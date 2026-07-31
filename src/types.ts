import type { TwoFactorChallenge } from './admin/two-factor';

declare module 'fastify' {
  interface FastifyRequest {
    cartId: string;
  }
  interface Session {
    adminId?: string;
    customerId?: string;
    pendingOrderId?: string;
    // Full snapshot of the order-to-be, captured at /checkout/paypal/create
    // time (JSON) — reused verbatim at capture time instead of re-fetching a
    // live cart, so what PayPal actually charged always matches what gets
    // fulfilled even if the cart changes in between.
    pendingPaypalOrder?: string;
    // Password verified, awaiting the emailed 2FA code — adminId is NOT set
    // until the code is confirmed.
    pending2fa?: TwoFactorChallenge;
    // Logged-in admin confirming an emailed code to switch 2FA on.
    pending2faEnable?: TwoFactorChallenge;
  }
}

export {};
