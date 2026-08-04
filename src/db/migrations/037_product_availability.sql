-- Product availability window ("product calendar"). The product stays visible,
-- but can only be added to the cart between these dates (inclusive). Either side
-- may be null (no gate). Dates are YYYY-MM-DD, compared with date('now','localtime')
-- to match the promo-banner scheduling convention.
ALTER TABLE products ADD COLUMN available_from  TEXT;
ALTER TABLE products ADD COLUMN available_until TEXT;
