import config from './config';
import { getAllSettings } from './db/queries/admin';

/** Used when nothing else is configured — a fresh self-hosted install. */
const FALLBACK = 'http://localhost:3000';

/**
 * The store's public base URL, without a trailing slash.
 *
 * Precedence:
 *   1. STORE_URL from the environment
 *   2. the `store_url` setting
 *   3. http://localhost:3000
 *
 * The environment wins on managed hosting because the control plane is what
 * assigned the subdomain and verified the custom domain — it knows the real
 * address, and a stale value left in Settings must not override it and start
 * putting the wrong host into canonical tags, sitemaps and signed download
 * links. On a self-hosted install STORE_URL is unset and the setting governs
 * exactly as before.
 *
 * Pass `settings` when the caller already has them, to avoid a second read.
 */
export function storeUrl(settings?: { store_url?: string }): string {
  if (config.storeUrl) return config.storeUrl;

  const configured = (settings ?? getAllSettings()).store_url;
  return (configured || FALLBACK).replace(/\/$/, '');
}

/** Joins a path onto the store's base URL. */
export function storeUrlFor(path: string, settings?: { store_url?: string }): string {
  return `${storeUrl(settings)}${path.startsWith('/') ? path : `/${path}`}`;
}
