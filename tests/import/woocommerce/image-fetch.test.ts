import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIp, assertSafeUrl, importRemoteImage } from '../../../src/import/woocommerce/image-fetch';

describe('isPrivateOrReservedIp', () => {
  it('flags loopback', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
  });

  it('flags the cloud metadata address specifically', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
  });

  it('flags RFC1918 private ranges', () => {
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
  });

  it('does not flag a 172.x address outside the private 16-31 second-octet range', () => {
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('172.15.0.1')).toBe(false);
  });

  it('flags IPv6 link-local and unique-local addresses', () => {
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
  });

  it('flags an IPv4-mapped IPv6 address whose embedded IPv4 is private', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('does not flag an ordinary public address', () => {
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false); // example.com
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2001:4860:4860::8888')).toBe(false); // Google public DNS v6
  });
});

describe('assertSafeUrl', () => {
  it('accepts http and https URLs', () => {
    expect(() => assertSafeUrl('http://example.com/img.jpg')).not.toThrow();
    expect(() => assertSafeUrl('https://example.com/img.jpg')).not.toThrow();
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafeUrl('ftp://example.com/img.jpg')).toThrow();
    expect(() => assertSafeUrl('data:image/png;base64,abcd')).toThrow();
  });

  it('rejects unparseable URLs', () => {
    expect(() => assertSafeUrl('not a url')).toThrow();
  });
});

describe('importRemoteImage — end-to-end SSRF guard', () => {
  it('refuses to fetch a loopback address', async () => {
    await expect(importRemoteImage('http://127.0.0.1/secret.jpg')).rejects.toThrow(/private|internal/i);
  });

  it('refuses to fetch the cloud metadata address', async () => {
    await expect(importRemoteImage('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private|internal/i);
  });

  it('refuses to fetch a private RFC1918 address', async () => {
    await expect(importRemoteImage('http://10.0.0.5/image.jpg')).rejects.toThrow(/private|internal/i);
  });

  it('refuses a non-http(s) scheme outright, before any network attempt', async () => {
    await expect(importRemoteImage('file:///etc/passwd')).rejects.toThrow(/non-http/i);
  });
});
