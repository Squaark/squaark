import path from 'path';
import { existsSync } from 'fs';
import { ThemeEngine } from './engine';
import { loadManifest, resolveConfigNested, type ThemeManifest, type ConfigField } from './config';
import type { Money } from './context';

// ── Report shape ─────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning';
export type CheckCategory = 'manifest' | 'templates' | 'partials' | 'render' | 'functionality' | 'assets';

export interface CheckResult {
  id: string;
  category: CheckCategory;
  /** Severity this check carries WHEN it fails. Passing checks are informational. */
  severity: Severity;
  status: 'pass' | 'fail';
  title: string;
  detail: string;
}

export interface ValidationReport {
  themeName: string;
  /** No error-severity failures — the theme will function. Warnings don't affect this. */
  ok: boolean;
  totals: { passed: number; warnings: number; errors: number };
  results: CheckResult[];
}

// ── Required contract ────────────────────────────────────────────────────────
// Templates the storefront renders by name (engine throws if one is called and
// missing). Splitting core (store can't work without them) from account
// (only reached when customer accounts are on) lets us grade severity fairly.

const CORE_TEMPLATES = [
  'index', 'product', 'collection', 'cart', 'search', 'page', '404',
  'checkout', 'checkout-success',
];
const ACCOUNT_TEMPLATES = [
  'account-login', 'account-register', 'account-forgot',
  'account-reset', 'account-orders', 'account-order',
];
const REQUIRED_PARTIALS = ['header', 'footer', 'product-card', 'pagination', 'cart-contents'];
const VALID_FIELD_TYPES = new Set(['color', 'text', 'select', 'boolean', 'image', 'repeater', 'collection']);

// ── Fixtures ─────────────────────────────────────────────────────────────────
// A synthetic store the templates render against, exercising the full context
// contract (products on sale, a cart with items, pagination, variants, tax).

const IMG = {
  original: '/sample.jpg', thumbnail: '/sample.jpg',
  medium: '/sample.jpg', large: '/sample.jpg', alt: 'Sample product',
};

function m(amount: number): Money {
  return { amount, formatted: `£${(amount / 100).toFixed(2)}`, currency: 'GBP' };
}

function productSummary(i: number) {
  return {
    id: `p${i}`, title: `Sample Product ${i}`, slug: `sample-${i}`,
    price: m(1999), compareAtPrice: m(2999), onSale: true,
    image: IMG, available: true, vendor: 'Acme', taxRate: '20',
  };
}

function variant(i: number) {
  return {
    id: `v${i}`, title: i === 0 ? 'Default' : `Variant ${i}`,
    price: m(1999), compareAtPrice: null, sku: `SKU-${i}`,
    available: true, options: { Size: 'M' }, image: IMG,
  };
}

const CART_ITEM = {
  id: 'ci1', productTitle: 'Sample Product', variantTitle: 'Default', quantity: 2,
  price: m(1999), lineTotal: m(3998), image: IMG, productSlug: 'sample-1',
  variantId: 'v1', freeShipping: false, isDigital: false, taxRate: '20',
};

const SAMPLE_ORDER = {
  id: 'o1', order_number: 1001, email: 'sample@example.com', status: 'paid',
  fulfillment: 'unfulfilled', subtotal: 3998, discount_amount: 0, shipping: 499,
  total: 4497, currency: 'GBP', tax_amount: 666, shipping_title: 'Standard',
  created_at: '2026-01-01 12:00:00', updated_at: '2026-01-01 12:00:00',
  items: [
    { product_title: 'Sample Product', variant_title: 'Default', sku: 'SKU-0', quantity: 2, price: 1999, line_total: 3998 },
  ],
  shippingAddress: { firstName: 'Sam', lastName: 'Shopper', line1: '1 High St', city: 'Townsville', postcode: 'AB1 2CD', country: 'GB' },
};

