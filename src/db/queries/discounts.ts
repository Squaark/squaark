import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface DiscountRow {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  active: number;
  min_subtotal: number;
  usage_limit: number | null;
  times_used: number;
  ends_at: string | null;
  created_at: string;
}

export interface DiscountInput {
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  active: boolean;
  minSubtotal: number;
  usageLimit: number | null;
  endsAt: string | null;
}

export function listDiscounts(): DiscountRow[] {
  return query<DiscountRow>('SELECT * FROM discounts ORDER BY created_at DESC');
}

export function findDiscountById(id: string): DiscountRow | null {
  return queryOne<DiscountRow>('SELECT * FROM discounts WHERE id = ?', [id]);
}

/** Case-insensitive lookup — codes are stored uppercased. */
export function findDiscountByCode(code: string): DiscountRow | null {
  return queryOne<DiscountRow>('SELECT * FROM discounts WHERE code = ?', [code.trim().toUpperCase()]);
}

export function createDiscount(input: DiscountInput): string {
  const id = randomUUID();
  execute(
    `INSERT INTO discounts (id, code, type, value, active, min_subtotal, usage_limit, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.code.trim().toUpperCase(), input.type, input.value, input.active ? 1 : 0,
     input.minSubtotal, input.usageLimit, input.endsAt],
  );
  return id;
}

export function updateDiscount(id: string, input: DiscountInput): void {
  execute(
    `UPDATE discounts SET code = ?, type = ?, value = ?, active = ?, min_subtotal = ?, usage_limit = ?, ends_at = ?
     WHERE id = ?`,
    [input.code.trim().toUpperCase(), input.type, input.value, input.active ? 1 : 0,
     input.minSubtotal, input.usageLimit, input.endsAt, id],
  );
}

export function deleteDiscount(id: string): void {
  execute('DELETE FROM discounts WHERE id = ?', [id]);
}

export function incrementDiscountUsage(code: string): void {
  execute('UPDATE discounts SET times_used = times_used + 1 WHERE code = ?', [code.trim().toUpperCase()]);
}
