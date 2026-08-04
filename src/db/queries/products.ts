import { query, queryOne, execute } from '../connection';

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
  available_from: string | null;  // YYYY-MM-DD or null
  available_until: string | null; // YYYY-MM-DD or null
  allow_preorder: number;         // 1 | 0 — orderable during the upcoming window
  requires_slot: number;          // 1 | 0 — needs a booked delivery/collection slot
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
    p.seo_title, p.seo_description, p.free_shipping, p.requires_slot,
    p.available_from, p.available_until, p.allow_preorder,
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

/** Products sharing at least one collection with the given product (newest first). */
export function findRelatedByCollection(productId: string, limit: number): ProductRow[] {
  return query<ProductRow>(
    `${PRODUCT_SUMMARY_SQL}
     WHERE p.published = 1 AND p.id != ?
       AND p.id IN (
         SELECT DISTINCT cp2.product_id
         FROM collection_products cp1
         JOIN collection_products cp2 ON cp2.collection_id = cp1.collection_id
         WHERE cp1.product_id = ? AND cp2.product_id != ?
       )
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [productId, productId, productId, limit],
  );
}

/** Newest published products excluding the given ids — used to top up a thin related row. */
export function findNewestExcluding(excludeIds: string[], limit: number): ProductRow[] {
  const notIn = excludeIds.length ? `AND p.id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
  return query<ProductRow>(
    `${PRODUCT_SUMMARY_SQL} WHERE p.published = 1 ${notIn} ORDER BY p.created_at DESC LIMIT ?`,
    [...excludeIds, limit],
  );
}

/** The merchant-picked related product ids for a product, in display order. */
export function findManualRelatedIds(productId: string): string[] {
  return query<{ related_product_id: string }>(
    'SELECT related_product_id FROM related_products WHERE product_id = ? ORDER BY position',
    [productId],
  ).map((r) => r.related_product_id);
}

/** Product summaries for a set of ids (published only); caller re-orders as needed. */
export function findPublishedProductsByIds(ids: string[]): ProductRow[] {
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  return query<ProductRow>(`${PRODUCT_SUMMARY_SQL} WHERE p.published = 1 AND p.id IN (${ph})`, ids);
}

/** Replaces a product's manual related list with the given ordered ids. */
export function setRelatedProducts(productId: string, relatedIds: string[]): void {
  execute('DELETE FROM related_products WHERE product_id = ?', [productId]);
  relatedIds.forEach((rid, i) => {
    if (rid && rid !== productId) {
      execute(
        'INSERT OR IGNORE INTO related_products (product_id, related_product_id, position) VALUES (?, ?, ?)',
        [productId, rid, i],
      );
    }
  });
}

/** Distinct product ids currently in a cart. */
export function getCartProductIds(cartId: string): string[] {
  return query<{ product_id: string }>(
    `SELECT DISTINCT v.product_id FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
      WHERE ci.cart_id = ?`,
    [cartId],
  ).map((r) => r.product_id);
}

/** Published products sharing a collection with anything in the cart, excluding cart products. */
export function findCartRecommendations(cartProductIds: string[], limit: number): ProductRow[] {
  if (cartProductIds.length === 0) return [];
  const ph = cartProductIds.map(() => '?').join(',');
  return query<ProductRow>(
    `${PRODUCT_SUMMARY_SQL}
     WHERE p.published = 1 AND p.id NOT IN (${ph})
       AND p.id IN (
         SELECT DISTINCT cp2.product_id
         FROM collection_products cp1
         JOIN collection_products cp2 ON cp2.collection_id = cp1.collection_id
         WHERE cp1.product_id IN (${ph})
       )
     ORDER BY RANDOM()
     LIMIT ?`,
    [...cartProductIds, ...cartProductIds, limit],
  );
}

/** Admin product search by title (includes unpublished). */
export function searchProductsByTitle(q: string, limit = 10): { id: string; title: string }[] {
  return query<{ id: string; title: string }>(
    'SELECT id, title FROM products WHERE title LIKE ? ORDER BY title LIMIT ?',
    [`%${q}%`, limit],
  );
}

/** Map of product id → the collection ids it belongs to (for discount targeting). */
export function getCollectionIdsForProducts(productIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (productIds.length === 0) return out;
  const ph = productIds.map(() => '?').join(',');
  const rows = query<{ product_id: string; collection_id: string }>(
    `SELECT product_id, collection_id FROM collection_products WHERE product_id IN (${ph})`,
    productIds,
  );
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    list.push(r.collection_id);
    out.set(r.product_id, list);
  }
  return out;
}

/** id + title for a set of product ids (any published state) — for the admin related picker. */
export function getProductNamesByIds(ids: string[]): { id: string; title: string }[] {
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  return query<{ id: string; title: string }>(`SELECT id, title FROM products WHERE id IN (${ph})`, ids);
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

/** True if any of the given variants belongs to a product that needs a booked slot. */
export function anyVariantRequiresSlot(variantIds: string[]): boolean {
  const ids = variantIds.filter(Boolean);
  if (ids.length === 0) return false;
  const placeholders = ids.map(() => '?').join(',');
  const row = queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${placeholders}) AND p.requires_slot = 1`,
    ids,
  );
  return (row?.n ?? 0) > 0;
}

/** The parent product's availability window + preorder flag for a variant (add-to-cart gating). */
export function getProductAvailabilityByVariant(
  variantId: string,
): { available_from: string | null; available_until: string | null; allow_preorder: number } | null {
  return queryOne<{ available_from: string | null; available_until: string | null; allow_preorder: number }>(
    `SELECT p.available_from, p.available_until, p.allow_preorder
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = ?`,
    [variantId],
  );
}
