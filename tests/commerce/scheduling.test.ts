import { describe, it, expect } from 'vitest';
import { parseSchedule, availableDates, isValidSlot, type FulfilmentSchedule } from '../../src/commerce/scheduling';

const TODAY = new Date(2026, 7, 4); // 4 Aug 2026 (local)
function plus(n: number): string {
  const d = new Date(2026, 7, 4 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ALL: FulfilmentSchedule = { weekdays: [0, 1, 2, 3, 4, 5, 6], windows: ['9–12', '12–3'], leadDays: 2, horizonDays: 5, blackouts: [] };

describe('availableDates', () => {
  it('spans today+lead to today+horizon inclusive', () => {
    expect(availableDates(ALL, TODAY).map(d => d.value)).toEqual([plus(2), plus(3), plus(4), plus(5)]);
  });
  it('excludes blackout dates', () => {
    expect(availableDates({ ...ALL, blackouts: [plus(3)] }, TODAY).map(d => d.value)).toEqual([plus(2), plus(4), plus(5)]);
  });
  it('only includes configured weekdays', () => {
    const wd = new Date(2026, 7, 4 + 2).getDay();
    const dates = availableDates({ ...ALL, weekdays: [wd] }, TODAY);
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(new Date(d.value + 'T00:00:00').getDay()).toBe(wd);
  });
});

describe('parseSchedule', () => {
  it('returns null for empty/invalid/no-days/no-windows', () => {
    expect(parseSchedule(null)).toBeNull();
    expect(parseSchedule('')).toBeNull();
    expect(parseSchedule('{bad')).toBeNull();
    expect(parseSchedule('{"weekdays":[],"windows":["x"]}')).toBeNull();
    expect(parseSchedule('{"weekdays":[1],"windows":[]}')).toBeNull();
  });
  it('normalises days/windows and clamps horizon >= lead', () => {
    const s = parseSchedule('{"weekdays":[1,2,2,9],"windows":[" 9–12 ",""],"leadDays":5,"horizonDays":2}')!;
    expect(s.weekdays).toEqual([1, 2]);
    expect(s.windows).toEqual(['9–12']);
    expect(s.leadDays).toBe(5);
    expect(s.horizonDays).toBe(5); // clamped up to lead
  });
});

describe('isValidSlot', () => {
  it('accepts a bookable date + configured window', () => {
    expect(isValidSlot(ALL, plus(2), '9–12', TODAY)).toBe(true);
  });
  it('rejects an unknown window', () => {
    expect(isValidSlot(ALL, plus(2), 'midnight', TODAY)).toBe(false);
  });
  it('rejects a date outside the horizon', () => {
    expect(isValidSlot(ALL, plus(99), '9–12', TODAY)).toBe(false);
  });
  it('rejects a date before the lead time', () => {
    expect(isValidSlot(ALL, plus(1), '9–12', TODAY)).toBe(false);
  });
});
