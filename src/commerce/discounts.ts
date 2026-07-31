import type { DiscountRow } from '../db/queries/discounts';

export type DiscountValidation =
  | { ok: true; code: string; amount: number }
  | { ok: false; reason: 'not_found' | 'inactive' | 'expired' | 'usage_limit' | 'min_subtotal'; minSubtotal?: number };

/** Discount value in pence for a given subtotal. Percentages clamp to 0–100; fixed amounts cap at the subtotal. */
export function computeDiscountAmount(type: 'percentage' | 'fixed', value: number, subtotal: number): number {
  if (type === 'percentage') {
    const pct = Math.min(100, Math.max(0, value));
    return Math.round((subtotal * pct) / 100);
  }
  return Math.min(subtotal, Math.max(0, value));
}

/**
 * Validates a discount against the current subtotal and computes the amount.
 * Pure — the row is looked up by the caller; `now` is injectable for tests.
 */
export function validateDiscount(discount: DiscountRow | null, subtotal: number, now = Date.now()): DiscountValidation {
  if (!discount) return { ok: false, reason: 'not_found' };
  if (!discount.active) return { ok: false, reason: 'inactive' };
  if (discount.ends_at && new Date(discount.ends_at).getTime() < now) return { ok: false, reason: 'expired' };
  if (discount.usage_limit != null && discount.times_used >= discount.usage_limit) {
    return { ok: false, reason: 'usage_limit' };
  }
  if (subtotal < discount.min_subtotal) {
    return { ok: false, reason: 'min_subtotal', minSubtotal: discount.min_subtotal };
  }
  return { ok: true, code: discount.code, amount: computeDiscountAmount(discount.type, discount.value, subtotal) };
}
