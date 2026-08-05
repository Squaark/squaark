import { sanitizeSections } from '../theme/sections';
import { listFeaturedProducts } from './collections';
import { findReusableById } from '../db/queries/reusable-sections';

/**
 * Turns a page's stored section JSON into render-ready sections: it re-sanitises
 * against the schema (defence in depth) and resolves any *dynamic* sections —
 * currently `featured_products`, which needs its product list fetched at render
 * time. Static sections (hero, text, …) pass straight through. Used for every
 * section-built page (including whichever page is set as the home page), and by
 * the live-preview endpoint. The result is rendered via `renderSection`.
 */
export async function resolveSections(
  raw: unknown,
  opts: { expandReusable?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const sections = sanitizeSections(raw);
  const out: Record<string, unknown>[] = [];
  for (const s of sections) {
    if (s.type === 'reusable') {
      // Inline the referenced block's sections. One level only — reusables
      // nested inside a block are not expanded, which also prevents cycles.
      if (opts.expandReusable === false) { out.push({ ...s }); continue; }
      const block = findReusableById(String(s.block || ''));
      if (block) out.push(...(await resolveSections(block.sections, { expandReusable: false })));
      continue;
    }
    if (s.type === 'featured_products') {
      const collectionSlug = String(s.collection || '');
      const count = parseInt(String(s.count || '8'), 10) || 8;
      out.push({ ...s, collectionSlug, products: await listFeaturedProducts(collectionSlug, count) });
      continue;
    }
    out.push({ ...s });
  }
  return out;
}
