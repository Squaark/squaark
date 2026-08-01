import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings, setSetting } from '../../db/queries/admin';
import {
  listReviews, findReviewById, setReviewStatus, deleteReview, countReviewsByStatus,
  type ReviewStatus,
} from '../../db/queries/reviews';

const STATUSES: ReviewStatus[] = ['pending', 'published', 'rejected'];

export async function reviewRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/reviews', list);
  fastify.post('/reviews/settings', saveSettings);
  fastify.post('/reviews/:id/status', updateStatus);
  fastify.post('/reviews/:id/delete', remove);
}

function ctx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

async function list(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
  const q = req.query.status;
  const filter = STATUSES.includes(q as ReviewStatus) ? (q as ReviewStatus) : undefined;
  const counts = countReviewsByStatus();
  return reply.type('text/html').send(
    await render('reviews/index', {
      ...ctx(req),
      reviews: listReviews(filter),
      counts,
      filter: filter ?? 'all',
      requireApproval: getAllSettings().reviews_require_approval !== '0',
      pageTitle: 'Reviews', pageSection: 'reviews',
      saved: 'saved' in (req.query as Record<string, string>),
    }, reply),
  );
}

async function saveSettings(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  setSetting('reviews_require_approval', req.body.require_approval === '1' ? '1' : '0');
  return reply.redirect('/admin/reviews?saved=1');
}

async function updateStatus(req: FastifyRequest<{ Params: { id: string }; Body: { status?: string } }>, reply: FastifyReply) {
  const review = findReviewById(req.params.id);
  if (!review) return reply.code(404).send('Not found');
  const status = req.body.status as ReviewStatus;
  if (STATUSES.includes(status)) setReviewStatus(review.id, status);
  return reply.redirect(backTo(req));
}

async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  deleteReview(req.params.id);
  return reply.redirect(backTo(req));
}

/** Preserve the status filter across an action via the `from` field. */
function backTo(req: FastifyRequest): string {
  const from = (req.body as { from?: string } | undefined)?.from;
  return from && STATUSES.includes(from as ReviewStatus) ? `/admin/reviews?status=${from}` : '/admin/reviews';
}
