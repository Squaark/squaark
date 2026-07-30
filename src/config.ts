import 'dotenv/config';
import path from 'path';

const DEV_DEFAULT_SESSION_SECRET = 'dev-secret-change-in-production-min32chars!';
// Known placeholder values ever shipped in this repo (config.ts's own
// fallback, plus .env.example's) — all equally public/guessable, so all must
// be rejected in production, not just whichever one config.ts happens to
// default to internally.
const KNOWN_PLACEHOLDER_SECRETS = new Set([DEV_DEFAULT_SESSION_SECRET, 'change-me-in-production']);

const databasePath = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'data/store.db');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  themeDir: path.resolve(process.cwd(), process.env.THEME_DIR || 'themes/linen'),
  uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads'),
  sessionSecret: process.env.SESSION_SECRET || DEV_DEFAULT_SESSION_SECRET,
  databasePath,
  // Deliberately NOT under uploadsDir — that whole tree is served publicly,
  // unauthenticated, by @fastify/static (see server.ts). Digital product
  // files must only ever be reachable through the signed, expiring
  // /downloads/:token route, never a raw static path. Defaults to living
  // next to the database so it's covered by the same persistent volume
  // without any extra Docker/compose configuration.
  digitalFilesDir: process.env.DIGITAL_FILES_DIR
    ? path.resolve(process.cwd(), process.env.DIGITAL_FILES_DIR)
    : path.join(path.dirname(databasePath), 'digital-files'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  paypalMode: (process.env.PAYPAL_MODE || 'sandbox') as 'sandbox' | 'live',
};

// Every placeholder here is checked into this open-source repo, so anyone
// who's read the source could forge session cookies / CSRF tokens for any
// deployment that forgot to override it. Fail loudly rather than silently
// running an internet-facing store with a publicly-known signing secret.
if (config.nodeEnv === 'production' && (!process.env.SESSION_SECRET || KNOWN_PLACEHOLDER_SECRETS.has(config.sessionSecret))) {
  throw new Error(
    'SESSION_SECRET is not set (or is still a placeholder value from this repo) while ' +
    'NODE_ENV=production. Set a strong, random SESSION_SECRET before running in production — ' +
    'generate one with `openssl rand -hex 32`.',
  );
}

export default config;
