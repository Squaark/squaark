ALTER TABLE products ADD COLUMN is_digital INTEGER NOT NULL DEFAULT 0;

CREATE TABLE product_files (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT,
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE order_downloads (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id    TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_file_id  TEXT NOT NULL REFERENCES product_files(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  download_count   INTEGER NOT NULL DEFAULT 0,
  max_downloads    INTEGER,
  expires_at       TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);

UPDATE email_templates
SET body = replace(body,
  '<p>We''ll email you again once your order ships.</p>',
  '{{#if downloads}}
<h2 style="margin-top:24px;">Your downloads</h2>
<p>Click the links below to download your files. Links expire after {{download_expiry_days}} days.</p>
<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
  {{#each downloads}}
  <tr style="border-bottom:1px solid #eee;">
    <td>{{this.product_title}}</td>
    <td align="right"><a href="{{this.url}}">Download</a></td>
  </tr>
  {{/each}}
</table>
{{else}}
<p>We''ll email you again once your order ships.</p>
{{/if}}'
)
WHERE key = 'order_confirmation';
