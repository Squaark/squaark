import {
  createCart,
  findCart,
  findCartItems,
  upsertCartItem,
  updateCartItemQuantity,
  removeCartItem,
  type CartItemRow,
} from '../db/queries/cart';
import { findVariantById, getCollectionIdsForProducts, anyVariantRequiresSlot, getProductAvailabilityByVariant } from '../db/queries/products';
import { getGroupForCustomer } from '../db/queries/customer-groups';
import { computeAvailability } from './availability';
import { findDiscountByCode } from '../db/queries/discounts';
import { validateDiscount } from './discounts';
import { listActiveAutomaticDiscounts, rowToPromo } from '../db/queries/automatic-discounts';
import { computeAutomaticDiscounts } from './automatic-discounts';
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
  appliedDiscounts: { name: string; amount: ReturnType<typeof money> }[];
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

export async function getCartPage(cartId: string, customerId?: string | null): Promise<CartPage> {
  const cart  = findCart(cartId);
  const rows  = findCartItems(cartId);
  const items = rows.map(rowToCartItem);

  const itemCount      = items.reduce((s, i) => s + i.quantity, 0);
  const subtotalAmount = items.reduce((s, i) => s + i.price.amount * i.quantity, 0);

  // Recompute the entered code against the *current* subtotal so it's never
  // stale — a code that no longer qualifies simply produces no discount but
  // stays on the cart and re-applies if the cart qualifies again.
  let codeDiscount: { code: string; amount: number } | null = null;
  if (cart?.discount_code) {
    const v = validateDiscount(findDiscountByCode(cart.discount_code), subtotalAmount);
    if (v.ok) codeDiscount = { code: v.code, amount: v.amount };
  }

  // Fold in automatic discounts (best order-level of code vs auto, plus BOGO).
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  const collections = getCollectionIdsForProducts(productIds);
  const dItems = rows.map((r) => ({
    productId: r.product_id,
    collectionIds: collections.get(r.product_id) ?? [],
    unitPrice: r.price,
    quantity: r.quantity,
  }));
  const promos = listActiveAutomaticDiscounts().map(rowToPromo);
  const { applied, total: discountTotal } = computeAutomaticDiscounts(dItems, subtotalAmount, promos, codeDiscount);

  // Customer-group (trade/wholesale) discount — a store-wide % off the list
  // subtotal, shown as its own line and folded into the total.
  const appliedAll: { name: string; amount: number }[] = applied.map((a) => ({ name: a.name, amount: a.amount }));
  let discountTotalAll = discountTotal;
  const group = getGroupForCustomer(customerId);
  if (group && group.discount_percent > 0 && subtotalAmount > 0) {
    const groupAmount = Math.round((subtotalAmount * group.discount_percent) / 100);
    if (groupAmount > 0) {
      appliedAll.push({ name: `${group.name} discount (${group.discount_percent}%)`, amount: groupAmount });
      discountTotalAll += groupAmount;
    }
  }

  return {
    items,
    itemCount,
    subtotal:         money(subtotalAmount),
    discountCode:     cart?.discount_code ?? null,
    discountAmount:   discountTotalAll > 0 ? money(discountTotalAll) : null,
    appliedDiscounts: appliedAll.map((a) => ({ name: a.name, amount: money(a.amount) })),
    total:            money(Math.max(0, subtotalAmount - discountTotalAll)),
    empty:            items.length === 0,
    checkoutUrl:      '/checkout',
  };
}

export async function addToCart(cartId: string, variantId: string, quantity: number): Promise<void> {
  const variant = findVariantById(variantId);
  if (!variant) throw new Error('Variant not found');
  if (variant.inventory_quantity <= 0) throw new Error('Out of stock');
  // Availability window ("product calendar"): the product may be visible but not
  // yet (or no longer) purchasable. Enforce server-side so a direct POST can't
  // bypass the disabled add-to-cart button.
  const win = getProductAvailabilityByVariant(variantId);
  if (win) {
    const a = computeAvailability(win.available_from, win.available_until, undefined, win.allow_preorder === 1);
    if (!a.orderable) throw new Error(a.status === 'upcoming' ? 'Not yet available' : 'No longer available');
  }
  upsertCartItem(cartId, variantId, quantity);
}

/** True if any item in the cart belongs to a product that needs a booked delivery/collection slot. */
export function cartRequiresSlot(items: { variantId: string }[]): boolean {
  return anyVariantRequiresSlot(items.map(i => i.variantId));
}

/**
 * Cart items whose product is currently outside its availability window — used
 * to re-check at checkout, since an item may have been added while purchasable
 * and its window then opened/closed before the customer paid.
 */
export function findUnavailableItems<T extends { variantId: string }>(items: T[]): T[] {
  return items.filter((it) => {
    const win = getProductAvailabilityByVariant(it.variantId);
    if (!win) return false;
    return !computeAvailability(win.available_from, win.available_until, undefined, win.allow_preorder === 1).orderable;
  });
}

export async function updateCartItem(cartId: string, itemId: string, quantity: number): Promise<void> {
  if (quantity <= 0) removeCartItem(cartId, itemId);
  else updateCartItemQuantity(cartId, itemId, quantity);
}

export async function removeFromCart(cartId: string, itemId: string): Promise<void> {
  removeCartItem(cartId, itemId);
}
