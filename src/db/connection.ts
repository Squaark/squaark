import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import config from '../config';

mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db: BetterSqliteDatabase = new Database(config.databasePath);

db.pragma('journal_mode = WAL');   // concurrent reads, safe writes
db.pragma('foreign_keys = ON');    // enforce referential integrity

/** Returns all matching rows. */
export function query<T extends object>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/** Returns first matching row or null. */
export function queryOne<T extends object>(sql: string, params: unknown[] = []): T | null {
  return (db.prepare(sql).get(...params) as T) ?? null;
}

/** Executes a statement, returns nothing. */
export function execute(sql: string, params: unknown[] = []): void {
  db.prepare(sql).run(...params);
}

/** Executes an INSERT/UPDATE ... RETURNING and returns the row. */
export function executeReturning<T extends object>(sql: string, params: unknown[] = []): T {
  return db.prepare(sql).get(...params) as T;
}

/**
 * Runs `fn` inside a single SQLite transaction, committing on return and
 * rolling back if it throws. better-sqlite3 transactions are synchronous —
 * `fn` must not await.
 */
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
