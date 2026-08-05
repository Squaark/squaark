-- Draft/publish for page sections. `sections` stays the *published* layout that
-- the storefront renders; `draft_sections` holds unpublished section edits while
-- they're being worked on (null = no pending draft). Publishing copies the draft
-- into `sections` and clears it.
ALTER TABLE pages ADD COLUMN draft_sections TEXT;
