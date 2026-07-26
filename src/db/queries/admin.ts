import { query, queryOne, execute, db } from '../connection';

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'staff';
  created_at: string;
}

export function findAdminByEmail(email: string): AdminUserRow | null {
  return queryOne<AdminUserRow>(
    'SELECT id, email, password_hash, name, role, created_at FROM admin_users WHERE email = ?',
    [email],
  );
}

export function findAdminById(id: string): AdminUserRow | null {
  return queryOne<AdminUserRow>(
    'SELECT id, email, password_hash, name, role, created_at FROM admin_users WHERE id = ?',
    [id],
  );
}

export function listAdminUsers(): AdminUserRow[] {
  return query<AdminUserRow>(
    'SELECT id, email, name, role, created_at FROM admin_users ORDER BY created_at ASC',
  );
}

export function createAdminUser(id: string, email: string, passwordHash: string, name: string, role: 'admin' | 'staff' = 'admin'): void {
  execute(
    'INSERT INTO admin_users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    [id, email, passwordHash, name, role],
  );
}

/**
 * Inserts the first admin only if the table is still empty, atomically — the
 * check and the insert happen as one indivisible SQLite statement, so
 * concurrent callers can't all pass a separate "does an admin exist" check
 * before any of them commits. Returns whether this call was the one that
 * actually created the row.
 */
export function createFirstAdminUser(id: string, email: string, passwordHash: string, name: string): boolean {
  const result = db.prepare(`
    INSERT INTO admin_users (id, email, password_hash, name, role)
    SELECT ?, ?, ?, ?, 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM admin_users)
  `).run(id, email, passwordHash, name);
  return result.changes > 0;
}

export function updateAdminUserRole(id: string, role: 'admin' | 'staff'): void {
  execute(`UPDATE admin_users SET role = ?, updated_at = datetime('now') WHERE id = ?`, [role, id]);
}

export function deleteAdminUser(id: string): void {
  execute('DELETE FROM admin_users WHERE id = ?', [id]);
}

export function countAdminUsers(): number {
  const row = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM admin_users');
  return row?.n ?? 0;
}

export function countAdminsByRole(role: 'admin' | 'staff'): number {
  const row = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM admin_users WHERE role = ?', [role]);
  return row?.n ?? 0;
}

export interface SettingRow { key: string; value: string }

export function getSetting(key: string): string | null {
  return queryOne<SettingRow>('SELECT value FROM store_settings WHERE key = ?', [key])?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  execute(
    'INSERT INTO store_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')',
    [key, value],
  );
}

export function getAllSettings(): Record<string, string> {
  const rows = query<SettingRow>('SELECT key, value FROM store_settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
