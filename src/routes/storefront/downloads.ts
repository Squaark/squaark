import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { findDownloadByToken, incrementDownloadCount } from '../../db/queries/downloads';
import config from '../../config';

export async function downloadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/downloads/:token', async (req, reply) => {
    const { token } = req.params as { token: string };

    const download = findDownloadByToken(token);
    if (!download) return reply.code(404).type('text/html').send('<h1>Download not found</h1>');

    if (download.expires_at && new Date(download.expires_at) < new Date()) {
      return reply.code(410).type('text/html').send('<h1>This download link has expired</h1>');
    }

    if (download.max_downloads != null && download.download_count >= download.max_downloads) {
      return reply.code(410).type('text/html').send('<h1>Download limit reached</h1>');
    }

    const filePath = path.join(config.digitalFilesDir, download.filename);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).type('text/html').send('<h1>File not found</h1>');
    }

    incrementDownloadCount(download.id);

    const stat = fs.statSync(filePath);
    return reply
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(download.original_name)}"`)
      .header('Content-Length', stat.size)
      .type('application/octet-stream')
      .send(fs.createReadStream(filePath));
  });
}
