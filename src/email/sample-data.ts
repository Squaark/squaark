import { getAllSettings } from '../db/queries/admin';

/** Placeholder data for previewing/test-sending templates before a real trigger exists. */
export function buildSampleContext(templateKey: string): Record<string, unknown> {
  const settings = getAllSettings();
  const store = { name: settings.store_name || 'My Store', url: settings.store_url || 'http://localhost:3000' };

  const sampleOrder = {
    id: 'sample-order-id',
    order_number: 1042,
    email: 'customer@example.com',
    items: [
      { product_title: 'Canvas Tote Bag', variant_title: 'Natural', quantity: 2, line_total_formatted: '£24.00' },
      { product_title: 'Linen Napkin Set', variant_title: 'Set of 4', quantity: 1, line_total_formatted: '£18.00' },
    ],
    subtotal_formatted: '£42.00',
    discount_formatted: null,
    shipping_formatted: '£4.50',
    total_formatted: '£46.50',
    tracking_url: null,
  };

  switch (templateKey) {
    case 'order_confirmation':
      return { store, customer_name: 'Alex', order: sampleOrder };
    case 'order_shipped':
      return { store, customer_name: 'Alex', order: { ...sampleOrder, tracking_url: 'https://example.com/track/123' } };
    case 'admin_new_order':
      return { store, order: sampleOrder };
    case 'password_reset':
      return { store, customer_name: 'Alex', reset_url: `${store.url}/account/reset?token=sample` };
    case 'email_verification':
      return { store, customer_name: 'Alex', verify_url: `${store.url}/account/verify?token=sample` };
    case 'low_stock':
      return { store, threshold: 5, items: [
        { product_title: 'Canvas Tote Bag', variant_title: 'Natural', sku: 'TOTE-NAT', remaining: 3 },
        { product_title: 'Linen Napkin Set', variant_title: '', sku: null, remaining: 0 },
      ] };
    default:
      return { store };
  }
}
