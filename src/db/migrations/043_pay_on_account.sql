-- B2B pay-on-account (invoicing). A customer group can be allowed to place
-- orders as unpaid invoices on net terms, rather than paying by card at checkout.
ALTER TABLE customer_groups ADD COLUMN pay_on_account INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_groups ADD COLUMN payment_terms_days INTEGER;  -- net terms in days; null = due on receipt

-- Invoice bookkeeping on the order. `due_date` drives the invoice email + admin
-- display. `accounting_ref` is reserved for a future accounting integration
-- (e.g. Xero, QuickBooks) to stamp the external invoice id against the order so
-- a sync stays idempotent — unused by the app for now.
ALTER TABLE orders ADD COLUMN due_date TEXT;         -- YYYY-MM-DD invoice due date
ALTER TABLE orders ADD COLUMN accounting_ref TEXT;   -- external accounting/invoice id (reserved)
ALTER TABLE orders ADD COLUMN invoice_committed INTEGER NOT NULL DEFAULT 0;  -- 1 once an invoice order has reserved stock (idempotency guard)

-- Invoice email, sent when a B2B customer places an on-account order. Modelled
-- on order_confirmation but framed as an invoice with an amount due.
INSERT INTO email_templates (key, name, subject, body) VALUES
(
  'order_invoice',
  'Invoice (pay on account)',
  'Invoice for order #{{order.order_number}}',
  '<h1>Invoice{{#if customer_name}} for {{customer_name}}{{/if}}</h1>
<p>Thank you for your order. It has been placed <strong>on account</strong> and is awaiting payment.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
  <tr><td colspan="2"><strong>Invoice / Order #{{order.order_number}}</strong>{{#if order.due_date_formatted}} &mdash; payment due by {{order.due_date_formatted}}{{/if}}</td></tr>
  {{#each order.items}}
  <tr style="border-bottom:1px solid #eee;">
    <td>{{this.product_title}} <span style="color:#888;">({{this.variant_title}}) &times; {{this.quantity}}</span></td>
    <td align="right">{{this.line_total_formatted}}</td>
  </tr>
  {{/each}}
  <tr><td>Subtotal</td><td align="right">{{order.subtotal_formatted}}</td></tr>
  {{#if order.discount_formatted}}<tr><td>Discount</td><td align="right">-{{order.discount_formatted}}</td></tr>{{/if}}
  <tr><td>Shipping</td><td align="right">{{order.shipping_formatted}}</td></tr>
  <tr style="font-weight:bold;"><td>Amount due</td><td align="right">{{order.total_formatted}}</td></tr>
</table>
{{#if order.pickup_address}}<p style="margin-top:8px;"><strong>Collect from:</strong><br>{{order.pickup_address}}{{#if order.pickup_instructions}}<br><span style="color:#555;">{{order.pickup_instructions}}</span>{{/if}}</p>{{/if}}
<p>Please arrange payment using your usual account details. If you have any questions about this invoice, just reply to this email.</p>
<p>Thanks for your business{{#if store.name}}, from {{store.name}}{{/if}}.</p>'
);
