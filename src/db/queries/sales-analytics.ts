import { query, queryOne } from '../connection';

// All monetary values are integer pence, matching the orders table. "Sales"
// means realised revenue: orders with status = 'paid' only (pending carts and
// refunded/cancelled orders are excluded). Date windows use SQLite's UTC
// `datetime('now', …)` / `date()` — the same basis as the page-view analytics
// (012_analytics.sql), so conversion figures line traffic and sales up on one
// clock.

export interface SalesKpi {
  revenue: number;       // sum(total) of paid orders in the window
  orders: number;        // count of paid orders
  units: number;         // sum of item quantities across those orders
  avgOrderValue: number; // revenue / orders, 0 when there are no orders
}

export interface KpiComparison {
  current: SalesKpi;
  previous: SalesKpi;        // the equal-length window immediately before
  revenueChangePct: number | null; // null when the previous window is 0 (no baseline)
  ordersChangePct: number | null;
  aovChangePct: number | null;
}

export interface RevenueBreakdown {
  gross: number;     // sum(subtotal) — merchandise before discounts
  discounts: number; // sum(discount_amount)
  shipping: number;  // sum(shipping)
  tax: number;       // sum(tax_amount)
  total: number;     // sum(total) — what was actually charged
}

export interface ConversionStats {
  visitors: number;          // distinct ip_hash in page_views
  pageViews: number;
  orders: number;            // paid orders in the same window
  conversionRate: number;    // orders / visitors as a percent (1 dp), 0 when no visitors
  revenuePerVisitor: number; // pence, 0 when no visitors
}

export interface TrendPoint {
  iso: string;    // first day of the bucket (YYYY-MM-DD, UTC)
  label: string;  // short human label, e.g. "5 Aug"
  revenue: number;
  orders: number;
}

export interface RevenueTrend {
  points: TrendPoint[];
  max: number;                 // largest bucket revenue, for bar scaling
  bucket: 'day' | 'week';
}

export interface TopProduct {
  product_title: string;
  units: number;
  revenue: number;
}

export interface SalesDashboard {
  days: number;
  kpi: KpiComparison;
  breakdown: RevenueBreakdown;
  conversion: ConversionStats;
  trend: TrendPoint[];
  trendMax: number;
  trendBucket: 'day' | 'week';
  topProducts: TopProduct[];
}

/** The date ranges the dashboard offers; the first is the default. */
export const SALES_RANGES = [7, 30, 90] as const;

/** A `created_at` window clause; `prefix` qualifies the column for joined queries. */
function bounds(prefix: string, hasUntil: boolean): string {
  return hasUntil
    ? `${prefix}created_at >= datetime('now', ?) AND ${prefix}created_at < datetime('now', ?)`
    : `${prefix}created_at >= datetime('now', ?)`;
}

