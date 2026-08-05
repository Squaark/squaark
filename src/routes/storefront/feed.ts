import type { FastifyInstance, FastifyReply } from 'fastify';
import { findAllProducts, type ProductRow } from '../../db/queries/products';
import { getAllSettings } from '../../db/queries/admin';
import { storeUrl as resolveStoreUrl } from '../../store-url';

// Product feed for Google Merchant Center and the Meta (Facebook) commerce
// catalogue. Both accept the RSS 2.0 + `g:` namespace format, so one feed
// serves both. Published at GET /feed.xml.

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

/** Absolute URL for a possibly-relative asset path (feeds require full URLs). */
function absoluteUrl(base: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}/${url.replace(/^\/+/, '')}`;
}

function price(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

/** Builds one <item> for a product summary row. Exported for unit testing. */
export function feedItem(p: ProductRow, storeUrl: string, currency: string): string {
  const link = `${storeUrl}/products/${encodeURIComponent(p.slug)}`;
  const image = p.img_large || p.img_original || '';
  const description = (p.seo_description || p.description || p.title)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

  const fields: string[] = [
    `<g:id>${xmlEscape(p.id)}</g:id>`,
    `<title>${xmlEscape(p.title)}</title>`,
    `<description>${xmlEscape(description || p.title)}</description>`,
    `<link>${xmlEscape(link)}</link>`,
    `<g:condition>new</g:condition>`,
    `<g:availability>${p.available ? 'in_stock' : 'out_of_stock'}</g:availability>`,
  ];

  if (image) fields.push(`<g:image_link>${xmlEscape(absoluteUrl(storeUrl, image))}</g:image_link>`);

  // On sale: advertise the regular (was) price plus the discounted sale price;
  // otherwise just the single price.
  if (p.on_sale && p.compare_at_price) {
    fields.push(`<g:price>${xmlEscape(price(p.compare_at_price, currency))}</g:price>`);
    fields.push(`<g:sale_price>${xmlEscape(price(p.price, currency))}</g:sale_price>`);
  } else {
    fields.push(`<g:price>${xmlEscape(price(p.price, currency))}</g:price>`);
  }

  const brand = (p.vendor || '').trim();
  if (brand) fields.push(`<g:brand>${xmlEscape(brand)}</g:brand>`);
  // With no brand and no GTIN/MPN, tell the platforms identifiers are absent so
  // the item isn't rejected for a "missing identifier" error.
  if (!brand) fields.push(`<g:identifier_exists>no</g:identifier_exists>`);

  return `<item>\n      ${fields.join('\n      ')}\n    </item>`;
}

export async function feedRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/feed.xml', async (_req, reply: FastifyReply) => {
    const settings = getAllSettings();
    const storeUrl = resolveStoreUrl(settings);
    const currency = settings.store_currency ?? 'GBP';
    const storeName = settings.store_name ?? 'My Store';

    const items = findAllProducts().map((p) => feedItem(p, storeUrl, currency)).join('\n    ');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(storeName)}</title>
    <link>${xmlEscape(storeUrl)}</link>
    <description>${xmlEscape(settings.store_tagline || `${storeName} product feed`)}</description>
    ${items}
  </channel>
</rss>`;

    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.type('application/xml').send(xml);
  });
}
