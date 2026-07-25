import { describe, it, expect, beforeAll } from 'vitest';
import { createZone, createRate, getRatesForCountry } from '../../src/db/queries/shipping';

// Kept in its own file (own fresh migrated DB, per tests/setup.ts) so no wildcard
// zone from another test's setup can leak in and mask the "no match at all" case.
describe('getRatesForCountry with a zone but no wildcard fallback', () => {
  beforeAll(() => {
    const de = createZone('Germany only', ['DE']);
    createRate(de.id, 'Standard', 'flat', 750, null);
  });

  it('returns no rates for a country that matches nothing, wildcard or otherwise', () => {
    expect(getRatesForCountry('JP', 1000)).toEqual([]);
  });
});
