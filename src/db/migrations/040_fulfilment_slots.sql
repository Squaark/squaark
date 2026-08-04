-- Bookable fulfilment scheduling (date + time window). A shipping rate can carry
-- a fulfilment_schedule (JSON: weekdays, windows, leadDays, horizonDays, blackouts)
-- that makes the customer book a slot. A product flagged requires_slot forces a
-- scheduled rate + slot to be chosen. The booked date + window are stored on the
-- order. Capacity is unlimited in this version (slots never "sell out").
ALTER TABLE shipping_rates ADD COLUMN fulfilment_schedule TEXT;         -- JSON or null
ALTER TABLE products       ADD COLUMN requires_slot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders         ADD COLUMN fulfilment_date   TEXT;           -- YYYY-MM-DD
ALTER TABLE orders         ADD COLUMN fulfilment_window TEXT;
