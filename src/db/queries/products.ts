import { query, queryOne } from '../connection';

export interface ProductRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  vendor: string | null;
  tags_text: string;
  published: number;         // SQLite BOOLEAN is INTEGER
  price: number;
  compare_at_price: number | null;
  on_sale: number;           // 1 | 0
  available: number;         // 1 | 0
  img_original: string | null;
  img_thumbnail: string | null;
  img_medium: string | null;
  img_large: string | null;
  img_alt: string | null;
  created_at: string;
  seo_title: string | null;
  seo_description: string | null;
  free_shipping: number; // 1 | 0
  tax_band_id: string | null;
  tax_rate: string | null; // resolved from tax_rates JOIN
}

export interface ProductImageRow {
  id: string;
  original: string;
  thumbnail: string;
  medium: string;
  large: string;
  alt: string;
  position: number;
}

export interface VariantRow {
  id: string;
  title: string;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  inventory_quantity: number;
  options: string;           // JSON stored as TEXT
  image_id: string | null;
  img_thumbnail: string | null;
  img_medium: string | null;
  img_large: string | null;
  img_original: string | null;
  img_alt: string | null;
  position: number;
}

// One summary row per product — ROW_NUMBER replaces Postgres DISTINCT ON
const PRODUCT_SUMMARY_SQL = `
  WITH fv AS (
    SELECT product_id, price, compare_at_price
    FROM (
      SELECT product_id, price, compare_at_price,
             ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY position) AS rn
      FROM product_variants
    ) WHERE rn = 1
  ),
  fi AS (
    SELECT product_id, original, thumbnail, medium, large, alt
    FROM (
      SELECT product_id, original, thumbnail, medium, large, alt,
             ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY position) AS rn
      FROM product_images
    ) WHERE rn = 1
  ),
  avail AS (
    SELECT product_id,
           MAX(CASE WHEN inventory_quantity > 0 THEN 1 ELSE 0 END) AS available
    FROM product_variants
    GROUP BY product_id
  )
  SELECT
    p.id, p.title, p.slug, p.description, p.vendor, p.tags_text, p.published, p.created_at,
    p.seo_title, p.seo_description, p.free_shipping,
    p.tax_band_id, tr.rate AS tax_rate,
    fv.price,
    fv.compare_at_price,
    CASE WHEN fv.compare_at_price IS NOT NULL AND fv.price < fv.compare_at_price THEN 1 ELSE 0 END AS on_sale,
    COALESCE(avail.available, 0) AS available,
    fi.original   AS img_original,
    fi.thumbnail  AS img_thumbnail,
    fi.medium     AS img_medium,
    fi.large      AS img_large,
    fi.alt        AS img_alt
  FROM products p
  LEFT JOIN fv         ON fv.product_id    = p.id
  LEFT JOIN fi         ON fi.product_id    = p.id
  LEFT JOIN avail      ON avail.product_id = p.id
  LEFT JOIN tax_bands  tb ON tb.id         = p.tax_band_id
  LEFT JOIN tax_rates  tr ON tr.band_id    = tb.id
`;

export function findAllProducts(limit?: number): ProductRow[] {
  const sql = `${PRODUCT_SUMMARY_SQL} WHERE p.published = 1 ORDER BY p.created_at DESC${limit ? ' LIMIT ?' : ''}`;
  return limit ? query<ProductRow>(sql, [limit]) : query<ProductRow>(sql);
}

export function searchProducts(q: string, limit = 40): ProductRow[] {
  // Escape LIKE metacharacters in the user-supplied query so e.g. "%" or "_"
  // can't turn a specific search into an unintentional match-everything (or
  // an expensive multi-wildcard) pattern.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${escaped}%`;
  return query<ProductRow>(
    `${PRODUCT_SUMMARY_SQL} WHERE p.published = 1 AND (p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR p.vendor LIKE ? ESCAPE '\\' OR p.tags_text LIKE ? ESCAPE '\\') ORDER BY p.created_at DESC LIMIT ?`,
    [like, like, like, like, limit]
  );
}

export function findProductsByCollection(collectionId: string, limit?: number, sort: 'featured' | 'newest' = 'featured'): ProductRow[] {
  const order = sort === 'newest' ? 'p.created_at DESC' : 'cp.position';
  const sql = `
    ${PRODUCT_SUMMARY_SQL}
    JOIN collection_products cp ON cp.product_id = p.id
    WHERE p.published = 1 AND cp.collection_id = ?
    ORDER BY ${order}${limit ? ' LIMIT ?' : ''}
  `;
  return limit
    ? query<ProductRow>(sql, [collectionId, limit])
    : query<ProductRow>(sql, [collectionId]);
}

export function findProductBySlug(slug: string): ProductRow | null {
  const rows = query<ProductRow>(`${PRODUCT_SUMMARY_SQL} WHERE p.slug = ? AND p.published = 1`, [slug]);
  return rows[0] ?? null;
}

export function findProductImages(productId: string): ProductImageRow[] {
  return query<ProductImageRow>(
    `SELECT id, original, thumbnail, medium, large, alt, position
     FROM product_images WHERE product_id = ? ORDER BY position`,
    [productId],
  );
}

export function findProductVariants(productId: string): VariantRow[] {
  return query<VariantRow>(`
    SELECT pv.id, pv.title, pv.price, pv.compare_at_price, pv.sku,
           pv.inventory_quantity, pv.options, pv.image_id, pv.position,
           pi.thumbnail AS img_thumbnail, pi.medium AS img_medium,
           pi.large     AS img_large,    pi.original AS img_original,
           pi.alt       AS img_alt
    FROM product_variants pv
    LEFT JOIN product_images pi ON pi.id = pv.image_id
    WHERE pv.product_id = ? ORDER BY pv.position
  `, [productId]);
}

export function findRelatedProducts(productId: string, limit = 4): ProductRow[] {
  return query<ProductRow>(
    `${PRODUCT_SUMMARY_SQL} WHERE p.published = 1 AND p.id != ? ORDER BY RANDOM() LIMIT ?`,
    [productId, limit],
  );
}

export function findVariantById(variantId: string): VariantRow | null {
  return queryOne<VariantRow>(`
    SELECT pv.id, pv.title, pv.price, pv.compare_at_price, pv.sku,
           pv.inventory_quantity, pv.options, pv.image_id, pv.product_id, pv.position,
           pi.thumbnail AS img_thumbnail, pi.medium AS img_medium,
           pi.large     AS img_large,    pi.original AS img_original,
           pi.alt       AS img_alt
    FROM product_variants pv
    LEFT JOIN product_images pi ON pi.id = pv.image_id
    WHERE pv.id = ?
  `, [variantId]);
}

/** Current stock for a variant, or null if the variant no longer exists. */
export function getVariantInventory(variantId: string): number | null {
  return queryOne<{ inventory_quantity: number }>(
    'SELECT inventory_quantity FROM product_variants WHERE id = ?',
    [variantId],
  )?.inventory_quantity ?? null;
}
