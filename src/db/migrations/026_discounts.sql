-- Discount codes. `code` is stored uppercase and matched case-insensitively.
-- `value` is a percentage (1–100) for type 'percentage', or pence for 'fixed'.
CREATE TABLE discounts (
  id           TEXT    PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  type         TEXT    NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'fixed'
  value        INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  min_subtotal INTEGER NOT NULL DEFAULT 0,             -- pence; 0 = no minimum
  usage_limit  INTEGER,                                 -- NULL = unlimited
  times_used   INTEGER NOT NULL DEFAULT 0,
  ends_at      TEXT,                                    -- NULL = no expiry
  created_at   TEXT    DEFAULT (datetime('now'))
);
