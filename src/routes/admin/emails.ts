import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Handlebars from 'handlebars';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import {
  listEmailTemplates,
  findEmailTemplate,
  updateEmailTemplate,
  listRecentEmailLog,
} from '../../db/queries/email';
import { renderEmailPreview } from '../../email/templates';
import { sendTemplatedEmail } from '../../email/send';
import { buildSampleContext } from '../../email/sample-data';

export async function emailRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/emails', listPage);
  fastify.get('/emails/:key', editPage);
  fastify.post('/emails/:key', save);
  fastify.post('/emails/:key/preview', preview);
  fastify.post('/emails/:key/test', sendTest);
}

async function listPage(req: FastifyRequest, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;
  return reply.type('text/html').send(
    await render('emails/list', {
      admin,
      settings: getAllSettings(),
      templates: listEmailTemplates(),
      log: listRecentEmailLog(10),
      pageTitle: 'Emails',
      pageSection: 'emails',
    }, reply),
  );
}

async function editPage(req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;
  const template = findEmailTemplate(req.params.key);
  if (!template)
    return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));

  const { html: previewHtml } = renderEmailPreview(
    template.subject,
    template.body,
    buildSampleContext(req.params.key),
  );

  return reply.type('text/html').send(
    await render('emails/form', {
      admin,
      settings: getAllSettings(),
      template,
      previewHtml,
      pageTitle: template.name,
      pageSection: 'emails',
      saved: 'saved' in (req.query as Record<string, string>),
    }, reply),
  );
}

async function save(
  req: FastifyRequest<{ Params: { key: string }; Body: { subject: string; body: string; enabled?: string } }>,
  reply: FastifyReply,
) {
  const template = findEmailTemplate(req.params.key);
  if (!template) return reply.code(404).send('Not found');

  updateEmailTemplate(req.params.key, req.body.subject, req.body.body, req.body.enabled === 'on');
  return reply.redirect(`/admin/emails/${req.params.key}?saved=1`);
}

async function preview(
  req: FastifyRequest<{ Params: { key: string }; Body: { subject: string; body: string } }>,
  reply: FastifyReply,
) {
  const { subject, html } = renderEmailPreview(
    req.body.subject,
    req.body.body,
    buildSampleContext(req.params.key),
  );
  return reply.type('text/html').send(
    `<div class="text-xs text-gray-400 mb-2">Subject: ${Handlebars.Utils.escapeExpression(subject)}</div>${html}`,
  );
}

async function sendTest(req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;

  try {
    await sendTemplatedEmail(req.params.key, admin.email, buildSampleContext(req.params.key));
    return reply.type('text/html').send(
      `<span class="text-green-600 text-sm">Test email sent to ${Handlebars.Utils.escapeExpression(admin.email)}.</span>`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send test email';
    return reply.type('text/html').send(
      `<span class="text-red-600 text-sm">Failed: ${Handlebars.Utils.escapeExpression(message)}</span>`,
    );
  }
}
