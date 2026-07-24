import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { findAllBands, findBandById, createBand, updateBand, deleteBand, countProductsInBand } from '../../db/queries/tax';

export async function taxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/tax', listBands);
  fastify.get('/tax/new', newBandPage);
  fastify.post('/tax', createBandHandler);
  fastify.get('/tax/:id', editBandPage);
  fastify.post('/tax/:id', updateBandHandler);
  fastify.post('/tax/:id/delete', deleteBandHandler);
}

function ctx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

async function listBands(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    render('tax/index', { ...ctx(req), bands: findAllBands(), pageTitle: 'Tax bands', pageSection: 'tax' }),
  );
}

async function newBandPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    render('tax/band', { ...ctx(req), band: null, pageTitle: 'New tax band', pageSection: 'tax' }),
  );
}

async function createBandHandler(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { name, rate } = req.body;
  if (!name?.trim()) {
    return reply.type('text/html').send(
      render('tax/band', { ...ctx(req), band: req.body, error: 'Name is required', pageTitle: 'New tax band', pageSection: 'tax' }),
    );
  }
  createBand(name, rate ?? '0');
  return reply.redirect('/admin/tax?saved=1');
}

async function editBandPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const band = findBandById(req.params.id);
  if (!band) return reply.code(404).type('text/html').send(render('404', { pageTitle: 'Not found' }));
  const productCount = countProductsInBand(band.id);
  return reply.type('text/html').send(
    render('tax/band', { ...ctx(req), band, productCount, pageTitle: band.name, pageSection: 'tax' }),
  );
}

async function updateBandHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const band = findBandById(req.params.id);
  if (!band) return reply.code(404).send('Not found');
  const { name, rate } = req.body;
  if (!name?.trim()) {
    return reply.type('text/html').send(
      render('tax/band', { ...ctx(req), band: { ...band, ...req.body }, error: 'Name is required', pageTitle: band.name, pageSection: 'tax' }),
    );
  }
  updateBand(req.params.id, name, rate ?? '0');
  return reply.redirect('/admin/tax?saved=1');
}

async function deleteBandHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  deleteBand(req.params.id);
  return reply.redirect('/admin/tax');
}
