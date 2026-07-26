import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render, renderFragment } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { findImportJob, listRecentImportJobs } from '../../db/queries/import';
import { startWxrImportJob, startApiImportJob } from '../../import/woocommerce/jobs';

export async function importRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/import', importPage);
  fastify.post('/import/wxr', uploadWxr);
  fastify.post('/import/woocommerce', connectApi);
  fastify.get('/import/jobs/:id', jobStatus);
}

async function importPage(req: FastifyRequest<{ Querystring: { job?: string } }>, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;
  const activeJob = req.query.job ? findImportJob(req.query.job) : null;

  return reply.type('text/html').send(
    await render(
      'import',
      {
        admin,
        settings: getAllSettings(),
        activeJob,
        jobs: listRecentImportJobs(10),
        pageTitle: 'Import',
        pageSection: 'import',
      },
      reply,
    ),
  );
}

async function uploadWxr(req: FastifyRequest, reply: FastifyReply) {
  const data = await req.file();
  if (!data) return reply.redirect('/admin/import?error=no_file');

  const xml = (await data.toBuffer()).toString('utf-8');
  const jobId = startWxrImportJob(xml);
  return reply.redirect(`/admin/import?job=${jobId}`);
}

async function connectApi(
  req: FastifyRequest<{
    Body: {
      store_url?: string;
      consumer_key?: string;
      consumer_secret?: string;
      import_products?: string;
      import_orders?: string;
      import_pages?: string;
    };
  }>,
  reply: FastifyReply,
) {
  const { store_url, consumer_key, consumer_secret } = req.body;
  if (!store_url || !consumer_key || !consumer_secret) {
    return reply.redirect('/admin/import?error=missing_fields');
  }

  const jobId = startApiImportJob(
    { storeUrl: store_url.trim(), consumerKey: consumer_key.trim(), consumerSecret: consumer_secret.trim() },
    {
      importProducts: req.body.import_products === 'on',
      importOrders: req.body.import_orders === 'on',
      importPages: req.body.import_pages === 'on',
    },
  );
  return reply.redirect(`/admin/import?job=${jobId}`);
}

async function jobStatus(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const job = findImportJob(req.params.id);
  if (!job) return reply.code(404).send('Not found');
  return reply.type('text/html').send(renderFragment('partials/import-job', { job }));
}
