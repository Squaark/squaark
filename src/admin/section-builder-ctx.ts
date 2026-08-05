import { listSectionSchemas } from '../theme/sections';
import { themeRegistry } from '../theme/registry';
import { findAllCollections } from '../db/queries/collections';
import { findAllReusable } from '../db/queries/reusable-sections';

// Schemas are static — serialise once, single-quote-escaped for the data-attr.
const SECTION_SCHEMAS_SAFE = JSON.stringify(listSectionSchemas()).replace(/'/g, '&#39;');

/**
 * The palette offered by `color` fields: the live theme brand colours (stored as
 * `var(--color-*)` tokens so a section follows a later brand-colour change) plus
 * black/white. Built per request since theme colours can change.
 */
function siteColorsSafe(): string {
  const colors = (themeRegistry.currentThemeConfig?.colors ?? {}) as Record<string, string>;
  const list: { label: string; value: string; hex: string }[] = [];
  if (colors.accent)     list.push({ label: 'Highlight', value: 'var(--color-accent)',     hex: colors.accent });
  if (colors.primary)    list.push({ label: 'Primary',   value: 'var(--color-primary)',    hex: colors.primary });
  if (colors.background) list.push({ label: 'Background', value: 'var(--color-background)', hex: colors.background });
  list.push({ label: 'White', value: '#ffffff', hex: '#ffffff' });
  list.push({ label: 'Dark',  value: '#111827', hex: '#111827' });
  return JSON.stringify(list).replace(/'/g, '&#39;');
}

/** The store's collections, for `collection` fields' dropdown. */
function collectionsSafe(): string {
  const cols = findAllCollections().map((c) => ({ slug: c.slug, title: c.title }));
  return JSON.stringify(cols).replace(/'/g, '&#39;');
}

/** The saved reusable blocks, for `block` fields' dropdown. `exclude` drops the
 *  block currently being edited so it can't reference itself. */
function blocksSafe(exclude?: string): string {
  const blocks = findAllReusable()
    .filter((b) => b.id !== exclude)
    .map((b) => ({ id: b.id, name: b.name }));
  return JSON.stringify(blocks).replace(/'/g, '&#39;');
}

/**
 * Everything the shared `section-builder` partial needs, ready to spread into a
 * render context. `uploadUrl`/`canUpload` point image uploads at the right host
 * endpoint; `legacy` shows the plain-HTML content fallback (pages only).
 */
export function sectionBuilderVars(opts: {
  uploadUrl: string;
  canUpload: boolean;
  previewUrl?: string;
  legacy?: boolean;
  legacyContent?: string;
  excludeBlock?: string;   // a block editing itself shouldn't list itself
}): Record<string, unknown> {
  return {
    sectionSchemasSafe: SECTION_SCHEMAS_SAFE,
    siteColorsSafe: siteColorsSafe(),
    collectionsSafe: collectionsSafe(),
    blocksSafe: blocksSafe(opts.excludeBlock),
    builderUploadUrl: opts.uploadUrl,
    builderCanUpload: opts.canUpload ? 'true' : 'false',
    builderPreviewUrl: opts.previewUrl ?? '',
    builderLegacy: opts.legacy ? true : false,
    builderLegacyContent: opts.legacyContent ?? '',
  };
}
