-- Reusable sections ("blocks"): a named set of sections defined once and
-- referenced from many pages via a `reusable` section. Editing the block updates
-- every page that references it. `sections` is the same JSON shape as a page's.
CREATE TABLE reusable_sections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sections   TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
