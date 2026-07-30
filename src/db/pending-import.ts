import fs from 'fs';
import path from 'path';
import config from '../config';

/**
 * Store import is applied here, at boot, BEFORE the database connection is
 * opened — never while the app is live. `stageStoreImport()` (see
 * store-transfer.ts) extracts an uploaded export into `<dataDir>/.pending-import`
 * and the server restarts; on the way back up connection.ts calls this to swap
 * the staged database and asset folders into place.
 *
 * Uses only fs/path — importing anything that opens the DB here would defeat
 * the whole point.
 */

const dataDir = path.dirname(config.databasePath);
export const STAGING_DIR = path.join(dataDir, '.pending-import');
// Written last, once staging is fully extracted — an import is only applied
// when this marker is present, so a partial or crashed stage is never applied.
export const READY_MARKER = path.join(STAGING_DIR, 'READY');

/** Move `src` onto `dest`, replacing it. Falls back to copy+remove across filesystems. */
function replaceWith(src: string, dest: string): void {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

/** True when a fully-staged import is waiting to be applied. */
export function hasPendingImport(): boolean {
  return fs.existsSync(READY_MARKER) && fs.existsSync(path.join(STAGING_DIR, 'store.db'));
}

export function applyPendingImport(): void {
  if (!hasPendingImport()) return;

  try {
    // Assets first (least critical), database last so a mid-swap failure leaves
    // the current database intact rather than half-replaced.
    const stagedUploads = path.join(STAGING_DIR, 'uploads');
    if (fs.existsSync(stagedUploads)) replaceWith(stagedUploads, config.uploadsDir);

    const stagedDigital = path.join(STAGING_DIR, 'digital-files');
    if (fs.existsSync(stagedDigital)) replaceWith(stagedDigital, config.digitalFilesDir);

    const stagedThemes = path.join(STAGING_DIR, 'themes');
    if (fs.existsSync(stagedThemes)) {
      const themesRoot = path.resolve(process.cwd(), 'themes');
      for (const slug of fs.readdirSync(stagedThemes)) {
        if (slug === 'linen') continue; // never clobber the bundled theme
        replaceWith(path.join(stagedThemes, slug), path.join(themesRoot, slug));
      }
    }

    // Database: clear any stale WAL/SHM sidecars so SQLite can't replay them
    // over the freshly restored file, then swap it in.
    for (const suffix of ['-wal', '-shm']) {
      fs.rmSync(config.databasePath + suffix, { force: true });
    }
    replaceWith(path.join(STAGING_DIR, 'store.db'), config.databasePath);

    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    console.log('Applied staged store import.');
  } catch (err) {
    // Leave the staging dir in place so a fixed restart can retry, and keep
    // booting on the existing database rather than crash-looping.
    console.error('Failed to apply staged store import:', err instanceof Error ? err.message : err);
  }
}
