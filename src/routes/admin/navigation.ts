import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings, setSetting } from '../../db/queries/admin';

export interface NavItem { label: string; url: string }

function defaultNavMain(settings: Record<string, string>): NavItem[] {
  const cartLabel = settings.cart_label || 'Cart';
  return [
    { label: 'Home', url: '/' },
    { label: 'Shop', url: '/collections/all' },
    { label: cartLabel, url: `/${cartLabel.toLowerCase()}` },
  ];
}

export const DEFAULT_NAV_FOOTER: NavItem[] = [
  { label: 'About', url: '/about' },
  { label: 'Contact', url: '/contact' },
  { label: 'Privacy', url: '/privacy' },
];

export function getNav(settings: Record<string, string>, location: 'main' | 'footer'): NavItem[] {
  const key = location === 'main' ? 'nav_main' : 'nav_footer';
  try {
    const parsed = JSON.parse(settings[key] ?? '');
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  return location === 'main' ? defaultNavMain(settings) : DEFAULT_NAV_FOOTER;
}

export async function navigationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/navigation', navPage);
  fastify.post('/navigation', saveNav);
}

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

async function navPage(req: FastifyRequest, reply: FastifyReply) {
  const settings = getAllSettings();
  const mainNav = getNav(settings, 'main');
  const footerNav = getNav(settings, 'footer');
  return reply.type('text/html').send(
    await render('navigation', {
      ...adminCtx(req),
      mainNavSafe: JSON.stringify(mainNav).replace(/'/g, '&#39;'),
      footerNavSafe: JSON.stringify(footerNav).replace(/'/g, '&#39;'),
      saved: 'saved' in (req.query as Record<string, string>),
      pageTitle: 'Navigation',
      pageSection: 'navigation',
    }, reply),
  );
}

async function saveNav(
  req: FastifyRequest<{ Body: { nav_main?: string; nav_footer?: string } }>,
  reply: FastifyReply,
) {
  const { nav_main, nav_footer } = req.body;
  const parse = (raw: string | undefined): NavItem[] => {
    try {
      const arr = JSON.parse(raw ?? '[]');
      if (!Array.isArray(arr)) return [];
      return arr.filter(i => i.label && i.url).map(i => ({ label: String(i.label).trim(), url: String(i.url).trim() }));
    } catch { return []; }
  };
  setSetting('nav_main', JSON.stringify(parse(nav_main)));
  setSetting('nav_footer', JSON.stringify(parse(nav_footer)));
  return reply.redirect('/admin/navigation?saved=1');
}
