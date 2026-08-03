import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings, setSetting } from '../../db/queries/admin';
import { findAllCollections } from '../../db/queries/collections';

// A mega link is either a plain link ({label,url}) or a category ({collection slug}); both may carry an image.
export interface MegaLink { label?: string; url?: string; image?: string; collection?: string }
export interface MegaColumn {
  heading: string;
  type: 'links' | 'collections' | 'products';
  links: MegaLink[];                       // 'links' (label+url) and 'collections' (collection slug)
  collection: string;                      // 'products' (collection slug; '' = all products)
  count: number;                           // 'products'
  display: 'grid' | 'list' | 'list-text';  // 'products' render style
  showMore: boolean;                       // 'products' — append a "Show more" link to the collection
}
export interface MegaMenu { columns: MegaColumn[]; columnsPerRow: number } // columnsPerRow 0 = auto (fit to width)
export interface NavItem { label: string; url: string; mega?: MegaMenu | null }

const MEGA_TYPES = ['links', 'collections', 'products'] as const;
const MEGA_DISPLAYS = ['grid', 'list', 'list-text'] as const;

/** Sanitises a raw mega-menu object from the admin form into a safe, typed shape. */
function parseMega(raw: unknown): MegaMenu | null {
  if (!raw || typeof raw !== 'object') return null;
  const cols = (raw as { columns?: unknown }).columns;
  if (!Array.isArray(cols)) return null;
  const columns: MegaColumn[] = cols.map((c: Record<string, unknown>) => {
    const type = MEGA_TYPES.includes(c.type as typeof MEGA_TYPES[number])
      ? (c.type as MegaColumn['type']) : 'links';
    const rawLinks: Record<string, unknown>[] = Array.isArray(c.links) ? c.links : [];
    let links: MegaLink[] = [];
    if (type === 'links') {
      links = rawLinks
        .filter(l => l && (l.label || l.url))
        .map(l => ({ label: String(l.label ?? '').trim(), url: String(l.url ?? '').trim() }));
    } else if (type === 'collections') {
      links = rawLinks
        .filter(l => l && l.collection)
        .map(l => {
          const link: MegaLink = { collection: String(l.collection).trim() };
          const image = String(l.image ?? '').trim();
          if (image) link.image = image;
          return link;
        });
    }
    const count = Math.max(1, Math.min(12, parseInt(String(c.count ?? '4'), 10) || 4));
    const display = MEGA_DISPLAYS.includes(c.display as typeof MEGA_DISPLAYS[number])
      ? (c.display as MegaColumn['display']) : 'grid';
    return {
      heading: String(c.heading ?? '').trim(),
      type,
      links: type === 'products' ? [] : links,
      collection: type === 'products' ? String(c.collection ?? '').trim() : '',
      count,
      display,
      showMore: type === 'products' && (c.showMore === true || c.showMore === 'true'),
    };
  }).filter(col => col.type === 'products' || col.links.length > 0 || col.heading);
  // 0 = auto; otherwise clamp to a sane 2–6 columns per row.
  const rawCols = parseInt(String((raw as { columnsPerRow?: unknown }).columnsPerRow ?? '0'), 10) || 0;
  const columnsPerRow = rawCols < 2 ? 0 : Math.min(6, rawCols);
  return columns.length ? { columns, columnsPerRow } : null;
}

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
  const collections = findAllCollections().map(c => ({ slug: c.slug, title: c.title }));
  return reply.type('text/html').send(
    await render('navigation', {
      ...adminCtx(req),
      mainNavSafe: JSON.stringify(mainNav).replace(/'/g, '&#39;'),
      footerNavSafe: JSON.stringify(footerNav).replace(/'/g, '&#39;'),
      collectionsJson: JSON.stringify(collections).replace(/</g, '\\u003c').replace(/'/g, '&#39;'),
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
  const parse = (raw: string | undefined, allowMega: boolean): NavItem[] => {
    try {
      const arr = JSON.parse(raw ?? '[]');
      if (!Array.isArray(arr)) return [];
      return arr.filter(i => i.label && i.url).map(i => {
        const item: NavItem = { label: String(i.label).trim(), url: String(i.url).trim() };
        if (allowMega) {
          const mega = parseMega(i.mega);
          if (mega) item.mega = mega;
        }
        return item;
      });
    } catch { return []; }
  };
  setSetting('nav_main', JSON.stringify(parse(nav_main, true)));
  setSetting('nav_footer', JSON.stringify(parse(nav_footer, false)));
  return reply.redirect('/admin/navigation?saved=1');
}
