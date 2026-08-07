import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface CustomerGroupRow {
  id: string;
  name: string;
  discount_percent: number;         // 0–100, applied store-wide at the cart
  tax_display: string | null;       // null = inherit; 'inc' | 'ex'
  pay_on_account: number;           // 1 = may checkout by invoice (no card)
  payment_terms_days: number | null;// net terms; null = due on receipt
  created_at: string;
}

export function findAllGroups(): CustomerGroupRow[] {
  return query<CustomerGroupRow>('SELECT * FROM customer_groups ORDER BY name');
}

export function findGroupById(id: string): CustomerGroupRow | null {
  return queryOne<CustomerGroupRow>('SELECT * FROM customer_groups WHERE id = ?', [id]);
}

/** The group a customer belongs to (null when unassigned/guest). */
export function getGroupForCustomer(customerId: string | null | undefined): CustomerGroupRow | null {
  if (!customerId) return null;
  return queryOne<CustomerGroupRow>(
    'SELECT g.* FROM customers c JOIN customer_groups g ON g.id = c.group_id WHERE c.id = ?',
    [customerId],
  );
}

export function createGroup(name: string): CustomerGroupRow {
  const id = randomUUID();
  execute('INSERT INTO customer_groups (id, name) VALUES (?, ?)', [id, name]);
  return findGroupById(id)!;
}

export function updateGroup(
  id: string,
  name: string,
  discountPercent: number,
  taxDisplay: string | null,
  payOnAccount: boolean,
  paymentTermsDays: number | null,
): void {
  const pct = Math.max(0, Math.min(100, Math.round(discountPercent) || 0));
  // Terms only meaningful when on-account; clamp to a non-negative whole number.
  const terms = paymentTermsDays != null && paymentTermsDays > 0 ? Math.round(paymentTermsDays) : null;
  execute(
    'UPDATE customer_groups SET name = ?, discount_percent = ?, tax_display = ?, pay_on_account = ?, payment_terms_days = ? WHERE id = ?',
    [name, pct, taxDisplay, payOnAccount ? 1 : 0, terms, id],
  );
}

export function deleteGroup(id: string): void {
  // Clear members explicitly so this works whether or not the FK pragma is on.
  execute('UPDATE customers SET group_id = NULL WHERE group_id = ?', [id]);
  execute('DELETE FROM customer_groups WHERE id = ?', [id]);
}

/** Assign (or clear, with null) a customer's group. */
export function setCustomerGroup(customerId: string, groupId: string | null): void {
  execute("UPDATE customers SET group_id = ?, updated_at = datetime('now') WHERE id = ?", [groupId, customerId]);
}
