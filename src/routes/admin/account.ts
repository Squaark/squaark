import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById, hashPassword, verifyAdminPassword } from '../../admin/auth';
import { getAllSettings, updateAdminProfile, updateAdminPassword } from '../../db/queries/admin';

export async function accountRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/account', accountPage);
  fastify.post('/account/profile', saveProfile);
  fastify.post('/account/password', changePassword);
}

async function accountPage(
  req: FastifyRequest<{ Querystring: { saved?: string; pw?: string; error?: string } }>,
  reply: FastifyReply,
) {
  const admin = getAdminById(req.session.adminId!)!;
  return reply.type('text/html').send(
    await render('account', {
      admin,
      settings: getAllSettings(),
      profileSaved: req.query.saved === '1',
      passwordSaved: req.query.pw === '1',
      error: req.query.error,
      pageTitle: 'My account',
      pageSection: 'account',
    }, reply),
  );
}

async function saveProfile(
  req: FastifyRequest<{ Body: { name?: string; email?: string } }>,
  reply: FastifyReply,
) {
  const name = req.body.name?.trim();
  const email = req.body.email?.toLowerCase().trim();
  if (!name || !email) return reply.redirect('/admin/account?error=missing_fields');

  try {
    updateAdminProfile(req.session.adminId!, name, email);
  } catch {
    // UNIQUE(email) — the address belongs to another user
    return reply.redirect('/admin/account?error=email_taken');
  }
  return reply.redirect('/admin/account?saved=1');
}

async function changePassword(
  req: FastifyRequest<{ Body: { current?: string; password?: string; confirm?: string } }>,
  reply: FastifyReply,
) {
  const { current, password, confirm } = req.body;
  if (!current || !password || !confirm) return reply.redirect('/admin/account?error=missing_fields');
  if (password.length < 8) return reply.redirect('/admin/account?error=too_short');
  if (password !== confirm) return reply.redirect('/admin/account?error=mismatch');

  const ok = await verifyAdminPassword(req.session.adminId!, current);
  if (!ok) return reply.redirect('/admin/account?error=wrong_password');

  updateAdminPassword(req.session.adminId!, await hashPassword(password));
  return reply.redirect('/admin/account?pw=1');
}
