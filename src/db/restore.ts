import fs from 'fs';
import path from 'path';
import config from '../config';

/**
 * Restores the database from a backup file produced by `npm run db:backup`.
 *
 *   npm run db:restore backups/store-20260727-104512.db
 *
 * IMPORTANT: stop the server first. This overwrites the live database file
 * (and clears any stale WAL/SHM sidecars so they can't be replayed over the
 * restored data). The current database is copied to `<db>.pre-restore` first
 * as a safety net.
 */
function main(): void {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: npm run db:restore <backup-file>');
    process.exit(1);
  }
  const srcPath = path.resolve(process.cwd(), src);
  if (!fs.existsSync(srcPath)) {
    console.error(`Backup file not found: ${srcPath}`);
    process.exit(1);
  }

  const dbPath = config.databasePath;

  // Preserve the current DB before clobbering it.
  if (fs.existsSync(dbPath)) {
    const safety = `${dbPath}.pre-restore`;
    fs.copyFileSync(dbPath, safety);
    console.log(`Current database saved to ${safety}`);
  }

  // Remove WAL/SHM sidecars — otherwise SQLite could replay them over the
  // freshly restored file on next open.
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(srcPath, dbPath);
  console.log(`Restored ${srcPath} → ${dbPath}`);
  console.log('Restart the server to pick up the restored database.');
}

main();
