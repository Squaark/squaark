import { getSetting } from '../db/queries/admin';

// Usage limits are INJECTED by the host (the hosted control plane sets them per
// tenant, via settings or env) — this open-source app never defines tiers or
// pricing, it only enforces whatever caps it's handed. Unset / 0 / blank means
// UNLIMITED, so a standalone self-hosted install is never capped by default.
export interface Limits {
  products: number;
  monthlyVisitors: number;
  storageMb: number;
}

function readLimit(settingKey: string, envKey: string): number {
  // A blank setting is treated as unset so the env fallback still applies.
  const raw = getSetting(settingKey) || process.env[envKey] || '';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

export function getLimits(): Limits {
  return {
    products:        readLimit('limit_products',         'LIMIT_PRODUCTS'),
    monthlyVisitors: readLimit('limit_monthly_visitors', 'LIMIT_MONTHLY_VISITORS'),
    storageMb:       readLimit('limit_storage_mb',       'LIMIT_STORAGE_MB'),
  };
}
