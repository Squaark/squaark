import { randomUUID } from 'crypto';
import { query, queryOne, execute, executeReturning, transaction, db } from '../connection';

export interface OrderRow {
  id: string;
  order_number: number;
  email: string;
  status: string;
  fulfillment: string;
  subtotal: number;
  discount_amount: number;
  shipping: number;
  total: number;
  currency: string;
  discount_code: string | null;
  notes: string | null;
  shipping_address: string;
  billing_address: string;
  payment_provider: string | null;
  payment_reference: string | null;
  shipping_rate_id: string | null;
  shipping_title: string | null;
  tax_amount: number;
  pickup_address: string | null;
  pickup_instructions: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ORDER_STATUSES = ['pending', 'paid', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENT_STATES = ['unfulfilled', 'shipped', 'delivered'] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_title: string;
  variant_title: string;
  sku: string | null;
  price: number;
  quantity: number;
  line_total: number;
}

export interface Address {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  county?: string;
  postcode: string;
  country: string;
  phone?: string;
}

export interface CreateOrderInput {
  email: string;
  subtotal: number;
  discountAmount: number;
  shipping: number;
  total: number;
  currency: string;
  discountCode: string | null;
  notes: string | null;
  shippingAddress: Address;
  paymentProvider: string;
  paymentReference: string | null;
  shippingRateId?: string | null;
  shippingTitle?: string | null;
  taxAmount?: number;
  pickupAddress?: string | null;
  pickupInstructions?: string | null;
  items: Array<{
    variantId: string | null;
    productTitle: string;
    variantTitle: string;
    sku: string | null;
    price: number;
    quantity: number;
  }>;
}

export function findOrders(limit = 50, offset = 0): OrderRow[] {
  return query<OrderRow>(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset],
  );
}

export function countOrders(): number {
  return queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM orders')?.n ?? 0;
}

/** All orders, newest first — for the admin CSV export (not paginated). */
export function findAllOrders(): OrderRow[] {
  return query<OrderRow>('SELECT * FROM orders ORDER BY created_at DESC');
}

export interface OrderStockLevel {
  product_title: string;
  variant_title: string;
  sku: string | null;
  remaining: number;  // current inventory (after this order's decrement)
  ordered: number;    // quantity in this order
}

/**
 * Pending orders ripe for an abandoned-checkout reminder: older than `delayHours`
 * but newer than `maxAgeDays`, never reminded, with an email, where that email has
 * no completed order and hasn't opted out. One row per email (the newest pending).
 */
export function findAbandonedOrders(delayHours: number, maxAgeDays: number): OrderRow[] {
  return query<OrderRow>(
    `SELECT o.* FROM orders o
      WHERE o.status = 'pending'
        AND o.reminder_sent_at IS NULL
        AND o.email <> ''
        AND o.created_at <= datetime('now', ?)
        AND o.created_at >= datetime('now', ?)
        AND NOT EXISTS (SELECT 1 FROM orders p WHERE p.email = o.email AND p.status = 'paid')
        AND o.email NOT IN (SELECT email FROM email_suppressions)
        AND o.id = (SELECT id FROM orders o2 WHERE o2.email = o.email AND o2.status = 'pending'
                     ORDER BY o2.created_at DESC LIMIT 1)
      ORDER BY o.created_at DESC`,
    [`-${delayHours} hours`, `-${maxAgeDays} days`],
  );
}

/** Flags every pending order for this email as reminded, so siblings don't re-trigger. */
export function markAbandonedReminderSent(email: string): void {
  execute(
    "UPDATE orders SET reminder_sent_at = datetime('now') WHERE email = ? AND status = 'pending' AND reminder_sent_at IS NULL",
    [email],
  );
}

/** Current stock for the physical variants in an order — used to detect low-stock crossings. */
export function findOrderStockLevels(orderId: string): OrderStockLevel[] {
  return query<OrderStockLevel>(
    `SELECT oi.product_title, oi.variant_title, oi.sku,
            v.inventory_quantity AS remaining, oi.quantity AS ordered
       FROM order_items oi
       JOIN product_variants v ON v.id = oi.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE oi.order_id = ? AND oi.variant_id IS NOT NULL AND p.is_digital = 0`,
    [orderId],
  );
}

export function findOrderById(id: string): OrderRow | null {
  return queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
}

export function findOrderByPaymentReference(reference: string): OrderRow | null {
  return queryOne<OrderRow>('SELECT * FROM orders WHERE payment_reference = ?', [reference]);
}

export function findOrderItems(orderId: string): OrderItemRow[] {
  return query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
}

/**
 * Distinct product ids in an order, in line-item order. Used for the marketing
 * purchase pixel's `content_ids` so they match the product feed's `g:id` (also
 * the product id) — required for Meta/Google to attribute a purchase to the
 * right catalogue item for dynamic ads.
 */
export function getOrderProductIds(orderId: string): string[] {
  return query<{ product_id: string }>(
    `SELECT v.product_id
       FROM order_items oi
       JOIN product_variants v ON v.id = oi.variant_id
      WHERE oi.order_id = ? AND oi.variant_id IS NOT NULL
      GROUP BY v.product_id
      ORDER BY MIN(oi.rowid)`,
    [orderId],
  ).map((r) => r.product_id);
}

