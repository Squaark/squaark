import Stripe from 'stripe';
import config from '../config';
import { getAllSettings } from '../db/queries/admin';
import type { OrderRow } from '../db/queries/orders';

export interface RefundResult {
  ok: boolean;
  error?: string;
}

/**
 * Pure guard: whether an order is in a state that can be refunded. Kept
 * separate from the API calls so the admin route and tests can check
 * eligibility without touching Stripe/PayPal.
 */
export function canRefund(order: OrderRow): { ok: boolean; reason?: string } {
  if (order.status === 'refunded') return { ok: false, reason: 'already_refunded' };
  if (order.status !== 'paid') return { ok: false, reason: 'not_paid' };
  if (!order.payment_reference) return { ok: false, reason: 'no_payment_reference' };
  if (order.payment_provider !== 'stripe' && order.payment_provider !== 'paypal') {
    return { ok: false, reason: 'unsupported_provider' };
  }
  return { ok: true };
}

// Stripe stores the Checkout Session id as payment_reference; a refund needs
// the underlying PaymentIntent, so we retrieve the session to resolve it.
async function refundStripe(order: OrderRow): Promise<RefundResult> {
  const key = getAllSettings().stripe_sk || config.stripeSecretKey;
  if (!key) return { ok: false, error: 'Stripe is not configured' };
  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

  const session = await stripe.checkout.sessions.retrieve(order.payment_reference!);
  const pi = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!pi) return { ok: false, error: 'No payment intent found for this order' };

  await stripe.refunds.create({ payment_intent: pi });
  return { ok: true };
}

function paypalBase(mode: string): string {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

// PayPal stores the order id as payment_reference; a refund targets the
// capture, so we fetch the order to resolve its capture id first.
async function refundPaypal(order: OrderRow): Promise<RefundResult> {
  const s = getAllSettings();
  const clientId = s.paypal_client_id || config.paypalClientId;
  const secret = s.paypal_client_secret || config.paypalClientSecret;
  const mode = s.paypal_mode || config.paypalMode;
  if (!clientId || !secret) return { ok: false, error: 'PayPal is not configured' };
  const base = paypalBase(mode);

  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token: token } = await tokenRes.json() as { access_token: string };

  const ordRes = await fetch(`${base}/v2/checkout/orders/${order.payment_reference}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const ord = await ordRes.json() as {
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }>;
  };
  const captureId = ord.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (!captureId) return { ok: false, error: 'No capture found for this order' };

  const refRes = await fetch(`${base}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!refRes.ok) return { ok: false, error: `PayPal refund failed (HTTP ${refRes.status})` };
  return { ok: true };
}

export interface RefundExecutors {
  stripe: (order: OrderRow) => Promise<RefundResult>;
  paypal: (order: OrderRow) => Promise<RefundResult>;
}

const defaultExecutors: RefundExecutors = { stripe: refundStripe, paypal: refundPaypal };

/**
 * Attempts a full refund through the order's original payment provider.
 * Returns the result rather than throwing so the caller only flips the order
 * to 'refunded' on a confirmed success. `executors` is injectable for tests.
 */
export async function refundOrder(
  order: OrderRow,
  executors: RefundExecutors = defaultExecutors,
): Promise<RefundResult> {
  const gate = canRefund(order);
  if (!gate.ok) return { ok: false, error: gate.reason };
  const exec = order.payment_provider === 'stripe' ? executors.stripe : executors.paypal;
  return exec(order);
}
