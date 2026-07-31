import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, codeMatches, isExpired, newChallenge, CODE_TTL_MS } from '../../src/admin/two-factor';

describe('generateCode', () => {
  it('is always a 6-digit numeric string, including leading zeros', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('hashCode / codeMatches', () => {
  it('is deterministic and never stores the code itself', () => {
    const h = hashCode('123456');
    expect(h).toBe(hashCode('123456'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('123456');
  });

  it('matches the right code and rejects the wrong one (whitespace-tolerant)', () => {
    const h = hashCode('428913');
    expect(codeMatches('428913', h)).toBe(true);
    expect(codeMatches(' 428913 ', h)).toBe(true);
    expect(codeMatches('428914', h)).toBe(false);
    expect(codeMatches('', h)).toBe(false);
  });
});

describe('isExpired', () => {
  it('respects the expiry timestamp', () => {
    expect(isExpired(Date.now() - 1000)).toBe(true);
    expect(isExpired(Date.now() + 1000)).toBe(false);
  });
});

describe('newChallenge', () => {
  it('produces a matching code + hash, zero attempts, future expiry', () => {
    const { code, challenge } = newChallenge('admin-1');
    expect(code).toMatch(/^\d{6}$/);
    expect(codeMatches(code, challenge.codeHash)).toBe(true);
    expect(challenge.adminId).toBe('admin-1');
    expect(challenge.attempts).toBe(0);
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    expect(challenge.expiresAt).toBeLessThanOrEqual(Date.now() + CODE_TTL_MS + 50);
  });
});
