import { computeDiscountAmount } from './discounts';

/** A cart line reduced to what the discount engine needs. */
export interface DiscountCartItem {
  productId: string;
  collectionIds: string[];
  unitPrice: number;  // pence
  quantity: number;
}

export interface AutomaticPromo {
  id: string;
  name: string;
  kind: 'order' | 'bogo';
  // order
  type?: 'percentage' | 'fixed' | null;
  value?: number | null;
  minSubtotal?: number;
  // bogo
  buyQuantity?: number | null;
  getQuantity?: number | null;
  getDiscount?: number | null;              // percent off the discounted items (100 = free)
  targetType?: 'all' | 'collection' | 'product' | null;
  targetId?: string | null;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  amount: number;                           // pence
  kind: 'order' | 'bogo' | 'code';
}

function itemMatches(item: DiscountCartItem, targetType: AutomaticPromo['targetType'], targetId: string | null | undefined): boolean {
  if (!targetType || targetType === 'all') return true;
  if (targetType === 'product') return item.productId === targetId;
  if (targetType === 'collection') return !!targetId && item.collectionIds.includes(targetId);
  return false;
}

/** BOGO discount amount: for every (buy+get) qualifying units, the cheapest `get` are discounted. */
export function bogoAmount(items: DiscountCartItem[], promo: AutomaticPromo): number {
  const buy = promo.buyQuantity ?? 0;
  const get = promo.getQuantity ?? 0;
  const pct = promo.getDiscount ?? 0;
  if (buy <= 0 || get <= 0 || pct <= 0) return 0;

  const units: number[] = [];
  for (const it of items) {
    if (itemMatches(it, promo.targetType, promo.targetId)) {
      for (let i = 0; i < it.quantity; i++) units.push(it.unitPrice);
    }
  }
  const groupSize = buy + get;
  const discountedCount = Math.floor(units.length / groupSize) * get;
  if (discountedCount === 0) return 0;

  units.sort((a, b) => a - b); // discount the cheapest qualifying units
  let amount = 0;
  for (let i = 0; i < discountedCount; i++) amount += Math.round((units[i] * pct) / 100);
  return amount;
}

/**
 * Computes the discounts applied to a cart. `promos` must already be filtered to
 * active + in-window. Rules:
 *   - Order-level discounts don't stack: the cart gets the *better* of the
 *     entered code and the best automatic 'order' promo.
 *   - BOGO ('bogo') promos are item-level and stack on top.
 * The total is clamped to the subtotal.
 */
export function computeAutomaticDiscounts(
  items: DiscountCartItem[],
  subtotal: number,
  promos: AutomaticPromo[],
  codeDiscount: { code: string; amount: number } | null,
): { applied: AppliedDiscount[]; total: number } {
  const applied: AppliedDiscount[] = [];

  // Best order-level discount: entered code vs the best automatic 'order' promo.
  let bestOrder: AppliedDiscount | null =
    codeDiscount && codeDiscount.amount > 0
      ? { id: 'code', name: codeDiscount.code, amount: codeDiscount.amount, kind: 'code' }
      : null;
  for (const p of promos) {
    if (p.kind !== 'order') continue;
    if (subtotal < (p.minSubtotal ?? 0)) continue;
    const amt = computeDiscountAmount((p.type ?? 'percentage') as 'percentage' | 'fixed', p.value ?? 0, subtotal);
    if (amt > 0 && (!bestOrder || amt > bestOrder.amount)) {
      bestOrder = { id: p.id, name: p.name, amount: amt, kind: 'order' };
    }
  }
  if (bestOrder) applied.push(bestOrder);

  // BOGO promos stack.
  for (const p of promos) {
    if (p.kind !== 'bogo') continue;
    const amt = bogoAmount(items, p);
    if (amt > 0) applied.push({ id: p.id, name: p.name, amount: amt, kind: 'bogo' });
  }

  const total = Math.min(subtotal, applied.reduce((s, a) => s + a.amount, 0));
  return { applied, total };
}
