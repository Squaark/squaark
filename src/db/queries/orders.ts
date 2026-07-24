import { randomUUID } from 'crypto';
import { query, queryOne, execute, executeReturning } from '../connection';

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
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
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

export function findOrderById(id: string): OrderRow | null {
  return queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
}

export function findOrderByPaymentReference(reference: string): OrderRow | null {
  return queryOne<OrderRow>('SELECT * FROM orders WHERE payment_reference = ?', [reference]);
}

export function findOrderItems(orderId: string): OrderItemRow[] {
  return query<OrderItemRow>('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
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
      shipping_rate_id, shipping_title, tax_amount
    ) VALUES (?, ?, ?, 'pending', 'unfulfilled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  ]);

  for (const item of input.items) {
    execute(`
      INSERT INTO order_items (id, order_id, variant_id, product_title, variant_title, sku, price, quantity, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [randomUUID(), id, item.variantId, item.productTitle, item.variantTitle, item.sku, item.price, item.quantity, item.price * item.quantity]);
  }

  return row;
}

export function markOrderPaid(orderId: string, paymentReference: string): void {
  execute(
    `UPDATE orders SET status = 'paid', payment_reference = ?, updated_at = datetime('now') WHERE id = ?`,
    [paymentReference, orderId],
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
