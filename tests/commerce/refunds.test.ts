import { describe, it, expect } from 'vitest';
import { canRefund, refundOrder, type RefundExecutors } from '../../src/commerce/refunds';
import type { OrderRow } from '../../src/db/queries/orders';

function order(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: 'o1', order_number: 1001, email: 'a@b.com', status: 'paid', fulfillment: 'unfulfilled',
    subtotal: 1000, discount_amount: 0, shipping: 0, total: 1000, currency: 'GBP',
    discount_code: null, notes: null, shipping_address: '{}', billing_address: '{}',
    payment_provider: 'stripe', payment_reference: 'cs_123',
    shipping_rate_id: null, shipping_title: null, tax_amount: 0,
    tracking_number: null, tracking_url: null, shipped_at: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('canRefund', () => {
  it('allows a paid order with a Stripe reference', () => {
    expect(canRefund(order({}))).toEqual({ ok: true });
  });

  it('rejects an already-refunded order', () => {
    expect(canRefund(order({ status: 'refunded' }))).toEqual({ ok: false, reason: 'already_refunded' });
  });

  it('rejects an unpaid (pending) order', () => {
    expect(canRefund(order({ status: 'pending' }))).toEqual({ ok: false, reason: 'not_paid' });
  });

  it('rejects when there is no payment reference', () => {
    expect(canRefund(order({ payment_reference: null }))).toEqual({ ok: false, reason: 'no_payment_reference' });
  });

  it('rejects an unsupported provider', () => {
    expect(canRefund(order({ payment_provider: 'cash' }))).toEqual({ ok: false, reason: 'unsupported_provider' });
  });
});

describe('refundOrder', () => {
  const executors: RefundExecutors = {
    stripe: async () => ({ ok: true }),
    paypal: async () => ({ ok: true }),
  };

  it('dispatches a Stripe order to the stripe executor', async () => {
    let called = '';
    const spy: RefundExecutors = {
      stripe: async () => { called = 'stripe'; return { ok: true }; },
      paypal: async () => { called = 'paypal'; return { ok: true }; },
    };
    const res = await refundOrder(order({ payment_provider: 'stripe' }), spy);
    expect(res.ok).toBe(true);
    expect(called).toBe('stripe');
  });

  it('dispatches a PayPal order to the paypal executor', async () => {
    let called = '';
    const spy: RefundExecutors = {
      stripe: async () => { called = 'stripe'; return { ok: true }; },
      paypal: async () => { called = 'paypal'; return { ok: true }; },
    };
    await refundOrder(order({ payment_provider: 'paypal', payment_reference: 'PP-1' }), spy);
    expect(called).toBe('paypal');
  });

  it('does not call any executor when the guard fails', async () => {
    let called = false;
    const spy: RefundExecutors = {
      stripe: async () => { called = true; return { ok: true }; },
      paypal: async () => { called = true; return { ok: true }; },
    };
    const res = await refundOrder(order({ status: 'refunded' }), spy);
    expect(called).toBe(false);
    expect(res).toEqual({ ok: false, error: 'already_refunded' });
  });

  it('propagates a provider failure without marking success', async () => {
    const failing: RefundExecutors = {
      stripe: async () => ({ ok: false, error: 'card_declined' }),
      paypal: async () => ({ ok: true }),
    };
    const res = await refundOrder(order({}), failing);
    expect(res).toEqual({ ok: false, error: 'card_declined' });
  });

  it('returns success when the provider confirms', async () => {
    expect(await refundOrder(order({}), executors)).toEqual({ ok: true });
  });
});
