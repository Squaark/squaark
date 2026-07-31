import { describe, it, expect } from 'vitest';
import { computeDiscountAmount, validateDiscount } from '../../src/commerce/discounts';
import type { DiscountRow } from '../../src/db/queries/discounts';

function d(overrides: Partial<DiscountRow>): DiscountRow {
  return {
    id: 'x', code: 'SAVE', type: 'percentage', value: 10, active: 1,
    min_subtotal: 0, usage_limit: null, times_used: 0, ends_at: null, created_at: '',
    ...overrides,
  };
}

describe('computeDiscountAmount', () => {
  it('percentage of the subtotal (rounded)', () => {
    expect(computeDiscountAmount('percentage', 10, 5000)).toBe(500);
    expect(computeDiscountAmount('percentage', 15, 999)).toBe(150); // 149.85 → 150
  });
  it('clamps a percentage to 0–100', () => {
    expect(computeDiscountAmount('percentage', 150, 5000)).toBe(5000);
  });
  it('fixed amount caps at the subtotal', () => {
    expect(computeDiscountAmount('fixed', 2000, 5000)).toBe(2000);
    expect(computeDiscountAmount('fixed', 8000, 5000)).toBe(5000);
  });
});

describe('validateDiscount', () => {
  const now = new Date('2026-06-01T00:00:00Z').getTime();

  it('rejects an unknown code', () => {
    expect(validateDiscount(null, 5000, now)).toEqual({ ok: false, reason: 'not_found' });
  });
  it('rejects an inactive code', () => {
    expect(validateDiscount(d({ active: 0 }), 5000, now).ok).toBe(false);
  });
  it('rejects an expired code', () => {
    expect(validateDiscount(d({ ends_at: '2026-01-01T23:59:59' }), 5000, now)).toMatchObject({ ok: false, reason: 'expired' });
  });
  it('rejects when the usage limit is reached', () => {
    expect(validateDiscount(d({ usage_limit: 5, times_used: 5 }), 5000, now)).toMatchObject({ ok: false, reason: 'usage_limit' });
  });
  it('rejects below the minimum spend and reports the minimum', () => {
    expect(validateDiscount(d({ min_subtotal: 6000 }), 5000, now)).toEqual({ ok: false, reason: 'min_subtotal', minSubtotal: 6000 });
  });
  it('accepts a valid code and computes the amount', () => {
    expect(validateDiscount(d({ type: 'percentage', value: 20 }), 5000, now)).toEqual({ ok: true, code: 'SAVE', amount: 1000 });
  });
});
