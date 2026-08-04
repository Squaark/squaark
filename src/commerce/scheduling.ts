// Bookable fulfilment scheduling: a shipping rate can require the customer to
// pick a delivery/collection DATE + TIME WINDOW. The rules live in a
// FulfilmentSchedule (stored as JSON on the rate). Capacity is unlimited here —
// a slot is a preference and never "sells out".

export interface FulfilmentSchedule {
  weekdays: number[];   // bookable days, 0=Sun … 6=Sat
  windows: string[];    // time-window labels, e.g. ["9am–12pm", "12–3pm"]
  leadDays: number;     // earliest bookable day = today + leadDays
  horizonDays: number;  // latest bookable day = today + horizonDays
  blackouts: string[];  // YYYY-MM-DD dates that are never bookable
}

export interface DateOption { value: string; label: string }

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse/normalise a stored schedule JSON. Returns null if absent or unusable. */
export function parseSchedule(json: string | null | undefined): FulfilmentSchedule | null {
  if (!json) return null;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(json); } catch { return null; }
  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))]
    : [];
  const windows = Array.isArray(raw.windows)
    ? raw.windows.map(w => String(w).trim()).filter(Boolean)
    : [];
  if (weekdays.length === 0 || windows.length === 0) return null;
  const leadDays = Math.max(0, parseInt(String(raw.leadDays ?? 0), 10) || 0);
  const horizonDays = Math.max(leadDays, parseInt(String(raw.horizonDays ?? 14), 10) || 14);
  const blackouts = Array.isArray(raw.blackouts) ? raw.blackouts.map(b => String(b).trim()).filter(Boolean) : [];
  return { weekdays, windows, leadDays, horizonDays, blackouts };
}

/** The list of bookable dates for a schedule, from today+lead to today+horizon. */
export function availableDates(s: FulfilmentSchedule, today: Date = new Date()): DateOption[] {
  const out: DateOption[] = [];
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = s.leadDays; i <= s.horizonDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (!s.weekdays.includes(d.getDay())) continue;
    const value = localDateStr(d);
    if (s.blackouts.includes(value)) continue;
    out.push({ value, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) });
  }
  return out;
}

/** True if (date, window) is a currently-bookable slot for the schedule. */
export function isValidSlot(s: FulfilmentSchedule, date: string, window: string, today: Date = new Date()): boolean {
  if (!s.windows.includes(window)) return false;
  return availableDates(s, today).some(d => d.value === date);
}
