-- Customer accounts previously granted immediate access to every guest order
-- matching their email with no proof the registrant controlled that inbox.
-- Existing rows are backfilled as verified (they predate this requirement);
-- new registrations start unverified until the emailed link is clicked.
ALTER TABLE customers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN verification_token TEXT;
ALTER TABLE customers ADD COLUMN verification_token_expires TEXT;

CREATE UNIQUE INDEX idx_customers_verification_token ON customers (verification_token) WHERE verification_token IS NOT NULL;

INSERT INTO email_templates (key, name, subject, body) VALUES
(
  'email_verification',
  'Verify your email',
  'Verify your email address',
  '<h1>Verify your email</h1>
<p>{{#if customer_name}}Hi {{customer_name}},{{/if}}</p>
<p>Thanks for creating an account. Click the link below to verify your email address and view your order history. This link expires in 24 hours.</p>
<p><a href="{{verify_url}}">Verify email address</a></p>
<p>If you didn''t create this account, you can safely ignore this email.</p>'
);
