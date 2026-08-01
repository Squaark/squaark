import { describe, it, expect } from 'vitest';
import { crossedLowStock } from '../../src/email/order-notifications';

describe('crossedLowStock (only alert when a variant just became low)', () => {
  const threshold = 5;

  it('fires when stock crosses from above to at/below the threshold', () => {
    expect(crossedLowStock(3, 4, threshold)).toBe(true);   // was 7 → now 3
    expect(crossedLowStock(5, 1, threshold)).toBe(true);   // was 6 → now 5 (exactly at)
    expect(crossedLowStock(0, 6, threshold)).toBe(true);   // was 6 → now 0 (sold out from above)
  });

  it('does NOT fire when it was already at/below the threshold before this order', () => {
    expect(crossedLowStock(1, 2, threshold)).toBe(false);  // was 3 → already low
    expect(crossedLowStock(0, 1, threshold)).toBe(false);  // was 1 → already low
  });

  it('does NOT fire when it stays above the threshold', () => {
    expect(crossedLowStock(8, 2, threshold)).toBe(false);  // was 10 → now 8
  });

  it('threshold 0 means alert only on sell-out', () => {
    expect(crossedLowStock(0, 3, 0)).toBe(true);           // was 3 → now 0
    expect(crossedLowStock(2, 1, 0)).toBe(false);          // still in stock
  });
});
