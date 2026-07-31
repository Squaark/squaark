import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAllSettings, setSetting, getSetting } from '../../db/queries/admin';
import { getAdminById } from '../../admin/auth';
import { saveStoreMedia, type StoreMediaSlot } from '../../admin/store-media';
import { exportStore, stageStoreImport } from '../../admin/store-transfer';
import { startUpdate, startRevert, readJob, revertAvailability } from '../../admin/self-update';
import { sendTestEmail } from '../../email/send';
import { listRecentEmailLog } from '../../db/queries/email';
import { listLogs } from '../../db/queries/system-log';
import { createReadStream } from 'fs';
import fs from 'fs';
import Handlebars from 'handlebars';

// Settings keys holding secrets: the form always renders these blank (see
// settings.hbs), so an empty submitted value means "left untouched" and must
// not overwrite the stored secret — only a non-empty value replaces it.
const SECRET_KEYS = new Set(['smtp_pass', 'resend_api_key', 'stripe_sk', 'stripe_webhook_secret', 'paypal_client_secret']);

function setSettingPreservingSecret(key: string, value: string): void {
  if (SECRET_KEYS.has(key) && value === '') return;
  setSetting(key, value);
}

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/settings', settingsPage);
  fastify.post('/settings', settingsSave);
  fastify.post('/settings/email', emailSettingsSave);
  fastify.post('/settings/email/test', sendTestEmailHandler);
  fastify.post('/settings/media/:slot', uploadMedia);
  fastify.post('/settings/payments', paymentSettingsSave);
  fastify.post('/settings/restart', restartServer);
  fastify.post('/settings/media/:slot/remove', removeMedia);
  fastify.post('/settings/tax', taxSettingsSave);
  fastify.get('/settings/export', exportStoreHandler);
  fastify.post('/settings/import', importStoreHandler);
  fastify.post('/settings/update', updateHandler);
  fastify.post('/settings/revert', revertHandler);
  fastify.get('/settings/update-status', updateStatusHandler);
}

async function updateHandler(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send(startUpdate());
}

async function revertHandler(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send(await startRevert());
}

async function updateStatusHandler(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ job: readJob(), revert: await revertAvailability(process.cwd()) });
}

async function settingsPage(req: FastifyRequest, reply: FastifyReply) {
  const admin = getAdminById(req.session.adminId!)!;
  return reply.type('text/html').send(
    await render('settings', {
      admin,
      settings: getAllSettings(),
      emailLog: listRecentEmailLog(50),
      paymentLog: listLogs('payment', 50),
      errorLog: listLogs('error', 50),
      pageTitle: 'Settings',
      pageSection: 'settings',
      saved: 'saved' in (req.query as Record<string, string>),
      updateJob: readJob(),
      revert: await revertAvailability(process.cwd()),
    }, reply),
  );
}

async function settingsSave(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const allowed = ['store_name', 'store_tagline', 'store_currency', 'store_url', 'store_email', 'store_timezone', 'cart_label'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key]);
  }
  // Checkbox — absent means unchecked
  setSetting('customer_accounts_enabled', req.body.customer_accounts_enabled === '1' ? '1' : '0');
  return reply.redirect('/admin/settings?saved=1#store');
}

async function emailSettingsSave(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const allowed = [
    'email_provider',
    'email_from_name',
    'email_from_address',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_secure',
    'resend_api_key',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSettingPreservingSecret(key, req.body[key]);
  }
  // Checkbox fields are omitted from the body entirely when unchecked.
  setSetting('smtp_secure', req.body.smtp_secure === 'on' || req.body.smtp_secure === '1' ? '1' : '0');

  return reply.redirect('/admin/settings?saved=1#email');

}

