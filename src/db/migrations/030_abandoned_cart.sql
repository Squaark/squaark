-- Abandoned-checkout recovery: emails a customer who created a pending order
-- (so we have their email) but never paid. Tracks the one-time reminder, seeds
-- an editable template, and a delay setting (blank/0 = off, N = send after N hours).
ALTER TABLE orders ADD COLUMN reminder_sent_at TEXT;

-- Emails that have opted out of recovery reminders (via the unsubscribe link).
CREATE TABLE email_suppressions (
  email      TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO email_templates (key, name, subject, body) VALUES
('abandoned_cart',
 'Abandoned checkout reminder',
 'You left something in your cart — {{store.name}}',
 '<h1>Still interested?</h1>
<p>{{#if customer_name}}Hi {{customer_name}}, {{/if}}you started checking out but didn''t finish. Your items are still waiting:</p>
<ul>
{{#each order.items}}
  <li>{{this.product_title}}{{#if this.variant_title}} — {{this.variant_title}}{{/if}} × {{this.quantity}} — {{this.line_total_formatted}}</li>
{{/each}}
</ul>
<p><a href="{{cart_url}}">Return to your cart</a></p>
<p style="color:#6b7280;font-size:12px;">Don''t want these reminders? <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p>'
);

INSERT OR IGNORE INTO store_settings (key, value) VALUES ('abandoned_cart_hours', '1');
