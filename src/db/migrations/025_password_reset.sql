-- Password reset tokens for customer accounts. Kept separate from the
-- email-verification token columns so a pending reset and a pending
-- verification can't clobber each other.
ALTER TABLE customers ADD COLUMN reset_token TEXT;
ALTER TABLE customers ADD COLUMN reset_token_expires TEXT;

CREATE UNIQUE INDEX idx_customers_reset_token ON customers (reset_token) WHERE reset_token IS NOT NULL;
