import { getVariantInventory } from '../db/queries/products';
import type { CartItem } from '../theme/context';

export interface StockShortfall {
  variantId: string;
  productTitle: string;
  requested: number;
  available: number;
}

export type StockLookup = (variantId: string) => number | null;

export type StockCheckItem = Pick<CartItem, 'variantId' | 'quantity' | 'isDigital' | 'productTitle'>;

/**
 * Re-validates cart items against live stock immediately before charging.
 * The add-to-cart check (see addToCart) can be stale by the time a customer
 * reaches payment, so this is the authoritative gate that stops us taking
 * money for goods we can't ship.
 *
 * Digital items are skipped (no stock). A variant that has since been deleted
 * (lookup returns null) is left for the order flow to handle rather than
 * blocking checkout here. `lookup` is injectable for testing.
 */
export function findStockShortfalls(
  items: StockCheckItem[],
  lookup: StockLookup = getVariantInventory,
): StockShortfall[] {
  const shortfalls: StockShortfall[] = [];
  for (const item of items) {
    if (item.isDigital) continue;
    const available = lookup(item.variantId);
    if (available === null) continue;
    if (available < item.quantity) {
      shortfalls.push({
        variantId: item.variantId,
        productTitle: item.productTitle,
        requested: item.quantity,
        available,
      });
    }
  }
  return shortfalls;
}
