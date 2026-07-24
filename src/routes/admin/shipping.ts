import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import {
  findAllZones, findZoneById, findRatesForZone,
  createZone, updateZone, deleteZone,
  createRate, deleteRate,
} from '../../db/queries/shipping';

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'PT', name: 'Portugal' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: '*',  name: 'Rest of world' },
];

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

function parseCountries(body: Record<string, string | string[]>): string[] {
  const raw = body['countries[]'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export async function shippingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/shipping', listZones);
  fastify.get('/shipping/new', newZonePage);
  fastify.post('/shipping/new', createZoneHandler);
  fastify.get('/shipping/:id', editZonePage);
  fastify.post('/shipping/:id', updateZoneHandler);
  fastify.post('/shipping/:id/delete', deleteZoneHandler);
  fastify.post('/shipping/:id/rates', createRateHandler);
  fastify.post('/shipping/:id/rates/:rateId/delete', deleteRateHandler);
}

async function listZones(req: FastifyRequest, reply: FastifyReply) {
  const zones = findAllZones().map(z => ({
    ...z,
    countriesParsed: (() => { try { return JSON.parse(z.countries) as string[]; } catch { return []; } })(),
    rates: findRatesForZone(z.id),
  }));
  return reply.type('text/html').send(
    render('shipping/index', { ...adminCtx(req), zones, pageTitle: 'Shipping', pageSection: 'shipping' }),
  );
}

async function newZonePage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    render('shipping/zone', {
      ...adminCtx(req), zone: null, rates: [], countries: COUNTRIES, selected: [],
      pageTitle: 'New shipping zone', pageSection: 'shipping',
    }),
  );
}

async function createZoneHandler(
  req: FastifyRequest<{ Body: Record<string, string | string[]> }>,
  reply: FastifyReply,
) {
  const name = (req.body.name as string)?.trim();
  if (!name) return reply.redirect('/admin/shipping/new');
  const countries = parseCountries(req.body);
  const zone = createZone(name, countries);
  return reply.redirect(`/admin/shipping/${zone.id}?created=1`);
}

async function editZonePage(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const zone = findZoneById(req.params.id);
  if (!zone) return reply.code(404).type('text/html').send(render('404', { pageTitle: 'Not found' }));
  const rates = findRatesForZone(zone.id);
  const selected: string[] = (() => { try { return JSON.parse(zone.countries) as string[]; } catch { return []; } })();
  return reply.type('text/html').send(
    render('shipping/zone', {
      ...adminCtx(req), zone, rates, countries: COUNTRIES, selected,
      saved: 'saved' in (req.query as Record<string, string>),
      created: 'created' in (req.query as Record<string, string>),
      pageTitle: zone.name, pageSection: 'shipping',
    }),
  );
}

async function updateZoneHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string | string[]> }>,
  reply: FastifyReply,
) {
  const name = (req.body.name as string)?.trim();
  if (!name) return reply.redirect(`/admin/shipping/${req.params.id}`);
  const countries = parseCountries(req.body);
  updateZone(req.params.id, name, countries);
  return reply.redirect(`/admin/shipping/${req.params.id}?saved=1`);
}

async function deleteZoneHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  deleteZone(req.params.id);
  return reply.redirect('/admin/shipping?deleted=1');
}

async function createRateHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { name, rate_type, amount, min_order_amount } = req.body;
  if (!name || !rate_type) return reply.redirect(`/admin/shipping/${req.params.id}`);
  const amountInt = Math.round(parseFloat(amount || '0') * 100);
  const minInt = min_order_amount ? Math.round(parseFloat(min_order_amount) * 100) : null;
  createRate(req.params.id, name.trim(), rate_type, amountInt, minInt);
  return reply.redirect(`/admin/shipping/${req.params.id}?saved=1`);
}

async function deleteRateHandler(
  req: FastifyRequest<{ Params: { id: string; rateId: string } }>,
  reply: FastifyReply,
) {
  deleteRate(req.params.rateId);
  return reply.redirect(`/admin/shipping/${req.params.id}?saved=1`);
}
