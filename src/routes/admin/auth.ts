import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { verifyLogin, createFirstAdmin, adminExists } from '../../admin/auth';
import { renderAuth } from '../../admin/render';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return done();
    fastify.csrfProtection(req, reply, done);
  });

  const loginRateLimit = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  fastify.get('/login', loginPage);
  fastify.post('/login', loginRateLimit, loginSubmit);
  fastify.post('/logout', logout);
  fastify.get('/setup', setupPage);
  fastify.post('/setup', loginRateLimit, setupSubmit);
}

async function loginPage(req: FastifyRequest, reply: FastifyReply) {
  if (!adminExists()) return reply.redirect('/admin/setup');
  return reply.type('text/html').send(await renderAuth('login', { pageTitle: 'Sign in' }, reply));
}

async function loginSubmit(
  req: FastifyRequest<{ Body: { email: string; password: string } }>,
  reply: FastifyReply,
) {
  const { email, password } = req.body;
  const admin = await verifyLogin(email, password);
  if (!admin) {
    return reply.type('text/html').send(
      await renderAuth('login', { pageTitle: 'Sign in', error: 'Invalid email or password' }, reply),
    );
  }
  req.session.set('adminId', admin.id);
  return reply.redirect('/admin');
}

async function logout(req: FastifyRequest, reply: FastifyReply) {
  await req.session.destroy();
  return reply.redirect('/admin/login');
}

async function setupPage(req: FastifyRequest, reply: FastifyReply) {
  if (adminExists()) return reply.redirect('/admin/login');
  return reply.type('text/html').send(await renderAuth('setup', { pageTitle: 'Create admin account' }, reply));
}

async function setupSubmit(
  req: FastifyRequest<{ Body: { email: string; password: string; name: string } }>,
  reply: FastifyReply,
) {
  if (adminExists()) return reply.redirect('/admin/login');
  const { email, password, name } = req.body;

  if (!email || !password || password.length < 8) {
    return reply.type('text/html').send(
      await renderAuth('setup', {
        pageTitle: 'Create admin account',
        error: 'Email and password (min 8 chars) are required',
        values: { email, name },
      }, reply),
    );
  }

  try {
    await createFirstAdmin(email, password, name || email.split('@')[0]);
  } catch {
    // Someone else's concurrent setup submission won the race — not an error
    // from this requester's point of view, setup is simply already done.
    return reply.redirect('/admin/login');
  }
  return reply.redirect('/admin/login?setup=1');
}
