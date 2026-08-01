-- Low-stock alerts: emails the store owner when a variant drops to/below a
-- threshold after a paid order. Seeds the editable email template and a default
-- threshold of 5 (blank the setting to turn alerts off; 0 = only when sold out).
INSERT OR IGNORE INTO email_templates (key, name, subject, body) VALUES
('low_stock',
 'Low stock alert (admin)',
 'Low stock alert — {{store.name}}',
 '<h1>Low stock</h1>
<p>These items dropped to {{threshold}} or fewer in stock after a recent order:</p>
<ul>
{{#each items}}
  <li><strong>{{this.product_title}}</strong>{{#if this.variant_title}} — {{this.variant_title}}{{/if}}{{#if this.sku}} ({{this.sku}}){{/if}} — {{this.remaining}} left</li>
{{/each}}
</ul>
<p><a href="{{store.url}}/admin/products">Manage products</a></p>');

INSERT OR IGNORE INTO store_settings (key, value) VALUES ('low_stock_threshold', '5');
