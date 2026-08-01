import { describe, it, expect } from 'vitest';
import { db } from '../../src/db/connection';
import { createAutomaticDiscount, listActiveAutomaticDiscounts } from '../../src/db/queries/automatic-discounts';

const base = { kind: 'order' as const, type: 'percentage' as const, value: 10, minSubtotal: 0,
  buyQuantity: null, getQuantity: null, getDiscount: null, targetType: null, targetId: null };
const day = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};
const activeNames = () => listActiveAutomaticDiscounts().map(r => r.name);

describe('listActiveAutomaticDiscounts (active + date window)', () => {
  it('includes active + in-window, excludes inactive / future / expired', () => {
    createAutomaticDiscount({ ...base, name: 'live-now', active: true, startsAt: null, endsAt: null });
    createAutomaticDiscount({ ...base, name: 'inactive', active: false, startsAt: null, endsAt: null });
    createAutomaticDiscount({ ...base, name: 'future', active: true, startsAt: day(3), endsAt: day(10) });
    createAutomaticDiscount({ ...base, name: 'expired', active: true, startsAt: day(-10), endsAt: day(-3) });
    createAutomaticDiscount({ ...base, name: 'in-window', active: true, startsAt: day(-1), endsAt: day(1) });

    const names = activeNames();
    expect(names).toContain('live-now');
    expect(names).toContain('in-window');
    expect(names).not.toContain('inactive');
    expect(names).not.toContain('future');
    expect(names).not.toContain('expired');
  });
});
