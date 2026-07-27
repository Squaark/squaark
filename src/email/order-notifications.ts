import { sendTemplatedEmail } from './send';
import { buildOrderEmailContext } from './order-context';
import { getAllSettings } from '../db/queries/admin';
import type { OrderRow, OrderItemRow } from '../db/queries/orders';

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
