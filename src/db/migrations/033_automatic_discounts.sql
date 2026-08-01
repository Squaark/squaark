-- Automatic (codeless) discounts, applied at the cart when conditions are met.
-- Two kinds:
--   'order' — % or fixed off the subtotal over an optional spend threshold
--   'bogo'  — buy N get M at X% off, targeting all / a collection / a product
CREATE TABLE automatic_discounts (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,               -- shown to the customer + admin label
  kind         TEXT    NOT NULL,               -- 'order' | 'bogo'
  active       INTEGER NOT NULL DEFAULT 1,
  starts_at    TEXT,                            -- YYYY-MM-DD, optional
  ends_at      TEXT,                            -- YYYY-MM-DD, optional (valid through this day)

  -- order kind
  type         TEXT,                            -- 'percentage' | 'fixed'
  value        INTEGER,                         -- whole percent, or pence
  min_subtotal INTEGER NOT NULL DEFAULT 0,      -- pence; 0 = no minimum

  -- bogo kind
  buy_quantity INTEGER,                         -- e.g. 2
  get_quantity INTEGER,                         -- e.g. 1
  get_discount INTEGER,                         -- percent off the discounted items (100 = free)
  target_type  TEXT,                            -- 'all' | 'collection' | 'product'
  target_id    TEXT,                            -- collection/product id (NULL for 'all')

  created_at   TEXT    DEFAULT (datetime('now'))
);
