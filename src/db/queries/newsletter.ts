import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface SubscriberRow {
  id: string;
  email: string;
  status: 'subscribed' | 'unsubscribed';
  source: string | null;
  created_at: string;
  unsubscribed_at: string | null;
}

export interface BroadcastRow {
  id: string;
  subject: string;
  body: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

export type SubscribeResult = 'added' | 'already' | 'resubscribed';

/**
 * Adds (or re-activates) a subscriber. Returns which happened so the storefront
 * can tailor its confirmation. A previously-unsubscribed email is flipped back
 * to 'subscribed' and its unsubscribe timestamp cleared.
 */
export function addSubscriber(email: string, source = 'footer'): SubscribeResult {
  const normalized = email.trim().toLowerCase();
  const existing = queryOne<SubscriberRow>('SELECT * FROM newsletter_subscribers WHERE email = ?', [normalized]);
  if (existing) {
    if (existing.status === 'subscribed') return 'already';
    execute(
      "UPDATE newsletter_subscribers SET status = 'subscribed', unsubscribed_at = NULL WHERE id = ?",
      [existing.id],
    );
    return 'resubscribed';
  }
  execute(
    'INSERT INTO newsletter_subscribers (id, email, source) VALUES (?, ?, ?)',
    [randomUUID(), normalized, source],
  );
  return 'added';
}

/** Marks an email unsubscribed. Idempotent; a no-op for unknown emails. */
export function unsubscribeEmail(email: string): void {
  execute(
    "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now') WHERE email = ?",
    [email.trim().toLowerCase()],
  );
}

export function listSubscribers(): SubscriberRow[] {
  return query<SubscriberRow>('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC');
}

/** Emails to send a broadcast to — currently-subscribed only. */
export function listSubscribedEmails(): string[] {
  return query<{ email: string }>(
    "SELECT email FROM newsletter_subscribers WHERE status = 'subscribed' ORDER BY created_at",
  ).map((r) => r.email);
}

export function countSubscribers(status: 'subscribed' | 'unsubscribed' | 'all' = 'all'): number {
  const sql = status === 'all'
    ? 'SELECT COUNT(*) AS n FROM newsletter_subscribers'
    : 'SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE status = ?';
  const params = status === 'all' ? [] : [status];
  return queryOne<{ n: number }>(sql, params)?.n ?? 0;
}

export function createBroadcast(subject: string, body: string, recipientCount: number): string {
  const id = randomUUID();
  execute(
    'INSERT INTO newsletter_broadcasts (id, subject, body, recipient_count) VALUES (?, ?, ?, ?)',
    [id, subject, body, recipientCount],
  );
  return id;
}

export function markBroadcastSending(id: string): void {
  execute("UPDATE newsletter_broadcasts SET status = 'sending' WHERE id = ?", [id]);
}

export function completeBroadcast(id: string, sent: number, failed: number): void {
  execute(
    `UPDATE newsletter_broadcasts
       SET status = ?, sent_count = ?, failed_count = ?, sent_at = datetime('now')
     WHERE id = ?`,
    [failed > 0 && sent === 0 ? 'failed' : 'sent', sent, failed, id],
  );
}

export function listBroadcasts(): BroadcastRow[] {
  return query<BroadcastRow>('SELECT * FROM newsletter_broadcasts ORDER BY created_at DESC');
}

export function findBroadcastById(id: string): BroadcastRow | null {
  return queryOne<BroadcastRow>('SELECT * FROM newsletter_broadcasts WHERE id = ?', [id]);
}
