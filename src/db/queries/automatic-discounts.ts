import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';
import type { AutomaticPromo } from '../../commerce/automatic-discounts';

export interface AutomaticDiscountRow {
  id: string;
  name: string;
  kind: 'order' | 'bogo';
  active: number;
  starts_at: string | null;
  ends_at: string | null;
  type: 'percentage' | 'fixed' | null;
  value: number | null;
  min_subtotal: number;
  buy_quantity: number | null;
  get_quantity: number | null;
  get_discount: number | null;
  target_type: 'all' | 'collection' | 'product' | null;
  target_id: string | null;
  created_at: string;
}

export interface AutomaticDiscountInput {
  name: string;
  kind: 'order' | 'bogo';
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  type: 'percentage' | 'fixed' | null;
  value: number | null;
  minSubtotal: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscount: number | null;
  targetType: 'all' | 'collection' | 'product' | null;
  targetId: string | null;
}

export function listAutomaticDiscounts(): AutomaticDiscountRow[] {
  return query<AutomaticDiscountRow>('SELECT * FROM automatic_discounts ORDER BY created_at DESC');
}

export function findAutomaticDiscountById(id: string): AutomaticDiscountRow | null {
  return queryOne<AutomaticDiscountRow>('SELECT * FROM automatic_discounts WHERE id = ?', [id]);
}

/** Active discounts within their (optional) date window — what the cart applies. */
export function listActiveAutomaticDiscounts(): AutomaticDiscountRow[] {
  return query<AutomaticDiscountRow>(
    `SELECT * FROM automatic_discounts
      WHERE active = 1
        AND (starts_at IS NULL OR starts_at <= date('now', 'localtime'))
        AND (ends_at   IS NULL OR ends_at   >= date('now', 'localtime'))
      ORDER BY created_at DESC`,
  );
}

export function createAutomaticDiscount(input: AutomaticDiscountInput): string {
  const id = randomUUID();
  execute(
    `INSERT INTO automatic_discounts
       (id, name, kind, active, starts_at, ends_at, type, value, min_subtotal,
        buy_quantity, get_quantity, get_discount, target_type, target_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.kind, input.active ? 1 : 0, input.startsAt, input.endsAt,
     input.type, input.value, input.minSubtotal,
     input.buyQuantity, input.getQuantity, input.getDiscount, input.targetType, input.targetId],
  );
  return id;
}

export function updateAutomaticDiscount(id: string, input: AutomaticDiscountInput): void {
  execute(
    `UPDATE automatic_discounts SET
       name = ?, kind = ?, active = ?, starts_at = ?, ends_at = ?, type = ?, value = ?, min_subtotal = ?,
       buy_quantity = ?, get_quantity = ?, get_discount = ?, target_type = ?, target_id = ?
     WHERE id = ?`,
    [input.name, input.kind, input.active ? 1 : 0, input.startsAt, input.endsAt,
     input.type, input.value, input.minSubtotal,
     input.buyQuantity, input.getQuantity, input.getDiscount, input.targetType, input.targetId, id],
  );
}

export function deleteAutomaticDiscount(id: string): void {
  execute('DELETE FROM automatic_discounts WHERE id = ?', [id]);
}

/** Maps a DB row to the shape the pure engine consumes. */
export function rowToPromo(r: AutomaticDiscountRow): AutomaticPromo {
  return {
    id: r.id, name: r.name, kind: r.kind,
    type: r.type, value: r.value, minSubtotal: r.min_subtotal,
    buyQuantity: r.buy_quantity, getQuantity: r.get_quantity, getDiscount: r.get_discount,
    targetType: r.target_type, targetId: r.target_id,
  };
}
