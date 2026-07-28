import { describe, it, expect } from 'vitest';
import { isWooSystemPage } from '../../../src/import/woocommerce/mapper';

describe('isWooSystemPage', () => {
  it('flags WooCommerce system pages the platform provides natively', () => {
    for (const slug of ['cart', 'basket', 'bag', 'checkout', 'my-account', 'shop', 'order-received']) {
      expect(isWooSystemPage(slug), slug).toBe(true);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isWooSystemPage('  Checkout ')).toBe(true);
    expect(isWooSystemPage('MY-ACCOUNT')).toBe(true);
  });

  it('does not flag genuine content pages', () => {
    for (const slug of ['about', 'contact', 'privacy', 'shipping-policy', 'our-story']) {
      expect(isWooSystemPage(slug), slug).toBe(false);
    }
  });
});
