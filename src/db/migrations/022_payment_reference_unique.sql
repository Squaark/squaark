-- Belt-and-suspenders against duplicate order creation for the same payment:
-- the app already checks findOrderByPaymentReference() before creating an
-- order, but a DB constraint means a race (or a future code path that
-- forgets the check) can't silently create two orders for one payment.
CREATE UNIQUE INDEX idx_orders_payment_reference ON orders (payment_reference) WHERE payment_reference IS NOT NULL;
