import { sanitizeSections } from '../theme/sections';
import { listFeaturedProducts } from './collections';

/**
 * Turns a page's stored section JSON into render-ready sections: it re-sanitises
 * against the schema (defence in depth) and resolves any *dynamic* sections —
 * currently `featured_products`, which needs its product list fetched at render
 * time. Static sections (hero, text, …) pass straight through. Used for every
 * section-built page (including whichever page is set as the home page), and by
 * the live-preview endpoint. The result is rendered via `renderSection`.
 */
export async function resolveSections(raw: unknown): Promise<Record<string, unknown>[]> {
  const sections = sanitizeSections(raw);
  return Promise.all(sections.map(async (s) => {
    if (s.type === 'featured_products') {
      const collectionSlug = String(s.collection || '');
      const count = parseInt(String(s.count || '8'), 10) || 8;
      return {
        ...s,
        collectionSlug,
        products: await listFeaturedProducts(collectionSlug, count),
      };
    }
    return { ...s };
  }));
}
