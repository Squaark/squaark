import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface CustomerGroupRow {
  id: string;
  name: string;
  created_at: string;
}

export function findAllGroups(): CustomerGroupRow[] {
  return query<CustomerGroupRow>('SELECT * FROM customer_groups ORDER BY name');
}

export function findGroupById(id: string): CustomerGroupRow | null {
  return queryOne<CustomerGroupRow>('SELECT * FROM customer_groups WHERE id = ?', [id]);
}

export function createGroup(name: string): CustomerGroupRow {
  const id = randomUUID();
  execute('INSERT INTO customer_groups (id, name) VALUES (?, ?)', [id, name]);
  return findGroupById(id)!;
}

export function renameGroup(id: string, name: string): void {
  execute('UPDATE customer_groups SET name = ? WHERE id = ?', [name, id]);
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
