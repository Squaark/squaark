import { describe, it, expect } from 'vitest';
import path from 'path';
import { validateTheme } from '../../src/theme/validate';

const LINEN_DIR = path.resolve(process.cwd(), 'themes/linen');

describe('validateTheme', () => {
  it('passes the bundled linen theme with no blocking errors', async () => {
    const report = await validateTheme(LINEN_DIR);

    // The reference theme must always satisfy the contract — this guards
    // against the context/render contract drifting away from the theme.
    const errors = report.results.filter(r => r.status === 'fail' && r.severity === 'error');
    expect(errors, `Unexpected errors:\n${errors.map(e => `- ${e.title}: ${e.detail}`).join('\n')}`).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.totals.passed).toBeGreaterThan(0);
  });

  it('renders every core template without throwing', async () => {
    const report = await validateTheme(LINEN_DIR);
    const renderChecks = report.results.filter(r => r.id.startsWith('render-'));
    expect(renderChecks.length).toBeGreaterThan(0);
    expect(renderChecks.every(r => r.status === 'pass')).toBe(true);
  });

  it('flags a theme missing required templates as an error', async () => {
    // An empty dir has no templates — every core template + partial should fail.
    const report = await validateTheme(path.resolve(process.cwd(), 'tests/theme'));
    expect(report.ok).toBe(false);
    expect(report.totals.errors).toBeGreaterThan(0);
    const missingIndex = report.results.find(r => r.id === 'template-index');
    expect(missingIndex?.status).toBe('fail');
  });
});
