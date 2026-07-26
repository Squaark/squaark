import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import path from 'path';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import {
  findAllThemes, findThemeById, activateTheme, saveConfigOverrides,
} from '../../db/queries/themes';
import { loadManifest, resolveConfig, type ConfigField, type ThemeManifest } from '../../theme/config';
import { findAllCollections } from '../../db/queries/collections';
import { themeRegistry } from '../../theme/registry';
import { installThemeFromZip } from '../../admin/themes';
import { saveThemeImage } from '../../admin/store-media';

export async function themeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/themes', listThemes);
  fastify.post<{ Params: { id: string } }>('/themes/:id/activate', (req, reply) => activateHandler(fastify, req, reply));
  fastify.get('/themes/:id/config', configPage);
  fastify.post<{ Params: { id: string }; Body: Record<string, string> }>('/themes/:id/config', (req, reply) => configSave(fastify, req, reply));
  fastify.post<{ Params: { id: string }; Body: Record<string, string> }>('/themes/:id/preview-apply', previewApply);
  fastify.post<{ Params: { id: string; field: string } }>('/themes/:id/config/image/:field', (req, reply) => uploadThemeImage(fastify, req, reply));
  fastify.post<{ Params: { id: string; field: string } }>('/themes/:id/config/image/:field/remove', (req, reply) => removeThemeImage(fastify, req, reply));
  fastify.post('/themes/upload', uploadTheme);
}

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

async function listThemes(req: FastifyRequest, reply: FastifyReply) {
  const themes = findAllThemes();
  return reply.type('text/html').send(
    await render('themes/list', { ...adminCtx(req), themes, pageTitle: 'Themes', pageSection: 'themes' }, reply),
  );
}

async function activateHandler(
  fastify: FastifyInstance,
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme) return reply.code(404).send('Not found');
  activateTheme(theme.id);
  await themeRegistry.reload(fastify);
  return reply.redirect('/admin/themes?activated=1');
}

// Maps flat config keys to CSS custom property names — used by the live preview
const CSS_VAR_MAP: Record<string, string> = {
  'colors.primary':          '--color-primary',
  'colors.accent':           '--color-accent',
  'colors.background':       '--color-background',
  'colors.headerBackground': '--color-header',
  'colors.headerText':       '--color-header-text',
  'colors.heroBackground':   '--color-hero',
  'typography.headingFont':  '--font-heading',
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rebuilds a repeater field's rows from bracket-indexed form fields, e.g. "layout.featuredSections[0][title]". */
function parseRepeaterRows(
  body: Record<string, string>,
  flatKey: string,
  itemFields: Record<string, ConfigField>,
): Record<string, unknown>[] {
  const pattern = new RegExp(`^${escapeRegExp(flatKey)}\\[(\\d+)\\]\\[([^\\]]+)\\]$`);
  const rowsByIndex = new Map<number, Record<string, unknown>>();
  for (const [bodyKey, val] of Object.entries(body)) {
    const match = bodyKey.match(pattern);
    if (!match) continue;
    const [, indexStr, itemKey] = match;
    if (!(itemKey in itemFields)) continue;
    const row = rowsByIndex.get(Number(indexStr)) ?? {};
    row[itemKey] = val;
    rowsByIndex.set(Number(indexStr), row);
  }
  return [...rowsByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => {
      const complete: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(itemFields)) {
        complete[key] = row[key] ?? field.default;
      }
      return complete;
    });
}

/** Merges submitted form fields into `overrides` in place, following the manifest's field types. */
function applyOverridesFromBody(
  manifest: ThemeManifest,
  body: Record<string, string>,
  overrides: Record<string, unknown>,
): void {
  for (const [section, fields] of Object.entries(manifest.config ?? {})) {
    for (const [key, field] of Object.entries(fields)) {
      if (field.type === 'image') continue; // images are managed via their own upload endpoints
      const flat = `${section}.${key}`;
      if (field.type === 'repeater') {
        overrides[flat] = parseRepeaterRows(body, flat, field.itemFields ?? {});
        continue;
      }
      const val = body[flat];
      if (val !== undefined) {
        overrides[flat] = field.type === 'boolean' ? val === 'true' : val;
      } else if (field.type === 'boolean') {
        overrides[flat] = false;
      }
    }
  }
}

/** Builds the row/cell view-model a repeater field needs to render in the customiser. */
function buildRepeaterView(
  flatKey: string,
  field: ConfigField,
  value: unknown,
  collections: Array<{ slug: string; title: string }> = [],
) {
  const rowsData = Array.isArray(value) ? value : [];
  const itemFields = field.itemFields ?? {};
  const containerId = `repeater-${flatKey.replace(/\./g, '-')}`;
  const rows = rowsData.map((rowValue, index) => ({
    cells: Object.entries(itemFields).map(([itemKey, itemField]) => ({
      type: itemField.type,
      label: itemField.label,
      options: itemField.options,
      collectionOptions: itemField.type === 'collection' ? collections : undefined,
      value: (rowValue as Record<string, unknown>)?.[itemKey] ?? itemField.default,
      name: `${flatKey}[${index}][${itemKey}]`,
    })),
  }));
  const itemFieldsForJs = Object.fromEntries(
    Object.entries(itemFields).map(([itemKey, f]) => [itemKey, { type: f.type, label: f.label, options: f.options, default: f.default }]),
  );
  return { containerId, rows, nextIndex: rowsData.length, itemFieldsJson: JSON.stringify(itemFieldsForJs) };
}

