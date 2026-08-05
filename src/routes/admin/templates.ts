import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings, getSetting, setSetting } from '../../db/queries/admin';
import { sanitizeSections } from '../../theme/sections';
import { sectionBuilderVars } from '../../admin/section-builder-ctx';
import { savePageImage } from '../../admin/store-media';

// Global section templates for product & collection pages, stored as settings.
const KINDS = { product: 'Product page', collection: 'Collection page' } as const;
type Kind = keyof typeof KINDS;

function isKind(k: string): k is Kind {
  return k === 'product' || k === 'collection';
}
function settingKey(kind: Kind): string {
  return `${kind}_template_sections`;
}
function adminCtx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}
function safeSectionsAttr(sections: unknown[]): string {
  return JSON.stringify(sections).replace(/'/g, '&#39;');
}
function parseSections(raw: string | null | undefined): unknown[] {
  try { return JSON.parse(raw || '[]') ?? []; } catch { return []; }
}

export async function templateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/templates', async (_req, reply) => reply.redirect('/admin/templates/product'));

  fastify.get('/templates/:kind', async (req: FastifyRequest<{ Params: { kind: string } }>, reply) => {
    const kind = req.params.kind;
    if (!isKind(kind)) return reply.redirect('/admin/templates/product');
    const sections = parseSections(getSetting(settingKey(kind)));
    return reply.type('text/html').send(
      await render('templates/edit', {
        ...adminCtx(req),
        kind, kindLabel: KINDS[kind], otherKind: kind === 'product' ? 'collection' : 'product',
        sectionsSafe: safeSectionsAttr(sections),
        ...sectionBuilderVars({ uploadUrl: `/admin/templates/${kind}/sections/image`, canUpload: true, previewUrl: '/__preview/page', legacy: false }),
        saved: 'saved' in (req.query as Record<string, string>),
        pageTitle: `${KINDS[kind]} template`, pageSection: 'templates', fullWidth: true,
      }, reply),
    );
  });

  fastify.post('/templates/:kind', async (req: FastifyRequest<{ Params: { kind: string }; Body: { sections?: string } }>, reply) => {
    const kind = req.params.kind;
    if (!isKind(kind)) return reply.redirect('/admin/templates/product');
    setSetting(settingKey(kind), JSON.stringify(sanitizeSections(req.body.sections)));
    return reply.redirect(`/admin/templates/${kind}?saved=1`);
  });

  fastify.post('/templates/:kind/sections/image', async (req: FastifyRequest<{ Params: { kind: string } }>, reply) => {
    const kind = req.params.kind;
    if (!isKind(kind)) return reply.code(400).send({ error: 'Unknown template' });
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });
    try {
      const url = await savePageImage(`template-${kind}`, await data.toBuffer(), data.mimetype);
      return reply.send({ url });
    } catch (err: unknown) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Upload failed' });
    }
  });
}
