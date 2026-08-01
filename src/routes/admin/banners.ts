import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { themeRegistry } from '../../theme/registry';
import {
  listBanners, findBannerById, createBanner, updateBanner, deleteBanner,
  type BannerInput, type BannerRow,
} from '../../db/queries/banners';

export async function bannerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/banners', list);
  fastify.get('/banners/new', newPage);
  fastify.post('/banners', create);
  fastify.get('/banners/:id', editPage);
  fastify.post('/banners/:id', update);
  fastify.post('/banners/:id/delete', remove);
}

function ctx(req: FastifyRequest) {
  // The live accent colour so the form preview matches a banner that "follows
  // the theme accent" — the storefront renders those with var(--color-accent).
  const accentColor = (themeRegistry.currentThemeConfig?.colors?.accent as string) || '#E94560';
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings(), accentColor };
}

/** Local today as YYYY-MM-DD, to compare against the date-only schedule bounds. */
function today(): string {
  return new Date().toLocaleDateString('en-CA'); // en-CA renders as YYYY-MM-DD
}

/** live | scheduled | expired | off — mirrors getActiveBanner()'s date logic. */
export function bannerStatus(b: BannerRow, now = today()): 'live' | 'scheduled' | 'expired' | 'off' {
  if (b.active !== 1) return 'off';
  if (b.starts_at && b.starts_at > now) return 'scheduled';
  if (b.ends_at && b.ends_at < now) return 'expired';
  return 'live';
}

function parseBody(body: Record<string, string>): { input?: BannerInput; error?: string } {
  const message = (body.message ?? '').trim();
  if (!message) return { error: 'A message is required.' };

  const startsAt = (body.starts_at ?? '').trim() || null;
  const endsAt = (body.ends_at ?? '').trim() || null;
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: 'The start date must be on or before the end date.' };
  }

  let linkUrl = (body.link_url ?? '').trim() || null;
  // Only allow http(s) or root-relative links; anything else (e.g. a
  // "javascript:" scheme) is coerced to a relative path so it can't execute.
  if (linkUrl && !/^(https?:\/\/|\/)/i.test(linkUrl)) {
    linkUrl = '/' + linkUrl.replace(/^\/+/, '');
  }
  const linkLabel = (body.link_label ?? '').trim() || null;
  const bgColor = (body.bg_color ?? '').trim();
  const textColor = (body.text_color ?? '').trim() || '#ffffff';

  return {
    input: {
      message,
      linkUrl,
      // A link needs a label to render a button; fall back to a sensible default.
      linkLabel: linkUrl ? (linkLabel || 'Shop now') : null,
      code: (body.code ?? '').trim() || null,
      bgColor,
      textColor,
      dismissible: body.dismissible === '1' || body.dismissible === 'on',
      active: body.active === '1' || body.active === 'on',
      startsAt,
      endsAt,
    },
  };
}

function toForm(b: BannerRow) {
  return {
    message: b.message,
    link_url: b.link_url ?? '',
    link_label: b.link_label ?? '',
    code: b.code ?? '',
    bg_color: b.bg_color || '',
    text_color: b.text_color || '#ffffff',
    dismissible: b.dismissible === 1,
    active: b.active === 1,
    starts_at: b.starts_at ?? '',
    ends_at: b.ends_at ?? '',
  };
}

async function list(req: FastifyRequest, reply: FastifyReply) {
  const banners = listBanners().map((b) => ({ ...b, status: bannerStatus(b) }));
  return reply.type('text/html').send(
    await render('banners/index', {
      ...ctx(req), banners,
      pageTitle: 'Banners', pageSection: 'promotions', promoTab: 'banners',
      saved: 'saved' in (req.query as Record<string, string>),
    }, reply),
  );
}

async function newPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('banners/form', {
      ...ctx(req), banner: null,
      form: { active: true, dismissible: true, text_color: '#ffffff' },
      pageTitle: 'New banner', pageSection: 'promotions', promoTab: 'banners',
    }, reply),
  );
}

async function create(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('banners/form', { ...ctx(req), banner: null, form: req.body, error, pageTitle: 'New banner', pageSection: 'promotions', promoTab: 'banners' }, reply),
    );
  }
  createBanner(input);
  return reply.redirect('/admin/banners?saved=1');
}

async function editPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const banner = findBannerById(req.params.id);
  if (!banner) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  return reply.type('text/html').send(
    await render('banners/form', {
      ...ctx(req), banner, form: toForm(banner), status: bannerStatus(banner),
      pageTitle: 'Edit banner', pageSection: 'promotions', promoTab: 'banners',
    }, reply),
  );
}

async function update(req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>, reply: FastifyReply) {
  const banner = findBannerById(req.params.id);
  if (!banner) return reply.code(404).send('Not found');
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('banners/form', { ...ctx(req), banner, form: req.body, error, pageTitle: 'Edit banner', pageSection: 'promotions', promoTab: 'banners' }, reply),
    );
  }
  updateBanner(banner.id, input);
  return reply.redirect('/admin/banners?saved=1');
}

async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  deleteBanner(req.params.id);
  return reply.redirect('/admin/banners?saved=1');
}
