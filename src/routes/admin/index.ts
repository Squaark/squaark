import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { verifyLogin, getAdminById, adminExists } from '../../admin/auth';
import { render } from '../../admin/render';
import { authRoutes } from './auth';
import { productRoutes } from './products';
import { collectionRoutes } from './collections';
import { pageRoutes } from './pages';
import { orderRoutes } from './orders';
import { settingsRoutes } from './settings';
import { themeRoutes } from './themes';
import { emailRoutes } from './emails';
import { importRoutes } from './import';
import { navigationRoutes } from './navigation';
import { usersRoutes } from './users';
import { shippingRoutes } from './shipping';
import { countOrders } from '../../db/queries/orders';
import { getAllSettings } from '../../db/queries/admin';
import { queryOne } from '../../db/connection';
import { getAnalyticsSummary } from '../../db/queries/analytics';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Auth routes don't need the guard
  await fastify.register(authRoutes, { prefix: '/admin' });

  const ADMIN_ONLY_PATHS = ['/admin/settings', '/admin/import', '/admin/themes', '/admin/emails', '/admin/navigation', '/admin/users'];

  // Guard: every /admin/* route below requires a session
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/admin')) return;
    if (req.url.startsWith('/admin/login') || req.url.startsWith('/admin/setup')) return;

    const adminId = req.session.adminId;
    const admin = adminId ? getAdminById(adminId) : null;
    if (!admin) return reply.redirect('/admin/login');

    if (admin.role === 'staff' && ADMIN_ONLY_PATHS.some(p => req.url.startsWith(p))) {
      return reply.redirect('/admin');
    }
  });

  await fastify.register(
    async (app) => {
      app.get('/', dashboardHandler);
      await app.register(productRoutes);
      await app.register(collectionRoutes);
      await app.register(pageRoutes);
      await app.register(orderRoutes);
      await app.register(settingsRoutes);
      await app.register(themeRoutes);
      await app.register(emailRoutes);
      await app.register(importRoutes);
      await app.register(navigationRoutes);
      await app.register(usersRoutes);
      await app.register(shippingRoutes);
    },
    { prefix: '/admin' },
  );
}

async function dashboardHandler(req: FastifyRequest, reply: FastifyReply) {
  const adminId = req.session.adminId!;
  const admin = getAdminById(adminId)!;
  const settings = getAllSettings();
  const orderCount = countOrders();
  const productCount = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products')?.n ?? 0;
  const analytics = getAnalyticsSummary();

  return reply.type('text/html').send(
    render('dashboard', {
      admin,
      settings,
      stats: { orderCount, productCount },
      isEmpty: productCount === 0,
      analytics,
      pageTitle: 'Dashboard',
    }),
  );
}
