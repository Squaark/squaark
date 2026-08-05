import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface ReusableSectionRow {
  id: string;
  name: string;
  sections: string;   // JSON array, same shape as pages.sections
  created_at: string;
  updated_at: string;
}

export function findAllReusable(): ReusableSectionRow[] {
  return query<ReusableSectionRow>('SELECT * FROM reusable_sections ORDER BY name');
}

export function findReusableById(id: string): ReusableSectionRow | null {
  if (!id) return null;
  return queryOne<ReusableSectionRow>('SELECT * FROM reusable_sections WHERE id = ?', [id]);
}

export function createReusable(name: string, sectionsJson: string): string {
  const id = randomUUID();
  execute('INSERT INTO reusable_sections (id, name, sections) VALUES (?, ?, ?)', [id, name, sectionsJson]);
  return id;
}

export function updateReusable(id: string, name: string, sectionsJson: string): void {
  execute(
    `UPDATE reusable_sections SET name = ?, sections = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, sectionsJson, id],
  );
}

export function deleteReusable(id: string): void {
  execute('DELETE FROM reusable_sections WHERE id = ?', [id]);
}
