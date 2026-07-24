import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface TaxBandRow {
  id: string;
  name: string;
  sort_order: number;
  rate: string | null;
}

const BAND_SQL = `
  SELECT tb.id, tb.name, tb.sort_order, tr.rate
  FROM tax_bands tb
  LEFT JOIN tax_rates tr ON tr.band_id = tb.id
`;

export function findAllBands(): TaxBandRow[] {
  return query<TaxBandRow>(`${BAND_SQL} ORDER BY tb.sort_order, tb.name`);
}

export function findBandById(id: string): TaxBandRow | null {
  return queryOne<TaxBandRow>(`${BAND_SQL} WHERE tb.id = ?`, [id]);
}

export function createBand(name: string, rate: string): TaxBandRow {
  const id = randomUUID();
  execute('INSERT INTO tax_bands (id, name) VALUES (?, ?)', [id, name.trim()]);
  execute('INSERT INTO tax_rates (id, band_id, rate) VALUES (?, ?, ?)', [randomUUID(), id, rate || '0']);
  return findBandById(id)!;
}

export function updateBand(id: string, name: string, rate: string): void {
  execute('UPDATE tax_bands SET name = ? WHERE id = ?', [name.trim(), id]);
  const existing = queryOne<{ id: string }>('SELECT id FROM tax_rates WHERE band_id = ?', [id]);
  if (existing) {
    execute('UPDATE tax_rates SET rate = ? WHERE band_id = ?', [rate || '0', id]);
  } else {
    execute('INSERT INTO tax_rates (id, band_id, rate) VALUES (?, ?, ?)', [randomUUID(), id, rate || '0']);
  }
}

export function deleteBand(id: string): void {
  execute('DELETE FROM tax_bands WHERE id = ?', [id]);
}

export function countProductsInBand(bandId: string): number {
  return queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE tax_band_id = ?', [bandId])?.n ?? 0;
}
