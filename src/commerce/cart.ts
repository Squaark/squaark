import {
  createCart,
  findCart,
  findCartItems,
  upsertCartItem,
  updateCartItemQuantity,
  removeCartItem,
  type CartItemRow,
} from '../db/queries/cart';
import { findVariantById } from '../db/queries/products';
import { findDiscountByCode } from '../db/queries/discounts';
import { validateDiscount } from './discounts';
import type { CartItem, Image } from '../theme/context';
import { money } from '../theme/context';

export interface CartSummary {
  itemCount: number;
  subtotal: ReturnType<typeof money>;
}

export interface CartPage {
  items: CartItem[];
  itemCount: number;
  subtotal: ReturnType<typeof money>;
  discountCode: string | null;
  discountAmount: ReturnType<typeof money> | null;
  total: ReturnType<typeof money>;
  empty: boolean;
  checkoutUrl: string;
}

function rowToImage(row: CartItemRow): Image {
  return {
    original:  row.img_original  ?? '',
    thumbnail: row.img_thumbnail ?? '',
    medium:    row.img_medium    ?? '',
    large:     row.img_large     ?? '',
    alt:       row.img_alt       ?? row.product_title,
  };
}

function rowToCartItem(row: CartItemRow): CartItem {
  return {
    id:           row.id,
    productTitle: row.product_title,
    variantTitle: row.variant_title,
    quantity:     row.quantity,
    price:        money(row.price),
    lineTotal:    money(row.price * row.quantity),
    image:        rowToImage(row),
    productSlug:   row.product_slug,
    variantId:     row.variant_id,
    freeShipping:  row.free_shipping === 1,
    isDigital:     row.is_digital === 1,
    taxRate:       row.tax_rate ?? null,
  };
}

export async function ensureCart(cartId: string | undefined): Promise<string> {
  if (cartId && findCart(cartId)) return cartId;
  return createCart();
}

export async function getCartSummary(cartId: string): Promise<CartSummary> {
  const items = findCartItems(cartId);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  return { itemCount, subtotal: money(items.reduce((s, i) => s + i.price * i.quantity, 0)) };
}

export async function getCartPage(cartId: string): Promise<CartPage> {
  const cart  = findCart(cartId);
  const items = findCartItems(cartId).map(rowToCartItem);

  const itemCount      = items.reduce((s, i) => s + i.quantity, 0);
  const subtotalAmount = items.reduce((s, i) => s + i.price.amount * i.quantity, 0);

  // Recompute the discount from the stored code against the *current* subtotal,
  // so it can never be stale. A code that's since become invalid (expired, cart
  // now below its minimum) simply produces no discount — it stays on the cart
  // and re-applies if the cart qualifies again.
  let discountCode: string | null = null;
  let discountAmount = 0;
  if (cart?.discount_code) {
    const v = validateDiscount(findDiscountByCode(cart.discount_code), subtotalAmount);
    if (v.ok) { discountCode = v.code; discountAmount = v.amount; }
  }

  return {
    items,
    itemCount,
    subtotal:       money(subtotalAmount),
    discountCode,
    discountAmount: discountAmount > 0 ? money(discountAmount) : null,
    total:          money(Math.max(0, subtotalAmount - discountAmount)),
    empty:          items.length === 0,
    checkoutUrl:    '/checkout',
  };
}

export async function addToCart(cartId: string, variantId: string, quantity: number): Promise<void> {
  const variant = findVariantById(variantId);
  if (!variant) throw new Error('Variant not found');
  if (variant.inventory_quantity <= 0) throw new Error('Out of stock');
  upsertCartItem(cartId, variantId, quantity);
}

export async function updateCartItem(cartId: string, itemId: string, quantity: number): Promise<void> {
  if (quantity <= 0) removeCartItem(cartId, itemId);
  else updateCartItemQuantity(cartId, itemId, quantity);
}

export async function removeFromCart(cartId: string, itemId: string): Promise<void> {
  removeCartItem(cartId, itemId);
}
