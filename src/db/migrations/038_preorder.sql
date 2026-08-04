-- Preorder support. A product with allow_preorder=1 can be ordered during its
-- "upcoming" window (before available_from) as a preorder, still selling against
-- stock. Order lines record whether they were placed as a preorder and the date
-- the item becomes available, so the merchant can hold fulfilment until then.
ALTER TABLE products    ADD COLUMN allow_preorder INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN preorder INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN preorder_available_from TEXT;
