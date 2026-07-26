import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById, hashPassword } from '../../admin/auth';
import { getAllSettings, listAdminUsers, createAdminUser, updateAdminUserRole, deleteAdminUser, countAdminsByRole } from '../../db/queries/admin';

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/users', listUsers);
  fastify.post('/users', createUser);
  fastify.post('/users/:id/role', changeRole);
  fastify.post('/users/:id/delete', deleteUser);
}

async function listUsers(req: FastifyRequest<{ Querystring: { saved?: string; error?: string } }>, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;
  return reply.type('text/html').send(
    await render('users/list', {
      admin,
      settings: getAllSettings(),
      users: listAdminUsers(),
      saved: 'saved' in (req.query as Record<string, string>),
      error: req.query.error,
      pageTitle: 'Users',
      pageSection: 'users',
    }, reply),
  );
}

async function createUser(
  req: FastifyRequest<{ Body: { name?: string; email?: string; password?: string; role?: string } }>,
  reply: FastifyReply,
) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return reply.redirect('/admin/users?error=missing_fields');

  const safeRole = role === 'staff' ? 'staff' : 'admin';
  const hash = await hashPassword(password);
  try {
    createAdminUser(crypto.randomUUID(), email.toLowerCase().trim(), hash, name.trim(), safeRole);
  } catch {
    return reply.redirect('/admin/users?error=email_taken');
  }
  return reply.redirect('/admin/users?saved=1');
}

async function changeRole(
  req: FastifyRequest<{ Params: { id: string }; Body: { role?: string } }>,
  reply: FastifyReply,
) {
  const { id } = req.params;
  const currentAdminId = req.session.adminId!;
  if (id === currentAdminId) return reply.redirect('/admin/users?error=cannot_change_own_role');

  const safeRole = req.body.role === 'staff' ? 'staff' : 'admin';
  // Don't allow demoting the last admin
  if (safeRole === 'staff' && countAdminsByRole('admin') <= 1) {
    return reply.redirect('/admin/users?error=last_admin');
  }
  updateAdminUserRole(id, safeRole);
  return reply.redirect('/admin/users?saved=1');
}

async function deleteUser(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id } = req.params;
  const currentAdminId = req.session.adminId!;
  if (id === currentAdminId) return reply.redirect('/admin/users?error=cannot_delete_self');
  if (countAdminsByRole('admin') <= 1) {
    return reply.redirect('/admin/users?error=last_admin');
  }
  deleteAdminUser(id);
  return reply.redirect('/admin/users?saved=1');
}
