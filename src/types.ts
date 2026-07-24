declare module 'fastify' {
  interface FastifyRequest {
    cartId: string;
  }
  interface Session {
    adminId: string;
    customerId?: string;
    pendingOrderId?: string;
    pendingCheckoutAddress?: string;
    pendingCheckoutEmail?: string;
    pendingShippingRateId?: string;
  }
}

export {};
