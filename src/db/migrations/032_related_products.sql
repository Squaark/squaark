-- Manually-curated related products (per product). When a product has no rows
-- here, the storefront falls back to automatic relatedness (shared collection).
CREATE TABLE related_products (
  product_id         TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  related_product_id TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, related_product_id)
);

CREATE INDEX idx_related_products_product ON related_products (product_id, position);
