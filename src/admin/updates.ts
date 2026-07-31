import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const exec = promisify(execFile);
const CHECK_TTL_MS = 60 * 60 * 1000; // re-check the remote at most hourly

export interface UpdateStatus {
  isGitCheckout: boolean;
  currentVersion: string;
  currentSha: string | null;
  /** Commits this checkout is behind origin/master; null if it couldn't be determined. */
  behind: number | null;
  updateAvailable: boolean;
  error?: string;
  checkedAt: string;
}

let cache: UpdateStatus | null = null;

async function git(cwd: string, args: string[], timeoutMs = 20_000): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, timeout: timeoutMs });
  return stdout.trim();
}

function readVersion(cwd: string): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Whether the running checkout is behind its `origin/master`. Fetches from the
 * remote (throttled to once an hour), so callers should treat it as background
 * info — the banner reads the cache via getCachedUpdateStatus(), never blocking
 * a page render on a network round-trip.
 *
 * `cwd` is injectable for testing; production always uses the repo root.
 */
export async function getUpdateStatus(opts: { force?: boolean; cwd?: string } = {}): Promise<UpdateStatus> {
  const cwd = opts.cwd ?? process.cwd();

  if (!opts.force && cache && Date.now() - new Date(cache.checkedAt).getTime() < CHECK_TTL_MS) {
    return cache;
  }

  const status: UpdateStatus = {
    isGitCheckout: false,
    currentVersion: readVersion(cwd),
    currentSha: null,
    behind: null,
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
  };

  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    status.isGitCheckout = true;
  } catch {
    cache = status; // not a git deploy (e.g. a tarball/image) — no update check
    return status;
  }

  try {
    status.currentSha = await git(cwd, ['rev-parse', 'HEAD']);
    await git(cwd, ['fetch', '--quiet', 'origin', 'master'], 30_000);
    const behind = parseInt(await git(cwd, ['rev-list', '--count', 'HEAD..origin/master']), 10);
    status.behind = Number.isFinite(behind) ? behind : null;
    status.updateAvailable = (status.behind ?? 0) > 0;
  } catch (err) {
    // Network down, no remote, private repo without a deploy key, etc. — report
    // that we couldn't check rather than failing the admin.
    status.error = err instanceof Error ? err.message : String(err);
  }

  cache = status;
  return status;
}

/** Last computed status (sync), for injecting into page context without blocking. */
export function getCachedUpdateStatus(): UpdateStatus | null {
  return cache;
}

/** Kick off a background refresh; safe to call on boot and on an interval. */
export function refreshUpdateStatus(): void {
  getUpdateStatus({ force: true }).catch(() => { /* background — errors are captured in status */ });
}