function globalCtx(themeConfig: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return {
    store: {
      name: 'Sample Store', tagline: 'Curated things', url: 'http://localhost:3000',
      logo: null, icon: null,
      currency: { code: 'GBP', symbol: '£', position: 'before' },
      cartLabel: 'Cart', cartSlug: 'cart', customerAccountsEnabled: true,
    },
    theme: { config: themeConfig },
    cart: { itemCount: 2, subtotal: m(3998) },
    customer: null,
    navigation: {
      main: [
        { label: 'Home', url: '/', active: true, children: [] },
        { label: 'Shop', url: '/collections/all', active: false, children: [] },
      ],
      footer: [{ label: 'About', url: '/about', active: false, children: [] }],
    },
    currentPath: '/',
    pageTitle: 'Sample Store',
    metaDescription: 'A sample store used to validate this theme.',
    ogImage: null,
    tax: { enabled: true, displayMode: 'inc', label: 'VAT' },
    csrfToken: 'validation-csrf-token',
    cssVars: '<style>:root{--color-primary:#111}</style>',
  };
}

const CART_FIXTURE = {
  items: [CART_ITEM], itemCount: 2, subtotal: m(3998),
  discountCode: null, discountAmount: null, total: m(3998),
  empty: false, checkoutUrl: '/checkout',
};

/** Builds the context each renderable template is exercised with. */
function fixtureFor(template: string, g: Record<string, unknown>): Record<string, unknown> {
  switch (template) {
    case 'index':
      return {
        ...g,
        featuredSections: [{
          title: 'Featured Products', collectionSlug: 'all',
          products: [productSummary(1), productSummary(2), productSummary(3)],
        }],
        showHero: true, heroEyebrow: 'New Collection', heroHeading: 'Welcome',
        heroSubheading: 'Curated goods for considered living.',
      };
    case 'product':
      return {
        ...g, pageTitle: 'Sample Product',
        product: {
          id: 'p1', title: 'Sample Product', slug: 'sample-1',
          description: '<p>A lovely sample.</p>', price: m(1999), compareAtPrice: m(2999),
          onSale: true, images: [IMG], variants: [variant(0), variant(1)],
          options: [{ name: 'Size', values: ['S', 'M', 'L'] }], available: true,
          vendor: 'Acme', tags: ['new', 'featured'],
          relatedProducts: [productSummary(2), productSummary(3)],
          taxRate: '20', seoTitle: null, seoDescription: null, isDigital: false,
        },
      };
    case 'collection':
      return {
        ...g,
        collection: {
          id: 'c1', title: 'All Products', slug: 'all', description: 'Everything we sell.',
          image: IMG, products: [productSummary(1), productSummary(2)],
          pagination: { currentPage: 1, totalPages: 2, hasNext: true, hasPrev: false, nextUrl: '/collections/all?page=2', prevUrl: null },
          sort: { current: 'featured', options: [{ value: 'featured', label: 'Featured' }, { value: 'newest', label: 'Newest' }] },
        },
      };
    case 'cart':
      return { ...g, pageTitle: 'Your Cart', cart: CART_FIXTURE, outOfStock: false };
    case 'partials/cart-contents':
      return { ...g, cart: CART_FIXTURE };
    case 'search':
      return { ...g, pageTitle: 'Search', query: 'shirt', products: [productSummary(1)] };
    case 'page':
      return {
        ...g,
        page: { title: 'About Us', sections: [{ type: 'text', body: '<p>Our story.</p>' }], seo_title: null, seo_description: null, excerpt: 'About us' },
      };
    case '404':
      return { ...g, pageTitle: 'Page Not Found' };
    case 'checkout':
      return {
        ...g, pageTitle: 'Checkout', cart: CART_FIXTURE,
        stripeEnabled: true, paypalEnabled: false, stripePk: 'pk_test_sample',
        paypalClientId: '', paypalMode: 'sandbox', itemsTaxAmount: 666,
      };
    case 'checkout-success':
      return {
        ...g, pageTitle: 'Order confirmed', order: SAMPLE_ORDER,
        canCreateAccount: false, accountCreated: false, orderId: 'o1',
        taxEnabled: true, taxLabel: 'VAT', taxNumber: 'GB123456789', downloads: [],
      };
    case 'account-login':
    case 'account-register':
    case 'account-forgot':
      return { ...g, pageTitle: 'Account', error: null };
    case 'account-reset':
      return { ...g, pageTitle: 'Reset password', error: null, token: 'sample-reset-token' };
    case 'account-orders':
      return { ...g, pageTitle: 'Your orders', orders: [SAMPLE_ORDER] };
    case 'account-order':
      return { ...g, pageTitle: `Order #${SAMPLE_ORDER.order_number}`, order: SAMPLE_ORDER };
    default:
      return { ...g };
  }
}

