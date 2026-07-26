import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifySession from '@fastify/session';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import config from './config';
import { runMigrations } from './db/migrate';
import { themeRegistry } from './theme/registry';
import { storefrontRoutes } from './routes/storefront/index';
import { adminRoutes } from './routes/admin/index';
import { ensureCart } from './commerce/cart';
import { writeLog } from './db/queries/system-log';
import { recordPageView } from './db/queries/analytics';
import { getSetting } from './db/queries/admin';

const BOT_UA = /bot|crawler|spider|scrapy|wget|curl|python|java|ruby|go-http|httpclient|libwww|okhttp|axios|node-fetch|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegram|discord|pingdom|uptimerobot|datadog|statuscake|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|yandex|baidu|duckduck|bingpreview|gptbot|claudebot|chatgpt/i;
const SKIP_PREFIX = ['/admin', '/public/', '/uploads/', '/webhooks'];
const SKIP_EXT   = /\.(js|css|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|map)$/i;

import './types';

async function build() {
  const fastify = Fastify({ logger: true });

  // ── Security headers ───────────────────────────────────────────────────────
  // SAMEORIGIN (not DENY) because the theme customiser embeds the storefront
  // preview in an iframe from the same origin — DENY would break that.
  // onSend hooks must return the payload unchanged or the response body is lost.
  fastify.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyFormbody);
  await fastify.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await fastify.register(fastifyCookie, { secret: config.sessionSecret });
  await fastify.register(fastifySession, {
    secret: config.sessionSecret,
    cookie: { secure: config.nodeEnv === 'production', httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    saveUninitialized: false,
  });
  await fastify.register(fastifyCsrf, { sessionPlugin: '@fastify/cookie' });

  await fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), 'public'),
    prefix: '/public/',
    decorateReply: false,
  });

  // Serve uploaded product images
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  await fastify.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ── Database ───────────────────────────────────────────────────────────────
  runMigrations();

  // ── Theme registry ─────────────────────────────────────────────────────────
  await themeRegistry.init(fastify);

  // ── Cart cookie hook ───────────────────────────────────────────────────────
  // Runs before every storefront handler; ensures req.cartId is always set.
  // Skips admin/static/webhook paths — those never need a cart, and without
  // this a cookie-less caller (bots, Stripe/PayPal webhook deliveries, plain
  // asset requests) would create a fresh, unbounded `carts` row on every hit.
  fastify.decorateRequest('cartId', '');
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];
    if (SKIP_PREFIX.some((p) => url.startsWith(p))) return;

    const existing = req.cookies.squaark_cart;
    const cartId = await ensureCart(existing);
    if (cartId !== existing) {
      reply.setCookie('squaark_cart', cartId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    req.cartId = cartId;
  });

  // ── Global error handler ───────────────────────────────────────────────────
  fastify.setErrorHandler((err, req, reply) => {
    writeLog('error', 'error', err.message || 'Unhandled error', {
      url: req.url,
      method: req.method,
      stack: err.stack?.split('\n').slice(0, 4).join(' | '),
      statusCode: err.statusCode,
    });
    fastify.log.error(err);
    const statusCode = err.statusCode ?? 500;
    // Full message logged above either way (visible to the operator under
    // Settings > Logs). Only what's sent to the CLIENT is redacted — an
    // unexpected 5xx in production may otherwise leak file paths, SQL
    // fragments, or other internal detail via err.message.
    const message = statusCode >= 500 && config.nodeEnv === 'production'
      ? 'Internal Server Error'
      : err.message;
    reply.code(statusCode).send({ error: message });
  });

  // ── Analytics page-view tracking ───────────────────────────────────────────
  fastify.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== 'GET') return;
    const status = reply.statusCode;
    if (status < 200 || status >= 300) return;
    const url = req.url.split('?')[0];
    if (SKIP_PREFIX.some((p) => url.startsWith(p))) return;
    if (SKIP_EXT.test(url)) return;
    const ua = req.headers['user-agent'] ?? '';
    if (BOT_UA.test(ua)) return;

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.ip ?? '0.0.0.0';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

    const rawRef = req.headers['referer'] ?? req.headers['referrer'] ?? '';
    let referrer: string | null = null;
    if (rawRef) {
      try {
        const refHost = new URL(rawRef as string).hostname;
        const storeUrl = getSetting('store_url') ?? 'http://localhost';
        const ownHost = new URL(storeUrl).hostname;
        if (refHost && refHost !== ownHost) referrer = refHost;
      } catch { /* malformed referrer — ignore */ }
    }

    recordPageView(url, referrer, ipHash);
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  await adminRoutes(fastify);
  await storefrontRoutes(fastify, themeRegistry);

  return fastify;
}

async function start() {
  const fastify = await build();
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`\n  Squaark storefront → http://localhost:${config.port}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
