import crypto from 'crypto';
import config from '../config';
import { sendTemplatedEmail } from '../email/send';
import { getAllSettings } from '../db/queries/admin';

/**
 * Email-code two-factor auth for admin/staff. A short numeric code is emailed
 * and its HMAC (keyed with the session secret) is held in the server-side
 * session — never the code itself — until it's verified once, within a short
 * window, under an attempt cap.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export interface TwoFactorChallenge {
  adminId: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

/** Cryptographically-random 6-digit code (000000–999999). */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Keyed hash of a code — HMAC-SHA256 with the session secret, so a leaked
 *  session store still can't be brute-forced offline without the secret. */
export function hashCode(code: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(code.trim()).digest('hex');
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function codeMatches(submitted: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(submitted), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isExpired(expiresAt: number, now = Date.now()): boolean {
  return expiresAt < now;
}

/** Creates a fresh challenge (code + its keyed hash) and returns both. */
export function newChallenge(adminId: string): { code: string; challenge: TwoFactorChallenge } {
  const code = generateCode();
  return {
    code,
    challenge: { adminId, codeHash: hashCode(code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 },
  };
}

export async function sendLoginCode(to: string, name: string, code: string): Promise<void> {
  const settings = getAllSettings();
  await sendTemplatedEmail('login_code', to, {
    code,
    name: name || null,
    store: { name: settings.store_name || 'the store' },
  });
}

/** 2FA can only be enabled when a real email provider is set — otherwise the
 *  login code can't be delivered and the account would lock itself out. */
export function emailConfigured(): boolean {
  return (getAllSettings().email_provider || 'console') !== 'console';
}
