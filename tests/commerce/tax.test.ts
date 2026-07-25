import { describe, it, expect } from 'vitest';
import { calculateItemsTax } from '../../src/commerce/tax';

function item(amountPence: number, taxRate: string | null) {
  return { lineTotal: { amount: amountPence, formatted: '', currency: 'GBP' }, taxRate };
}

describe('calculateItemsTax', () => {
  it('returns 0 when tax is disabled, regardless of rates', () => {
    expect(calculateItemsTax([item(10000, '20')], false)).toBe(0);
  });

  it('returns 0 for an empty cart', () => {
    expect(calculateItemsTax([], true)).toBe(0);
  });

  it('extracts VAT-inclusive tax at 20%: £120.00 line -> £20.00 tax', () => {
    expect(calculateItemsTax([item(12000, '20')], true)).toBe(2000);
  });

  it('treats a null rate as zero-rated', () => {
    expect(calculateItemsTax([item(12000, null)], true)).toBe(0);
  });

  it('treats an empty-string rate as zero-rated', () => {
    expect(calculateItemsTax([item(12000, '')], true)).toBe(0);
  });

  it('treats a "0" rate as zero-rated', () => {
    expect(calculateItemsTax([item(12000, '0')], true)).toBe(0);
  });

  it('sums tax across multiple items with different rates', () => {
    // £120 inc @ 20% -> £20 tax, £105 inc @ 5% -> £5 tax
    const total = calculateItemsTax([item(12000, '20'), item(10500, '5')], true);
    expect(total).toBe(2000 + 500);
  });

  it('rounds to the nearest penny rather than truncating', () => {
    // £10.00 inc @ 20% -> exactly £1.6667 -> rounds to 167p
    expect(calculateItemsTax([item(1000, '20')], true)).toBe(167);
  });

  it('handles a negative/garbage rate string as zero-rated rather than throwing', () => {
    expect(calculateItemsTax([item(12000, 'not-a-number')], true)).toBe(0);
  });
});
