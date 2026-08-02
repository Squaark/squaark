import { describe, it, expect } from 'vitest';
import {
  pixelSettings, hasAnyPixel, buildPixelHead, buildPixelNoscript, buildPurchasePixel,
} from '../../src/marketing/pixels';

const empty = pixelSettings({});

describe('pixelSettings / hasAnyPixel', () => {
  it('reads the pixel ids from the settings map and trims them', () => {
    const p = pixelSettings({ meta_pixel_id: ' 123 ', ga4_measurement_id: 'G-ABC' });
    expect(p.metaPixelId).toBe('123');
    expect(p.ga4MeasurementId).toBe('G-ABC');
    expect(hasAnyPixel(p)).toBe(true);
  });

  it('reports no pixels when nothing is configured', () => {
    expect(hasAnyPixel(empty)).toBe(false);
  });
});

describe('buildPixelHead', () => {
  it('is empty when no ids are set', () => {
    expect(buildPixelHead(empty)).toBe('');
  });

  it('emits the Meta Pixel init + PageView', () => {
    const html = buildPixelHead(pixelSettings({ meta_pixel_id: '9988' }));
    expect(html).toContain("fbq('init', '9988')");
    expect(html).toContain("fbq('track', 'PageView')");
  });

  it('loads gtag once and configs both GA4 and Google Ads', () => {
    const html = buildPixelHead(pixelSettings({ ga4_measurement_id: 'G-AAA', google_ads_id: 'AW-BBB' }));
    expect(html).toContain('googletagmanager.com/gtag/js?id=G-AAA');
    expect(html).toContain("gtag('config', 'G-AAA')");
    expect(html).toContain("gtag('config', 'AW-BBB')");
  });

  it('strips characters that could break out of the inline script', () => {
    const html = buildPixelHead(pixelSettings({ meta_pixel_id: "123');alert(1)//" }));
    expect(html).not.toContain('alert(1)');
    expect(html).toContain("fbq('init', '123alert1')");
  });
});

describe('buildPixelNoscript', () => {
  it('renders the Meta tracking img only when a Meta id is set', () => {
    expect(buildPixelNoscript(empty)).toBe('');
    const html = buildPixelNoscript(pixelSettings({ meta_pixel_id: '77' }));
    expect(html).toContain('facebook.com/tr?id=77&ev=PageView&noscript=1');
  });
});

describe('buildPurchasePixel', () => {
  const purchase = { orderId: '1005', value: 29.99, currency: 'GBP', contentIds: ['SKU-1', 'SKU-2'] };

  it('is empty when no pixel is configured', () => {
    expect(buildPurchasePixel(empty, purchase)).toBe('');
  });

  it('fires a Meta Purchase with value/currency/content_ids', () => {
    const html = buildPurchasePixel(pixelSettings({ meta_pixel_id: '77' }), purchase);
    expect(html).toContain("fbq('track', 'Purchase'");
    expect(html).toContain('value: 29.99');
    expect(html).toContain('"GBP"');
    expect(html).toContain('["SKU-1","SKU-2"]');
  });

  it('fires a GA4 purchase with the transaction id', () => {
    const html = buildPurchasePixel(pixelSettings({ ga4_measurement_id: 'G-AAA' }), purchase);
    expect(html).toContain("gtag('event', 'purchase'");
    expect(html).toContain('transaction_id: "1005"');
  });

  it('fires a Google Ads conversion only when both id and label are present', () => {
    const withoutLabel = buildPurchasePixel(pixelSettings({ google_ads_id: 'AW-BBB' }), purchase);
    expect(withoutLabel).not.toContain("'conversion'");

    const withLabel = buildPurchasePixel(
      pixelSettings({ google_ads_id: 'AW-BBB', google_ads_conversion_label: 'lbl123' }),
      purchase,
    );
    expect(withLabel).toContain("gtag('event', 'conversion'");
    expect(withLabel).toContain('"AW-BBB/lbl123"');
  });
});
