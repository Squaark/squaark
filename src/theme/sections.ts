/**
 * Section registry — the catalogue of page-builder sections and their settings.
 *
 * The *core* owns this schema (what a section is and which settings it has); each
 * *theme* owns how it looks, by shipping a matching `partials/sections/<type>.hbs`.
 * Keeping the schema central (rather than per-theme, Shopify-style) means a saved
 * section document renders in any theme and the admin editor is theme-agnostic.
 *
 * Adding a new section is therefore two files and no plumbing: an entry here plus
 * a partial in each theme. The admin form, defaults, validation and the storefront
 * dispatch (`renderSection`) all read from this list.
 */

import { randomUUID } from 'crypto';

export type FieldType =
  | 'text'      // single-line text input
  | 'textarea'  // multi-line plain text
  | 'html'      // multi-line HTML (rendered through sanitized_html)
  | 'image'     // uploaded image (stores a URL); editor shows an upload widget
  | 'url'       // link/path text input
  | 'select'    // one of a fixed set of options
  | 'checkbox'  // boolean
  | 'color';    // a CSS colour — a hex, or a site-colour token like var(--color-accent)

export interface SectionField {
  id: string;                 // settings key (stored at the top level of the section)
  type: FieldType;
  label: string;
  optional?: boolean;         // UI hint only — shows an "optional" marker
  help?: string;
  placeholder?: string;
  default?: string | boolean;
  rows?: number;              // textarea/html height
  options?: { value: string; label: string }[]; // select
}

export interface SectionSchema {
  type: string;               // matches the partial name: sections/<type>
  name: string;               // label in the "Add section" menu + card header
  fields: SectionField[];
}

// Order here is the order sections appear in the "Add section" menu.
const SECTION_SCHEMAS: SectionSchema[] = [
  {
    type: 'hero',
    name: 'Hero',
    fields: [
      { id: 'heading',     type: 'text',     label: 'Heading', default: 'Welcome', placeholder: 'Big headline' },
      { id: 'subheading',  type: 'textarea', label: 'Subheading', optional: true, rows: 2 },
      { id: 'src',         type: 'image',    label: 'Background / feature image', optional: true },
      { id: 'alt',         type: 'text',     label: 'Image alt text', optional: true },
      { id: 'buttonLabel', type: 'text',     label: 'Button label', optional: true, placeholder: 'Shop now' },
      { id: 'buttonUrl',   type: 'url',      label: 'Button URL', default: '/collections/all' },
      { id: 'align',       type: 'select',   label: 'Alignment', default: 'left',
        options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }] },
      { id: 'bgColor',     type: 'color',    label: 'Background colour', optional: true,
        help: 'Overrides the theme default. Pick a site colour or a custom one.' },
      { id: 'textColor',   type: 'color',    label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'text',
    name: 'Text',
    fields: [
      { id: 'content', type: 'html', label: 'Content', rows: 8, placeholder: '<p>Your text here…</p>' },
    ],
  },
  {
    type: 'image',
    name: 'Image',
    fields: [
      { id: 'src',     type: 'image', label: 'Image' },
      { id: 'alt',     type: 'text',  label: 'Alt text', placeholder: 'Describe the image' },
      { id: 'caption', type: 'text',  label: 'Caption', optional: true },
    ],
  },
  {
    type: 'image_text',
    name: 'Image + Text',
    fields: [
      { id: 'src',           type: 'image',  label: 'Image' },
      { id: 'alt',           type: 'text',   label: 'Alt text' },
      { id: 'imagePosition', type: 'select', label: 'Image position', default: 'left',
        options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
      { id: 'content',       type: 'html',   label: 'Text content', rows: 6, placeholder: '<p>Your text here…</p>' },
    ],
  },
  {
    type: 'cta',
    name: 'Call to Action',
    fields: [
      { id: 'heading',     type: 'text',     label: 'Heading', placeholder: 'Ready to get started?' },
      { id: 'body',        type: 'textarea', label: 'Body text', rows: 3, placeholder: 'Supporting paragraph…' },
      { id: 'buttonLabel', type: 'text',     label: 'Button label', default: 'Shop Now' },
      { id: 'buttonUrl',   type: 'url',      label: 'Button URL', default: '/collections/all' },
      { id: 'align',       type: 'select',   label: 'Alignment', default: 'center',
        options: [{ value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }] },
    ],
  },
  {
    type: 'columns',
    name: 'Two Columns',
    fields: [
      { id: 'leftContent',  type: 'html', label: 'Left column',  rows: 8, placeholder: '<p>Left column…</p>' },
      { id: 'rightContent', type: 'html', label: 'Right column', rows: 8, placeholder: '<p>Right column…</p>' },
    ],
  },
];

const SCHEMA_BY_TYPE = new Map(SECTION_SCHEMAS.map((s) => [s.type, s]));

/**
 * A colour setting is injected into an inline `style`, so it must be locked to a
 * safe shape or it's a CSS-injection vector. Allow only a hex colour or a
 * site-colour custom-property reference (`var(--color-...)`); anything else → ''.
 */
export function sanitizeColor(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^var\(--color-[a-z-]+\)$/.test(s)) return s;
  return '';
}

export function listSectionSchemas(): SectionSchema[] {
  return SECTION_SCHEMAS;
}

export function getSectionSchema(type: string): SectionSchema | undefined {
  return SCHEMA_BY_TYPE.get(type);
}

/** The default settings object for a section type (from each field's `default`). */
export function sectionDefaults(type: string): Record<string, string | boolean> {
  const schema = SCHEMA_BY_TYPE.get(type);
  if (!schema) return {};
  const out: Record<string, string | boolean> = {};
  for (const f of schema.fields) {
    out[f.id] = f.default ?? (f.type === 'checkbox' ? false : '');
  }
  return out;
}

export interface StoredSection {
  id: string;
  type: string;
  [key: string]: string | boolean;
}

/**
 * Normalises a raw sections payload from the editor into clean, storable data:
 * drops unknown section types, keeps only settings declared in the schema
 * (whitelist — junk/unexpected keys never reach the DB), coerces each value to
 * its field's type, and fills in defaults for anything missing. This is the
 * server-side guarantee that stored section data always matches the schema,
 * whatever the client sends.
 */
export function sanitizeSections(raw: unknown): StoredSection[] {
  let arr: unknown[];
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw || '[]'); } catch { return []; }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out: StoredSection[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const type = String(e.type ?? '');
    const schema = SCHEMA_BY_TYPE.get(type);
    if (!schema) continue; // unknown type → dropped

    const section: StoredSection = {
      id: typeof e.id === 'string' && e.id ? e.id : randomUUID(),
      type,
    };
    for (const f of schema.fields) {
      const v = e[f.id];
      if (f.type === 'checkbox') {
        section[f.id] = v === true || v === 'true' || v === 'on' || v === '1';
      } else if (f.type === 'color') {
        section[f.id] = sanitizeColor(v);
      } else {
        section[f.id] = v == null ? (typeof f.default === 'string' ? f.default : '') : String(v);
      }
    }
    out.push(section);
  }
  return out;
}
