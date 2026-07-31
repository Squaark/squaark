import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { execute, query, queryOne } from '../../db/connection';
import { savePageImage } from '../../admin/store-media';

interface PageRow {
  id: string; title: string; slug: string; content: string; sections: string;
  excerpt: string; status: string; created_at: string; updated_at: string;
}

// Top-level paths reserved by the storefront router
const RESERVED_SLUGS = new Set(['cart', 'search', 'products', 'collections', 'account', 'checkout']);

function isReservedSlug(slug: string): boolean {
  const topSegment = slug.split('/')[0];
  return RESERVED_SLUGS.has(topSegment);
}

export async function pageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/pages', listPages);
  fastify.get('/pages/new', newPagePage);
  fastify.post('/pages/new', createPage);
  fastify.get('/pages/:id', editPagePage);
  fastify.post('/pages/:id', updatePage);
  fastify.post('/pages/:id/delete', deletePage);
  fastify.post<{ Params: { id: string } }>('/pages/:id/sections/image', (req, reply) => uploadSectionImage(req, reply));
}

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

function parseSections(raw: string | undefined): unknown[] {
  try { return JSON.parse(raw || '[]') ?? []; } catch { return []; }
}

// A form field can arrive as an array when the same name is submitted more than
// once (e.g. two `content` inputs in the DOM at the same time). Collapse it to a
// single string so it never breaks a SQL bind.
function one(v: unknown): string | undefined {
  return Array.isArray(v) ? (v[v.length - 1] as string) : (v as string | undefined);
}

function safeSectionsAttr(sections: unknown[]): string {
  return JSON.stringify(sections).replace(/'/g, '&#39;');
}

async function listPages(req: FastifyRequest, reply: FastifyReply) {
  const pages = query<PageRow>('SELECT * FROM pages ORDER BY title');
  return reply.type('text/html').send(
    await render('pages/list', { ...adminCtx(req), pages, pageTitle: 'Pages', pageSection: 'pages' }, reply),
  );
}

async function newPagePage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('pages/form', {
      ...adminCtx(req), page: null,
      sectionsSafe: '[]',
      pageTitle: 'New page', pageSection: 'pages',
    }, reply),
  );
}

async function editPagePage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const page = queryOne<PageRow>('SELECT * FROM pages WHERE id = ?', [req.params.id]);
  if (!page) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  const sections = parseSections(page.sections);
  return reply.type('text/html').send(
    await render('pages/form', {
      ...adminCtx(req), page,
      sectionsSafe: safeSectionsAttr(sections),
      saved: 'saved' in (req.query as Record<string, string>),
      created: 'created' in (req.query as Record<string, string>),
      pageTitle: page.title, pageSection: 'pages',
    }, reply),
  );
}

async function createPage(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { title, slug, excerpt, status, sections, seo_title, seo_description } = req.body;
  const content = one(req.body.content); // may arrive twice from the form
  const slugTrimmed = slug?.trim();
  const validationError = !title || !slugTrimmed
    ? 'Title and slug are required'
    : isReservedSlug(slugTrimmed)
      ? `"${slugTrimmed.split('/')[0]}" is a reserved path and cannot be used as a slug`
      : null;
  if (validationError) {
    return reply.type('text/html').send(
      await render('pages/form', {
        ...adminCtx(req), page: req.body, sectionsSafe: safeSectionsAttr(parseSections(sections)),
        error: validationError, pageTitle: 'New page', pageSection: 'pages',
      }, reply),
    );
  }
  const sectionsJson = (() => { try { JSON.parse(sections); return sections; } catch { return '[]'; } })();
  const id = crypto.randomUUID();
  execute(
    'INSERT INTO pages (id, title, slug, content, sections, excerpt, status, seo_title, seo_description) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, title.trim(), slugTrimmed, content || '', sectionsJson || '[]', excerpt || '', status === 'published' ? 'published' : 'draft',
     seo_title || null, seo_description || null],
  );
  return reply.redirect(`/admin/pages/${id}?created=1`);
}

async function updatePage(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { title, slug, excerpt, status, sections, seo_title, seo_description } = req.body;
  const content = one(req.body.content); // may arrive twice from the form
  const slugTrimmed = slug?.trim();
  if (isReservedSlug(slugTrimmed)) {
    const page = queryOne<PageRow>('SELECT * FROM pages WHERE id = ?', [req.params.id]);
    return reply.type('text/html').send(
      await render('pages/form', {
        ...adminCtx(req), page: { ...page, ...req.body },
        sectionsSafe: safeSectionsAttr(parseSections(sections)),
        error: `"${slugTrimmed.split('/')[0]}" is a reserved path and cannot be used as a slug`,
        pageTitle: title, pageSection: 'pages',
      }, reply),
    );
  }
  const sectionsJson = (() => { try { JSON.parse(sections); return sections; } catch { return '[]'; } })();
  execute(
    `UPDATE pages SET title=?, slug=?, content=?, sections=?, excerpt=?, status=?, seo_title=?, seo_description=?, updated_at=datetime('now') WHERE id=?`,
    [title, slugTrimmed, content || '', sectionsJson || '[]', excerpt || '', status === 'published' ? 'published' : 'draft',
     seo_title || null, seo_description || null, req.params.id],
  );
  return reply.redirect(`/admin/pages/${req.params.id}?saved=1`);
}

async function deletePage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  execute('DELETE FROM pages WHERE id = ?', [req.params.id]);
  return reply.redirect('/admin/pages?deleted=1');
}

async function uploadSectionImage(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const page = queryOne<PageRow>('SELECT id FROM pages WHERE id = ?', [req.params.id]);
  if (!page) return reply.code(404).send({ error: 'Page not found' });
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: 'No file uploaded' });
  try {
    const buf = await data.toBuffer();
    const url = await savePageImage(req.params.id, buf, data.mimetype);
    return reply.send({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return reply.code(400).send({ error: msg });
  }
}
