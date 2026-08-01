import { sendTemplatedEmail } from './send';
import { buildOrderEmailContext } from './order-context';
import { getAllSettings } from '../db/queries/admin';
import { findOrderStockLevels, type OrderRow, type OrderItemRow } from '../db/queries/orders';

/**
 * Notifies the store owner of a new paid order via the admin_new_order
 * template. Sent to the configured `store_email`; a no-op (not an error) when
 * that address is blank, so a store that hasn't set one just doesn't get
 * notifications. Callers should treat send failures as non-fatal.
 */
export async function sendMerchantNewOrderEmail(order: OrderRow, items: OrderItemRow[]): Promise<void> {
  const settings = getAllSettings();
  const to = settings.store_email?.trim();
  if (!to) return;
  const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
  await sendTemplatedEmail('admin_new_order', to, {
    order: buildOrderEmailContext(order, items),
    store: { name: settings.store_name, url: storeUrl },
  });
}

/**
 * Emails the store owner about variants from a just-paid order that dropped
 * to/at the low-stock threshold. Only fires for variants that *crossed* the
 * threshold on this order (were above before, at/below after), so a store isn't
 * re-alerted on every subsequent order for the same low item.
 *
 * Threshold comes from the `low_stock_threshold` setting: blank = off,
 * 0 = alert only when sold out, N = alert at N or fewer. No-op if store_email
 * is unset. Callers should treat failures as non-fatal, and only call this on a
 * *fresh* paid transition (markOrderPaid returned true) — otherwise a duplicate
 * confirmation would re-send.
 */
/**
 * True when this order pushed a variant to at/below the threshold *from above* —
 * i.e. it just became low. `remaining` is the post-order stock; `remaining +
 * ordered` reconstructs the pre-order level.
 */
export function crossedLowStock(remaining: number, ordered: number, threshold: number): boolean {
  return remaining <= threshold && remaining + ordered > threshold;
}

export async function notifyLowStock(orderId: string): Promise<void> {
  const settings = getAllSettings();
  const to = settings.store_email?.trim();
  if (!to) return;

  const raw = settings.low_stock_threshold;
  if (raw !== undefined && raw.trim() === '') return;        // explicitly turned off
  const threshold = parseInt(raw ?? '5', 10);
  if (!Number.isFinite(threshold) || threshold < 0) return;

  const crossed = findOrderStockLevels(orderId).filter(
    (r) => crossedLowStock(r.remaining, r.ordered, threshold),
  );
  if (crossed.length === 0) return;

  const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
  await sendTemplatedEmail('low_stock', to, {
    store: { name: settings.store_name, url: storeUrl },
    threshold,
    items: crossed.map((r) => ({
      product_title: r.product_title,
      // Hide the placeholder "Default" variant name (the email has no `eq` helper).
      variant_title: r.variant_title === 'Default' ? '' : r.variant_title,
      sku: r.sku,
      remaining: r.remaining,
    })),
  });
}
