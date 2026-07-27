import { describe, it, expect } from 'vitest';
import { sanitizeContentHtml } from '../../src/theme/content-sanitizer';

describe('sanitizeContentHtml', () => {
  it('strips <script> tags entirely', () => {
    const out = sanitizeContentHtml('<p>Hello</p><script>alert(document.cookie)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(');
    expect(out).toContain('Hello');
  });

  it('strips inline event-handler attributes like onerror/onclick', () => {
    const out = sanitizeContentHtml('<img src="x.jpg" onerror="alert(1)"><button onclick="evil()">Go</button>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
  });

  it('strips javascript: URLs from links', () => {
    const out = sanitizeContentHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips iframe/object/embed tags', () => {
    const out = sanitizeContentHtml('<iframe src="https://evil.example"></iframe><object data="x"></object>');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('<object');
  });

  it('preserves ordinary rich-text formatting a legitimate product description would use', () => {
    const html = '<p>A <strong>great</strong> shirt, <em>on sale</em>. <a href="https://example.com">Details</a></p><ul><li>100% cotton</li></ul>';
    const out = sanitizeContentHtml(html);
    expect(out).toContain('<strong>great</strong>');
    expect(out).toContain('<em>on sale</em>');
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('<li>100% cotton</li>');
  });

  it('preserves ordinary images with safe attributes', () => {
    const out = sanitizeContentHtml('<img src="https://example.com/photo.jpg" alt="A photo" width="200">');
    expect(out).toContain('src="https://example.com/photo.jpg"');
    expect(out).toContain('alt="A photo"');
  });

  it('handles null/undefined/empty input without throwing', () => {
    expect(sanitizeContentHtml('')).toBe('');
    expect(sanitizeContentHtml(null as unknown as string)).toBe('');
    expect(sanitizeContentHtml(undefined as unknown as string)).toBe('');
  });
});
