import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { sanitizeSections } from '../../theme/sections';
import { sectionBuilderVars } from '../../admin/section-builder-ctx';
import { savePageImage } from '../../admin/store-media';
import {
  findAllReusable, findReusableById, createReusable, updateReusable, deleteReusable,
} from '../../db/queries/reusable-sections';

function adminCtx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}
function safeSectionsAttr(sections: unknown[]): string {
  return JSON.stringify(sections).replace(/'/g, '&#39;');
}
function parseSections(raw: string | undefined): unknown[] {
  try { return JSON.parse(raw || '[]') ?? []; } catch { return []; }
}

export async function blockRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/blocks', async (req, reply) => {
    return reply.type('text/html').send(
      await render('blocks/list', { ...adminCtx(req), blocks: findAllReusable(), pageTitle: 'Reusable sections', pageSection: 'blocks' }, reply),
    );
  });

  fastify.get('/blocks/new', async (req, reply) => {
    return reply.type('text/html').send(
      await render('blocks/form', {
        ...adminCtx(req), block: null, sectionsSafe: '[]',
        ...sectionBuilderVars({ uploadUrl: '', canUpload: false, previewUrl: '/__preview/page', legacy: false }),
        pageTitle: 'New block', pageSection: 'blocks', fullWidth: true,
      }, reply),
    );
  });

  fastify.post('/blocks/new', async (req: FastifyRequest<{ Body: { name?: string; sections?: string } }>, reply) => {
    const name = req.body.name?.trim();
    if (!name) return reply.redirect('/admin/blocks/new');
    const id = createReusable(name, JSON.stringify(sanitizeSections(req.body.sections)));
    return reply.redirect(`/admin/blocks/${id}?created=1`);
  });

  fastify.get('/blocks/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const block = findReusableById(req.params.id);
    if (!block) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
    const q = req.query as Record<string, string>;
    return reply.type('text/html').send(
      await render('blocks/form', {
        ...adminCtx(req), block, sectionsSafe: safeSectionsAttr(parseSections(block.sections)),
        ...sectionBuilderVars({ uploadUrl: `/admin/blocks/${block.id}/sections/image`, canUpload: true, previewUrl: '/__preview/page', legacy: false, excludeBlock: block.id }),
        saved: 'saved' in q, created: 'created' in q,
        pageTitle: block.name, pageSection: 'blocks', fullWidth: true,
      }, reply),
    );
  });

  fastify.post('/blocks/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: { name?: string; sections?: string } }>, reply) => {
    updateReusable(req.params.id, req.body.name?.trim() || 'Untitled', JSON.stringify(sanitizeSections(req.body.sections)));
    return reply.redirect(`/admin/blocks/${req.params.id}?saved=1`);
  });

  fastify.post('/blocks/:id/delete', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    deleteReusable(req.params.id);
    return reply.redirect('/admin/blocks?deleted=1');
  });

  fastify.post('/blocks/:id/sections/image', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });
    try {
      const url = await savePageImage(`block-${req.params.id}`, await data.toBuffer(), data.mimetype);
      return reply.send({ url });
    } catch (err: unknown) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });
}
