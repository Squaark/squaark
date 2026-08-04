import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { listCustomers, countCustomers, deleteCustomer } from '../../db/queries/customers';
import { findAllGroups, createGroup, updateGroup, deleteGroup, setCustomerGroup } from '../../db/queries/customer-groups';

export async function customersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/customers', listCustomersPage);
  fastify.post('/customers/:id/delete', deleteCustomerHandler);
  fastify.post('/customers/:id/group', setGroupHandler);
  fastify.post('/customer-groups', createGroupHandler);
  fastify.post('/customer-groups/:id', updateGroupHandler);
  fastify.post('/customer-groups/:id/delete', deleteGroupHandler);
}

async function listCustomersPage(
  req: FastifyRequest<{ Querystring: { page?: string; deleted?: string } }>,
  reply: FastifyReply,
) {
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const customers = listCustomers(limit, offset);
  const total = countCustomers();
  const admin = getAdminById(req.session.adminId!)!;

  return reply.type('text/html').send(
    await render('customers/list', {
      admin,
      settings: getAllSettings(),
      customers,
      groups: findAllGroups(),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      deleted: req.query.deleted === '1',
      pageTitle: 'Customers',
      pageSection: 'customers',
    }, reply),
  );
}

async function deleteCustomerHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  deleteCustomer(req.params.id);
  return reply.redirect('/admin/customers?deleted=1');
}

async function setGroupHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { group_id?: string } }>,
  reply: FastifyReply,
) {
  setCustomerGroup(req.params.id, req.body.group_id?.trim() || null);
  return reply.redirect('/admin/customers');
}

async function createGroupHandler(
  req: FastifyRequest<{ Body: { name?: string } }>,
  reply: FastifyReply,
) {
  const name = req.body.name?.trim();
  if (name) createGroup(name);
  return reply.redirect('/admin/customers');
}

async function updateGroupHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { name?: string; discount_percent?: string; tax_display?: string } }>,
  reply: FastifyReply,
) {
  const name = req.body.name?.trim();
  const pct = parseInt(req.body.discount_percent ?? '0', 10) || 0;
  const tax = req.body.tax_display === 'ex' || req.body.tax_display === 'inc' ? req.body.tax_display : null;
  if (name) updateGroup(req.params.id, name, pct, tax);
  return reply.redirect('/admin/customers');
}

async function deleteGroupHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  deleteGroup(req.params.id);
  return reply.redirect('/admin/customers');
}