// ── Validator ────────────────────────────────────────────────────────────────

export async function validateTheme(themeDir: string): Promise<ValidationReport> {
  const results: CheckResult[] = [];
  const add = (r: CheckResult) => results.push(r);

  // 1. Manifest ---------------------------------------------------------------
  let manifest: ThemeManifest | null = null;
  let themeConfig: Record<string, Record<string, unknown>> = {};
  try {
    manifest = loadManifest(themeDir);
    themeConfig = resolveConfigNested(manifest, {});
    add({ id: 'manifest-present', category: 'manifest', severity: 'error', status: 'pass',
      title: 'theme.json is present and valid JSON', detail: `Parsed manifest for "${manifest.name}".` });

    // Config field integrity
    const issues: string[] = [];
    for (const [section, fields] of Object.entries(manifest.config ?? {})) {
      for (const [key, field] of Object.entries(fields as Record<string, ConfigField>)) {
        const at = `${section}.${key}`;
        if (!VALID_FIELD_TYPES.has(field.type)) issues.push(`${at}: unknown type "${field.type}"`);
        if (field.type === 'repeater' && !field.itemFields) issues.push(`${at}: repeater is missing itemFields`);
        if (field.default === undefined) issues.push(`${at}: no default value`);
      }
    }
    add({ id: 'manifest-config', category: 'manifest', severity: 'warning', status: issues.length ? 'fail' : 'pass',
      title: 'Config fields are well-formed',
      detail: issues.length ? issues.join('; ') : 'All config fields have a valid type and default.' });

    if (!manifest.version) {
      add({ id: 'manifest-version', category: 'manifest', severity: 'warning', status: 'fail',
        title: 'Manifest declares a version', detail: 'No "version" set — recommended for updates and marketplace listing.' });
    }
  } catch (err) {
    add({ id: 'manifest-present', category: 'manifest', severity: 'error', status: 'fail',
      title: 'theme.json is present and valid JSON',
      detail: `Could not load theme.json: ${err instanceof Error ? err.message : String(err)}` });
  }

  // 2. Required templates exist ----------------------------------------------
  for (const t of CORE_TEMPLATES) {
    const ok = existsSync(path.join(themeDir, `${t}.hbs`));
    add({ id: `template-${t}`, category: 'templates', severity: 'error', status: ok ? 'pass' : 'fail',
      title: `Core template: ${t}.hbs`,
      detail: ok ? 'Present.' : `Missing — the storefront renders "${t}" by name and will error without it.` });
  }
  for (const t of ACCOUNT_TEMPLATES) {
    const ok = existsSync(path.join(themeDir, `${t}.hbs`));
    add({ id: `template-${t}`, category: 'templates', severity: 'warning', status: ok ? 'pass' : 'fail',
      title: `Account template: ${t}.hbs`,
      detail: ok ? 'Present.' : `Missing — needed only when customer accounts are enabled.` });
  }

  // 3. Required partials exist ------------------------------------------------
  for (const p of REQUIRED_PARTIALS) {
    const ok = existsSync(path.join(themeDir, 'partials', `${p}.hbs`));
    add({ id: `partial-${p}`, category: 'partials', severity: 'error', status: ok ? 'pass' : 'fail',
      title: `Partial: partials/${p}.hbs`,
      detail: ok ? 'Present.' : 'Missing — referenced by the layout/pages; templates will fail to render.' });
  }

  // 4. Compile + render each present template --------------------------------
  const rendered: Record<string, string> = {};
  let engine: ThemeEngine | null = null;
  try {
    engine = new ThemeEngine(themeDir);
    await engine.init();
  } catch (err) {
    add({ id: 'engine-init', category: 'render', severity: 'error', status: 'fail',
      title: 'Theme engine initialises', detail: `Failed to load assets/partials: ${err instanceof Error ? err.message : String(err)}` });
  }

  if (engine) {
    const g = globalCtx(themeConfig);
    const renderTargets = [...CORE_TEMPLATES, ...ACCOUNT_TEMPLATES, 'partials/cart-contents'];
    for (const t of renderTargets) {
      const rel = t.includes('/') ? `${t}.hbs` : `${t}.hbs`;
      if (!existsSync(path.join(themeDir, rel))) continue; // existence already graded above
      try {
        const html = await engine.render(t, fixtureFor(t, g));
        rendered[t] = html;
        add({ id: `render-${t}`, category: 'render', severity: 'error', status: 'pass',
          title: `Renders: ${t}`, detail: 'Compiled and rendered against sample data without errors.' });
      } catch (err) {
        add({ id: `render-${t}`, category: 'render', severity: 'error', status: 'fail',
          title: `Renders: ${t}`,
          detail: `Threw while rendering: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // Extra pass: empty cart must not throw either
    if (existsSync(path.join(themeDir, 'cart.hbs'))) {
      try {
        await engine.render('cart', {
          ...g, pageTitle: 'Your Cart',
          cart: { items: [], itemCount: 0, subtotal: m(0), discountCode: null, discountAmount: null, total: m(0), empty: true, checkoutUrl: '/checkout' },
          outOfStock: false,
        });
        add({ id: 'render-cart-empty', category: 'render', severity: 'error', status: 'pass',
          title: 'Renders: cart (empty)', detail: 'Empty-cart state renders without errors.' });
      } catch (err) {
        add({ id: 'render-cart-empty', category: 'render', severity: 'error', status: 'fail',
          title: 'Renders: cart (empty)', detail: `Threw on empty cart: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  // 5. Functional hooks (heuristic — warnings only) ---------------------------
  const hook = (id: string, title: string, present: boolean, missingDetail: string, okDetail: string, applicable: boolean) => {
    if (!applicable) return;
    add({ id, category: 'functionality', severity: 'warning', status: present ? 'pass' : 'fail',
      title, detail: present ? okDetail : missingDetail });
  };

  hook('hook-add-to-cart', 'Product page has an add-to-cart control',
    /variantId/.test(rendered['product'] ?? ''),
    'No `variantId` input found on the product page — customers may not be able to add items to the cart.',
    'Found an add-to-cart control.', 'product' in rendered);

  hook('hook-cart-badge', 'Header exposes the cart-count badge target',
    /id=["']?cart-count/.test(rendered['index'] ?? ''),
    'No element with id="cart-count" found — the live cart badge won\'t update after add-to-cart.',
    'Cart-count target present.', 'index' in rendered);

  hook('hook-checkout-link', 'Cart links through to checkout',
    /\/checkout/.test(rendered['cart'] ?? ''),
    'No link/form to /checkout found on the cart page.',
    'Checkout is reachable from the cart.', 'cart' in rendered);

  hook('hook-checkout-csrf', 'Checkout form includes a CSRF field',
    /name=["']?_csrf/.test(rendered['checkout'] ?? ''),
    'No _csrf field found on checkout — POSTs will be rejected. Add {{csrf_field}} inside the form.',
    'CSRF field present on checkout.', 'checkout' in rendered);

  hook('hook-seo-title', 'Pages emit a <title>',
    /<title/i.test(rendered['index'] ?? ''),
    'No <title> found — add {{meta_title}} in the <head>. Hurts SEO and browser tabs.',
    'Title tag present.', 'index' in rendered);

  // 6. Assets -----------------------------------------------------------------
  const hasStyle = existsSync(path.join(themeDir, 'assets', 'style.css'));
  add({ id: 'asset-style', category: 'assets', severity: 'warning', status: hasStyle ? 'pass' : 'fail',
    title: 'Stylesheet: assets/style.css',
    detail: hasStyle ? 'Present.' : 'No assets/style.css — the store will render unstyled unless CSS is inlined.' });

  // ── Totals ─────────────────────────────────────────────────────────────────
  let passed = 0, warnings = 0, errors = 0;
  for (const r of results) {
    if (r.status === 'pass') passed++;
    else if (r.severity === 'error') errors++;
    else warnings++;
  }

  return {
    themeName: manifest?.name ?? path.basename(themeDir),
    ok: errors === 0,
    totals: { passed, warnings, errors },
    results,
  };
}
