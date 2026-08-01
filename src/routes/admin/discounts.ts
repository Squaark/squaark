import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import {
  listDiscounts, findDiscountById, createDiscount, updateDiscount, deleteDiscount,
  type DiscountInput, type DiscountRow,
} from '../../db/queries/discounts';

export async function discountRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/discounts', list);
  fastify.get('/discounts/new', newPage);
  fastify.post('/discounts', create);
  fastify.get('/discounts/:id', editPage);
  fastify.post('/discounts/:id', update);
  fastify.post('/discounts/:id/delete', remove);
}

function ctx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

/** Turns the form body into a DiscountInput, or an error message. Percentages
 *  stay whole numbers; fixed amounts and the minimum are entered in currency
 *  and stored as pence. */
function parseBody(body: Record<string, string>): { input?: DiscountInput; error?: string } {
  const code = (body.code ?? '').trim();
  if (!code) return { error: 'A code is required.' };

  const type = body.type === 'fixed' ? 'fixed' : 'percentage';
  const rawValue = parseFloat(body.value ?? '');
  if (!(rawValue > 0)) return { error: 'The value must be greater than zero.' };
  if (type === 'percentage' && rawValue > 100) return { error: 'A percentage can\'t be more than 100.' };
  const value = type === 'percentage' ? Math.round(rawValue) : Math.round(rawValue * 100);

  const minSubtotal = Math.round((parseFloat(body.min_subtotal ?? '') || 0) * 100);
  const usageLimit = parseInt(body.usage_limit ?? '', 10);
  const endsAt = body.ends_at ? `${body.ends_at}T23:59:59` : null;

  return {
    input: {
      code, type, value,
      active: body.active === '1' || body.active === 'on',
      minSubtotal: minSubtotal > 0 ? minSubtotal : 0,
      usageLimit: usageLimit > 0 ? usageLimit : null,
      endsAt,
    },
  };
}

/** Display-friendly form values for the edit page (pence → currency, etc.). */
function toForm(d: DiscountRow) {
  return {
    code: d.code,
    type: d.type,
    value: d.type === 'fixed' ? (d.value / 100).toFixed(2) : String(d.value),
    min_subtotal: d.min_subtotal ? (d.min_subtotal / 100).toFixed(2) : '',
    usage_limit: d.usage_limit ?? '',
    ends_at: d.ends_at ? d.ends_at.slice(0, 10) : '',
    active: d.active === 1,
  };
}

async function list(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('discounts/index', {
      ...ctx(req), discounts: listDiscounts(),
      pageTitle: 'Discounts', pageSection: 'promotions', promoTab: 'codes',
      saved: 'saved' in (req.query as Record<string, string>),
    }, reply),
  );
}

async function newPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('discounts/form', {
      ...ctx(req), discount: null, form: { type: 'percentage', active: true },
      pageTitle: 'New discount', pageSection: 'promotions', promoTab: 'codes',
    }, reply),
  );
}

async function create(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('discounts/form', { ...ctx(req), discount: null, form: req.body, error, pageTitle: 'New discount', pageSection: 'promotions', promoTab: 'codes' }, reply),
    );
  }
  try {
    createDiscount(input);
  } catch {
    return reply.type('text/html').send(
      await render('discounts/form', { ...ctx(req), discount: null, form: req.body, error: 'A discount with that code already exists.', pageTitle: 'New discount', pageSection: 'promotions', promoTab: 'codes' }, reply),
    );
  }
  return reply.redirect('/admin/discounts?saved=1');
}

async function editPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const discount = findDiscountById(req.params.id);
  if (!discount) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  return reply.type('text/html').send(
    await render('discounts/form', {
      ...ctx(req), discount, form: toForm(discount),
      pageTitle: discount.code, pageSection: 'promotions', promoTab: 'codes',
    }, reply),
  );
}

async function update(req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>, reply: FastifyReply) {
  const discount = findDiscountById(req.params.id);
  if (!discount) return reply.code(404).send('Not found');
  const { input, error } = parseBody(req.body);
  if (error || !input) {
    return reply.type('text/html').send(
      await render('discounts/form', { ...ctx(req), discount, form: req.body, error, pageTitle: discount.code, pageSection: 'promotions', promoTab: 'codes' }, reply),
    );
  }
  try {
    updateDiscount(discount.id, input);
  } catch {
    return reply.type('text/html').send(
      await render('discounts/form', { ...ctx(req), discount, form: req.body, error: 'A discount with that code already exists.', pageTitle: discount.code, pageSection: 'promotions', promoTab: 'codes' }, reply),
    );
  }
  return reply.redirect('/admin/discounts?saved=1');
}

async function remove(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  deleteDiscount(req.params.id);
  return reply.redirect('/admin/discounts?saved=1');
}
