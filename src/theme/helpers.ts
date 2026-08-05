import Handlebars from 'handlebars';
import type { Money } from './context';
import { sanitizeContentHtml } from './content-sanitizer';

export type AssetResolver = (filename: string) => string;
export type UrlResolver = (type: string, slugs: string[]) => string;

export function registerHelpers(
  hbs: typeof Handlebars,
  resolveAsset: AssetResolver,
  resolveUrl: UrlResolver,
): void {
  hbs.registerHelper('money', function (this: unknown, m: Money | null | undefined, options: Handlebars.HelperOptions) {
    if (!m) return '';
    const root = (options?.data?.root ?? {}) as { store?: { currency?: { symbol?: string } } };
    const symbol = root.store?.currency?.symbol ?? '$';
    return `${symbol}${(m.amount / 100).toFixed(2)}`;
  });

  hbs.registerHelper('pence', function (this: unknown, amount: number, options: Handlebars.HelperOptions) {
    const root = (options?.data?.root ?? {}) as { store?: { currency?: { symbol?: string } } };
    const symbol = root.store?.currency?.symbol ?? '$';
    return `${symbol}${((amount ?? 0) / 100).toFixed(2)}`;
  });

  hbs.registerHelper('asset', (filename: string) => resolveAsset(filename));

  hbs.registerHelper('url', (type: string, ...rest: unknown[]) => {
    // Handlebars appends an options object as the last argument
    const slugs = rest.slice(0, -1) as string[];
    return resolveUrl(type, slugs);
  });

  hbs.registerHelper('csrf_field', function (this: { csrfToken?: string }, options: Handlebars.HelperOptions) {
    // Fall back to the root context — inside an {{#each}} block `this` is the
    // loop item (no csrfToken), so a naive `this.csrfToken` would emit an empty
    // token and forms inside the loop would fail the CSRF check.
    const token = Handlebars.escapeExpression(this?.csrfToken ?? options?.data?.root?.csrfToken ?? '');
    return new Handlebars.SafeString(
      `<input type="hidden" name="_csrf" value="${token}">`,
    );
  });

  // Inline SVG for a homepage value-prop badge, keyed by the icon name chosen in
  // the theme customizer. Falls back to a checkmark for unknown/empty names.
  const VALUE_PROP_ICONS: Record<string, string> = {
    check:   'M5 13l4 4L19 7',
    truck:   'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0',
    returns: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    lock:    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    shield:  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    star:    'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    heart:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    gift:    'M12 8v13m0-13V6a2 2 0 112-2M12 8H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2h-5zM9.879 5.879C10.5 5 12 8 12 8s1.5-3 2.121-2.121',
  };
  hbs.registerHelper('value_prop_icon', (name: unknown) => {
    const path = VALUE_PROP_ICONS[String(name ?? '')] ?? VALUE_PROP_ICONS.check;
    return new Handlebars.SafeString(
      `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">` +
      `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${path}"/></svg>`,
    );
  });

  // Renders a 1–5 star rating as filled/empty stars (rounds to the nearest whole star).
  hbs.registerHelper('stars', (rating: unknown) => {
    const r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    const label = `${Number(rating) || 0} out of 5 stars`;
    return new Handlebars.SafeString(
      `<span class="stars" role="img" aria-label="${label}">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`,
    );
  });

  hbs.registerHelper('stock_badge', (variant: { available: boolean } | null) => {
    if (!variant) return '';
    return variant.available ? 'In Stock' : 'Sold Out';
  });

  // For rich-text HTML written by admin/staff (product descriptions, page
  // content, page-builder sections) — use this instead of {{{ }}} directly.
  hbs.registerHelper('sanitized_html', (html: string | null | undefined) =>
    new Handlebars.SafeString(sanitizeContentHtml(html ?? '')),
  );

  // Returns formatted ex-tax price given the resolved band rate.
  // If rate is null/empty/0, returns the inclusive price unchanged (zero-rated or unclassified).
  hbs.registerHelper('ex_tax_price', function (this: unknown, incAmountPence: number, resolvedRate: string | null, options: Handlebars.HelperOptions) {
    const root = (options?.data?.root ?? {}) as { store?: { currency?: { symbol?: string } } };
    const symbol = root.store?.currency?.symbol ?? '';
    const rate = resolvedRate ? parseFloat(resolvedRate) : 0;
    if (!rate || rate <= 0) return new Handlebars.SafeString(`${symbol}${(incAmountPence / 100).toFixed(2)}`);
    const exAmount = Math.round(incAmountPence * 100 / (100 + rate));
    return new Handlebars.SafeString(`${symbol}${(exAmount / 100).toFixed(2)}`);
  });

  hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  hbs.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
  hbs.registerHelper('gt', (a: number, b: number) => a > b);
  hbs.registerHelper('lt', (a: number, b: number) => a < b);
  hbs.registerHelper('gte', (a: number, b: number) => a >= b);
  hbs.registerHelper('lte', (a: number, b: number) => a <= b);
  hbs.registerHelper('or', (a: unknown, b: unknown) => a || b);
  hbs.registerHelper('and', (a: unknown, b: unknown) => a && b);

  // Works both as a block helper {{#is a b}}...{{/is}} and subexpression (is a b)
  hbs.registerHelper('is', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions,
  ) {
    if (typeof options?.fn === 'function') {
      return a === b ? options.fn(this) : options.inverse(this);
    }
    return a === b;
  });

  hbs.registerHelper('if_eq', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions,
  ) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper('pluralize', (count: number, singular: string, plural: string) =>
    count === 1 ? singular : plural,
  );

  hbs.registerHelper('truncate', (text: string, length: number) => {
    if (!text || text.length <= length) return text;
    return text.slice(0, length).trimEnd() + '…';
  });

  // Stub for Phase 1 — real i18n locale files wired up in Phase 6
  hbs.registerHelper('t', (key: string) => key);

  hbs.registerHelper('json', (obj: unknown) =>
    new Handlebars.SafeString(`<pre class="text-xs">${JSON.stringify(obj, null, 2)}</pre>`),
  );

  hbs.registerHelper('parseJson', (str: string) => {
    try { return JSON.parse(str); } catch { return {}; }
  });

  hbs.registerHelper('timestamp', (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  hbs.registerHelper('meta_title', function (this: { store?: { name: string }; pageTitle?: string }) {
    const title = this.pageTitle
      ? `${this.pageTitle} – ${this.store?.name ?? ''}`
      : (this.store?.name ?? '');
    return new Handlebars.SafeString(`<title>${Handlebars.escapeExpression(title)}</title>`);
  });

  hbs.registerHelper('meta_description', function (this: { metaDescription?: string }) {
    const desc = this.metaDescription ?? '';
    return new Handlebars.SafeString(
      `<meta name="description" content="${Handlebars.escapeExpression(desc)}">`,
    );
  });

  hbs.registerHelper('canonical_url', function (this: {
    store?: { url: string };
    currentPath?: string;
  }) {
    const url = (this.store?.url ?? '') + (this.currentPath ?? '');
    return new Handlebars.SafeString(`<link rel="canonical" href="${url}">`);
  });

  hbs.registerHelper('og_tags', function (this: {
    pageTitle?: string;
    metaDescription?: string;
    store?: { url: string; name: string };
    currentPath?: string;
    ogImage?: string | null;
  }) {
    const title = Handlebars.escapeExpression(this.pageTitle ?? this.store?.name ?? '');
    const desc  = Handlebars.escapeExpression(this.metaDescription ?? '');
    const url   = Handlebars.escapeExpression((this.store?.url ?? '') + (this.currentPath ?? ''));
    const img   = this.ogImage
      ? `\n<meta property="og:image" content="${Handlebars.escapeExpression(this.ogImage)}">`
      : '';
    return new Handlebars.SafeString(
      `<meta property="og:title" content="${title}">\n` +
      (desc ? `<meta property="og:description" content="${desc}">\n` : '') +
      `<meta property="og:url" content="${url}">\n` +
      `<meta property="og:type" content="website">${img}`,
    );
  });

  hbs.registerHelper('structured_data', () => new Handlebars.SafeString(''));

  // Turns a YouTube/Vimeo watch URL into an embeddable player URL. Returns ''
  // for anything unrecognised, so the video section can guard on it.
  hbs.registerHelper('video_embed', (url: unknown) => {
    const s = typeof url === 'string' ? url.trim() : '';
    if (!s) return '';
    const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return '';
  });

  hbs.registerHelper('renderSection', function(section: Record<string, unknown>, options: Handlebars.HelperOptions) {
    const type = String(section.type ?? '');
    if (!type) return '';
    const partialName = `sections/${type}`;
    const partials = (hbs as unknown as { partials: Record<string, HandlebarsTemplateDelegate | string> }).partials;
    const partial = partials[partialName];
    if (!partial) return '';
    const fn = typeof partial === 'string' ? hbs.compile(partial) : partial as HandlebarsTemplateDelegate;
    // Pass the data frame so a section partial can reach the page root via
    // `@root` — e.g. `{{@root.csrfToken}}` for a newsletter form.
    return new hbs.SafeString(fn(section, { data: options?.data }));
  });

  hbs.registerHelper('pagination', (pagination: {
    hasPrev: boolean; prevUrl: string | null;
    hasNext: boolean; nextUrl: string | null;
  } | null) => {
    if (!pagination) return '';
    const prev = pagination.hasPrev && pagination.prevUrl
      ? `<a href="${pagination.prevUrl}" class="pagination__prev">← Prev</a>`
      : '';
    const next = pagination.hasNext && pagination.nextUrl
      ? `<a href="${pagination.nextUrl}" class="pagination__next">Next →</a>`
      : '';
    return new Handlebars.SafeString(`<nav class="pagination">${prev}${next}</nav>`);
  });
}
