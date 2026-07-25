import type { CartItem } from '../theme/context';

/**
 * Sums the tax portion already included in each line total, using each item's
 * resolved tax-band rate. Returns 0 for every item when tax is disabled.
 */
export function calculateItemsTax(
  items: Pick<CartItem, 'lineTotal' | 'taxRate'>[],
  taxEnabled: boolean,
): number {
  if (!taxEnabled) return 0;
  return items.reduce((sum, item) => {
    const rate = item.taxRate ? parseFloat(item.taxRate) : 0;
    return sum + (rate > 0 ? Math.round(item.lineTotal.amount * rate / (100 + rate)) : 0);
  }, 0);
}
