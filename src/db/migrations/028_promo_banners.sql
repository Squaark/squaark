-- Promo banners: a site-wide announcement bar shown above the storefront header.
-- Scheduled by an optional [starts_at, ends_at] date range; the currently-live
-- one (newest wins if several overlap) is rendered on every page.
CREATE TABLE promo_banners (
  id          TEXT    PRIMARY KEY,
  message     TEXT    NOT NULL,
  link_url    TEXT,                                 -- optional CTA target (path or URL)
  link_label  TEXT,                                 -- optional CTA button text
  code        TEXT,                                 -- optional discount-code pill
  bg_color    TEXT    NOT NULL DEFAULT '',          -- '' = fall back to theme accent
  text_color  TEXT    NOT NULL DEFAULT '#ffffff',
  dismissible INTEGER NOT NULL DEFAULT 1,           -- visitor can close it (remembered per browser)
  active      INTEGER NOT NULL DEFAULT 1,
  starts_at   TEXT,                                 -- YYYY-MM-DD; NULL = no start bound
  ends_at     TEXT,                                 -- YYYY-MM-DD; NULL = no end bound (valid through this day)
  created_at  TEXT    DEFAULT (datetime('now'))
);
