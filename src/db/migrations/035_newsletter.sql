-- Newsletter capture + broadcasts.
--
-- Subscribers are captured from a storefront signup form. A broadcast is a
-- one-off email composed in the admin and sent to every current subscriber via
-- the store's configured email transport. Kept separate from email_suppressions
-- (which is order-recovery opt-outs) — a shopper can want order reminders but
-- not marketing, or vice versa.

CREATE TABLE newsletter_subscribers (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'subscribed',  -- 'subscribed' | 'unsubscribed'
  source          TEXT,                                -- where they signed up, e.g. 'footer'
  created_at      TEXT DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE TABLE newsletter_broadcasts (
  id              TEXT PRIMARY KEY,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',       -- 'draft' | 'sending' | 'sent' | 'failed'
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  sent_at         TEXT
);
