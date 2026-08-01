import { execute, queryOne } from '../connection';

/** Records that an email has opted out of recovery reminders. Idempotent. */
export function addSuppression(email: string): void {
  execute('INSERT OR IGNORE INTO email_suppressions (email) VALUES (?)', [email.trim()]);
}

export function isSuppressed(email: string): boolean {
  return !!queryOne('SELECT 1 FROM email_suppressions WHERE email = ?', [email.trim()]);
}
