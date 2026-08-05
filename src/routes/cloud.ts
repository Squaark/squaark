import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import fs from 'fs';
import config from '../config';
import { queryOne } from '../db/connection';
import { countAdminUsers } from '../db/queries/admin';

/**
 * Endpoints for a managed (Squaark Cloud) deployment.
 *
 * Only registered when CLOUD_MODE=true, so a self-hosted install has no extra
 * surface at all — these routes simply do not exist there.
 */
export async function cloudRoutes(fastify: FastifyInstance): Promise<void> {
  if (!config.cloudMode) return;

  /**
   * Usage counts for the control plane's hourly metering sweep.
   *
   * Authenticated with X-Cloud-Secret, the shared secret the control plane
   * writes into this store's .env, compared in constant time. With no secret
   * configured the endpoint refuses everything rather than defaulting open.
   */
  fastify.get('/api/usage', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authorised(req)) return reply.code(404).send({ error: 'Not found' });

    const products = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products');
    return reply.send({
      products: products?.n ?? 0,
      staff: countAdminUsers(),
      db_size: databaseSize(),
    });
  });
}

/**
 * Size of this store's SQLite database on disk, in bytes.
 *
 * Includes the -wal and -shm sidecars: in WAL mode a busy store can hold
 * megabytes of committed data in the write-ahead log that has not been
 * checkpointed back into the main file yet, and ignoring it would under-report
 * exactly when the store is busiest.
 */
function databaseSize(): number {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += fs.statSync(`${config.databasePath}${suffix}`).size;
    } catch {
      // Sidecars only exist while the database is open.
    }
  }
  return total;
}

function authorised(req: FastifyRequest): boolean {
  const expected = config.cloudSecret;
  if (!expected) return false;

  const provided = req.headers['x-cloud-secret'];
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;

  // Constant time, so a wrong token cannot be recovered by measuring how long
  // the comparison took.
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