async function configPage(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { saved?: string; error?: string } }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));

  const themeDir = path.resolve(process.cwd(), theme.directory);
  const manifest = loadManifest(themeDir);
  const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
  const resolved = resolveConfig(manifest, overrides);

  // Reset any unsaved preview state back to persisted DB config when opening the editor
  if (theme.active === 1) themeRegistry.applyPreview(overrides);

  const allCollections = findAllCollections().map(c => ({ slug: c.slug, title: c.title }));

  const sections = Object.entries(manifest.config ?? {}).map(([sectionName, fields]) => ({
    name: sectionName,
    fields: Object.entries(fields).map(([key, field]) => {
      const flatKey = `${sectionName}.${key}`;
      const value = resolved[flatKey] ?? field.default;
      const base = {
        ...field,
        key,
        flatKey,
        value,
        cssVar: CSS_VAR_MAP[flatKey] ?? null,
        cssVarIsFont: (CSS_VAR_MAP[flatKey] ?? '').startsWith('--font-'),
      };
      return field.type === 'repeater' ? { ...base, ...buildRepeaterView(flatKey, field, value, allCollections) } : base;
    }),
  }));

  return reply.type('text/html').send(
    await render('themes/config', {
      ...adminCtx(req),
      theme, manifest, resolved, sections,
      // Escape '<' so a collection title containing "</script>" (writable by
      // the lower-privileged staff role) can't prematurely close this inline
      // <script> block and inject arbitrary markup — the HTML parser sees
      // this before the JS engine ever does, so JSON.stringify alone isn't
      // enough to make this safe to embed via {{{ }}}.
      collectionsJson: JSON.stringify(allCollections).replace(/</g, '\\u003c'),
      saved: 'saved' in (req.query as Record<string, string>),
      error: (req.query as Record<string, string>).error ?? null,
      pageTitle: `${theme.name} — Customise`,
      pageSection: 'themes',
      fullWidth: true,
    }, reply),
  );
}

async function configSave(
  fastify: FastifyInstance,
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme) return reply.code(404).send('Not found');

  const themeDir = path.resolve(process.cwd(), theme.directory);
  const manifest = loadManifest(themeDir);

  // Start from existing overrides so image uploads are preserved
  const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
  applyOverridesFromBody(manifest, req.body, overrides);

  saveConfigOverrides(theme.id, overrides);

  // If this is the active theme, refresh vars immediately
  if (theme.active === 1) await themeRegistry.reload(fastify);

  return reply.redirect(`/admin/themes/${theme.id}/config?saved=1`);
}

/** Applies config to the in-memory registry without persisting — powers the live preview. */
async function previewApply(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme || theme.active !== 1) return reply.code(204).send();

  const themeDir = path.resolve(process.cwd(), theme.directory);
  const manifest = loadManifest(themeDir);

  const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
  applyOverridesFromBody(manifest, req.body, overrides);

  themeRegistry.applyPreview(overrides);
  return reply.code(204).send();
}

async function uploadThemeImage(
  fastify: FastifyInstance,
  req: FastifyRequest<{ Params: { id: string; field: string } }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme) return reply.code(404).send('Not found');

  const data = await req.file();
  if (!data) return reply.redirect(`/admin/themes/${req.params.id}/config?error=no_file`);

  try {
    const buf = await data.toBuffer();
    const url = await saveThemeImage(req.params.field, buf, data.mimetype, theme.slug);
    const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
    overrides[req.params.field] = url;
    saveConfigOverrides(theme.id, overrides);
    if (theme.active === 1) await themeRegistry.reload(fastify);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return reply.redirect(`/admin/themes/${req.params.id}/config?error=${encodeURIComponent(msg)}`);
  }

  return reply.redirect(`/admin/themes/${req.params.id}/config?saved=1`);
}

async function removeThemeImage(
  fastify: FastifyInstance,
  req: FastifyRequest<{ Params: { id: string; field: string } }>,
  reply: FastifyReply,
) {
  const theme = findThemeById(req.params.id);
  if (!theme) return reply.code(404).send('Not found');
  const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
  overrides[req.params.field] = '';
  saveConfigOverrides(theme.id, overrides);
  if (theme.active === 1) await themeRegistry.reload(fastify);
  return reply.redirect(`/admin/themes/${req.params.id}/config`);
}

async function uploadTheme(req: FastifyRequest, reply: FastifyReply) {
  const data = await req.file();
  if (!data) return reply.redirect('/admin/themes?error=no_file');

  try {
    const buf = await data.toBuffer();
    const result = await installThemeFromZip(buf);
    return reply.redirect(`/admin/themes?installed=${result.name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return reply.redirect(`/admin/themes?error=${encodeURIComponent(msg)}`);
  }
}
