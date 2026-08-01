import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { findAllCollections } from '../../db/queries/collections';
import {
  listAutomaticDiscounts, findAutomaticDiscountById, createAutomaticDiscount,
  updateAutomaticDiscount, deleteAutomaticDiscount,
  type AutomaticDiscountInput, type AutomaticDiscountRow,
} from '../../db/queries/automatic-discounts';

export async function automaticDiscountRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/automatic', list);
  fastify.get('/automatic/new', newPage);
  fastify.post('/automatic', create);
  fastify.get('/automatic/:id', editPage);
  fastify.post('/automatic/:id', update);
  fastify.post('/automatic/:id/delete', remove);
}

function ctx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

function parseBody(body: Record<string, string>): { input?: AutomaticDiscountInput; error?: string } {
  const name = (body.name ?? '').trim();
  if (!name) return { error: 'A name is required.' };
  const kind = body.kind === 'bogo' ? 'bogo' : 'order';

  const startsAt = (body.starts_at ?? '').trim() || null;
  const endsAt = (body.ends_at ?? '').trim() || null;
  if (startsAt && endsAt && startsAt > endsAt) return { error: 'The start date must be on or before the end date.' };

  const base = {
    name, kind,
    active: body.active === '1' || body.active === 'on',
    startsAt, endsAt,
  } as const;

  if (kind === 'order') {
    const type = body.type === 'fixed' ? 'fixed' : 'percentage';
    const raw = parseFloat(body.value ?? '');
    if (!(raw > 0)) return { error: 'The value must be greater than zero.' };
    if (type === 'percentage' && raw > 100) return { error: "A percentage can't be more than 100." };
    const value = type === 'percentage' ? Math.round(raw) : Math.round(raw * 100);
    const minSubtotal = Math.round((parseFloat(body.min_subtotal ?? '') || 0) * 100);
    return {
      input: {
        ...base, type, value, minSubtotal: minSubtotal > 0 ? minSubtotal : 0,
        buyQuantity: null, getQuantity: null, getDiscount: null, targetType: null, targetId: null,
      },
    };
  }

  // bogo
  const buyQuantity = parseInt(body.buy_quantity ?? '', 10);
  const getQuantity = parseInt(body.get_quantity ?? '', 10);
  const getDiscount = parseInt(body.get_discount ?? '', 10);
  if (!(buyQuantity > 0) || !(getQuantity > 0)) return { error: 'Buy and get quantities must be at least 1.' };
  if (!(getDiscount > 0) || getDiscount > 100) return { error: 'The get discount must be between 1 and 100%.' };
  const targetType = ['all', 'collection', 'product'].includes(body.target_type) ? (body.target_type as 'all' | 'collection' | 'product') : 'all';
  const targetId = targetType === 'all' ? null : ((body.target_id ?? '').trim() || null);
  if (targetType !== 'all' && !targetId) return { error: 'Choose a target for the buy-X-get-Y offer.' };
  return {
    input: {
      ...base, type: null, value: null, minSubtotal: 0,
      buyQuantity, getQuantity, getDiscount, targetType, targetId,
    },
  };
}

function toForm(d: AutomaticDiscountRow) {
  return {
    name: d.name, kind: d.kind, active: d.active === 1,
    starts_at: d.starts_at ?? '', ends_at: d.ends_at ?? '',
    type: d.type ?? 'percentage',
    value: d.type === 'fixed' ? ((d.value ?? 0) / 100).toFixed(2) : String(d.value ?? ''),
    min_subtotal: d.min_subtotal ? (d.min_subtotal / 100).toFixed(2) : '',
    buy_quantity: d.buy_quantity ?? '', get_quantity: d.get_quantity ?? '',
    get_discount: d.get_discount ?? 100,
    target_type: d.target_type ?? 'all', target_id: d.target_id ?? '',
  };
}

async function list(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('automatic-discounts/index', {
      ...ctx(req), discounts: listAutomaticDiscounts(),
      pageTitle: 'Automatic discounts', pageSection: 'promotions', promoTab: 'automatic',
      saved: 'saved' in (req.query as Record<string, string>),
    }, reply),
  );
}

async function newPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('automatic-discounts/form', {
      ...ctx(req), discount: null, form: { kind: 'order', type: 'percentage', active: true, get_discount: 100, target_type: 'all' },
      collections: findAllCollections(),
      pageTitle: 'New automatic discount', pageSection: 'promotions', promoTab: 'automatic',
    }, reply),
  );
}

async function create(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('automatic-discounts/form', { ...ctx(req), discount: null, form: req.body, collections: findAllCollections(), error, pageTitle: 'New automatic discount', pageSection: 'promotions', promoTab: 'automatic' }, reply),
    );
  }
  createAutomaticDiscount(input);
  return reply.redirect('/admin/automatic?saved=1');
}

async function editPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const discount = findAutomaticDiscountById(req.params.id);
  if (!discount) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  return reply.type('text/html').send(
    await render('automatic-discounts/form', {
      ...ctx(req), discount, form: toForm(discount), collections: findAllCollections(),
      pageTitle: 'Edit automatic discount', pageSection: 'promotions', promoTab: 'automatic',
    }, reply),
  );
}

async function update(req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>, reply: FastifyReply) {
  const discount = findAutomaticDiscountById(req.params.id);
  if (!discount) return reply.code(404).send('Not found');
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('automatic-discounts/form', { ...ctx(req), discount, form: req.body, collections: findAllCollections(), error, pageTitle: 'Edit automatic discount', pageSection: 'promotions', promoTab: 'automatic' }, reply),
    );
  }
  updateAutomaticDiscount(discount.id, input);
  return reply.redirect('/admin/automatic?saved=1');
}

async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  deleteAutomaticDiscount(req.params.id);
  return reply.redirect('/admin/automatic?saved=1');
}
