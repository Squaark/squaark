import { describe, it, expect, beforeAll } from 'vitest';
import { createZone, createRate } from '../../src/db/queries/shipping';
import { resolveShipping, type ShippableCart } from '../../src/commerce/shipping';

function cart(items: Array<{ isDigital?: boolean; freeShipping?: boolean }>, opts?: { subtotal?: number; discount?: number }): ShippableCart {
  return {
    items: items.map(i => ({ isDigital: !!i.isDigital, freeShipping: !!i.freeShipping })),
    subtotal: { amount: opts?.subtotal ?? 10000 },
    discountAmount: opts?.discount ? { amount: opts.discount } : null,
  };
}

describe('resolveShipping', () => {
  it('never trusts a client-claimed "digital_delivery" for a cart of ordinary physical goods', () => {
    const physicalCart = cart([{ isDigital: false, freeShipping: false }]);
    const result = resolveShipping(physicalCart, 'GB', 'digital_delivery');
    // The client's sentinel claim is simply not a real rate ID, so it falls
    // through to "no matching rate" rather than being honoured as free.
    expect(result).toEqual({ amount: 0, title: null, rateId: null, isPickup: false, pickupAddress: null, pickupInstructions: null });
  });

  it('never trusts a client-claimed "free_shipping_product" for a cart that is not all free-shipping', () => {
    const mixedCart = cart([{ freeShipping: true }, { freeShipping: false }]);
    const result = resolveShipping(mixedCart, 'GB', 'free_shipping_product');
    expect(result).toEqual({ amount: 0, title: null, rateId: null, isPickup: false, pickupAddress: null, pickupInstructions: null });
  });

  it('grants digital delivery only when every item in the cart is actually digital', () => {
    const allDigitalCart = cart([{ isDigital: true }, { isDigital: true }]);
    expect(resolveShipping(allDigitalCart, 'GB', '')).toEqual({
      amount: 0, title: 'Digital delivery', rateId: 'digital_delivery', isPickup: false, pickupAddress: null, pickupInstructions: null,
    });
  });

  it('grants free shipping only when every item in the cart actually has free shipping (and none are digital)', () => {
    const allFreeCart = cart([{ freeShipping: true }, { freeShipping: true }]);
    expect(resolveShipping(allFreeCart, 'GB', '')).toEqual({
      amount: 0, title: 'Free Shipping', rateId: 'free_shipping_product', isPickup: false, pickupAddress: null, pickupInstructions: null,
    });
  });

  it('digital takes precedence: an all-digital cart is not also treated as free-shipping-eligible via the other path', () => {
    const allDigitalCart = cart([{ isDigital: true, freeShipping: true }]);
    expect(resolveShipping(allDigitalCart, 'GB', '').rateId).toBe('digital_delivery');
  });

  describe('with a real shipping rate configured', () => {
    let rateId: string;
    beforeAll(() => {
      const zone = createZone('Test Zone', ['GB']);
      const rate = createRate(zone.id, 'Standard', 'flat', 495, null);
      rateId = rate.id;
    });

    it('charges the real rate for an ordinary physical cart when a valid rate ID is submitted', () => {
      const physicalCart = cart([{ isDigital: false, freeShipping: false }]);
      expect(resolveShipping(physicalCart, 'GB', rateId)).toEqual({
        amount: 495, title: 'Standard', rateId, isPickup: false, pickupAddress: null, pickupInstructions: null,
      });
    });

    it('ignores a rate ID that does not apply to the requested country', () => {
      const physicalCart = cart([{ isDigital: false, freeShipping: false }]);
      expect(resolveShipping(physicalCart, 'FR', rateId)).toEqual({ amount: 0, title: null, rateId: null, isPickup: false, pickupAddress: null, pickupInstructions: null });
    });

    it('ignores a completely made-up rate ID', () => {
      const physicalCart = cart([{ isDigital: false, freeShipping: false }]);
      expect(resolveShipping(physicalCart, 'GB', 'not-a-real-rate-id')).toEqual({
        amount: 0, title: null, rateId: null, isPickup: false, pickupAddress: null, pickupInstructions: null,
      });
    });

    it('a real rate ID cannot be used to charge shipping on an all-digital cart — digital wins regardless', () => {
      const allDigitalCart = cart([{ isDigital: true }]);
      expect(resolveShipping(allDigitalCart, 'GB', rateId).rateId).toBe('digital_delivery');
    });
  });
});
