import crypto from 'crypto';
import { sendTemplatedEmail } from '../email/send';
import { getAllSettings } from '../db/queries/admin';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function generateVerificationToken(): { token: string; expiresAt: string } {
  return {
    token: crypto.randomBytes(32).toString('base64url'),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

export function isVerificationTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

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
  const storeUrl = (settings.store_url ?? 'http://localhost:3000').replace(/\/$/, '');
  await sendTemplatedEmail('email_verification', customer.email, {
    customer_name: customer.first_name || null,
    store: { name: settings.store_name },
    verify_url: `${storeUrl}/account/verify?token=${token}`,
  });
}
