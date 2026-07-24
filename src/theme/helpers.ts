import Handlebars from 'handlebars';
import type { Money } from './context';

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

  hbs.registerHelper('csrf_field', function (this: { csrfToken?: string }) {
    const token = Handlebars.escapeExpression(this.csrfToken ?? '');
    return new Handlebars.SafeString(
      `<input type="hidden" name="_csrf" value="${token}">`,
    );
  });

  hbs.registerHelper('stock_badge', (variant: { available: boolean } | null) => {
    if (!variant) return '';
    return variant.available ? 'In Stock' : 'Sold Out';
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

  hbs.registerHelper('renderSection', function(section: Record<string, unknown>) {
    const type = String(section.type ?? '');
    if (!type) return '';
    const partialName = `sections/${type}`;
    const partials = (hbs as unknown as { partials: Record<string, HandlebarsTemplateDelegate | string> }).partials;
    const partial = partials[partialName];
    if (!partial) return '';
    const fn = typeof partial === 'string' ? hbs.compile(partial) : partial as HandlebarsTemplateDelegate;
    return new hbs.SafeString(fn(section));
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
