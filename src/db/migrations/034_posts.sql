-- Blog posts: the pages/CMS model (content + page-builder sections + SEO) plus
-- blog fields (featured image, author, publish date) and a chronological index.
CREATE TABLE posts (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  excerpt         TEXT    NOT NULL DEFAULT '',
  content         TEXT    NOT NULL DEFAULT '',
  sections        TEXT    NOT NULL DEFAULT '[]',
  featured_image  TEXT,
  author          TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  published_at    TEXT,                                -- YYYY-MM-DD; sort key + shown date
  seo_title       TEXT,
  seo_description TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_published ON posts (status, published_at);