async function sendTestEmailHandler(
  req: FastifyRequest<{ Body: { to?: string } }>,
  reply: FastifyReply,
) {
  const admin = getAdminById(req.session.adminId!)!;
  const to = req.body?.to?.trim() || admin.email;

  try {
    await sendTestEmail(
      to,
      'Test email from your store',
      `<p>This is a test email sent from your store's admin settings.</p><p>If you're reading this, your email configuration is working.</p>`,
    );
    return reply.type('text/html').send(
      `<span class="text-green-600 text-sm">Test email sent to ${Handlebars.Utils.escapeExpression(to)}.</span>`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send test email';
    return reply.type('text/html').send(
      `<span class="text-red-600 text-sm">Failed: ${Handlebars.Utils.escapeExpression(message)}</span>`,
    );
  }
}

async function uploadMedia(
  req: FastifyRequest<{ Params: { slot: string } }>,
  reply: FastifyReply,
) {
  const slot = req.params.slot as StoreMediaSlot;
  if (slot !== 'logo' && slot !== 'icon') return reply.code(400).send('Invalid slot');

  const data = await req.file();
  if (!data) return reply.redirect('/admin/settings?error=no_file');

  try {
    const buf = await data.toBuffer();
    const existing = getSetting(`store_${slot}`) ?? '';
    const url = await saveStoreMedia(slot, buf, data.mimetype, existing);
    setSetting(`store_${slot}`, url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return reply.redirect(`/admin/settings?error=${encodeURIComponent(msg)}`);
  }

  return reply.redirect('/admin/settings?saved=1#media');
}

async function removeMedia(
  req: FastifyRequest<{ Params: { slot: string } }>,
  reply: FastifyReply,
) {
  const slot = req.params.slot as StoreMediaSlot;
  if (slot !== 'logo' && slot !== 'icon') return reply.code(400).send('Invalid slot');
  setSetting(`store_${slot}`, '');
  return reply.redirect('/admin/settings?saved=1#media');
}

async function paymentSettingsSave(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const allowed = ['stripe_pk', 'stripe_sk', 'stripe_webhook_secret', 'paypal_client_id', 'paypal_client_secret', 'paypal_mode'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSettingPreservingSecret(key, req.body[key]);
  }
  return reply.redirect('/admin/settings?saved=1#payments');

}

async function taxSettingsSave(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  setSetting('tax_enabled', req.body.tax_enabled === '1' ? '1' : '0');
  setSetting('tax_display_mode', ['inc', 'ex', 'both'].includes(req.body.tax_display_mode) ? req.body.tax_display_mode : 'inc');
  setSetting('tax_label', req.body.tax_label?.trim() || 'VAT');
  setSetting('tax_number', req.body.tax_number?.trim() || '');
  return reply.redirect('/admin/settings?saved=1#tax');
}

async function restartServer(_req: FastifyRequest, reply: FastifyReply) {
  reply.code(200).send({ ok: true });
  // Allow the response to flush before exiting — process manager handles the restart
  setTimeout(() => process.exit(0), 300);
}

async function exportStoreHandler(
  req: FastifyRequest<{ Querystring: { digital?: string } }>,
  reply: FastifyReply,
) {
  const includeDigitalFiles = req.query.digital === '1';
  const { zipPath, dir, filename } = await exportStore({ includeDigitalFiles });
  const stream = createReadStream(zipPath);
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  stream.on('close', cleanup);
  stream.on('error', cleanup);
  reply.header('Content-Type', 'application/zip');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(stream);
}

async function importStoreHandler(req: FastifyRequest, reply: FastifyReply) {
  // A whole-store export can be very large (all product images, digital files),
  // so lift the per-file limit well above the global multipart cap.
  const data = await req.file({ limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  if (!data) return reply.redirect('/admin/settings?error=No+file+uploaded#server');

  try {
    const buffer = await data.toBuffer();
    const { manifest } = await stageStoreImport(buffer);
    // The current DB is about to be replaced by the import, so log to stdout
    // (survives the restart) rather than the soon-to-be-overwritten DB.
    console.log('Store import staged — restarting to apply.', JSON.stringify(manifest.counts));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Import failed';
    return reply.redirect(`/admin/settings?error=${encodeURIComponent(msg)}#server`);
  }

  // Staged successfully — restart so pending-import applies it before the DB
  // reopens. Show a self-refreshing page since /admin is briefly unavailable.
  reply.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8">
<title>Importing store…</title><meta http-equiv="refresh" content="8; url=/admin">
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:6rem auto;padding:0 1.5rem;color:#374151;text-align:center}</style>
</head><body><h1 style="font-size:1.25rem">Importing your store…</h1>
<p>The server is restarting to apply the import. This page will reload automatically — if it doesn't, <a href="/admin">click here</a> in a few seconds.</p>
</body></html>`);
  setTimeout(() => process.exit(0), 600);
}
