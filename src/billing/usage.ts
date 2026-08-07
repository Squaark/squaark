import fs from 'fs';
import path from 'path';
import config from '../config';
import { queryOne } from '../db/connection';
import { getLimits } from './limits';

export interface UsageMetric {
  used: number;
  limit: number;
  pct: number;        // 0–100, clamped
  over: boolean;      // at or above the limit
  nearLimit: boolean; // >= 80%
  unlimited: boolean; // no cap injected
}
export interface Usage {
  products: UsageMetric;
  visitors: UsageMetric;
  storageMb: UsageMetric;
}

function metric(used: number, limit: number): UsageMetric {
  if (!Number.isFinite(limit)) {
    return { used, limit, pct: 0, over: false, nearLimit: false, unlimited: true };
  }
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return { used, limit, pct, over: used >= limit, nearLimit: pct >= 80, unlimited: false };
}

/** Recursive size (bytes) of a directory tree; unreadable entries are skipped. */
function dirSizeBytes(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSizeBytes(full);
      else if (e.isFile()) total += fs.statSync(full).size;
    } catch { /* skip unreadable entry */ }
  }
  return total;
}

export function getProductCount(): number {
  return queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products')?.n ?? 0;
}

/** Unique visitors (distinct hashed IP) since the start of the current calendar month (UTC). */
export function getMonthlyVisitors(): number {
  return queryOne<{ n: number }>(
    "SELECT COUNT(DISTINCT ip_hash) AS n FROM page_views WHERE created_at >= datetime('now', 'start of month')",
  )?.n ?? 0;
}

export function getStorageMb(): number {
  return Math.round((dirSizeBytes(config.uploadsDir) / (1024 * 1024)) * 10) / 10;
}

/** Current usage measured against whatever limits the host has injected (unlimited if none). */
export function getUsage(): Usage {
  const limits = getLimits();
  return {
    products: metric(getProductCount(), limits.products),
    visitors: metric(getMonthlyVisitors(), limits.monthlyVisitors),
    storageMb: metric(getStorageMb(), limits.storageMb),
  };
}

/** True when the store is already at (or over) its product limit — one more would exceed it. */
export function productLimitReached(): boolean {
  return getProductCount() >= getLimits().products;
}
