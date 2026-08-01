-- Product reviews. Open submission (name + email); email is never shown, used
-- only for the verified-purchase match and moderation. `status` gates visibility;
-- new reviews start 'pending' or 'published' depending on the moderation setting.
CREATE TABLE reviews (
  id          TEXT    PRIMARY KEY,
  product_id  TEXT    NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL,                    -- 1..5
  title       TEXT,
  body        TEXT    NOT NULL DEFAULT '',
  author_name TEXT    NOT NULL,
  email       TEXT    NOT NULL,                    -- not shown publicly
  verified    INTEGER NOT NULL DEFAULT 0,          -- email had a paid order for this product
  status      TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'published' | 'rejected'
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_reviews_product ON reviews (product_id, status);

-- Default to moderated (approve before showing); admins can switch to auto-publish.
INSERT OR IGNORE INTO store_settings (key, value) VALUES ('reviews_require_approval', '1');
