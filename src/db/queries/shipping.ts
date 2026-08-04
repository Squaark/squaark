import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface ShippingZoneRow {
  id: string;
  name: string;
  countries: string; // JSON array e.g. '["GB","US"]' or '["*"]'
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ShippingRateRow {
  id: string;
  zone_id: string;
  name: string;
  rate_type: 'flat' | 'free' | 'free_over' | 'pickup';
  amount: number;           // minor units
  min_order_amount: number | null; // minor units; for free_over type
  position: number;
  pickup_address: string | null;      // 'pickup' — collection address
  pickup_instructions: string | null; // 'pickup' — opening hours / notes
}

export function findAllZones(): ShippingZoneRow[] {
  return query<ShippingZoneRow>('SELECT * FROM shipping_zones ORDER BY position, name');
}

export function findZoneById(id: string): ShippingZoneRow | null {
  return queryOne<ShippingZoneRow>('SELECT * FROM shipping_zones WHERE id = ?', [id]);
}

export function findRatesForZone(zoneId: string): ShippingRateRow[] {
  return query<ShippingRateRow>(
    'SELECT * FROM shipping_rates WHERE zone_id = ? ORDER BY position, name',
    [zoneId],
  );
}

export function findRateById(id: string): ShippingRateRow | null {
  return queryOne<ShippingRateRow>('SELECT * FROM shipping_rates WHERE id = ?', [id]);
}

export function createZone(name: string, countries: string[]): ShippingZoneRow {
  const id = randomUUID();
  const maxPos = queryOne<{ m: number }>('SELECT COALESCE(MAX(position),0) AS m FROM shipping_zones')?.m ?? 0;
  execute(
    'INSERT INTO shipping_zones (id, name, countries, position) VALUES (?,?,?,?)',
    [id, name, JSON.stringify(countries), maxPos + 1],
  );
  return findZoneById(id)!;
}

export function updateZone(id: string, name: string, countries: string[]): void {
  execute(
    `UPDATE shipping_zones SET name=?, countries=?, updated_at=datetime('now') WHERE id=?`,
    [name, JSON.stringify(countries), id],
  );
}

export function deleteZone(id: string): void {
  execute('DELETE FROM shipping_zones WHERE id = ?', [id]);
}

export function createRate(
  zoneId: string,
  name: string,
  rateType: string,
  amount: number,
  minOrderAmount: number | null,
  pickup: { address: string | null; instructions: string | null } = { address: null, instructions: null },
): ShippingRateRow {
  const id = randomUUID();
  const maxPos = queryOne<{ m: number }>(
    'SELECT COALESCE(MAX(position),0) AS m FROM shipping_rates WHERE zone_id = ?',
    [zoneId],
  )?.m ?? 0;
  execute(
    'INSERT INTO shipping_rates (id, zone_id, name, rate_type, amount, min_order_amount, position, pickup_address, pickup_instructions) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, zoneId, name, rateType, amount, minOrderAmount, maxPos + 1, pickup.address, pickup.instructions],
  );
  return findRateById(id)!;
}

export function deleteRate(id: string): void {
  execute('DELETE FROM shipping_rates WHERE id = ?', [id]);
}

export interface ResolvedRate {
  id: string;
  name: string;
  amount: number; // minor units — what will actually be charged
  isFree: boolean;
  isPickup: boolean;
  pickupAddress: string | null;
  pickupInstructions: string | null;
}

export function getRatesForCountry(country: string, subtotalMinorUnits: number): ResolvedRate[] {
  const zones = findAllZones();

  // Find the best matching zone: exact country match first, then wildcard
  let matchedZone: ShippingZoneRow | null = null;
  for (const zone of zones) {
    try {
      const codes: string[] = JSON.parse(zone.countries);
      if (codes.includes(country)) { matchedZone = zone; break; }
    } catch { /* skip malformed */ }
  }
  if (!matchedZone) {
    for (const zone of zones) {
      try {
        const codes: string[] = JSON.parse(zone.countries);
        if (codes.includes('*')) { matchedZone = zone; break; }
      } catch { /* skip */ }
    }
  }
  if (!matchedZone) return [];

  const rates = findRatesForZone(matchedZone.id);
  return rates.map(r => {
    const base = { id: r.id, name: r.name, isPickup: false, pickupAddress: null, pickupInstructions: null };
    if (r.rate_type === 'pickup') {
      return { ...base, amount: r.amount, isFree: r.amount === 0, isPickup: true,
        pickupAddress: r.pickup_address, pickupInstructions: r.pickup_instructions };
    }
    if (r.rate_type === 'free') {
      return { ...base, amount: 0, isFree: true };
    }
    if (r.rate_type === 'free_over') {
      const threshold = r.min_order_amount ?? 0;
      const free = subtotalMinorUnits >= threshold;
      return { ...base, amount: free ? 0 : r.amount, isFree: free };
    }
    // flat
    return { ...base, amount: r.amount, isFree: r.amount === 0 };
  });
}
