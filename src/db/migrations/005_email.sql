-- ── Email settings ───────────────────────────────────────────────────────────

INSERT INTO store_settings (key, value) VALUES
  ('email_provider',      'console'),
  ('email_from_name',     ''),
  ('email_from_address',  ''),
  ('smtp_host',           ''),
  ('smtp_port',           '587'),
  ('smtp_user',           ''),
  ('smtp_pass',           ''),
  ('smtp_secure',         '0'),
  ('resend_api_key',      '');

-- ── Email templates ──────────────────────────────────────────────────────────
-- A fixed set of transactional emails, editable from Admin > Emails.
-- `key` identifies the trigger; `body` is a Handlebars fragment rendered
-- inside a shared wrapper (see src/email/templates.ts).

CREATE TABLE email_templates (
  key        TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  subject    TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT    DEFAULT (datetime('now'))
);

INSERT INTO email_templates (key, name, subject, body) VALUES
(
  'order_confirmation',
  'Order confirmation',
  'Order confirmation — #{{order.order_number}}',
  '<h1>Thanks for your order{{#if customer_name}}, {{customer_name}}{{/if}}!</h1>
<p>We''ve received order <strong>#{{order.order_number}}</strong> and we''re getting it ready.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
  {{#each order.items}}
  <tr style="border-bottom:1px solid #eee;">
    <td>{{this.product_title}} <span style="color:#888;">({{this.variant_title}}) &times; {{this.quantity}}</span>{{#if this.preorder}}<br><span style="color:#1e40af;font-size:13px;">Pre-order &mdash; ships from {{this.preorder_from_formatted}}</span>{{/if}}</td>
    <td align="right">{{this.line_total_formatted}}</td>
  </tr>
  {{/each}}
  <tr><td>Subtotal</td><td align="right">{{order.subtotal_formatted}}</td></tr>
  {{#if order.discount_formatted}}<tr><td>Discount</td><td align="right">-{{order.discount_formatted}}</td></tr>{{/if}}
  <tr><td>Shipping</td><td align="right">{{order.shipping_formatted}}</td></tr>
  <tr style="font-weight:bold;"><td>Total</td><td align="right">{{order.total_formatted}}</td></tr>
</table>
{{#if order.fulfilment_date}}<p style="margin-top:8px;"><strong>Booked for:</strong> {{order.fulfilment_date_formatted}}{{#if order.fulfilment_window}} ({{order.fulfilment_window}}){{/if}}</p>{{/if}}
{{#if order.pickup_address}}<p style="margin-top:8px;"><strong>Collect from:</strong><br>{{order.pickup_address}}{{#if order.pickup_instructions}}<br><span style="color:#555;">{{order.pickup_instructions}}</span>{{/if}}</p><p>We''ll email you when your order is ready to collect.</p>{{else}}<p>We''ll email you again once your order ships.</p>{{/if}}'
),
(
  'order_shipped',
  'Order shipped',
  'Your order #{{order.order_number}} is on its way',
  '<h1>Your order is on its way{{#if customer_name}}, {{customer_name}}{{/if}}!</h1>
<p>Order <strong>#{{order.order_number}}</strong> has been marked as shipped.</p>
{{#if order.tracking_url}}<p><a href="{{order.tracking_url}}">Track your package</a></p>{{/if}}
<p>Thanks for shopping with {{store.name}}.</p>'
),
(
  'admin_new_order',
  'New order (admin notification)',
  'New order — #{{order.order_number}} ({{order.total_formatted}})',
  '<h1>New order received</h1>
<p>Order <strong>#{{order.order_number}}</strong> from {{order.email}} — {{order.total_formatted}}.</p>
<p><a href="{{store.url}}/admin/orders/{{order.id}}">View order in admin</a></p>'
),
(
  'password_reset',
  'Password reset',
  'Reset your password',
  '<h1>Reset your password</h1>
<p>{{#if customer_name}}Hi {{customer_name}},{{/if}}</p>
<p>Click the link below to choose a new password. This link expires in 1 hour.</p>
<p><a href="{{reset_url}}">Reset password</a></p>
<p>If you didn''t request this, you can safely ignore this email.</p>'
);

-- ── Email send log ───────────────────────────────────────────────────────────
-- Every attempted send (test or triggered) is recorded here so admins can
-- confirm delivery without checking server logs.

CREATE TABLE email_log (
  id          TEXT    PRIMARY KEY,
  template_key TEXT,
  to_address  TEXT    NOT NULL,
  subject     TEXT    NOT NULL,
  provider    TEXT    NOT NULL,
  status      TEXT    NOT NULL,  -- 'sent' | 'failed'
  error       TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_log_created ON email_log (created_at);