export function createOrder(input: CreateOrderInput): OrderRow {
  const id = randomUUID();
  const nextNumber = queryOne<{ n: number }>('SELECT COALESCE(MAX(order_number), 1000) + 1 AS n FROM orders')!.n;

  const row = executeReturning<OrderRow>(`
    INSERT INTO orders (
      id, order_number, email, status, fulfillment,
      subtotal, discount_amount, shipping, total, currency,
      discount_code, notes, shipping_address, billing_address,
      payment_provider, payment_reference,
      shipping_rate_id, shipping_title, tax_amount,
      pickup_address, pickup_instructions
    ) VALUES (?, ?, ?, 'pending', 'unfulfilled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [
    id, nextNumber, input.email,
    input.subtotal, input.discountAmount, input.shipping, input.total, input.currency,
    input.discountCode, input.notes,
    JSON.stringify(input.shippingAddress),
    JSON.stringify(input.shippingAddress),
    input.paymentProvider, input.paymentReference,
    input.shippingRateId ?? null, input.shippingTitle ?? null,
    input.taxAmount ?? 0,
    input.pickupAddress ?? null, input.pickupInstructions ?? null,
  ]);

  for (const item of input.items) {
    execute(`
      INSERT INTO order_items (id, order_id, variant_id, product_title, variant_title, sku, price, quantity, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [randomUUID(), id, item.variantId, item.productTitle, item.variantTitle, item.sku, item.price, item.quantity, item.price * item.quantity]);
  }

  return row;
}

/**
 * Transitions an order to 'paid' and decrements stock for its physical items,
 * atomically. Returns true if this call performed the transition, false if the
 * order was already paid — the guard on `status != 'paid'` makes this
 * idempotent, so the Stripe return handler and webhook (which can both fire
 * for one order) decrement inventory exactly once between them. Digital
 * products (p.is_digital = 1) carry no stock and are skipped; physical stock is
 * floored at 0 so a race that oversells shows 0, never a negative count.
 */
export function markOrderPaid(orderId: string, paymentReference: string): boolean {
  return transaction(() => {
    const res = db.prepare(
      `UPDATE orders SET status = 'paid', payment_reference = ?, updated_at = datetime('now')
       WHERE id = ? AND status != 'paid'`,
    ).run(paymentReference, orderId);
    if (res.changes === 0) return false;

    db.prepare(`
      UPDATE product_variants
      SET inventory_quantity = MAX(0, inventory_quantity - (
            SELECT oi.quantity FROM order_items oi
            WHERE oi.variant_id = product_variants.id AND oi.order_id = ?
          )),
          updated_at = datetime('now')
      WHERE id IN (
        SELECT oi.variant_id FROM order_items oi
        JOIN products p ON p.id = (SELECT product_id FROM product_variants WHERE id = oi.variant_id)
        WHERE oi.order_id = ? AND oi.variant_id IS NOT NULL AND p.is_digital = 0
      )
    `).run(orderId, orderId);

    // Count a discount code's use once the order is actually paid (not on the
    // abandoned pending order), so usage limits reflect real redemptions.
    const dc = db.prepare('SELECT discount_code FROM orders WHERE id = ?').get(orderId) as { discount_code: string | null };
    if (dc?.discount_code) {
      db.prepare('UPDATE discounts SET times_used = times_used + 1 WHERE code = ?').run(dc.discount_code);
    }
    return true;
  });
}

export function updateOrderStatus(orderId: string, status: OrderStatus): void {
  execute(
    `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, orderId],
  );
}

/**
 * Records a shipment. `shipped_at` is stamped the first time an order moves to
 * 'shipped' and left untouched otherwise, so re-saving tracking details for an
 * already-shipped order doesn't reset the ship date. Tracking fields are
 * cleared when reverting to 'unfulfilled'.
 */
export function updateOrderFulfillment(
  orderId: string,
  fulfillment: FulfillmentState,
  trackingNumber: string | null,
  trackingUrl: string | null,
): void {
  if (fulfillment === 'unfulfilled') {
    execute(
      `UPDATE orders SET fulfillment = 'unfulfilled', tracking_number = NULL, tracking_url = NULL, shipped_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      [orderId],
    );
    return;
  }
  execute(
    `UPDATE orders
     SET fulfillment = ?, tracking_number = ?, tracking_url = ?,
         shipped_at = COALESCE(shipped_at, datetime('now')), updated_at = datetime('now')
     WHERE id = ?`,
    [fulfillment, trackingNumber || null, trackingUrl || null, orderId],
  );
}

export function findOrdersByEmail(email: string): OrderRow[] {
  return query<OrderRow>(
    'SELECT * FROM orders WHERE lower(email) = lower(?) ORDER BY created_at DESC',
    [email],
  );
}

export function findOrderByIdAndEmail(id: string, email: string): OrderRow | null {
  return queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = ? AND lower(email) = lower(?)',
    [id, email],
  );
}
