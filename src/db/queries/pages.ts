import { query, queryOne } from '../connection';
import { getSetting, setSetting } from './admin';

export interface PageRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  sections: string;
  draft_sections: string | null;
  excerpt: string;
  status: string;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
}

export function findPageBySlug(slug: string): PageRow | null {
  return queryOne<PageRow>(`SELECT * FROM pages WHERE slug = ? AND status = 'published'`, [slug]);
}

export function findPageById(id: string): PageRow | null {
  return queryOne<PageRow>('SELECT * FROM pages WHERE id = ?', [id]);
}

export function findAllPages(): PageRow[] {
  return query<PageRow>('SELECT * FROM pages ORDER BY title');
}

// ── Home page designation ────────────────────────────────────────────────────
// One page can be flagged as the storefront home page (rendered at "/"), stored
// as a setting rather than a column so it stays a single source of truth.

const HOMEPAGE_SETTING = 'homepage_page_id';

export function getHomepageId(): string | null {
  return getSetting(HOMEPAGE_SETTING) || null;
}

/** The published page set as the home page, or null (→ default themed home). */
export function getHomepage(): PageRow | null {
  const id = getHomepageId();
  if (!id) return null;
  const page = findPageById(id);
  return page && page.status === 'published' ? page : null;
}

export function isHomepage(pageId: string): boolean {
  return getHomepageId() === pageId;
}

/** Set (or clear, with null) which page is the home page. */
export function setHomepage(pageId: string | null): void {
  setSetting(HOMEPAGE_SETTING, pageId ?? '');
}
