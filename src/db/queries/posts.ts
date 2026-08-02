import { query, queryOne } from '../connection';

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  sections: string;
  featured_image: string | null;
  author: string | null;
  status: string;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

/** All posts for the admin list, newest (by publish/creation date) first. */
export function findAllPosts(): PostRow[] {
  return query<PostRow>('SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC');
}

export function findPostById(id: string): PostRow | null {
  return queryOne<PostRow>('SELECT * FROM posts WHERE id = ?', [id]);
}

/** Live posts for the storefront: published and past their (optional) publish date. */
export function findPublishedPosts(limit: number, offset: number): PostRow[] {
  return query<PostRow>(
    `SELECT * FROM posts
      WHERE status = 'published' AND (published_at IS NULL OR published_at <= date('now', 'localtime'))
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT ? OFFSET ?`,
    [limit, offset],
  );
}

export function countPublishedPosts(): number {
  return queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM posts WHERE status = 'published' AND (published_at IS NULL OR published_at <= date('now', 'localtime'))",
  )?.n ?? 0;
}

export function findPublishedPostBySlug(slug: string): PostRow | null {
  return queryOne<PostRow>(
    `SELECT * FROM posts
      WHERE slug = ? AND status = 'published' AND (published_at IS NULL OR published_at <= date('now', 'localtime'))`,
    [slug],
  );
}
