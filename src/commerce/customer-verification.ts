import crypto from 'crypto';
import { sendTemplatedEmail } from '../email/send';
import { getAllSettings } from '../db/queries/admin';
import { storeUrl as resolveStoreUrl } from '../store-url';

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — matches the password_reset email copy

function generateToken(ttlMs: number): { token: string; expiresAt: string } {
  return {
    token: crypto.randomBytes(32).toString('base64url'),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
}

export function generateVerificationToken(): { token: string; expiresAt: string } {
  return generateToken(VERIFICATION_TOKEN_TTL_MS);
}

export function generatePasswordResetToken(): { token: string; expiresAt: string } {
  return generateToken(RESET_TOKEN_TTL_MS);
}

/** Generic token-expiry check (used for both verification and reset tokens). */
export function isVerificationTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export const isTokenExpired = isVerificationTokenExpired;

/**
 * Whether an existing customer row represents a real claim on its email —
 * either already verified, or still within its verification window. A row
 * that is neither (an abandoned or squatted registration whose link expired
 * unused) can be evicted by a fresh registration/create-account attempt for
 * that same address.
 */
export function isAccountClaimed(
  customer: { email_verified: number; verification_token_expires: string | null } | null,
): boolean {
  if (!customer) return false;
  return !!customer.email_verified || !isVerificationTokenExpired(customer.verification_token_expires);
}

export async function sendVerificationEmail(
  customer: { email: string; first_name: string },
  token: string,
): Promise<void> {
  const settings = getAllSettings();
  const storeUrl = resolveStoreUrl(settings);
  await sendTemplatedEmail('email_verification', customer.email, {
    customer_name: customer.first_name || null,
    store: { name: settings.store_name },
    verify_url: `${storeUrl}/account/verify?token=${token}`,
  });
}

export async function sendPasswordResetEmail(
  customer: { email: string; first_name: string },
  token: string,
): Promise<void> {
  const settings = getAllSettings();
  const storeUrl = resolveStoreUrl(settings);
  await sendTemplatedEmail('password_reset', customer.email, {
    customer_name: customer.first_name || null,
    store: { name: settings.store_name },
    reset_url: `${storeUrl}/account/reset?token=${token}`,
  });
}
