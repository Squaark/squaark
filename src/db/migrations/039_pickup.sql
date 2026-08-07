-- Local pickup / collection. A shipping rate can be type 'pickup', carrying a
-- collection location (address + free-text opening hours / instructions).
-- Multiple pickup rates = multiple collection points. When a pickup rate is
-- chosen the order snapshots the location so it survives later rate edits.
ALTER TABLE shipping_rates ADD COLUMN pickup_address      TEXT;
ALTER TABLE shipping_rates ADD COLUMN pickup_instructions TEXT;
ALTER TABLE orders         ADD COLUMN pickup_address      TEXT;
ALTER TABLE orders         ADD COLUMN pickup_instructions TEXT;
