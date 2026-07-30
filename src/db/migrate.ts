import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { db } from './connection';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** The migration files this build ships — i.e. the schema version this code understands. */
export function listMigrationFilenames(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
}

/** Applies any migration files not yet recorded in the `migrations` table. Safe to call on every boot. */
export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT filename FROM migrations').all() as { filename: string }[])
      .map(r => r.filename),
  );

  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
    });

    try {
      run();
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file}:`, err);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  runMigrations();
  console.log('Migrations complete.');
}
