import { describe, it, expect } from 'vitest';
import { findStockShortfalls, type StockCheckItem } from '../../src/commerce/inventory';

function item(overrides: Partial<StockCheckItem>): StockCheckItem {
  return { variantId: 'v1', quantity: 1, isDigital: false, productTitle: 'Widget', ...overrides };
}

describe('findStockShortfalls', () => {
  it('returns nothing when every physical item has enough stock', () => {
    const items = [item({ variantId: 'a', quantity: 2 }), item({ variantId: 'b', quantity: 1 })];
    const stock: Record<string, number> = { a: 5, b: 1 };
    expect(findStockShortfalls(items, id => stock[id] ?? null)).toEqual([]);
  });

  it('flags an item whose requested quantity exceeds available stock', () => {
    const items = [item({ variantId: 'a', quantity: 3, productTitle: 'Mug' })];
    const result = findStockShortfalls(items, () => 1);
    expect(result).toEqual([{ variantId: 'a', productTitle: 'Mug', requested: 3, available: 1 }]);
  });

  it('flags a fully out-of-stock item (available 0)', () => {
    const result = findStockShortfalls([item({ quantity: 1 })], () => 0);
    expect(result).toHaveLength(1);
    expect(result[0].available).toBe(0);
  });

  it('skips digital items entirely (unlimited stock)', () => {
    const result = findStockShortfalls([item({ isDigital: true, quantity: 999 })], () => 0);
    expect(result).toEqual([]);
  });

  it('does not block on a deleted variant (lookup returns null)', () => {
    const result = findStockShortfalls([item({ quantity: 5 })], () => null);
    expect(result).toEqual([]);
  });

  it('treats exactly-enough stock as sufficient (boundary)', () => {
    expect(findStockShortfalls([item({ quantity: 3 })], () => 3)).toEqual([]);
  });
});
