import { findRateById, getRatesForCountry } from '../db/queries/shipping';
import type { CartItem } from '../theme/context';

export interface ShippingResolution {
  amount: number;
  title: string | null;
  rateId: string | null;
  isPickup: boolean;
  pickupAddress: string | null;
  pickupInstructions: string | null;
}

export interface ShippableCart {
  items: Pick<CartItem, 'isDigital' | 'freeShipping'>[];
  subtotal: { amount: number };
  discountAmount: { amount: number } | null;
}

/**
 * Determines shipping cost/label server-side from the cart's own data —
 * never trusts the client's shippingRateId claim for ELIGIBILITY, only uses
 * it to pick which already-valid rate to charge. Previously the
 * 'digital_delivery' and 'free_shipping_product' sentinel values (and even
 * real rate IDs) were accepted from the client with no check that the cart
 * actually qualified, so submitting shippingRateId=digital_delivery for a
 * cart of ordinary physical goods zeroed the shipping charge outright.
 */
export function resolveShipping(cart: ShippableCart, country: string, requestedRateId: string): ShippingResolution {
  const allDigital = cart.items.length > 0 && cart.items.every(i => i.isDigital);
  const allFreeShipping = !allDigital && cart.items.length > 0 && cart.items.every(i => i.freeShipping);

  const NONE = { isPickup: false, pickupAddress: null, pickupInstructions: null };

  if (allDigital) return { amount: 0, title: 'Digital delivery', rateId: 'digital_delivery', ...NONE };
  if (allFreeShipping) return { amount: 0, title: 'Free Shipping', rateId: 'free_shipping_product', ...NONE };

  if (requestedRateId) {
    const rateRow = findRateById(requestedRateId);
    if (rateRow) {
      const subtotalAfterDiscount = cart.subtotal.amount - (cart.discountAmount?.amount ?? 0);
      const resolved = getRatesForCountry(country, subtotalAfterDiscount).find(r => r.id === rateRow.id);
      if (resolved) return {
        amount: resolved.amount, title: rateRow.name, rateId: rateRow.id,
        isPickup: resolved.isPickup, pickupAddress: resolved.pickupAddress, pickupInstructions: resolved.pickupInstructions,
      };
    }
  }
  return { amount: 0, title: null, rateId: null, ...NONE };
}
