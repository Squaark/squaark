import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import type { FastifyReply } from 'fastify';
import { getCachedUpdateStatus } from './updates';

const ADMIN_VIEWS = path.resolve(process.cwd(), 'admin');

const hbs = Handlebars.create();

function loadPartials() {
  const partialsDir = path.join(ADMIN_VIEWS, 'partials');
  if (!fs.existsSync(partialsDir)) return;
  for (const file of fs.readdirSync(partialsDir)) {
    if (!file.endsWith('.hbs')) continue;
    const name = path.basename(file, '.hbs');
    hbs.registerPartial(name, fs.readFileSync(path.join(partialsDir, file), 'utf-8'));
  }
}

loadPartials();

hbs.registerHelper('csrf_field', function (this: { csrfToken?: string }, options: Handlebars.HelperOptions) {
  // Fall back to the root context — inside an {{#each}} block `this` is the loop
  // item, which has no csrfToken, so a naive `this.csrfToken` would render an
  // empty token and every form in the loop would fail the CSRF check.
  const token = Handlebars.escapeExpression(this?.csrfToken ?? options?.data?.root?.csrfToken ?? '');
  return new Handlebars.SafeString(`<input type="hidden" name="_csrf" value="${token}">`);
});

hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
hbs.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
hbs.registerHelper('or', (a: unknown, b: unknown) => a || b);
hbs.registerHelper('and', (a: unknown, b: unknown) => a && b);
hbs.registerHelper('not', (a: unknown) => !a);
hbs.registerHelper('gt', (a: number, b: number) => a > b);
hbs.registerHelper('lt', (a: number, b: number) => a < b);
hbs.registerHelper('add', (a: number, b: number) => a + b);
hbs.registerHelper('subtract', (a: number, b: number) => a - b);
hbs.registerHelper('concat', (...args: unknown[]) => args.slice(0, -1).join(''));
hbs.registerHelper('lookup', (obj: Record<string, unknown>, key: string) => obj?.[key]);
hbs.registerHelper('money_pence', (pence: number) => (pence / 100).toFixed(2));
hbs.registerHelper('pence', (amount: number | null | undefined, options: Handlebars.HelperOptions) => {
  if (amount == null) return '—';
  const settings = (options?.data?.root as Record<string, unknown>)?.settings as Record<string, string> | undefined;
  const currencyCode = settings?.store_currency ?? 'GBP';
  const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
  const sym = symbols[currencyCode] ?? currencyCode;
  return `${sym}${(amount / 100).toFixed(2)}`;
});
hbs.registerHelper('isSelected', (code: string, selected: string[]) =>
  Array.isArray(selected) && selected.includes(code),
);
hbs.registerHelper('date_short', (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
);
hbs.registerHelper('json_pretty', (v: unknown) =>
  new Handlebars.SafeString(`<pre>${JSON.stringify(v, null, 2)}</pre>`),
);
hbs.registerHelper('hasNonImageFields', (fields: Array<{ type: string }>) =>
  Array.isArray(fields) && fields.some((f) => f.type !== 'image'),
);
hbs.registerHelper('percent', (processed: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0,
);
hbs.registerHelper('parseJson', (json: string) => {
  try { return JSON.parse(json); } catch { return []; }
});
hbs.registerHelper('jsonParse', (json: string) => {
  try { return JSON.parse(json); } catch { return {}; }
});
hbs.registerHelper('jsonLength', (json: string) => {
  try { return JSON.parse(json).length; } catch { return 0; }
});
hbs.registerHelper('jsonNonEmpty', (json: string) => {
  try { return JSON.parse(json).length > 0; } catch { return false; }
});
hbs.registerHelper('sparkline_bars', (daily: Array<{ date: string; views: number }>) => {
  if (!Array.isArray(daily) || daily.length === 0) return new Handlebars.SafeString('');
  const days: Array<{ label: string; views: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const found = daily.find((r) => r.date === iso);
    days.push({ label, views: found?.views ?? 0 });
  }
  const max = Math.max(...days.map((d) => d.views), 1);
  const bars = days.map(({ label, views }) => {
    const pct = Math.round((views / max) * 100);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:0.25rem;flex:1;">
      <span style="font-size:0.75rem;color:#9ca3af;">${views}</span>
      <div style="width:100%;height:48px;display:flex;align-items:flex-end;">
        <div style="width:100%;border-radius:0.25rem 0.25rem 0 0;background:#1f2937;height:${Math.max(pct, 2)}%;" title="${views} views"></div>
      </div>
      <span style="font-size:0.75rem;color:#9ca3af;">${label}</span>
    </div>`;
  }).join('');
  return new Handlebars.SafeString(`<div style="display:flex;align-items:flex-end;gap:0.25rem;width:100%;height:80px;">${bars}</div>`);
});

hbs.registerHelper('status_badge', (status: string) => {
  const colour: Record<string, string> = {
    pending: 'badge-yellow',
    paid: 'badge-green',
    refunded: 'badge-red',
    cancelled: 'badge-gray',
  };
  const cls = colour[status] ?? 'badge-gray';
  return new Handlebars.SafeString(
    `<span class="badge ${cls}">${Handlebars.Utils.escapeExpression(status)}</span>`,
  );
});

/**
 * Renders an admin page inside the shared layout.
 *
 * `reply` is required (not optional) so a CSRF token is generated and merged
 * into every context automatically — forgetting it is a compile error rather
 * than a template silently missing {{csrf_field}}. The one exception is the
 * pre-login auth templates (login/setup), which render standalone and have
 * their own session-less forms; call renderAuth() for those instead.
 */
export async function render(template: string, context: Record<string, unknown>, reply: FastifyReply): Promise<string> {
  const csrfToken = await reply.generateCsrf();
  // The cached status (never blocks) powers the "update available" banner in the
  // layout. A page may pass its own freshly-computed `update` (e.g. the Server
  // settings tab, which shouldn't sit on "Checking…" if the cache is cold);
  // only fall back to the cache when it hasn't.
  const fullContext = { ...context, csrfToken, update: context.update ?? getCachedUpdateStatus() };

  const file = path.join(ADMIN_VIEWS, `${template}.hbs`);
  const src = fs.readFileSync(file, 'utf-8');
  const body = hbs.compile(src)(fullContext);

  const layoutSrc = fs.readFileSync(path.join(ADMIN_VIEWS, 'partials', 'layout.hbs'), 'utf-8');
  return hbs.compile(layoutSrc)({ ...fullContext, body: new Handlebars.SafeString(body) });
}

/** Renders a template with no session yet (login/setup) — still gets a CSRF token, just no layout. */
export async function renderAuth(template: string, context: Record<string, unknown>, reply: FastifyReply): Promise<string> {
  const csrfToken = await reply.generateCsrf();
  const file = path.join(ADMIN_VIEWS, `${template}.hbs`);
  const src = fs.readFileSync(file, 'utf-8');
  return hbs.compile(src)({ ...context, csrfToken });
}

/** Renders a template without the admin layout — for htmx fragment responses (polling, inline swaps). */
export function renderFragment(template: string, context: Record<string, unknown>): string {
  const file = path.join(ADMIN_VIEWS, `${template}.hbs`);
  const src = fs.readFileSync(file, 'utf-8');
  return hbs.compile(src)(context);
}
