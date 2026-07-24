import { query, queryOne } from '../connection';

export interface CollectionRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  published: number;
  product_count: number;
  seo_title: string | null;
  seo_description: string | null;
}

export function findCollectionBySlug(slug: string): CollectionRow | null {
  return queryOne<CollectionRow>(`
    SELECT c.id, c.title, c.slug, c.description, c.published,
           c.seo_title, c.seo_description,
           COUNT(cp.product_id) AS product_count
    FROM collections c
    LEFT JOIN collection_products cp ON cp.collection_id = c.id
    WHERE c.slug = ? AND c.published = 1
    GROUP BY c.id
  `, [slug]);
}

export function findAllCollections(): CollectionRow[] {
  return query<CollectionRow>(`
    SELECT c.id, c.title, c.slug, c.description, c.published,
           c.seo_title, c.seo_description,
           COUNT(cp.product_id) AS product_count
    FROM collections c
    LEFT JOIN collection_products cp ON cp.collection_id = c.id
    WHERE c.published = 1
    GROUP BY c.id
    ORDER BY c.title
  `);
}
