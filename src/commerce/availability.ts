// Product "calendar" — a product stays visible but is only purchasable between
// its optional available_from / available_until dates (inclusive). This mirrors
// the promo-banner date convention: YYYY-MM-DD compared against the local date.

export type AvailabilityStatus = 'available' | 'upcoming' | 'ended';

export interface Availability {
  from: string | null;       // YYYY-MM-DD or null (no start gate)
  until: string | null;      // YYYY-MM-DD or null (no end gate)
  fromLabel: string | null;  // e.g. "1 December 2026"
  untilLabel: string | null;
  status: AvailabilityStatus;
  purchasable: boolean;      // true only while status === 'available'
  preorder: boolean;         // upcoming AND the product allows preorders
  orderable: boolean;        // purchasable OR preorder — the add-to-cart gate
  scheduled: boolean;        // true if either date is set (i.e. a window exists)
}

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function label(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function computeAvailability(
  from: string | null | undefined,
  until: string | null | undefined,
  today: string = localDateStr(),
  allowPreorder = false,
): Availability {
  const f = from || null;
  const u = until || null;
  let status: AvailabilityStatus = 'available';
  if (f && today < f) status = 'upcoming';
  else if (u && today > u) status = 'ended';
  const purchasable = status === 'available';
  const preorder = status === 'upcoming' && allowPreorder;
  return {
    from: f,
    until: u,
    fromLabel: label(f),
    untilLabel: label(u),
    status,
    purchasable,
    preorder,
    orderable: purchasable || preorder,
    scheduled: Boolean(f || u),
  };
}
