import { describe, it, expect } from 'vitest';
import { resolveSmtpSecurity, normalizeSmtpPassword } from '../../src/email/transports/smtp';

describe('normalizeSmtpPassword', () => {
  it('strips the display spaces from a Gmail-style app password', () => {
    expect(normalizeSmtpPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
  });
  it('removes trailing whitespace/newlines from a paste', () => {
    expect(normalizeSmtpPassword('  secret\n')).toBe('secret');
  });
  it('leaves a normal password untouched', () => {
    expect(normalizeSmtpPassword('s3cr3t-token')).toBe('s3cr3t-token');
  });
});

describe('resolveSmtpSecurity', () => {
  it('port 465 → implicit TLS regardless of the flag', () => {
    expect(resolveSmtpSecurity(465, false)).toEqual({ secure: true, requireTLS: false });
    expect(resolveSmtpSecurity(465, true)).toEqual({ secure: true, requireTLS: false });
  });

  it('port 587 → STARTTLS required, never implicit TLS (the classic hang)', () => {
    expect(resolveSmtpSecurity(587, true)).toEqual({ secure: false, requireTLS: true });
    expect(resolveSmtpSecurity(587, false)).toEqual({ secure: false, requireTLS: true });
  });

  it('port 25 → optional STARTTLS', () => {
    expect(resolveSmtpSecurity(25, false)).toEqual({ secure: false, requireTLS: false });
  });

  it('non-standard port → honour the manual flag', () => {
    expect(resolveSmtpSecurity(2525, true)).toEqual({ secure: true, requireTLS: false });
    expect(resolveSmtpSecurity(2525, false)).toEqual({ secure: false, requireTLS: false });
  });
});
