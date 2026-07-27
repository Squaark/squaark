import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import argon2 from 'argon2';
import type { ThemeRegistry } from '../../theme/registry';
import { buildGlobalContext } from '../../theme/context';
import { getCartSummary } from '../../commerce/cart';
import {
  findCustomerByEmail,
  findCustomerById,
  createCustomer,
  deleteCustomer,
  findCustomerByVerificationToken,
  markCustomerEmailVerified,
  setCustomerVerificationToken,
} from '../../db/queries/customers';
import { findOrdersByEmail, findOrderByIdAndEmail, findOrderItems } from '../../db/queries/orders';
import { getSetting } from '../../db/queries/admin';
import {
  generateVerificationToken,
  isVerificationTokenExpired,
  isAccountClaimed,
  sendVerificationEmail,
} from '../../commerce/customer-verification';
import '../../types';

function accountsEnabled(): boolean {
  return getSetting('customer_accounts_enabled') !== '0';
}

// Verified against on an unknown-email login so the response takes roughly
// the same time as a real account's argon2id verify — see the identical
// pattern (and reasoning) in src/admin/auth.ts.
const DUMMY_HASH_FOR_TIMING = '$argon2id$v=19$m=65536,t=3,p=4$b4sHhkexu0HRu/yVtAa5Lg$uxd90xMEYSv/xe8lObsOZboFpJWiAV2eHV0ShGlABZM';

async function render(
  registry: ThemeRegistry,
  reply: FastifyReply,
  template: string,
  ctx: Record<string, unknown>,
): Promise<void> {
  const html = await registry.currentEngine.render(template, ctx);
  reply.type('text/html').send(html);
}

async function base(req: FastifyRequest, reply: FastifyReply, path: string, registry: ThemeRegistry) {
  const cartSummary = await getCartSummary(req.cartId);
  const global = buildGlobalContext(path, registry.currentThemeConfig);
  let customer = null;
  if (req.session.customerId) {
    const c = findCustomerById(req.session.customerId);
    if (c) customer = { loggedIn: true, firstName: c.first_name || null, emailVerified: !!c.email_verified };
  }
  return {
    ...global,
    cart: cartSummary,
    customer,
    csrfToken: reply.generateCsrf(),
    cssVars: registry.currentCssVars,
  };
}

function requireCustomer(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.session.customerId) {
    reply.redirect('/account/login');
    return false;
  }
  return true;
}

export async function accountRoutes(fastify: FastifyInstance, registry: ThemeRegistry): Promise<void> {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/account')) return;
    if (!accountsEnabled()) return reply.code(404).type('text/html').send(
      await registry.currentEngine.render('404', { pageTitle: 'Not found' }),
    );
  });

  fastify.get('/account', async (req, reply) => {
    return reply.redirect(req.session.customerId ? '/account/orders' : '/account/login');
  });

  fastify.get('/account/login', async (req, reply) => {
    if (req.session.customerId) return reply.redirect('/account/orders');
    const ctx = await base(req, reply, '/account/login', registry);
    return render(registry, reply, 'account-login', {
      ...ctx,
      pageTitle: 'Sign in',
      error: (req.query as Record<string, string>).error,
    });
  });

  fastify.post('/account/login', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.redirect('/account/login?error=missing_fields');

    const customer = findCustomerByEmail(email);
    if (!customer) {
      await argon2.verify(DUMMY_HASH_FOR_TIMING, password);
      return reply.redirect('/account/login?error=invalid');
    }
    const ok = await argon2.verify(customer.password_hash, password);
    if (!ok) return reply.redirect('/account/login?error=invalid');

    req.session.customerId = customer.id;
    return reply.redirect('/account/orders');
  });

  fastify.get('/account/register', async (req, reply) => {
    if (req.session.customerId) return reply.redirect('/account/orders');
    const ctx = await base(req, reply, '/account/register', registry);
    return render(registry, reply, 'account-register', {
      ...ctx,
      pageTitle: 'Create account',
      error: (req.query as Record<string, string>).error,
    });
  });

  fastify.post('/account/register', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const { first_name, last_name, email, password } = req.body as Record<string, string>;
    if (!first_name || !email || !password) return reply.redirect('/account/register?error=missing_fields');
    if (password.length < 8) return reply.redirect('/account/register?error=password_too_short');

    const existing = findCustomerByEmail(email);
    if (existing) {
      if (isAccountClaimed(existing)) return reply.redirect('/account/register?error=email_taken');
      // Stale, never-verified registration (e.g. someone else squatting the
      // address) — safe to evict and let this attempt claim the email.
      deleteCustomer(existing.id);
    }

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const id = crypto.randomUUID();
    const { token, expiresAt } = generateVerificationToken();
    createCustomer(id, email, hash, first_name, last_name ?? '', token, expiresAt);
    sendVerificationEmail({ email, first_name }, token).catch(() => {});
    req.session.customerId = id;
    return reply.redirect('/account/orders');
  });

  fastify.get('/account/verify', async (req, reply) => {
    const { token } = req.query as { token?: string };
    const customer = token ? findCustomerByVerificationToken(token) : null;
    if (!customer || isVerificationTokenExpired(customer.verification_token_expires)) {
      return reply.redirect('/account/orders?verify_error=invalid_token');
    }
    markCustomerEmailVerified(customer.id);
    req.session.customerId = customer.id;
    return reply.redirect('/account/orders?verified=1');
  });

  fastify.post('/account/verify/resend', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async (req, reply) => {
    if (!requireCustomer(req, reply)) return;
    const customer = findCustomerById(req.session.customerId!)!;
    if (customer.email_verified) return reply.redirect('/account/orders');

    const { token, expiresAt } = generateVerificationToken();
    setCustomerVerificationToken(customer.id, token, expiresAt);
    sendVerificationEmail(customer, token).catch(() => {});
    return reply.redirect('/account/orders?resent=1');
  });

  fastify.get('/account/orders', async (req, reply) => {
    if (!requireCustomer(req, reply)) return;
    const customer = findCustomerById(req.session.customerId!)!;
    // Order history is only released once the customer has proven they
    // control this email address — otherwise anyone could register a
    // victim's email and read back their entire guest-checkout history.
    const orders = customer.email_verified ? findOrdersByEmail(customer.email) : [];
    const ctx = await base(req, reply, '/account/orders', registry);
    const q = req.query as Record<string, string>;
    return render(registry, reply, 'account-orders', {
      ...ctx,
      pageTitle: 'My orders',
      customer,
      orders,
      emailVerified: !!customer.email_verified,
      verified: q.verified === '1',
      resent: q.resent === '1',
      verifyError: q.verify_error,
    });
  });

  fastify.get('/account/orders/:id', async (req, reply) => {
    if (!requireCustomer(req, reply)) return;
    const customer = findCustomerById(req.session.customerId!)!;
    if (!customer.email_verified) return reply.redirect('/account/orders');
    const { id } = req.params as { id: string };
    const order = findOrderByIdAndEmail(id, customer.email);
    if (!order) return reply.redirect('/account/orders');
    const items = findOrderItems(order.id);
    const ctx = await base(req, reply, `/account/orders/${id}`, registry);
    return render(registry, reply, 'account-order', {
      ...ctx,
      pageTitle: `Order #${order.order_number}`,
      customer,
      order,
      items,
    });
  });

  fastify.post('/account/logout', async (req, reply) => {
    req.session.customerId = undefined;
    return reply.redirect('/account/login');
  });
}
