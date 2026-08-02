import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { writeLog } from '../../db/queries/system-log';
import {
  listSubscribers, countSubscribers, createBroadcast, listBroadcasts, listSubscribedEmails,
} from '../../db/queries/newsletter';
import { sendBroadcast } from '../../email/broadcast';

export async function newsletterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/newsletter', list);
  fastify.get('/newsletter/broadcasts/new', composePage);
  fastify.post('/newsletter/broadcasts', createAndSend);
}

function ctx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

async function list(req: FastifyRequest, reply: FastifyReply) {
  const q = req.query as Record<string, string>;
  return reply.type('text/html').send(
    await render('newsletter/index', {
      ...ctx(req),
      subscribers: listSubscribers(),
      broadcasts: listBroadcasts(),
      subscribedCount: countSubscribers('subscribed'),
      totalCount: countSubscribers('all'),
      pageTitle: 'Newsletter',
      pageSection: 'newsletter',
      sent: 'sent' in q,
      error: q.error,
    }, reply),
  );
}

async function composePage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('newsletter/broadcast', {
      ...ctx(req),
      subscribedCount: countSubscribers('subscribed'),
      form: {},
      pageTitle: 'New broadcast',
      pageSection: 'newsletter',
    }, reply),
  );
}

async function createAndSend(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  const subject = (req.body.subject ?? '').trim();
  const body = (req.body.body ?? '').trim();

  const recipients = listSubscribedEmails();
  const invalid = !subject || !body
    ? 'A subject and message are both required.'
    : recipients.length === 0
      ? 'You have no subscribers to send to yet.'
      : null;

  if (invalid) {
    return reply.type('text/html').send(
      await render('newsletter/broadcast', {
        ...ctx(req),
        subscribedCount: recipients.length,
        form: { subject, body },
        error: invalid,
        pageTitle: 'New broadcast',
        pageSection: 'newsletter',
      }, reply),
    );
  }

  const broadcastId = createBroadcast(subject, body, recipients.length);

  // Send in the background so a large list doesn't block the request; the list
  // page shows the status ('sending' → 'sent') and the final counts on refresh.
  sendBroadcast(broadcastId).catch((err) => {
    writeLog('error', 'error', `Newsletter broadcast failed: ${err instanceof Error ? err.message : String(err)}`, { broadcastId });
  });

  return reply.redirect('/admin/newsletter?sent=1');
}
