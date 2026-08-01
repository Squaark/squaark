import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export type ReviewStatus = 'pending' | 'published' | 'rejected';

export interface ReviewRow {
  id: string;
  product_id: string;
  rating: number;
  title: string | null;
  body: string;
  author_name: string;
  email: string;
  verified: number;
  status: ReviewStatus;
  created_at: string;
}

export interface ReviewInput {
  productId: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  email: string;
}

export interface RatingSummary {
  average: number;  // rounded to 1dp
  count: number;
}

/** Whether this email has a paid order containing this product (case-insensitive). */
export function emailBoughtProduct(email: string, productId: string): boolean {
  return !!queryOne(
    `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_variants v ON v.id = oi.variant_id
      WHERE lower(o.email) = lower(?) AND o.status = 'paid' AND v.product_id = ?
      LIMIT 1`,
    [email.trim(), productId],
  );
}

/** Creates a review; `autoPublish` decides whether it's live immediately or pending. */
export function createReview(input: ReviewInput, autoPublish: boolean): { id: string; status: ReviewStatus } {
  const id = randomUUID();
  const verified = emailBoughtProduct(input.email, input.productId);
  const status: ReviewStatus = autoPublish ? 'published' : 'pending';
  execute(
    `INSERT INTO reviews (id, product_id, rating, title, body, author_name, email, verified, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.productId, input.rating, input.title, input.body, input.authorName, input.email.trim(), verified ? 1 : 0, status],
  );
  return { id, status };
}

export function listPublishedReviews(productId: string): ReviewRow[] {
  return query<ReviewRow>(
    "SELECT * FROM reviews WHERE product_id = ? AND status = 'published' ORDER BY created_at DESC",
    [productId],
  );
}

export function getRatingSummary(productId: string): RatingSummary {
  const row = queryOne<{ count: number; average: number }>(
    "SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average FROM reviews WHERE product_id = ? AND status = 'published'",
    [productId],
  );
  return { count: row?.count ?? 0, average: Math.round((row?.average ?? 0) * 10) / 10 };
}

/** Batch rating summaries for product cards. Products with no published reviews are omitted. */
export function getRatingSummaries(productIds: string[]): Map<string, RatingSummary> {
  const out = new Map<string, RatingSummary>();
  if (productIds.length === 0) return out;
  const placeholders = productIds.map(() => '?').join(',');
  const rows = query<{ product_id: string; count: number; average: number }>(
    `SELECT product_id, COUNT(*) AS count, AVG(rating) AS average
       FROM reviews WHERE status = 'published' AND product_id IN (${placeholders})
      GROUP BY product_id`,
    productIds,
  );
  for (const r of rows) out.set(r.product_id, { count: r.count, average: Math.round(r.average * 10) / 10 });
  return out;
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AdminReviewRow extends ReviewRow {
  product_title: string;
  product_slug: string;
}

export function listReviews(status?: ReviewStatus): AdminReviewRow[] {
  const where = status ? 'WHERE r.status = ?' : '';
  return query<AdminReviewRow>(
    `SELECT r.*, p.title AS product_title, p.slug AS product_slug
       FROM reviews r JOIN products p ON p.id = r.product_id
       ${where}
      ORDER BY r.created_at DESC`,
    status ? [status] : [],
  );
}

export function findReviewById(id: string): ReviewRow | null {
  return queryOne<ReviewRow>('SELECT * FROM reviews WHERE id = ?', [id]);
}

export function setReviewStatus(id: string, status: ReviewStatus): void {
  execute('UPDATE reviews SET status = ? WHERE id = ?', [status, id]);
}

export function deleteReview(id: string): void {
  execute('DELETE FROM reviews WHERE id = ?', [id]);
}

export function countReviewsByStatus(): { pending: number; published: number; rejected: number } {
  const rows = query<{ status: ReviewStatus; n: number }>('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status');
  const out = { pending: 0, published: 0, rejected: 0 };
  for (const r of rows) if (r.status in out) out[r.status] = r.n;
  return out;
}
