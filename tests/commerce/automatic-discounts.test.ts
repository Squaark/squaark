import { describe, it, expect } from 'vitest';
import { computeAutomaticDiscounts, bogoAmount, type DiscountCartItem, type AutomaticPromo } from '../../src/commerce/automatic-discounts';

const item = (over: Partial<DiscountCartItem>): DiscountCartItem =>
  ({ productId: 'p', collectionIds: [], unitPrice: 1000, quantity: 1, ...over });

describe('order discounts', () => {
  const promo: AutomaticPromo = { id: 'o1', name: '10% over £40', kind: 'order', type: 'percentage', value: 10, minSubtotal: 4000 };

  it('applies over the threshold and not below it', () => {
    expect(computeAutomaticDiscounts([item({ unitPrice: 5000 })], 5000, [promo], null).total).toBe(500);
    expect(computeAutomaticDiscounts([item({ unitPrice: 3000 })], 3000, [promo], null).total).toBe(0);
  });

  it('takes the better of an entered code vs the automatic order discount (no stacking)', () => {
    // auto = 500; code = 800 → code wins
    let r = computeAutomaticDiscounts([item({ unitPrice: 5000 })], 5000, [promo], { code: 'BIG', amount: 800 });
    expect(r.total).toBe(800);
    expect(r.applied.map(a => a.name)).toEqual(['BIG']);
    // auto = 500; code = 200 → auto wins
    r = computeAutomaticDiscounts([item({ unitPrice: 5000 })], 5000, [promo], { code: 'SMALL', amount: 200 });
    expect(r.total).toBe(500);
    expect(r.applied.map(a => a.name)).toEqual(['10% over £40']);
  });
});

describe('BOGO', () => {
  const bogo: AutomaticPromo = { id: 'b1', name: 'Buy 2 get 1 free', kind: 'bogo', buyQuantity: 2, getQuantity: 1, getDiscount: 100, targetType: 'all' };

  it('discounts one per group of three, and nothing below a full group', () => {
    expect(bogoAmount([item({ quantity: 3 })], bogo)).toBe(1000); // 3 → 1 free
    expect(bogoAmount([item({ quantity: 6 })], bogo)).toBe(2000); // 6 → 2 free
    expect(bogoAmount([item({ quantity: 2 })], bogo)).toBe(0);    // < group
  });

  it('discounts the cheapest qualifying units', () => {
    const items = [item({ productId: 'a', unitPrice: 1000, quantity: 2 }), item({ productId: 'b', unitPrice: 500, quantity: 1 })];
    expect(bogoAmount(items, bogo)).toBe(500); // 3 units → cheapest (500) free
  });

  it('only counts items in the targeted collection', () => {
    const scoped: AutomaticPromo = { ...bogo, targetType: 'collection', targetId: 'c1' };
    const items = [
      item({ productId: 'a', collectionIds: ['c1'], quantity: 3 }), // qualifies
      item({ productId: 'b', collectionIds: ['c2'], quantity: 3 }), // ignored
    ];
    expect(bogoAmount(items, scoped)).toBe(1000);
  });
});

describe('order + BOGO stack, clamped to subtotal', () => {
  it('adds an order discount and a BOGO discount together', () => {
    const order: AutomaticPromo = { id: 'o', name: '10% off', kind: 'order', type: 'percentage', value: 10, minSubtotal: 0 };
    const bogo: AutomaticPromo = { id: 'b', name: 'BOGO', kind: 'bogo', buyQuantity: 2, getQuantity: 1, getDiscount: 100, targetType: 'all' };
    const items = [item({ unitPrice: 1000, quantity: 3 })]; // subtotal 3000
    const r = computeAutomaticDiscounts(items, 3000, [order, bogo], null);
    expect(r.total).toBe(300 + 1000); // 10% of 3000 + one free unit
    expect(r.applied).toHaveLength(2);
  });

  it('never discounts more than the subtotal', () => {
    const order: AutomaticPromo = { id: 'o', name: 'all off', kind: 'order', type: 'percentage', value: 100, minSubtotal: 0 };
    const bogo: AutomaticPromo = { id: 'b', name: 'BOGO', kind: 'bogo', buyQuantity: 1, getQuantity: 1, getDiscount: 100, targetType: 'all' };
    const items = [item({ unitPrice: 1000, quantity: 2 })]; // subtotal 2000
    expect(computeAutomaticDiscounts(items, 2000, [order, bogo], null).total).toBe(2000);
  });
});
