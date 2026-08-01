import { describe, it, expect } from 'vitest';
import { unsubscribeToken, verifyUnsubscribeToken } from '../../src/email/unsubscribe';

describe('unsubscribe tokens', () => {
  it('verifies its own token and rejects tampering or a mismatched email', () => {
    const token = unsubscribeToken('jane@example.com');
    expect(verifyUnsubscribeToken('jane@example.com', token)).toBe(true);
    expect(verifyUnsubscribeToken('jane@example.com', token + 'x')).toBe(false);
    expect(verifyUnsubscribeToken('someone-else@example.com', token)).toBe(false); // email-specific
    expect(verifyUnsubscribeToken('jane@example.com', undefined)).toBe(false);
    expect(verifyUnsubscribeToken('jane@example.com', '')).toBe(false);
  });
});
