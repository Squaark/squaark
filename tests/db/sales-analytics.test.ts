import { describe, it, expect, beforeAll } from 'vitest';
import { execute } from '../../src/db/connection';
import {
  getSalesKpi, getRevenueBreakdown, getConversionStats,
  getRevenueTrend, getTopProducts, getSalesDashboard, getRevenueSnapshot,
} from '../../src/db/queries/sales-analytics';

// Fixtures span three windows relative to a 30-day view:
//   current  (0–30 days ago): o1 (paid), o2 (paid), o3 (pending), o4 (refunded)
//   previous (30–60 days ago): o5 (paid) — the delta baseline
//   older    (>60 days ago):   o6 (paid) — outside every window
// Only paid orders inside a window count as sales.
beforeAll(() => {
  execute(
    `INSERT INTO orders (id, order_number, email, status, subtotal, discount_amount, shipping, total, currency, tax_amount, created_at) VALUES
       ('o1',5001,'a@x.com','paid',    2000,500,300,2200,'GBP',400, datetime('now','-2 days')),
       ('o2',5002,'b@x.com','paid',    1000,  0,  0,1000,'GBP',  0, datetime('now','-5 days')),
       ('o3',5003,'c@x.com','pending', 9999,  0,  0,9999,'GBP',  0, datetime('now','-1 days')),
       ('o4',5004,'d@x.com','refunded',5000,  0,  0,5000,'GBP',  0, datetime('now','-3 days')),
       ('o5',5005,'e@x.com','paid',    1000,  0,  0,1000,'GBP',  0, datetime('now','-40 days')),
       ('o6',5006,'f@x.com','paid',   99999,  0,  0,99999,'GBP', 0, datetime('now','-100 days'))`,
  );
  execute(
    `INSERT INTO order_items (id, order_id, variant_id, product_title, variant_title, price, quantity, line_total) VALUES
       ('it1','o1','v1','P1','A',1000, 2, 2000),
       ('it2','o2','v2','P2','', 1000, 1, 1000),
       ('it3','o3','v1','P1','A',1000,10,10000),
       ('it5','o5','v1','P1','A',1000, 1, 1000)`,
  );
  // Kept a clear day off "now" so a 1-day window is reliably empty (avoids the
  // second-resolution boundary at exactly datetime('now','-1 days')).
  execute(
    `INSERT INTO page_views (id, path, referrer, ip_hash, created_at) VALUES
       ('pv1','/',    NULL, 'ipA', datetime('now','-2 days')),
       ('pv2','/p/x', NULL, 'ipA', datetime('now','-3 days')),
       ('pv3','/',    NULL, 'ipB', datetime('now','-4 days')),
       ('pv4','/',    NULL, 'ipC', datetime('now','-5 days')),
       ('pv5','/',    NULL, 'ipD', datetime('now','-40 days'))`,
  );
});

describe('getSalesKpi', () => {
  it('counts only paid orders in the window and compares with the previous one', () => {
    const kpi = getSalesKpi(30);
    // o1 + o2 (pending o3 and refunded o4 excluded)
    expect(kpi.current.revenue).toBe(3200);
    expect(kpi.current.orders).toBe(2);
    expect(kpi.current.units).toBe(3);        // 2 + 1 (pending o3's 10 excluded)
    expect(kpi.current.avgOrderValue).toBe(1600);
    // previous window is o5 only
    expect(kpi.previous.revenue).toBe(1000);
    expect(kpi.previous.orders).toBe(1);
    expect(kpi.revenueChangePct).toBe(220);   // (3200-1000)/1000
    expect(kpi.ordersChangePct).toBe(100);
  });

  it('reports a null delta when there is no prior baseline', () => {
    // 7-day window: current has o1+o2, the preceding 7 days (7–14 ago) are empty
    const kpi = getSalesKpi(7);
    expect(kpi.previous.revenue).toBe(0);
    expect(kpi.revenueChangePct).toBeNull();
  });
});

describe('getRevenueBreakdown', () => {
  it('sums each money component of paid orders', () => {
    expect(getRevenueBreakdown(30)).toEqual({
      gross: 3000, discounts: 500, shipping: 300, tax: 400, total: 3200,
    });
  });
});

describe('getConversionStats', () => {
  it('ties distinct visitors to paid orders', () => {
    const c = getConversionStats(30);
    expect(c.visitors).toBe(3);           // ipA (x2 views), ipB, ipC; ipD out of window
    expect(c.pageViews).toBe(4);
    expect(c.orders).toBe(2);
    expect(c.conversionRate).toBe(66.7);  // 2/3, one decimal place
    expect(c.revenuePerVisitor).toBe(1067); // round(3200/3)
  });

  it('is zero, not NaN, when there are no visitors', () => {
    const c = getConversionStats(1); // no page views (or orders) in the last day
    expect(c.visitors).toBe(0);
    expect(c.orders).toBe(0);
    expect(c.conversionRate).toBe(0);
    expect(c.revenuePerVisitor).toBe(0);
  });
});

describe('getTopProducts', () => {
  it('ranks paid-order items by revenue and combines by product title', () => {
    const top = getTopProducts(30);
    expect(top).toEqual([
      { product_title: 'P1', units: 2, revenue: 2000 },
      { product_title: 'P2', units: 1, revenue: 1000 },
    ]);
  });
});

describe('getRevenueTrend', () => {
  it('returns a continuous zero-filled daily series that sums to window revenue', () => {
    const t = getRevenueTrend(30);
    expect(t.bucket).toBe('day');
    expect(t.points).toHaveLength(30);
    expect(t.points.reduce((s, p) => s + p.revenue, 0)).toBe(3200);
    expect(t.max).toBe(2200); // o1's day is the tallest bar
  });

  it('buckets by week for long ranges', () => {
    const t = getRevenueTrend(90);
    expect(t.bucket).toBe('week');
    expect(t.points).toHaveLength(13); // ceil(90 / 7)
  });
});

describe('getSalesDashboard / getRevenueSnapshot', () => {
  it('assembles the pieces for one range', () => {
    const d = getSalesDashboard(30);
    expect(d.days).toBe(30);
    expect(d.kpi.current.revenue).toBe(3200);
    expect(d.topProducts).toHaveLength(2);
    expect(d.trendBucket).toBe('day');
  });

  it('snapshot returns the headline figure cheaply', () => {
    expect(getRevenueSnapshot(30)).toEqual({ revenue: 3200, orders: 2 });
  });
});
