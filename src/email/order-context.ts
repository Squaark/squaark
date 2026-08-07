import { CURRENCY_SYMBOLS } from '../theme/context';
import type { OrderRow, OrderItemRow } from '../db/queries/orders';

function fmt(pence: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

function dateLabel(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Builds the `order` object the transactional email templates expect —
 * augmenting the raw row with the pre-formatted currency strings
 * (`*_formatted`) the templates reference. Without this the order emails
 * render blank totals, since the templates use `{{order.total_formatted}}`
 * rather than a money helper over the raw pence value.
 */
export function buildOrderEmailContext(order: OrderRow, items: OrderItemRow[]): Record<string, unknown> {
  const cur = order.currency;
  return {
    ...order,
    total_formatted: fmt(order.total, cur),
    subtotal_formatted: fmt(order.subtotal, cur),
    shipping_formatted: fmt(order.shipping, cur),
    discount_formatted: order.discount_amount ? fmt(order.discount_amount, cur) : null,
    tax_formatted: fmt(order.tax_amount, cur),
    fulfilment_date_formatted: dateLabel(order.fulfilment_date),
    due_date_formatted: dateLabel(order.due_date),
    items: items.map(i => ({
      ...i,
      line_total_formatted: fmt(i.line_total, cur),
      unit_price_formatted: fmt(i.price, cur),
      preorder_from_formatted: i.preorder ? dateLabel(i.preorder_available_from) : null,
    })),
    has_preorder: items.some(i => i.preorder === 1),
  };
}
