CREATE TABLE shipping_zones (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  countries  TEXT    NOT NULL DEFAULT '[]',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now')),
  updated_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE shipping_rates (
  id               TEXT    PRIMARY KEY,
  zone_id          TEXT    NOT NULL REFERENCES shipping_zones (id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  rate_type        TEXT    NOT NULL DEFAULT 'flat',
  amount           INTEGER NOT NULL DEFAULT 0,
  min_order_amount INTEGER,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    DEFAULT (datetime('now')),
  updated_at       TEXT    DEFAULT (datetime('now'))
);

ALTER TABLE orders ADD COLUMN shipping_rate_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_title   TEXT;
