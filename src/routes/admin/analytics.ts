import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { getSalesDashboard, SALES_RANGES } from '../../db/queries/sales-analytics';
import { getAnalyticsSummary } from '../../db/queries/analytics';
import { findOrders } from '../../db/queries/orders';

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/analytics', async (req: FastifyRequest<{ Querystring: { range?: string } }>, reply: FastifyReply) => {
    const requested = Number(req.query.range);
    const days = (SALES_RANGES as readonly number[]).includes(requested) ? requested : SALES_RANGES[1];

    const sales = getSalesDashboard(days);
    const traffic = getAnalyticsSummary();
    const recentOrders = findOrders(8, 0);

    return reply.type('text/html').send(
      await render('analytics/index', {
        admin: getAdminById(req.session.adminId!)!,
        settings: getAllSettings(),
        pageTitle: 'Analytics',
        pageSection: 'analytics',
        sales,
        traffic,
        recentOrders,
        ranges: SALES_RANGES.map((d) => ({ days: d, active: d === days })),
      }, reply),
    );
  });
}
