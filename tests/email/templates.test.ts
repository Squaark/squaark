import { describe, it, expect } from 'vitest';
import { renderEmailTemplate, renderEmailPreview } from '../../src/email/templates';

describe('renderEmailTemplate — HTML escaping of interpolated data', () => {
  it('escapes HTML-special characters in customer-controlled data', () => {
    const { html } = renderEmailTemplate('order_confirmation', {
      customer_name: '<script>alert(1)</script>',
      order: {
        order_number: '1001',
        items: [
          { product_title: '<img src=x onerror=alert(1)>', variant_title: 'Default', quantity: 1, line_total_formatted: '£10.00' },
        ],
        subtotal_formatted: '£10.00',
        shipping_formatted: '£0.00',
        total_formatted: '£10.00',
      },
      store: { name: 'Test Store' },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
  });

  it('still renders the template’s own literal markup unescaped', () => {
    const { html } = renderEmailTemplate('order_confirmation', {
      customer_name: 'Jane',
      order: {
        order_number: '1001',
        items: [],
        subtotal_formatted: '£10.00',
        shipping_formatted: '£0.00',
        total_formatted: '£10.00',
      },
      store: { name: 'Test Store' },
    });

    expect(html).toContain('<h1>Thanks for your order, Jane!</h1>');
    expect(html).toContain('<table');
  });
});

describe('renderEmailPreview — HTML escaping of interpolated data', () => {
  it('escapes HTML-special characters from preview data', () => {
    const { html } = renderEmailPreview(
      'Subject {{name}}',
      '<p>Hello {{name}}</p>',
      { name: '<script>alert(1)</script>' },
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
