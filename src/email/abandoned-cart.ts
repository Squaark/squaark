import { sendTemplatedEmail } from './send';
import { buildOrderEmailContext } from './order-context';
import { unsubscribeToken } from './unsubscribe';
import { getAllSettings } from '../db/queries/admin';
import { findAbandonedOrders, markAbandonedReminderSent, findOrderItems } from '../db/queries/orders';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;  // scan every 15 minutes
const MAX_AGE_DAYS = 7;                     // don't chase orders older than a week (avoids a first-run backlog blast)

/**
 * Emails a one-off recovery reminder to customers who started checkout (a pending
 * order, so we have their email) but never paid. Honours the `abandoned_cart_hours`
 * setting (blank/0 = off), skips opted-out and already-converted addresses, and
 * marks each address reminded so it's sent at most once. Returns how many were sent.
 * Reachability note: only Stripe abandonment leaves a pending order; PayPal orders
 * are created at payment, and pre-checkout browsers leave no email.
 */
export async function sendAbandonedCartReminders(): Promise<number> {
  const settings = getAllSettings();
  const raw = settings.abandoned_cart_hours;
  if (raw !== undefined && raw.trim() === '') return 0;   // explicitly off
  const hours = parseInt(raw ?? '1', 10);
  if (!Number.isFinite(hours) || hours <= 0) return 0;    // off / invalid

  const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
  let sent = 0;

  for (const order of findAbandonedOrders(hours, MAX_AGE_DAYS)) {
    const items = findOrderItems(order.id);
    if (items.length === 0) continue;

    let firstName: string | null = null;
    try { firstName = (JSON.parse(order.shipping_address || '{}').firstName as string) || null; } catch { /* no name */ }

    try {
      await sendTemplatedEmail('abandoned_cart', order.email, {
        store: { name: settings.store_name, url: storeUrl },
        customer_name: firstName,
        order: buildOrderEmailContext(order, items),
        cart_url: `${storeUrl}/cart`,
        unsubscribe_url: `${storeUrl}/unsubscribe?e=${encodeURIComponent(order.email)}&t=${unsubscribeToken(order.email)}`,
      });
      markAbandonedReminderSent(order.email);  // mark only after a successful send, so failures retry next sweep
      sent++;
    } catch { /* leave unmarked; try again next sweep */ }
  }
  return sent;
}

/**
 * Starts the background sweep: one pass a minute after boot, then every 15 min.
 * `.unref()` so it never keeps the process alive on its own (mirrors the update-check timer).
 */
export function startAbandonedCartSweep(): void {
  setTimeout(() => { void sendAbandonedCartReminders().catch(() => {}); }, 60_000).unref();
  setInterval(() => { void sendAbandonedCartReminders().catch(() => {}); }, SWEEP_INTERVAL_MS).unref();
}
