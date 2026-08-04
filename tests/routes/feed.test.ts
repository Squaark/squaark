import { describe, it, expect } from 'vitest';
import { feedItem } from '../../src/routes/storefront/feed';
import type { ProductRow } from '../../src/db/queries/products';

const base: ProductRow = {
  id: 'prod-1', title: 'Blue Mug', slug: 'blue-mug', description: '<p>A <b>nice</b> mug</p>',
  vendor: 'Acme', tags_text: '', published: 1, price: 1299, compare_at_price: null,
  on_sale: 0, available: 1, img_original: '/uploads/mug.jpg', img_thumbnail: null,
  img_medium: null, img_large: '/uploads/mug-large.jpg', img_alt: 'Mug',
  created_at: '2026-01-01', seo_title: null, seo_description: null, free_shipping: 0,
  tax_band_id: null, tax_rate: null, available_from: null, available_until: null, allow_preorder: 0,
};

const STORE = 'https://shop.example.com';

describe('feedItem', () => {
  it('builds a Google/Meta item with id, price, availability and absolute link/image', () => {
    const xml = feedItem(base, STORE, 'GBP');
    expect(xml).toContain('<g:id>prod-1</g:id>');
    expect(xml).toContain('<title>Blue Mug</title>');
    expect(xml).toContain('<link>https://shop.example.com/products/blue-mug</link>');
    expect(xml).toContain('<g:image_link>https://shop.example.com/uploads/mug-large.jpg</g:image_link>');
    expect(xml).toContain('<g:price>12.99 GBP</g:price>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).toContain('<g:brand>Acme</g:brand>');
  });

  it('strips HTML from the description', () => {
    const xml = feedItem(base, STORE, 'GBP');
    expect(xml).toContain('<description>A nice mug</description>');
    expect(xml).not.toContain('<b>');
  });

  it('emits regular + sale price when on sale', () => {
    const onSale = { ...base, price: 999, compare_at_price: 1299, on_sale: 1 };
    const xml = feedItem(onSale, STORE, 'GBP');
    expect(xml).toContain('<g:price>12.99 GBP</g:price>');
    expect(xml).toContain('<g:sale_price>9.99 GBP</g:sale_price>');
  });

  it('marks out-of-stock products and declares no identifier when brand is missing', () => {
    const noBrand = { ...base, vendor: null, available: 0 };
    const xml = feedItem(noBrand, STORE, 'GBP');
    expect(xml).toContain('<g:availability>out_of_stock</g:availability>');
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>');
    expect(xml).not.toContain('<g:brand>');
  });

  it('XML-escapes special characters in the title', () => {
    const xml = feedItem({ ...base, title: 'Tea & <Coffee>' }, STORE, 'GBP');
    expect(xml).toContain('<title>Tea &amp; &lt;Coffee&gt;</title>');
  });
});
