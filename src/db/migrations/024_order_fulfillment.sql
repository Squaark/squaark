-- Order fulfillment workflow. The `fulfillment` column already exists
-- (defaults to 'unfulfilled'); these add the shipment detail an admin records
-- when marking an order shipped, surfaced to the customer via the
-- order_shipped email and their account order view.
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_url TEXT;
ALTER TABLE orders ADD COLUMN shipped_at TEXT;
