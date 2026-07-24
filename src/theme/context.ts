import { getAllSettings } from '../db/queries/admin';
import { getNav } from '../routes/admin/navigation';

export interface Money {
  amount: number;      // Minor units (cents)
  formatted: string;   // '$29.99'
  currency: string;    // 'USD'
}

export interface NavItem {
  label: string;
  url: string;
  active: boolean;
  children: NavItem[];
}

export interface Image {
  original: string;
  thumbnail: string;   // 200px wide
  medium: string;      // 600px wide
  large: string;       // 1200px wide
  alt: string;
}

export interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  price: Money;
  compareAtPrice: Money | null;
  onSale: boolean;
  image: Image | null;
  available: boolean;
  vendor: string | null;
}

export interface Variant {
  id: string;
  title: string;
  price: Money;
  compareAtPrice: Money | null;
  sku: string | null;
  available: boolean;
  options: Record<string, string>;
  image: Image | null;
}

export interface CartItem {
  id: string;
  productTitle: string;
  variantTitle: string;
  quantity: number;
  price: Money;
  lineTotal: Money;
  image: Image;
  productSlug: string;
  variantId: string;
  freeShipping: boolean;
}

export interface GlobalContext {
  store: {
    name: string;
    tagline: string;
    url: string;
    logo: string | null;
    icon: string | null;
    currency: { code: string; symbol: string; position: 'before' | 'after' };
    cartLabel: string;
    cartSlug: string;
    customerAccountsEnabled: boolean;
  };
  theme: {
    config: Record<string, Record<string, unknown>>;
  };
  cart: {
    itemCount: number;
    subtotal: Money;
  };
  customer: { loggedIn: boolean; firstName: string | null } | null;
  navigation: { main: NavItem[]; footer: NavItem[] };
  currentPath: string;
  pageTitle?: string;
  metaDescription?: string;
  ogImage?: string | null;
}

export interface ProductPageContext extends GlobalContext {
  product: {
    id: string;
    title: string;
    slug: string;
    description: string;
    price: Money;
    compareAtPrice: Money | null;
    onSale: boolean;
    images: Image[];
    variants: Variant[];
    options: { name: string; values: string[] }[];
    available: boolean;
    vendor: string | null;
    tags: string[];
    relatedProducts: ProductSummary[];
  };
}

export interface CollectionPageContext extends GlobalContext {
  collection: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    image: Image | null;
    products: ProductSummary[];
    pagination: {
      currentPage: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
      nextUrl: string | null;
      prevUrl: string | null;
    };
    sort: {
      current: string;
      options: { value: string; label: string }[];
    };
  };
}

export interface CartPageContext extends GlobalContext {
  cart: {
    items: CartItem[];
    itemCount: number;
    subtotal: Money;
    discountCode: string | null;
    discountAmount: Money | null;
    total: Money;
    empty: boolean;
    checkoutUrl: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function money(amount: number, currency = 'USD', symbol = '$'): Money {
  return {
    amount,
    formatted: `${symbol}${(amount / 100).toFixed(2)}`,
    currency,
  };
}

const DEFAULT_THEME_CONFIG: Record<string, Record<string, unknown>> = {
  colors: { primary: '#1A1A2E', accent: '#E94560', background: '#FFFFFF' },
  typography: { headingFont: 'Inter' },
  layout: {
    productsPerRow: '3',
    showHero: true,
    heroHeading: 'Welcome to our store',
    heroImage: '',
    featuredSections: [{ title: 'Featured Products', collection: '', count: '8' }],
  },
};

export const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

export function buildGlobalContext(
  currentPath: string,
  themeConfig: Record<string, Record<string, unknown>> = DEFAULT_THEME_CONFIG,
): GlobalContext {
  const settings = getAllSettings();
  const currencyCode = settings.store_currency ?? 'GBP';
  return {
    store: {
      name: settings.store_name ?? 'My Store',
      tagline: settings.store_tagline ?? '',
      url: settings.store_url ?? 'http://localhost:3000',
      logo: settings.store_logo || null,
      icon: settings.store_icon || null,
      cartLabel: settings.cart_label || 'Cart',
      cartSlug: settings.cart_slug || 'cart',
      customerAccountsEnabled: settings.customer_accounts_enabled !== '0',
      currency: {
        code: currencyCode,
        symbol: CURRENCY_SYMBOLS[currencyCode] ?? currencyCode,
        position: 'before',
      },
    },
    theme: { config: themeConfig },
    cart: { itemCount: 0, subtotal: money(0) },
    customer: null,
    navigation: {
      main: getNav(settings, 'main').map(item => ({
        ...item,
        active: item.url === '/' ? currentPath === '/' : currentPath.startsWith(item.url),
        children: [],
      })),
      footer: getNav(settings, 'footer').map(item => ({
        ...item,
        active: false,
        children: [],
      })),
    },
    currentPath,
  };
}

