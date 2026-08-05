import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { sanitizeSections } from '../../theme/sections';
import { sectionBuilderVars } from '../../admin/section-builder-ctx';
import { savePageImage } from '../../admin/store-media';
import { findProductForSections, getProductSectionsRaw, setProductSections } from '../../db/queries/products';
import { findCollectionForSections, getCollectionSectionsRaw, setCollectionSections } from '../../db/queries/collections';

function adminCtx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}
function safeSectionsAttr(sections: unknown[]): string {
  return JSON.stringify(sections).replace(/'/g, '&#39;');
}
function parseSections(raw: string | null | undefined): unknown[] {
  try { return JSON.parse(raw || '[]') ?? []; } catch { return []; }
}

interface Item { id: string; title: string; slug: string }

// One handler shape for both products and collections.
function makeHandlers(kind: 'product' | 'collection', deps: {
  find: (id: string) => Item | null;
  getSections: (id: string) => string | null;
  setSections: (id: string, json: string) => void;
  viewPath: (slug: string) => string;
}) {
  const editor = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const item = deps.find(req.params.id);
    if (!item) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
    return reply.type('text/html').send(
      await render('item-sections/edit', {
        ...adminCtx(req),
        kind, itemTitle: item.title,
        backUrl: `/admin/${kind}s/${item.id}`, viewUrl: deps.viewPath(item.slug),
        formUrl: `/admin/${kind}s/${item.id}/sections`,
        sectionsSafe: safeSectionsAttr(parseSections(deps.getSections(item.id))),
        ...sectionBuilderVars({ uploadUrl: `/admin/${kind}s/${item.id}/sections/image`, canUpload: true, previewUrl: '/__preview/page', legacy: false }),
        saved: 'saved' in (req.query as Record<string, string>),
        pageTitle: `${item.title} — sections`, pageSection: `${kind}s`, fullWidth: true,
      }, reply),
    );
  };
  const save = async (req: FastifyRequest<{ Params: { id: string }; Body: { sections?: string } }>, reply: FastifyReply) => {
    if (!deps.find(req.params.id)) return reply.code(404).send('Not found');
    deps.setSections(req.params.id, JSON.stringify(sanitizeSections(req.body.sections)));
    return reply.redirect(`/admin/${kind}s/${req.params.id}/sections?saved=1`);
  };
  const upload = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });
    try {
      const url = await savePageImage(`${kind}-${req.params.id}`, await data.toBuffer(), data.mimetype);
      return reply.send({ url });
    } catch (err: unknown) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  };
  return { editor, save, upload };
}

export async function itemSectionRoutes(fastify: FastifyInstance): Promise<void> {
  const p = makeHandlers('product', {
    find: findProductForSections, getSections: getProductSectionsRaw, setSections: setProductSections,
    viewPath: (slug) => `/products/${slug}`,
  });
  fastify.get('/products/:id/sections', p.editor);
  fastify.post('/products/:id/sections', p.save);
  fastify.post('/products/:id/sections/image', p.upload);

  const c = makeHandlers('collection', {
    find: findCollectionForSections, getSections: getCollectionSectionsRaw, setSections: setCollectionSections,
    viewPath: (slug) => `/collections/${slug}`,
  });
  fastify.get('/collections/:id/sections', c.editor);
  fastify.post('/collections/:id/sections', c.save);
  fastify.post('/collections/:id/sections/image', c.upload);
}
