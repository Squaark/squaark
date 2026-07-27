import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import type { ThemeRegistry } from '../../theme/registry';
import { buildGlobalContext } from '../../theme/context';
import { getCartPage, getCartSummary } from '../../commerce/cart';
import { clearCart } from '../../db/queries/cart';
import { getAllSettings } from '../../db/queries/admin';
import { createOrder, markOrderPaid, findOrderById, findOrderByPaymentReference, findOrderItems, type Address } from '../../db/queries/orders';
import { createOrderDownloads, findDownloadsForOrder } from '../../db/queries/downloads';
import { sendTemplatedEmail } from '../../email/send';
import { buildOrderEmailContext } from '../../email/order-context';
import { sendMerchantNewOrderEmail } from '../../email/order-notifications';
import config from '../../config';
import { writeLog } from '../../db/queries/system-log';
import { findCustomerByEmail, createCustomer, deleteCustomer } from '../../db/queries/customers';
import { getRatesForCountry } from '../../db/queries/shipping';
import { calculateItemsTax } from '../../commerce/tax';
import { resolveShipping } from '../../commerce/shipping';
import { findStockShortfalls } from '../../commerce/inventory';
import { generateVerificationToken, isAccountClaimed, sendVerificationEmail } from '../../commerce/customer-verification';
import argon2 from 'argon2';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getStripe(): Stripe | null {
  const key = getAllSettings().stripe_sk || config.stripeSecretKey;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

function getPaypalBase(mode: string): string {
  return mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPaypalToken(clientId: string, secret: string, mode: string): Promise<string> {
  const res = await fetch(`${getPaypalBase(mode)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

/** Snapshot of everything needed to fulfil a PayPal order, frozen at /checkout/paypal/create time. */
interface PendingPaypalOrder {
  email: string;
  address: Address;
  items: Array<{ variantId: string; productTitle: string; variantTitle: string; price: number; quantity: number }>;
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  shippingAmount: number;
  shippingTitle: string | null;
  shippingRateId: string | null;
  taxAmount: number;
  total: number;
  currency: string;
}

function parseAddress(body: Record<string, string>): Address {
  return {
    firstName: body.firstName?.trim() ?? '',
    lastName: body.lastName?.trim() ?? '',
    line1: body.line1?.trim() ?? '',
    line2: body.line2?.trim() || undefined,
    city: body.city?.trim() ?? '',
    county: body.county?.trim() || undefined,
    postcode: body.postcode?.trim() ?? '',
    country: body.country?.trim() ?? '',
    phone: body.phone?.trim() || undefined,
  };
}

async function base(req: FastifyRequest, reply: FastifyReply, registry: ThemeRegistry) {
  const cartSummary = await getCartSummary(req.cartId);
  const global = buildGlobalContext('/checkout', registry.currentThemeConfig);
  return { ...global, cart: cartSummary, csrfToken: reply.generateCsrf(), cssVars: registry.currentCssVars };
}

async function render(registry: ThemeRegistry, reply: FastifyReply, template: string, ctx: Record<string, unknown>) {
  const html = await registry.currentEngine.render(template, ctx);
  reply.type('text/html').send(html);
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export async function checkoutRoutes(fastify: FastifyInstance, registry: ThemeRegistry): Promise<void> {

  // GET /checkout — show address + payment form
  fastify.get('/checkout', async (req, reply) => {
    const cart = await getCartPage(req.cartId);
    if (cart.empty) return reply.redirect(`/${getAllSettings().cart_slug || 'cart'}`);

    const settings = getAllSettings();
    const ctx = await base(req, reply, registry);
    const stripeEnabled = !!(settings.stripe_sk || config.stripeSecretKey);
    const paypalEnabled = !!(settings.paypal_client_id || config.paypalClientId);
    const stripePk = settings.stripe_pk || config.stripePublishableKey;
    const paypalClientId = settings.paypal_client_id || config.paypalClientId;
    const paypalMode = settings.paypal_mode || config.paypalMode;

    // Compute items tax from per-band rates; passes to Alpine for display
    const taxEnabled = settings.tax_enabled === '1';
    const itemsTaxAmount = calculateItemsTax(cart.items, taxEnabled);

    await render(registry, reply, 'checkout', {
      ...ctx, cart, pageTitle: 'Checkout',
      stripeEnabled, paypalEnabled, stripePk, paypalClientId, paypalMode,
      itemsTaxAmount,
    });
  });

  // GET /checkout/shipping-rates — htmx fragment: rate options for a given country
  fastify.get('/checkout/shipping-rates', async (req, reply) => {
    const { country = '' } = req.query as { country?: string };
    const cart = await getCartPage(req.cartId);
    const settings = getAllSettings();
    const currencyCode = settings.store_currency ?? 'GBP';
    const symbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
    const sym = symbols[currencyCode] ?? currencyCode;

    const allDigital = cart.items.length > 0 && cart.items.every(i => i.isDigital);
    const allFreeShipping = !allDigital && cart.items.length > 0 && cart.items.every(i => i.freeShipping);
    const rates = allDigital
      ? [{ id: 'digital_delivery', name: 'Digital delivery', amount: 0, isFree: true }]
      : allFreeShipping
        ? [{ id: 'free_shipping_product', name: 'Free Shipping', amount: 0, isFree: true }]
        : getRatesForCountry(country, cart.subtotal.amount - (cart.discountAmount?.amount ?? 0));

    if (!rates.length) {
      reply.type('text/html').send('');
      return;
    }

    const html = rates.map((r, i) => {
      const label = r.isFree ? 'Free' : `${sym}${(r.amount / 100).toFixed(2)}`;
      const checked = i === 0 ? ' checked' : '';
      return `<label class="shipping-rate-option">
  <input type="radio" name="shippingRateId" value="${r.id}" data-amount="${r.amount}"${checked}
         onchange="document.dispatchEvent(new CustomEvent('shipping-rate-changed',{detail:{id:'${r.id}',amount:${r.amount},label:'${label}'}}))">
  <span class="shipping-rate-name">${r.name}</span>
  <span class="shipping-rate-price">${label}</span>
</label>`;
    }).join('\n');

    reply.type('text/html').send(html);
  });

  // POST /checkout — create Stripe session and redirect
  fastify.post('/checkout', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const cart = await getCartPage(req.cartId);
    if (cart.empty) return reply.redirect(`/${getAllSettings().cart_slug || 'cart'}`);

    const settings = getAllSettings();
    const stripe = getStripe();
    if (!stripe) return reply.code(400).send('Stripe is not configured');

    // Re-check stock against the live count before charging — the add-to-cart
    // check can be stale by now.
    const shortfalls = findStockShortfalls(cart.items);
    if (shortfalls.length) {
      return reply.redirect(`/${settings.cart_slug || 'cart'}?error=out_of_stock`);
    }

    const address = parseAddress(body);
    const storeUrl = settings.store_url?.replace(/\/$/, '') || 'http://localhost:3000';
    const currency = (settings.store_currency || 'GBP').toLowerCase();

    // Resolve shipping server-side — never trust the client's claim that a
    // cart qualifies for digital/free shipping (see resolveShipping()).
    const shipping = resolveShipping(cart, address.country, body.shippingRateId ?? '');
    const shippingAmount = shipping.amount;
    const shippingTitle = shipping.title;
    const orderTotal = cart.total.amount + shippingAmount;
    const taxAmount = calculateItemsTax(cart.items, settings.tax_enabled === '1');

    // Create a pending order first so we have an ID for metadata
    const order = createOrder({
      email: body.email?.trim() ?? '',
      subtotal: cart.subtotal.amount,
      discountAmount: cart.discountAmount?.amount ?? 0,
      shipping: shippingAmount,
      total: orderTotal,
      currency: settings.store_currency || 'GBP',
      discountCode: cart.discountCode,
      notes: body.notes?.trim() || null,
      shippingAddress: address,
      paymentProvider: 'stripe',
      paymentReference: null,
      shippingRateId: shipping.rateId,
      shippingTitle,
      taxAmount,
      items: cart.items.map(i => ({
        variantId: i.variantId,
        productTitle: i.productTitle,
        variantTitle: i.variantTitle,
        sku: null,
        price: i.price.amount,
        quantity: i.quantity,
      })),
    });

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cart.items.map(item => ({
      price_data: {
        currency,
        product_data: {
          name: item.productTitle,
          ...(item.variantTitle !== 'Default' ? { description: item.variantTitle } : {}),
        },
        unit_amount: item.price.amount,
      },
      quantity: item.quantity,
    }));
    if (shippingAmount > 0 && shippingTitle) {
      lineItems.push({
        price_data: { currency, product_data: { name: shippingTitle }, unit_amount: shippingAmount },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: body.email?.trim(),
      line_items: lineItems,
      metadata: { orderId: order.id },
      success_url: `${storeUrl}/checkout/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${storeUrl}/checkout`,
    });

    writeLog('payment', 'info', 'Stripe session created', {
      orderId: order.id, orderNumber: order.order_number, email: order.email, total: order.total,
    });

    req.session.pendingOrderId = order.id;
    return reply.redirect(session.url!);
  });

  // GET /checkout/stripe/return — Stripe redirects here after payment
  fastify.get('/checkout/stripe/return', async (req, reply) => {
    const { session_id } = req.query as { session_id?: string };
    if (!session_id) return reply.redirect('/checkout');

    const stripe = getStripe();
    if (!stripe) return reply.redirect('/checkout');

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== 'paid') return reply.redirect('/checkout');

      // Idempotent: if already fulfilled (webhook beat us), just redirect to success
      const existingByRef = findOrderByPaymentReference(session_id);
      if (existingByRef) {
        req.cartId && clearCart(req.cartId);
        return reply.redirect(`/checkout/success/${existingByRef.id}`);
      }

      const orderId = (session.metadata?.orderId as string) || req.session.pendingOrderId;
      if (!orderId) return reply.redirect('/checkout');

      markOrderPaid(orderId, session_id);
      clearCart(req.cartId);
      delete req.session.pendingOrderId;

      const order = findOrderById(orderId);
      writeLog('payment', 'info', 'Stripe payment confirmed', {
        orderId, orderNumber: order?.order_number, email: order?.email,
        total: order?.total, sessionId: session_id,
      });

      if (order) {
        const settings = getAllSettings();
        const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
        const items = findOrderItems(orderId);
        const downloads = createOrderDownloads(orderId);
        sendTemplatedEmail('order_confirmation', order.email, {
          order: buildOrderEmailContext(order, items),
          store: { name: settings.store_name },
          downloads: downloads.map(d => ({ ...d, url: `${storeUrl}/downloads/${d.token}` })),
          download_expiry_days: 30,
        }).catch(() => {});
        sendMerchantNewOrderEmail(order, items).catch(() => {});
      }

      return reply.redirect(`/checkout/success/${orderId}`);
    } catch (err) {
      writeLog('error', 'error', 'Stripe return handler failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      return reply.redirect('/checkout');
    }
  });

  // POST /webhooks/stripe — backup fulfilment via webhook
  fastify.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, reply) => {
    const settings = getAllSettings();
    const webhookSecret = settings.stripe_webhook_secret || config.stripeWebhookSecret;
    const stripe = getStripe();
    if (!stripe || !webhookSecret) return reply.code(200).send({ received: true });

    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (req as unknown as { rawBody: Buffer }).rawBody,
        sig,
        webhookSecret,
      );
    } catch (err) {
      writeLog('error', 'error', 'Stripe webhook signature invalid', {
        message: err instanceof Error ? err.message : String(err),
      });
      return reply.code(400).send('Webhook signature invalid');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        const existing = findOrderByPaymentReference(session.id);
        if (!existing) {
          const orderId = session.metadata?.orderId as string;
          if (orderId) {
            markOrderPaid(orderId, session.id);
            const order = findOrderById(orderId);
            writeLog('payment', 'info', 'Stripe payment confirmed via webhook', {
              orderId, orderNumber: order?.order_number, email: order?.email,
              total: order?.total, sessionId: session.id,
            });
            if (order) {
              const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
              const items = findOrderItems(orderId);
              const downloads = createOrderDownloads(orderId);
              sendTemplatedEmail('order_confirmation', order.email, {
                order: buildOrderEmailContext(order, items),
                store: { name: settings.store_name },
                downloads: downloads.map(d => ({ ...d, url: `${storeUrl}/downloads/${d.token}` })),
                download_expiry_days: 30,
              }).catch(() => {});
              sendMerchantNewOrderEmail(order, items).catch(() => {});
            }
          }
        }
      }
    }

    return reply.code(200).send({ received: true });
  });

  // POST /checkout/paypal/create — PayPal JS SDK calls this
  fastify.post('/checkout/paypal/create', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const settings = getAllSettings();
    const clientId = settings.paypal_client_id || config.paypalClientId;
    const clientSecret = settings.paypal_client_secret || config.paypalClientSecret;
    const mode = settings.paypal_mode || config.paypalMode;

    if (!clientId || !clientSecret) return reply.code(400).send({ error: 'PayPal not configured' });

    const cart = await getCartPage(req.cartId);
    if (cart.empty) return reply.code(400).send({ error: 'Cart is empty' });

    // Re-check stock against the live count before creating the PayPal order.
    const shortfalls = findStockShortfalls(cart.items);
    if (shortfalls.length) return reply.code(409).send({ error: 'out_of_stock', items: shortfalls });

    const currency = (settings.store_currency || 'GBP').toUpperCase();
    const address = parseAddress(body);
    const shipping = resolveShipping(cart, address.country, body.shippingRateId ?? '');
    const taxAmount = calculateItemsTax(cart.items, settings.tax_enabled === '1');
    const total = cart.total.amount + shipping.amount;

    try {
      const token = await getPaypalToken(clientId, clientSecret, mode);
      const res = await fetch(`${getPaypalBase(mode)}/v2/checkout/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: {
              currency_code: currency,
              value: (total / 100).toFixed(2),
              breakdown: {
                item_total: { currency_code: currency, value: (cart.subtotal.amount / 100).toFixed(2) },
                discount: { currency_code: currency, value: ((cart.discountAmount?.amount ?? 0) / 100).toFixed(2) },
                shipping: { currency_code: currency, value: (shipping.amount / 100).toFixed(2) },
              },
            },
            items: cart.items.map(item => ({
              name: item.productTitle + (item.variantTitle !== 'Default' ? ` — ${item.variantTitle}` : ''),
              unit_amount: { currency_code: currency, value: (item.price.amount / 100).toFixed(2) },
              quantity: String(item.quantity),
              category: 'PHYSICAL_GOODS',
            })),
          }],
          application_context: { shipping_preference: 'NO_SHIPPING' },
        }),
      });
      const data = await res.json() as { id: string };

      // Snapshot exactly what was quoted to PayPal — capture reuses this
      // verbatim rather than re-fetching a live (possibly since-changed)
      // cart, and verifies PayPal's captured amount against `total` here.
      const snapshot: PendingPaypalOrder = {
        email: body.email?.trim() ?? '',
        address,
        items: cart.items.map(i => ({
          variantId: i.variantId, productTitle: i.productTitle, variantTitle: i.variantTitle,
          price: i.price.amount, quantity: i.quantity,
        })),
        subtotal: cart.subtotal.amount,
        discountAmount: cart.discountAmount?.amount ?? 0,
        discountCode: cart.discountCode,
        shippingAmount: shipping.amount,
        shippingTitle: shipping.title,
        shippingRateId: shipping.rateId,
        taxAmount,
        total,
        currency,
      };
      req.session.pendingPaypalOrder = JSON.stringify(snapshot);

      return reply.send({ id: data.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PayPal error';
      writeLog('error', 'error', 'PayPal order creation failed', { message: msg });
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /checkout/paypal/capture — called after PayPal approval
  fastify.post('/checkout/paypal/capture', async (req, reply) => {
    const body = req.body as { paypalOrderId: string };
    const settings = getAllSettings();
    const clientId = settings.paypal_client_id || config.paypalClientId;
    const clientSecret = settings.paypal_client_secret || config.paypalClientSecret;
    const mode = settings.paypal_mode || config.paypalMode;

    if (!clientId || !clientSecret) return reply.code(400).send({ error: 'PayPal not configured' });

    const snapshotRaw = req.session.pendingPaypalOrder;
    if (!snapshotRaw) return reply.code(400).send({ error: 'No pending checkout found for this session' });
    const snapshot: PendingPaypalOrder = JSON.parse(snapshotRaw);

    try {
      const token = await getPaypalToken(clientId, clientSecret, mode);
      const res = await fetch(`${getPaypalBase(mode)}/v2/checkout/orders/${body.paypalOrderId}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json() as {
        status: string;
        id: string;
        purchase_units?: Array<{ payments?: { captures?: Array<{ amount?: { currency_code: string; value: string } }> } }>;
      };

      if (data.status !== 'COMPLETED') {
        writeLog('payment', 'error', 'PayPal capture not completed', {
          paypalOrderId: body.paypalOrderId, status: data.status,
        });
        return reply.code(400).send({ error: `PayPal capture status: ${data.status}` });
      }

      // Idempotency: if a webhook/retry/double-click already fulfilled this
      // exact PayPal capture, don't create a second local order for it.
      const existing = findOrderByPaymentReference(data.id);
      if (existing) {
        clearCart(req.cartId);
        delete req.session.pendingPaypalOrder;
        return reply.send({ orderId: existing.id });
      }

      // Verify PayPal actually captured what we quoted — never trust
      // "status: COMPLETED" alone. If PayPal's own charged amount/currency
      // doesn't match our snapshot, refuse to fulfil and flag loudly rather
      // than shipping goods for less than the intended price (or trusting
      // a captured currency we didn't expect).
      const captured = data.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
      const expectedValue = (snapshot.total / 100).toFixed(2);
      if (!captured || captured.currency_code !== snapshot.currency || captured.value !== expectedValue) {
        writeLog('payment', 'error', 'PayPal captured amount/currency mismatch — order NOT fulfilled', {
          paypalOrderId: body.paypalOrderId,
          expected: { currency: snapshot.currency, value: expectedValue },
          captured,
        });
        return reply.code(400).send({ error: 'Payment verification failed. Please contact support.' });
      }

      const order = createOrder({
        email: snapshot.email,
        subtotal: snapshot.subtotal,
        discountAmount: snapshot.discountAmount,
        shipping: snapshot.shippingAmount,
        total: snapshot.total,
        currency: settings.store_currency || 'GBP',
        discountCode: snapshot.discountCode,
        notes: null,
        shippingAddress: snapshot.address,
        paymentProvider: 'paypal',
        paymentReference: data.id,
        shippingRateId: snapshot.shippingRateId,
        shippingTitle: snapshot.shippingTitle,
        taxAmount: snapshot.taxAmount,
        items: snapshot.items.map(i => ({
          variantId: i.variantId,
          productTitle: i.productTitle,
          variantTitle: i.variantTitle,
          sku: null,
          price: i.price,
          quantity: i.quantity,
        })),
      });

      markOrderPaid(order.id, data.id);
      clearCart(req.cartId);
      delete req.session.pendingPaypalOrder;

      writeLog('payment', 'info', 'PayPal payment confirmed', {
        orderId: order.id, orderNumber: order.order_number, email: snapshot.email, total: order.total,
        paypalOrderId: data.id,
      });

      const ppStoreUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
      const ppItems = findOrderItems(order.id);
      const ppDownloads = createOrderDownloads(order.id);
      sendTemplatedEmail('order_confirmation', snapshot.email, {
        order: buildOrderEmailContext(order, ppItems),
        store: { name: settings.store_name },
        downloads: ppDownloads.map(d => ({ ...d, url: `${ppStoreUrl}/downloads/${d.token}` })),
        download_expiry_days: 30,
      }).catch(() => {});
      sendMerchantNewOrderEmail(order, ppItems).catch(() => {});

      return reply.send({ orderId: order.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Capture failed';
      writeLog('error', 'error', 'PayPal capture failed', { message: msg });
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /checkout/success/:orderId — confirmation page
  fastify.get('/checkout/success/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const order = findOrderById(orderId);
    if (!order) return reply.redirect('/');

    const items = findOrderItems(orderId);
    const settings = getAllSettings();
    const ctx = await base(req, reply, registry);
    const shippingAddress: Address = (() => {
      try { return JSON.parse(order.shipping_address); } catch { return {}; }
    })();

    const accountsEnabled = settings.customer_accounts_enabled !== '0';
    const alreadyLoggedIn = !!req.session.customerId;
    const emailHasAccount = isAccountClaimed(findCustomerByEmail(order.email));
    const canCreateAccount = accountsEnabled && !alreadyLoggedIn && !emailHasAccount;
    const accountStatus = (req.query as Record<string, string>).account ?? null;

    const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
    const orderDownloads = findDownloadsForOrder(orderId).map(d => ({
      productTitle: d.product_title,
      originalName: d.original_name,
      url: `${storeUrl}/downloads/${d.token}`,
      expired: d.expires_at ? new Date(d.expires_at) < new Date() : false,
    }));

    await render(registry, reply, 'checkout-success', {
      ...ctx,
      pageTitle: `Order #${order.order_number} confirmed`,
      order: { ...order, items, shippingAddress },
      store: { ...ctx.store, name: settings.store_name },
      canCreateAccount,
      accountCreated: accountStatus === 'created',
      orderId,
      taxEnabled: settings.tax_enabled === '1',
      taxLabel: settings.tax_label || 'VAT',
      taxNumber: settings.tax_number || '',
      downloads: orderDownloads,
    });
  });

  // POST /checkout/create-account — password-only signup from confirmation page
  fastify.post('/checkout/create-account', async (req, reply) => {
    const settings = getAllSettings();
    if (settings.customer_accounts_enabled === '0') return reply.code(404).send('Not found');
    const { orderId, password } = req.body as { orderId?: string; password?: string };
    if (!orderId || !password || password.length < 8) return reply.redirect(`/checkout/success/${orderId ?? ''}?account=error`);

    const order = findOrderById(orderId);
    if (!order) return reply.redirect('/');

    const existing = findCustomerByEmail(order.email);
    if (existing) {
      if (isAccountClaimed(existing)) return reply.redirect(`/checkout/success/${orderId}?account=exists`);
      deleteCustomer(existing.id);
    }

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const customerId = crypto.randomUUID();
    const nameParts = (() => {
      try {
        const addr = JSON.parse(order.billing_address) as Record<string, string>;
        return { first: addr.first_name ?? addr.firstName ?? '', last: addr.last_name ?? addr.lastName ?? '' };
      } catch { return { first: '', last: '' }; }
    })();
    const { token, expiresAt } = generateVerificationToken();
    createCustomer(customerId, order.email, hash, nameParts.first, nameParts.last, token, expiresAt);
    sendVerificationEmail({ email: order.email, first_name: nameParts.first }, token).catch(() => {});
    req.session.customerId = customerId;
    return reply.redirect(`/checkout/success/${orderId}?account=created`);
  });
}
