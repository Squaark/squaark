import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { execute } from '../../src/db/connection';

const SECRET = 'a-shared-cloud-secret';

/**
 * Builds an app with only the cloud routes mounted.
 *
 * config.ts reads process.env once at import, so the module is re-imported per
 * test with vi.resetModules to exercise both the on and off states.
 */
/**
 * Applies an environment overlay, deleting keys explicitly set to undefined.
 *
 * `process.env.FOO = undefined` stores the STRING "undefined", which is truthy
 * and would make "unset" tests silently assert the wrong thing.
 */
function applyEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function buildApp(env: Record<string, string | undefined>): Promise<FastifyInstance> {
  const previous = { ...process.env };
  applyEnv(env);

  const { vi } = await import('vitest');
  vi.resetModules();
  const { cloudRoutes } = await import('../../src/routes/cloud');

  const app = Fastify();
  await cloudRoutes(app);
  await app.ready();

  process.env = previous;
  return app;
}

let app: FastifyInstance | null = null;

beforeEach(() => {
  execute('DELETE FROM products');
  execute('DELETE FROM admin_users');
});

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('GET /api/usage', () => {
  it('is not registered at all unless CLOUD_MODE is on', async () => {
    app = await buildApp({ CLOUD_MODE: undefined, CLOUD_SECRET: SECRET });

    // A self-hosted install gets no extra surface whatsoever.
    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns product and staff counts with a valid token', async () => {
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: SECRET });

    execute("INSERT INTO products (id, title, slug) VALUES ('p1', 'One', 'one')");
    execute("INSERT INTO products (id, title, slug) VALUES ('p2', 'Two', 'two')");
    execute("INSERT INTO admin_users (id, email, password_hash, name) VALUES ('a1', 'a@x.test', 'h', 'A')");

    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': SECRET },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ products: 2, staff: 1 });
    // Reported so the control plane can meter storage without reaching into
    // the tenant's files itself.
    expect(res.json().db_size).toBeGreaterThan(0);
  });

  it('accepts the legacy CLOUD_INTERNAL_TOKEN name', async () => {
    // A store provisioned before the rename keeps reporting usage until its
    // .env is refreshed.
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: undefined, CLOUD_INTERNAL_TOKEN: SECRET });

    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': SECRET },
    });
    expect(res.statusCode).toBe(200);
  });

  it('refuses a wrong secret', async () => {
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: SECRET });

    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': 'not-the-token' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuses a request with no token', async () => {
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: SECRET });

    const res = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(res.statusCode).toBe(404);
  });

  it('refuses everything when no token is configured, rather than defaulting open', async () => {
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: '' });

    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': '' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('reports zero for an empty store', async () => {
    app = await buildApp({ CLOUD_MODE: 'true', CLOUD_SECRET: SECRET });

    const res = await app.inject({
      method: 'GET', url: '/api/usage', headers: { 'x-cloud-secret': SECRET },
    });
    expect(res.json()).toMatchObject({ products: 0, staff: 0 });
  });
});
