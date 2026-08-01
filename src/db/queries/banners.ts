import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface BannerRow {
  id: string;
  message: string;
  link_url: string | null;
  link_label: string | null;
  code: string | null;
  bg_color: string;
  text_color: string;
  dismissible: number;
  active: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface BannerInput {
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
  code: string | null;
  bgColor: string;
  textColor: string;
  dismissible: boolean;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export function listBanners(): BannerRow[] {
  return query<BannerRow>('SELECT * FROM promo_banners ORDER BY created_at DESC');
}

export function findBannerById(id: string): BannerRow | null {
  return queryOne<BannerRow>('SELECT * FROM promo_banners WHERE id = ?', [id]);
}

/**
 * The single banner to show right now: active, within its (optional) date range,
 * newest wins when several overlap. Dates are compared as local YYYY-MM-DD so a
 * banner is live for the whole of its start and end days.
 */
export function getActiveBanner(): BannerRow | null {
  return queryOne<BannerRow>(
    `SELECT * FROM promo_banners
      WHERE active = 1
        AND (starts_at IS NULL OR starts_at <= date('now', 'localtime'))
        AND (ends_at   IS NULL OR ends_at   >= date('now', 'localtime'))
      ORDER BY created_at DESC
      LIMIT 1`,
  );
}

export function createBanner(input: BannerInput): string {
  const id = randomUUID();
  execute(
    `INSERT INTO promo_banners
       (id, message, link_url, link_label, code, bg_color, text_color, dismissible, active, starts_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.message, input.linkUrl, input.linkLabel, input.code, input.bgColor, input.textColor,
     input.dismissible ? 1 : 0, input.active ? 1 : 0, input.startsAt, input.endsAt],
  );
  return id;
}

export function updateBanner(id: string, input: BannerInput): void {
  execute(
    `UPDATE promo_banners SET
       message = ?, link_url = ?, link_label = ?, code = ?, bg_color = ?, text_color = ?,
       dismissible = ?, active = ?, starts_at = ?, ends_at = ?
     WHERE id = ?`,
    [input.message, input.linkUrl, input.linkLabel, input.code, input.bgColor, input.textColor,
     input.dismissible ? 1 : 0, input.active ? 1 : 0, input.startsAt, input.endsAt, id],
  );
}

export function deleteBanner(id: string): void {
  execute('DELETE FROM promo_banners WHERE id = ?', [id]);
}
