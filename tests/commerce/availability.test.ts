import { describe, it, expect } from 'vitest';
import { computeAvailability } from '../../src/commerce/availability';

const TODAY = '2026-08-04';

describe('computeAvailability', () => {
  it('is available with no window set', () => {
    const a = computeAvailability(null, null, TODAY);
    expect(a.status).toBe('available');
    expect(a.purchasable).toBe(true);
    expect(a.scheduled).toBe(false);
  });

  it('is upcoming before the from date', () => {
    const a = computeAvailability('2026-12-01', null, TODAY);
    expect(a.status).toBe('upcoming');
    expect(a.purchasable).toBe(false);
    expect(a.scheduled).toBe(true);
  });

  it('is available on the from date (inclusive)', () => {
    expect(computeAvailability(TODAY, null, TODAY).purchasable).toBe(true);
  });

  it('is available within the window', () => {
    expect(computeAvailability('2026-01-01', '2026-12-31', TODAY).status).toBe('available');
  });

  it('is available on the until date (inclusive)', () => {
    expect(computeAvailability(null, TODAY, TODAY).purchasable).toBe(true);
  });

  it('is ended after the until date', () => {
    const a = computeAvailability(null, '2026-01-01', TODAY);
    expect(a.status).toBe('ended');
    expect(a.purchasable).toBe(false);
  });

  it('treats blank strings as no gate', () => {
    expect(computeAvailability('', '', TODAY).scheduled).toBe(false);
  });

  it('formats human-readable labels', () => {
    const a = computeAvailability('2026-12-01', null, TODAY);
    expect(a.fromLabel).toBe('1 December 2026');
  });

  it('is preorderable when upcoming and preorders are allowed', () => {
    const a = computeAvailability('2026-12-01', null, TODAY, true);
    expect(a.status).toBe('upcoming');
    expect(a.purchasable).toBe(false);
    expect(a.preorder).toBe(true);
    expect(a.orderable).toBe(true);
  });

  it('does not preorder when upcoming but preorders are off', () => {
    const a = computeAvailability('2026-12-01', null, TODAY, false);
    expect(a.preorder).toBe(false);
    expect(a.orderable).toBe(false);
  });

  it('never preorders an ended item even if the flag is on', () => {
    const a = computeAvailability(null, '2026-01-01', TODAY, true);
    expect(a.status).toBe('ended');
    expect(a.preorder).toBe(false);
    expect(a.orderable).toBe(false);
  });
});
