import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { listCustomers, countCustomers, deleteCustomer } from '../../db/queries/customers';

export async function customersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/customers', listCustomersPage);
  fastify.post('/customers/:id/delete', deleteCustomerHandler);
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
