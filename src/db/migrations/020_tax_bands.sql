CREATE TABLE tax_bands (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tax_rates (
  id         TEXT PRIMARY KEY,
  band_id    TEXT NOT NULL REFERENCES tax_bands(id) ON DELETE CASCADE,
  rate       TEXT NOT NULL DEFAULT '0',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (band_id)
);

ALTER TABLE products ADD COLUMN tax_band_id TEXT REFERENCES tax_bands(id) ON DELETE SET NULL;
