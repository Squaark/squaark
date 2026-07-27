import { describe, it, expect } from 'vitest';
import { isVerificationTokenExpired, isAccountClaimed } from '../../src/commerce/customer-verification';

describe('isVerificationTokenExpired', () => {
  it('treats a null expiry as expired', () => {
    expect(isVerificationTokenExpired(null)).toBe(true);
  });

  it('treats a past timestamp as expired', () => {
    expect(isVerificationTokenExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it('treats a future timestamp as not expired', () => {
    expect(isVerificationTokenExpired(new Date(Date.now() + 1000 * 60 * 60).toISOString())).toBe(false);
  });
});

describe('isAccountClaimed', () => {
  it('is false for a null customer (email never registered)', () => {
    expect(isAccountClaimed(null)).toBe(false);
  });

  it('is true for a verified customer regardless of token state', () => {
    expect(isAccountClaimed({ email_verified: 1, verification_token_expires: null })).toBe(true);
  });

  it('is true for an unverified customer still inside its verification window', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    expect(isAccountClaimed({ email_verified: 0, verification_token_expires: future })).toBe(true);
  });

  it('is false for an unverified customer whose verification window has lapsed', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isAccountClaimed({ email_verified: 0, verification_token_expires: past })).toBe(false);
  });
});
