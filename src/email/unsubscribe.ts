import { createHmac, timingSafeEqual } from 'crypto';
import config from '../config';

/** Unguessable opt-out token for an email — keyed by the session secret, like the 2FA codes. */
export function unsubscribeToken(email: string): string {
  return createHmac('sha256', config.sessionSecret).update(`unsub:${email}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string | undefined): boolean {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(token ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
