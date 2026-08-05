import { describe, it, expect } from 'vitest';
import { sanitizeSections, sectionDefaults, listSectionSchemas, getSectionSchema, sanitizeColor } from '../../src/theme/sections';

describe('sanitizeSections', () => {
  it('drops unknown section types', () => {
    const out = sanitizeSections(JSON.stringify([{ id: 'a', type: 'not_a_real_section', foo: 'x' }]));
    expect(out).toEqual([]);
  });

  it('whitelists to schema fields — junk keys never reach storage', () => {
    const out = sanitizeSections([{ id: 'a', type: 'text', content: '<p>hi</p>', evil: '<script>' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('evil');
    expect(out[0].content).toBe('<p>hi</p>');
  });

  it('applies field defaults for anything missing', () => {
    const out = sanitizeSections([{ type: 'hero' }]); // no settings at all
    expect(out[0].type).toBe('hero');
    expect(out[0].heading).toBe('Welcome');       // default
    expect(out[0].buttonUrl).toBe('/collections/all');
    expect(out[0].align).toBe('left');
    expect(out[0].subheading).toBe('');           // optional, no default → ''
  });

  it('preserves a provided id and generates one when absent', () => {
    const [withId] = sanitizeSections([{ id: 'keep-me', type: 'text', content: 'x' }]);
    expect(withId.id).toBe('keep-me');
    const [noId] = sanitizeSections([{ type: 'text', content: 'x' }]);
    expect(typeof noId.id).toBe('string');
    expect(noId.id.length).toBeGreaterThan(0);
  });

  it('coerces values to strings', () => {
    const [s] = sanitizeSections([{ type: 'text', content: 12345 }]);
    expect(s.content).toBe('12345');
  });

  it('handles bad input safely', () => {
    expect(sanitizeSections('not json')).toEqual([]);
    expect(sanitizeSections(null)).toEqual([]);
    expect(sanitizeSections(42)).toEqual([]);
    expect(sanitizeSections([null, 'x', { type: 'text', content: 'ok' }])).toHaveLength(1);
  });
});

describe('sanitizeColor', () => {
  it('accepts hex colours', () => {
    expect(sanitizeColor('#fff')).toBe('#fff');
    expect(sanitizeColor('#E94560')).toBe('#E94560');
    expect(sanitizeColor('  #112233  ')).toBe('#112233');
  });

  it('accepts site-colour tokens', () => {
    expect(sanitizeColor('var(--color-accent)')).toBe('var(--color-accent)');
    expect(sanitizeColor('var(--color-primary)')).toBe('var(--color-primary)');
  });

  it('rejects anything that could break out of the style attribute', () => {
    expect(sanitizeColor('red; } body { display:none')).toBe('');
    expect(sanitizeColor('url(javascript:alert(1))')).toBe('');
    expect(sanitizeColor('var(--evil); background:url(x)')).toBe('');
    expect(sanitizeColor('expression(alert(1))')).toBe('');
    expect(sanitizeColor('')).toBe('');
    expect(sanitizeColor(null)).toBe('');
  });

  it('sanitizes colour fields through the section pipeline', () => {
    const [good] = sanitizeSections([{ type: 'hero', bgColor: 'var(--color-accent)', textColor: '#ffffff' }]);
    expect(good.bgColor).toBe('var(--color-accent)');
    expect(good.textColor).toBe('#ffffff');
    const [bad] = sanitizeSections([{ type: 'hero', bgColor: 'red;}html{}' }]);
    expect(bad.bgColor).toBe(''); // injection stripped
  });
});

describe('section registry', () => {
  it('every schema field id is unique within its section', () => {
    for (const schema of listSectionSchemas()) {
      const ids = schema.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('sectionDefaults matches the schema', () => {
    const d = sectionDefaults('cta');
    expect(d.buttonLabel).toBe('Shop Now');
    expect(d.align).toBe('center');
    expect(getSectionSchema('cta')?.name).toBe('Call to Action');
  });
});
