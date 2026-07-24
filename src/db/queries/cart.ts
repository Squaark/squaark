import { randomUUID } from 'crypto';
import { query, queryOne, execute, executeReturning } from '../connection';

export interface CartRow {
  id: string;
  discount_code: string | null;
  discount_amount: number;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  variant_title: string;
  price: number;
  product_id: string;
  product_title: string;
  product_slug: string;
  img_thumbnail: string | null;
  img_medium: string | null;
  img_large: string | null;
  img_original: string | null;
  img_alt: string | null;
  free_shipping: number; // 1 | 0
  is_digital: number; // 1 | 0
  tax_rate: string | null; // resolved from tax_rates JOIN
}

export function createCart(): string {
  const id = randomUUID();
  execute('INSERT INTO carts (id) VALUES (?)', [id]);
  return id;
}

export function findCart(cartId: string): CartRow | null {
  return queryOne<CartRow>(
    'SELECT id, discount_code, discount_amount FROM carts WHERE id = ?',
    [cartId],
  );
}

export function findCartItems(cartId: string): CartItemRow[] {
  return query<CartItemRow>(`
    SELECT
      ci.id, ci.cart_id, ci.variant_id, ci.quantity,
      pv.title     AS variant_title,
      pv.price,
      p.id           AS product_id,
      p.title        AS product_title,
      p.slug         AS product_slug,
      p.free_shipping, p.is_digital, tr.rate AS tax_rate,
      COALESCE(pvi.thumbnail, ppi.thumbnail) AS img_thumbnail,
      COALESCE(pvi.medium,    ppi.medium)    AS img_medium,
      COALESCE(pvi.large,     ppi.large)     AS img_large,
      COALESCE(pvi.original,  ppi.original)  AS img_original,
      COALESCE(pvi.alt,       ppi.alt)       AS img_alt
    FROM cart_items ci
    JOIN product_variants pv ON pv.id = ci.variant_id
    JOIN products p           ON p.id = pv.product_id
    LEFT JOIN tax_bands  tb  ON tb.id       = p.tax_band_id
    LEFT JOIN tax_rates  tr  ON tr.band_id  = tb.id
    LEFT JOIN product_images pvi ON pvi.id = pv.image_id
    LEFT JOIN product_images ppi ON ppi.product_id = p.id AND ppi.position = (
      SELECT MIN(position) FROM product_images WHERE product_id = p.id
    )
    WHERE ci.cart_id = ?
    ORDER BY ci.created_at
  `, [cartId]);
}

export function upsertCartItem(cartId: string, variantId: string, quantity: number): void {
  const id = randomUUID();
  execute(`
    INSERT INTO cart_items (id, cart_id, variant_id, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (cart_id, variant_id)
    DO UPDATE SET quantity   = cart_items.quantity + excluded.quantity,
                  updated_at = datetime('now')
  `, [id, cartId, variantId, quantity]);
}

export function updateCartItemQuantity(cartId: string, itemId: string, quantity: number): void {
  execute(
    `UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ? AND cart_id = ?`,
    [quantity, itemId, cartId],
  );
}

export function removeCartItem(cartId: string, itemId: string): void {
  execute('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [itemId, cartId]);
}

export function clearCart(cartId: string): void {
  execute('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
}
