import { describe, it, expect } from 'vitest';
import { buildOrderEmailContext } from '../../src/email/order-context';
import { renderEmailTemplate } from '../../src/email/templates';
import type { OrderRow, OrderItemRow } from '../../src/db/queries/orders';

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1', order_number: 1001, email: 'a@b.com', status: 'paid', fulfillment: 'unfulfilled',
    subtotal: 4200, discount_amount: 0, shipping: 450, total: 4650, currency: 'GBP',
    discount_code: null, notes: null, shipping_address: '{}', billing_address: '{}',
    payment_provider: 'stripe', payment_reference: 'cs_1',
    shipping_rate_id: null, shipping_title: null, tax_amount: 0,
    tracking_number: null, tracking_url: null, shipped_at: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

const items: OrderItemRow[] = [
  { id: 'i1', order_id: 'o1', variant_id: 'v1', product_title: 'Tote', variant_title: 'Natural', sku: null, price: 2100, quantity: 2, line_total: 4200 },
];

describe('buildOrderEmailContext', () => {
  it('adds formatted currency strings with the right symbol', () => {
    const ctx = buildOrderEmailContext(order(), items) as Record<string, string>;
    expect(ctx.total_formatted).toBe('£46.50');
    expect(ctx.subtotal_formatted).toBe('£42.00');
    expect(ctx.shipping_formatted).toBe('£4.50');
  });

  it('formats each line item total', () => {
    const ctx = buildOrderEmailContext(order(), items) as { items: Array<Record<string, string>> };
    expect(ctx.items[0].line_total_formatted).toBe('£42.00');
  });

  it('leaves discount_formatted null when there is no discount', () => {
    const ctx = buildOrderEmailContext(order(), items) as Record<string, unknown>;
    expect(ctx.discount_formatted).toBeNull();
  });

  it('uses the order currency symbol (USD)', () => {
    const ctx = buildOrderEmailContext(order({ currency: 'USD', total: 1000 }), items) as Record<string, string>;
    expect(ctx.total_formatted).toBe('$10.00');
  });
});

describe('order_confirmation renders real totals (regression: previously blank)', () => {
  it('shows the formatted total in the email HTML', () => {
    const { html } = renderEmailTemplate('order_confirmation', {
      customer_name: 'Alex',
      order: buildOrderEmailContext(order(), items),
      store: { name: 'Test Store' },
    });
    expect(html).toContain('£46.50');
    expect(html).toContain('£42.00');
  });
});

describe('admin_new_order renders order summary', () => {
  it('includes order number, email and total', () => {
    const { subject, html } = renderEmailTemplate('admin_new_order', {
      order: buildOrderEmailContext(order(), items),
      store: { name: 'Test Store', url: 'https://shop.example' },
    });
    expect(subject).toContain('#1001');
    expect(subject).toContain('£46.50');
    expect(html).toContain('a@b.com');
    expect(html).toContain('https://shop.example/admin/orders/o1');
  });
});
