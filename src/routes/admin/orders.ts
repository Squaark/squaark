import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import {
  findOrders, countOrders, findAllOrders, findOrderById, findOrderItems,
  updateOrderStatus, updateOrderFulfillment,
  ORDER_STATUSES, FULFILLMENT_STATES,
  type OrderStatus, type FulfillmentState, type OrderRow,
} from '../../db/queries/orders';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { sendTemplatedEmail } from '../../email/send';
import { writeLog } from '../../db/queries/system-log';
import { refundOrder } from '../../commerce/refunds';

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/orders', listOrders);
  fastify.get('/orders/export.csv', exportOrdersCsv); // before /orders/:id so it isn't read as an id
  fastify.get('/orders/:id', viewOrder);
  fastify.post('/orders/:id/fulfillment', updateFulfillment);
  fastify.post('/orders/:id/status', updateStatus);
  fastify.post('/orders/:id/refund', refundOrderHandler);
}

/** Parses a first name out of an order's stored shipping/billing address JSON. */
function customerFirstName(order: OrderRow): string | null {
  try {
    const addr = JSON.parse(order.shipping_address) as Record<string, string>;
    return addr.first_name || addr.firstName || null;
  } catch {
    return null;
  }
}

/** Wraps a CSV cell only when it contains a comma, quote or newline; doubles quotes. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportOrdersCsv(req: FastifyRequest, reply: FastifyReply) {
  const orders = findAllOrders();
  const money = (pence: number) => (pence / 100).toFixed(2);

  const header = [
    'Order', 'Date', 'Status', 'Fulfillment', 'Email', 'Currency',
    'Subtotal', 'Discount code', 'Discount', 'Shipping', 'Tax', 'Total',
    'Shipping method', 'Tracking', 'Ship name', 'Ship city', 'Ship postcode', 'Ship country', 'Notes',
  ];

  const rows = orders.map((o) => {
    let a: Record<string, string> = {};
    try { a = JSON.parse(o.shipping_address || '{}') as Record<string, string>; } catch { /* leave blank */ }
    const name = [a.firstName, a.lastName].filter(Boolean).join(' ');
    return [
      o.order_number, o.created_at, o.status, o.fulfillment, o.email, o.currency,
      money(o.subtotal), o.discount_code ?? '', money(o.discount_amount), money(o.shipping),
      money(o.tax_amount ?? 0), money(o.total), o.shipping_title ?? '', o.tracking_number ?? '',
      name, a.city ?? '', a.postcode ?? '', a.country ?? '', o.notes ?? '',
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const today = new Date().toISOString().slice(0, 10);
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="orders-${today}.csv"`)
    // UTF-8 BOM so Excel renders £/€ and accented names correctly.
    .send('\uFEFF' + csv);
}

async function listOrders(req: FastifyRequest<{ Querystring: { page?: string } }>, reply: FastifyReply) {
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const orders = findOrders(limit, offset);
  const total = countOrders();
  const admin = getAdminById(req.session.adminId!)!;

  return reply.type('text/html').send(
    await render('orders/list', {
      admin, orders, total,
      page, totalPages: Math.ceil(total / limit),
      settings: getAllSettings(),
      pageTitle: 'Orders',
    }, reply),
  );
}

async function viewOrder(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { fulfilled?: string; status_updated?: string; refunded?: string; refund_error?: string } }>,
  reply: FastifyReply,
) {
  const order = findOrderById(req.params.id);
  if (!order) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  const items = findOrderItems(order.id);
  const admin = getAdminById(req.session.adminId!)!;

  return reply.type('text/html').send(
    await render('orders/view', {
      admin, order, items,
      settings: getAllSettings(),
      fulfillmentStates: FULFILLMENT_STATES,
      orderStatuses: ORDER_STATUSES,
      fulfilled: req.query.fulfilled === '1',
      statusUpdated: req.query.status_updated === '1',
      refunded: req.query.refunded === '1',
      refundError: req.query.refund_error,
      canRefund: order.status === 'paid' && !!order.payment_reference
        && (order.payment_provider === 'stripe' || order.payment_provider === 'paypal'),
      isInvoice: order.payment_provider === 'invoice',
      pageTitle: `Order #${order.order_number}`,
    }, reply),
  );
}

async function updateFulfillment(
  req: FastifyRequest<{ Params: { id: string }; Body: { fulfillment?: string; tracking_number?: string; tracking_url?: string } }>,
  reply: FastifyReply,
) {
  const order = findOrderById(req.params.id);
  if (!order) return reply.code(404).send('Not found');

  const fulfillment = req.body.fulfillment as FulfillmentState;
  if (!FULFILLMENT_STATES.includes(fulfillment)) return reply.code(400).send('Invalid fulfillment state');

  const trackingNumber = req.body.tracking_number?.trim() || null;
  const trackingUrl = req.body.tracking_url?.trim() || null;

  const wasShipped = order.fulfillment === 'shipped' || order.fulfillment === 'delivered';
  updateOrderFulfillment(order.id, fulfillment, trackingNumber, trackingUrl);

  // Notify the customer the first time an order becomes shipped — not on
  // later edits (e.g. correcting a tracking number) or on delivered/unfulfilled.
  if (fulfillment === 'shipped' && !wasShipped) {
    const settings = getAllSettings();
    sendTemplatedEmail('order_shipped', order.email, {
      customer_name: customerFirstName(order),
      order: { order_number: order.order_number, tracking_url: trackingUrl },
      store: { name: settings.store_name },
    }).catch((err: unknown) => {
      writeLog('error', 'error', 'Failed to send order_shipped email', {
        orderId: order.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return reply.redirect(`/admin/orders/${order.id}?fulfilled=1`);
}

async function updateStatus(
  req: FastifyRequest<{ Params: { id: string }; Body: { status?: string } }>,
  reply: FastifyReply,
) {
  const order = findOrderById(req.params.id);
  if (!order) return reply.code(404).send('Not found');

  const status = req.body.status as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return reply.code(400).send('Invalid status');

  updateOrderStatus(order.id, status);
  return reply.redirect(`/admin/orders/${order.id}?status_updated=1`);
}

async function refundOrderHandler(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const order = findOrderById(req.params.id);
  if (!order) return reply.code(404).send('Not found');

  const result = await refundOrder(order);
  if (!result.ok) {
    writeLog('payment', 'error', 'Refund failed', {
      orderId: order.id, orderNumber: order.order_number, provider: order.payment_provider, reason: result.error,
    });
    return reply.redirect(`/admin/orders/${order.id}?refund_error=${encodeURIComponent(result.error ?? 'unknown')}`);
  }

  // Only record the refund once the provider has confirmed it.
  updateOrderStatus(order.id, 'refunded');
  writeLog('payment', 'info', 'Order refunded', {
    orderId: order.id, orderNumber: order.order_number, provider: order.payment_provider, total: order.total,
  });
  return reply.redirect(`/admin/orders/${order.id}?refunded=1`);
}
