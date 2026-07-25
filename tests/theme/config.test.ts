import { describe, it, expect } from 'vitest';
import { resolveConfig, resolveConfigNested, buildCssVars, type ThemeManifest } from '../../src/theme/config';

const manifest: ThemeManifest = {
  name: 'test-theme',
  version: '1.0.0',
  engine: '>=1.0.0',
  description: '',
  author: '',
  config: {
    colors: {
      primary: { type: 'color', label: 'Primary', default: '#111111' },
    },
    layout: {
      showHero: { type: 'boolean', label: 'Show hero', default: true },
      heroHeading: { type: 'text', label: 'Heading', default: 'Welcome' },
      featuredSections: {
        type: 'repeater',
        label: 'Featured sections',
        default: [{ title: 'Featured Products', collection: '', count: '8' }],
        itemFields: {
          title: { type: 'text', label: 'Title', default: '' },
          collection: { type: 'collection', label: 'Collection', default: '' },
          count: { type: 'select', label: 'Count', default: '8', options: ['4', '8', '12'] },
        },
      },
    },
  },
};

describe('resolveConfig', () => {
  it('uses the manifest default when there is no override', () => {
    const resolved = resolveConfig(manifest, {});
    expect(resolved['colors.primary']).toBe('#111111');
    expect(resolved['layout.showHero']).toBe(true);
  });

  it('prefers a DB override over the manifest default', () => {
    const resolved = resolveConfig(manifest, { 'colors.primary': '#ff0000' });
    expect(resolved['colors.primary']).toBe('#ff0000');
  });

  it('applies a falsy override rather than falling back to the default', () => {
    // showHero: false is a legitimate override, not "no override" — must not fall back to true
    const resolved = resolveConfig(manifest, { 'layout.showHero': false });
    expect(resolved['layout.showHero']).toBe(false);
  });

  it('carries a repeater override through as an array, replacing the default rows entirely', () => {
    const override = [{ title: 'New Arrivals', collection: 'new', count: '4' }];
    const resolved = resolveConfig(manifest, { 'layout.featuredSections': override });
    expect(resolved['layout.featuredSections']).toEqual(override);
  });

  it('falls back to the default repeater rows when unset', () => {
    const resolved = resolveConfig(manifest, {});
    expect(resolved['layout.featuredSections']).toEqual([
      { title: 'Featured Products', collection: '', count: '8' },
    ]);
  });
});

describe('resolveConfigNested', () => {
  it('groups flat keys back into their section objects', () => {
    const nested = resolveConfigNested(manifest, { 'colors.primary': '#ff0000' });
    expect(nested).toEqual({
      colors: { primary: '#ff0000' },
      layout: {
        showHero: true,
        heroHeading: 'Welcome',
        featuredSections: [{ title: 'Featured Products', collection: '', count: '8' }],
      },
    });
  });
});

describe('buildCssVars', () => {
  it('emits a style block only for keys in the CSS var map', () => {
    const css = buildCssVars({ 'colors.primary': '#ff0000', 'layout.heroHeading': 'ignored' });
    expect(css).toContain('--color-primary: #ff0000;');
    expect(css).not.toContain('ignored');
  });

  it('quotes the heading font as a font-family value', () => {
    const css = buildCssVars({ 'typography.headingFont': 'Playfair Display' });
    expect(css).toContain("--font-heading: 'Playfair Display', sans-serif;");
  });

  it('returns an empty string when nothing in the resolved config maps to a CSS var', () => {
    expect(buildCssVars({ 'layout.heroHeading': 'Welcome' })).toBe('');
  });
});