function paidKpi(sinceMod: string, untilMod?: string): SalesKpi {
  const params = untilMod ? [sinceMod, untilMod] : [sinceMod];

  const agg = queryOne<{ revenue: number; orders: number }>(
    `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
       FROM orders WHERE status = 'paid' AND ${bounds('', !!untilMod)}`,
    params,
  )!;

  const units = queryOne<{ n: number }>(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS n
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'paid' AND ${bounds('o.', !!untilMod)}`,
    params,
  )!.n;

  return {
    revenue: agg.revenue,
    orders: agg.orders,
    units,
    avgOrderValue: agg.orders > 0 ? Math.round(agg.revenue / agg.orders) : 0,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Headline KPIs for the last `days`, each compared with the preceding `days`. */
export function getSalesKpi(days: number): KpiComparison {
  const current = paidKpi(`-${days} days`);
  const previous = paidKpi(`-${days * 2} days`, `-${days} days`);
  return {
    current,
    previous,
    revenueChangePct: pctChange(current.revenue, previous.revenue),
    ordersChangePct: pctChange(current.orders, previous.orders),
    aovChangePct: pctChange(current.avgOrderValue, previous.avgOrderValue),
  };
}

/** Where the money came from over the last `days` (paid orders). */
export function getRevenueBreakdown(days: number): RevenueBreakdown {
  return queryOne<RevenueBreakdown>(
    `SELECT COALESCE(SUM(subtotal), 0)        AS gross,
            COALESCE(SUM(discount_amount), 0) AS discounts,
            COALESCE(SUM(shipping), 0)        AS shipping,
            COALESCE(SUM(tax_amount), 0)      AS tax,
            COALESCE(SUM(total), 0)           AS total
       FROM orders
      WHERE status = 'paid' AND created_at >= datetime('now', ?)`,
    [`-${days} days`],
  )!;
}

/** Ties traffic to sales: how many visitors turned into paying orders. */
export function getConversionStats(days: number): ConversionStats {
  const sinceMod = `-${days} days`;

  const pv = queryOne<{ visitors: number; views: number }>(
    `SELECT COUNT(DISTINCT ip_hash) AS visitors, COUNT(*) AS views
       FROM page_views WHERE created_at >= datetime('now', ?)`,
    [sinceMod],
  )!;

  const sales = queryOne<{ orders: number; revenue: number }>(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
       FROM orders WHERE status = 'paid' AND created_at >= datetime('now', ?)`,
    [sinceMod],
  )!;

  return {
    visitors: pv.visitors,
    pageViews: pv.views,
    orders: sales.orders,
    conversionRate: pv.visitors > 0 ? Math.round((sales.orders / pv.visitors) * 1000) / 10 : 0,
    revenuePerVisitor: pv.visitors > 0 ? Math.round(sales.revenue / pv.visitors) : 0,
  };
}

/** Continuous, zero-filled revenue series for the last `days`, bucketed by
 *  week once a daily chart would be too dense to read (> ~1 month). */
export function getRevenueTrend(days: number): RevenueTrend {
  const rows = query<{ date: string; revenue: number; orders: number }>(
    `SELECT date(created_at) AS date, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
       FROM orders WHERE status = 'paid' AND created_at >= datetime('now', ?)
      GROUP BY date(created_at)`,
    [`-${days} days`],
  );
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const daily: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const hit = byDate.get(iso);
    daily.push({
      iso,
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      revenue: hit?.revenue ?? 0,
      orders: hit?.orders ?? 0,
    });
  }

  const bucket: 'day' | 'week' = days > 31 ? 'week' : 'day';
  const points = bucket === 'week' ? bucketByWeek(daily) : daily;
  const max = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  return { points, max, bucket };
}

/** Collapses a daily series into 7-day buckets labelled by their first day. */
function bucketByWeek(daily: TrendPoint[]): TrendPoint[] {
  const weeks: TrendPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    weeks.push({
      iso: chunk[0].iso,
      label: chunk[0].label,
      revenue: chunk.reduce((s, p) => s + p.revenue, 0),
      orders: chunk.reduce((s, p) => s + p.orders, 0),
    });
  }
  return weeks;
}

/** Best sellers over the last `days` by revenue (paid orders). Groups by the
 *  item's snapshotted product title so variants of one product combine and
 *  since-deleted products still show. */
export function getTopProducts(days: number, limit = 8): TopProduct[] {
  return query<TopProduct>(
    `SELECT oi.product_title AS product_title,
            SUM(oi.quantity)   AS units,
            SUM(oi.line_total) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'paid' AND o.created_at >= datetime('now', ?)
      GROUP BY oi.product_title
      ORDER BY revenue DESC, units DESC
      LIMIT ?`,
    [`-${days} days`, limit],
  );
}

/** Everything the full analytics page needs, for one date range. */
export function getSalesDashboard(days: number): SalesDashboard {
  const trend = getRevenueTrend(days);
  return {
    days,
    kpi: getSalesKpi(days),
    breakdown: getRevenueBreakdown(days),
    conversion: getConversionStats(days),
    trend: trend.points,
    trendMax: trend.max,
    trendBucket: trend.bucket,
    topProducts: getTopProducts(days),
  };
}

/** Cheap headline figure for the home dashboard's Revenue card. */
export function getRevenueSnapshot(days = 30): { revenue: number; orders: number } {
  const k = paidKpi(`-${days} days`);
  return { revenue: k.revenue, orders: k.orders };
}
