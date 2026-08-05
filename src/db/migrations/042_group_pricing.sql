-- Group pricing (B2B phase 2): a customer group can carry a store-wide
-- percentage discount (applied at the cart) and a tax-display override
-- (e.g. 'ex' so trade customers see prices excluding tax).
ALTER TABLE customer_groups ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_groups ADD COLUMN tax_display TEXT;  -- null = inherit store default; 'inc' | 'ex'
