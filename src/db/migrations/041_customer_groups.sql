-- Customer groups (B2B foundation). A customer can belong to a group
-- (e.g. Retail, Trade, Wholesale); later phases hang group pricing and
-- pay-on-account terms off this. On its own it changes nothing shopper-facing.
CREATE TABLE customer_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
ALTER TABLE customers ADD COLUMN group_id TEXT REFERENCES customer_groups(id) ON DELETE SET NULL;
