import Handlebars from 'handlebars';
import { findEmailTemplate } from '../db/queries/email';
import { CURRENCY_SYMBOLS } from '../theme/context';

const hbs = Handlebars.create();

hbs.registerHelper('money', (pence: number, currency = 'GBP') => {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${(pence / 100).toFixed(2)}`;
});

const WRAPPER = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  {{{body}}}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:12px;">{{store.name}}</p>
</div>
`;
const wrapperTemplate = hbs.compile(WRAPPER);

export interface RenderedEmail {
  subject: string;
  html: string;
}

export class TemplateNotFoundError extends Error {}
export class TemplateDisabledError extends Error {}

/** Renders a stored email template by key against the given data, wrapped in a shared shell. */
export function renderEmailTemplate(key: string, data: Record<string, unknown>): RenderedEmail {
  const row = findEmailTemplate(key);
  if (!row) throw new TemplateNotFoundError(`No email template found for "${key}"`);
  if (!row.enabled) throw new TemplateDisabledError(`Email template "${key}" is disabled`);

  const subject = hbs.compile(row.subject)(data);
  const body = hbs.compile(row.body)(data);
  const html = wrapperTemplate({ ...data, body: new Handlebars.SafeString(body) });

  return { subject, html };
}

/** Renders an arbitrary subject/body pair (used for previews of unsaved edits). */
export function renderEmailPreview(
  subject: string,
  body: string,
  data: Record<string, unknown>,
): RenderedEmail {
  return {
    subject: hbs.compile(subject)(data),
    html: wrapperTemplate({ ...data, body: new Handlebars.SafeString(hbs.compile(body)(data)) }),
  };
}
