import { describe, it, expect, beforeAll } from 'vitest';
import { createZone, createRate, getRatesForCountry } from '../../src/db/queries/shipping';

describe('getRatesForCountry', () => {
  it('returns no rates when no zones exist', () => {
    expect(getRatesForCountry('GB', 5000)).toEqual([]);
  });

  describe('with zones configured', () => {
    beforeAll(() => {
      const rest = createZone('Rest of world', ['*']);
      createRate(rest.id, 'Standard', 'flat', 995, null);

      const uk = createZone('United Kingdom', ['GB']);
      createRate(uk.id, 'Standard', 'flat', 495, null);
      createRate(uk.id, 'Free over £50', 'free_over', 495, 5000);
      createRate(uk.id, 'Always free', 'free', 0, null);
    });

    it('matches an exact country code over the wildcard zone', () => {
      const rates = getRatesForCountry('GB', 1000);
      expect(rates.map(r => r.name)).toEqual(['Standard', 'Free over £50', 'Always free']);
    });

    it('falls back to the wildcard zone for an unmatched country', () => {
      const rates = getRatesForCountry('FR', 1000);
      expect(rates).toEqual([{ id: expect.any(String), name: 'Standard', amount: 995, isFree: false, isPickup: false, pickupAddress: null, pickupInstructions: null }]);
    });

    it('charges a flat rate as-is', () => {
      const rates = getRatesForCountry('GB', 1000);
      const standard = rates.find(r => r.name === 'Standard')!;
      expect(standard).toMatchObject({ amount: 495, isFree: false });
    });

    it('charges a free_over rate when the subtotal is below the threshold', () => {
      const rates = getRatesForCountry('GB', 4999);
      const freeOver = rates.find(r => r.name === 'Free over £50')!;
      expect(freeOver).toMatchObject({ amount: 495, isFree: false });
    });

    it('waives a free_over rate once the subtotal meets the threshold', () => {
      const rates = getRatesForCountry('GB', 5000);
      const freeOver = rates.find(r => r.name === 'Free over £50')!;
      expect(freeOver).toMatchObject({ amount: 0, isFree: true });
    });

    it('always waives a free rate regardless of subtotal', () => {
      const rates = getRatesForCountry('GB', 1);
      const alwaysFree = rates.find(r => r.name === 'Always free')!;
      expect(alwaysFree).toMatchObject({ amount: 0, isFree: true });
    });
  });
});
