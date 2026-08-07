-- Per-item page sections: each product and collection can carry its own extra
-- sections, rendered after the global page template's sections. Same JSON shape
-- as pages.sections. Null/empty = just the global template.
ALTER TABLE products    ADD COLUMN sections TEXT;
ALTER TABLE collections ADD COLUMN sections TEXT;
