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
  | 'color'     // a CSS colour — a hex, or a site-colour token like var(--color-accent)
  | 'collection'// a collection slug, chosen from a dropdown of the store's collections
  | 'repeater'  // an ordered list of sub-items, each with its own itemFields (one level deep)
  | 'block';    // a reusable-section id, chosen from a dropdown of saved blocks

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
  itemFields?: SectionField[];// repeater — the sub-fields of each item (no nested repeaters)
  itemLabel?: string;         // repeater — singular label, e.g. "Slide"
}

export interface SectionSchema {
  type: string;               // matches the partial name: sections/<type>
  name: string;               // label in the "Add section" menu + card header
  fields: SectionField[];
}

// Order here is the order sections appear in the "Add section" menu.
const SECTION_SCHEMAS: SectionSchema[] = [
  {
    type: 'reusable',
    name: 'Reusable block',
    fields: [
      { id: 'block', type: 'block', label: 'Block',
        help: 'Insert a saved reusable block. Edit the block to update it everywhere.' },
    ],
  },
  {
    type: 'hero',
    name: 'Hero',
    fields: [
      { id: 'eyebrow',     type: 'text',     label: 'Eyebrow', optional: true, placeholder: 'Small label above the heading' },
      { id: 'heading',     type: 'text',     label: 'Heading', default: 'Welcome', placeholder: 'Big headline' },
      { id: 'subheading',  type: 'textarea', label: 'Subheading', optional: true, rows: 2 },
      { id: 'src',         type: 'image',    label: 'Image', optional: true },
      { id: 'alt',         type: 'text',     label: 'Image alt text', optional: true },
      { id: 'imageStyle',  type: 'select',   label: 'Image style', default: 'background',
        options: [{ value: 'background', label: 'Full background' }, { value: 'image-left', label: 'Beside text (left)' }, { value: 'image-right', label: 'Beside text (right)' }] },
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
    type: 'featured_products',
    name: 'Featured products',
    fields: [
      { id: 'heading',    type: 'text',       label: 'Heading', default: 'Featured products' },
      { id: 'collection', type: 'collection', label: 'Collection', optional: true,
        help: 'Leave blank to show featured products from across the store.' },
      { id: 'count',      type: 'select',     label: 'How many', default: '8',
        options: [{ value: '4', label: '4' }, { value: '8', label: '8' }, { value: '12', label: '12' }] },
      { id: 'columns',    type: 'select',     label: 'Columns', default: '4',
        options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
      { id: 'bgColor',    type: 'color',      label: 'Background colour', optional: true,
        help: 'Give the section a background to set it apart from those around it.' },
      { id: 'textColor',  type: 'color',      label: 'Heading colour', optional: true },
    ],
  },
  {
    type: 'text',
    name: 'Text',
    fields: [
      { id: 'content', type: 'html', label: 'Content', rows: 8, placeholder: '<p>Your text here…</p>' },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'image',
    name: 'Image',
    fields: [
      { id: 'src',     type: 'image', label: 'Image' },
      { id: 'alt',     type: 'text',  label: 'Alt text', placeholder: 'Describe the image' },
      { id: 'caption', type: 'text',  label: 'Caption', optional: true },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Caption colour', optional: true },
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
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
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
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true, help: 'Defaults to your primary colour.' },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'columns',
    name: 'Two Columns',
    fields: [
      { id: 'leftContent',  type: 'html', label: 'Left column',  rows: 8, placeholder: '<p>Left column…</p>' },
      { id: 'rightContent', type: 'html', label: 'Right column', rows: 8, placeholder: '<p>Right column…</p>' },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'gallery',
    name: 'Gallery',
    fields: [
      { id: 'heading', type: 'text',   label: 'Heading', optional: true },
      { id: 'columns', type: 'select', label: 'Columns', default: '3',
        options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
      { id: 'images',  type: 'repeater', label: 'Images', itemLabel: 'Image', itemFields: [
        { id: 'image',   type: 'image', label: 'Image' },
        { id: 'alt',     type: 'text',  label: 'Alt text', optional: true },
        { id: 'caption', type: 'text',  label: 'Caption', optional: true },
      ] },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Heading colour', optional: true },
    ],
  },
  {
    type: 'testimonials',
    name: 'Testimonials',
    fields: [
      { id: 'heading', type: 'text', label: 'Heading', optional: true, default: 'What our customers say' },
      { id: 'items',   type: 'repeater', label: 'Testimonials', itemLabel: 'Testimonial', itemFields: [
        { id: 'quote',  type: 'textarea', label: 'Quote', rows: 3 },
        { id: 'author', type: 'text',     label: 'Author' },
        { id: 'role',   type: 'text',     label: 'Role / company', optional: true },
        { id: 'image',  type: 'image',    label: 'Avatar', optional: true },
      ] },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'logo_row',
    name: 'Logo row',
    fields: [
      { id: 'heading', type: 'text', label: 'Heading', optional: true, placeholder: 'As seen in' },
      { id: 'logos',   type: 'repeater', label: 'Logos', itemLabel: 'Logo', itemFields: [
        { id: 'image', type: 'image', label: 'Logo image' },
        { id: 'alt',   type: 'text',  label: 'Name / alt text', optional: true },
        { id: 'url',   type: 'url',   label: 'Link', optional: true },
      ] },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Heading colour', optional: true },
    ],
  },
  {
    type: 'slideshow',
    name: 'Slideshow',
    fields: [
      { id: 'slides', type: 'repeater', label: 'Slides', itemLabel: 'Slide', itemFields: [
        { id: 'image',       type: 'image',    label: 'Image' },
        { id: 'heading',     type: 'text',     label: 'Heading', optional: true },
        { id: 'subheading',  type: 'textarea', label: 'Subheading', optional: true, rows: 2 },
        { id: 'buttonLabel', type: 'text',     label: 'Button label', optional: true },
        { id: 'buttonUrl',   type: 'url',      label: 'Button URL', optional: true },
      ] },
      { id: 'autoplay', type: 'checkbox', label: 'Auto-advance', help: 'Advance slides automatically' },
    ],
  },
  {
    type: 'faq',
    name: 'FAQ',
    fields: [
      { id: 'heading', type: 'text', label: 'Heading', optional: true, default: 'Frequently asked questions' },
      { id: 'items',   type: 'repeater', label: 'Questions', itemLabel: 'Question', itemFields: [
        { id: 'question', type: 'text', label: 'Question' },
        { id: 'answer',   type: 'html', label: 'Answer', rows: 3 },
      ] },
      { id: 'bgColor',   type: 'color', label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color', label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'newsletter',
    name: 'Newsletter',
    fields: [
      { id: 'heading',     type: 'text',     label: 'Heading', default: 'Join our newsletter' },
      { id: 'body',        type: 'textarea', label: 'Body text', optional: true, rows: 2, default: 'Sign up for occasional updates and offers.' },
      { id: 'buttonLabel', type: 'text',     label: 'Button label', default: 'Subscribe' },
      { id: 'placeholder', type: 'text',     label: 'Email placeholder', default: 'you@example.com' },
      { id: 'bgColor',     type: 'color',    label: 'Background colour', optional: true },
      { id: 'textColor',   type: 'color',    label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'video',
    name: 'Video',
    fields: [
      { id: 'heading', type: 'text', label: 'Heading', optional: true },
      { id: 'url',     type: 'url',  label: 'Video URL', placeholder: 'YouTube or Vimeo link',
        help: 'Paste a YouTube or Vimeo link — it becomes an embedded player.' },
      { id: 'bgColor', type: 'color', label: 'Background colour', optional: true },
    ],
  },
  {
    type: 'map',
    name: 'Map / contact',
    fields: [
      { id: 'heading', type: 'text',     label: 'Heading', optional: true, default: 'Visit us' },
      { id: 'address', type: 'textarea', label: 'Address', rows: 3, help: 'Shown, and used to place the map pin.' },
      { id: 'phone',   type: 'text',     label: 'Phone', optional: true },
      { id: 'email',   type: 'text',     label: 'Email', optional: true },
      { id: 'showMap', type: 'checkbox', label: 'Show map', default: true, help: 'Show an embedded map' },
      { id: 'bgColor', type: 'color',    label: 'Background colour', optional: true },
      { id: 'textColor', type: 'color',  label: 'Text colour', optional: true },
    ],
  },
  {
    type: 'spacer',
    name: 'Spacer / divider',
    fields: [
      { id: 'style', type: 'select', label: 'Style', default: 'space',
        options: [{ value: 'space', label: 'Empty space' }, { value: 'line', label: 'Divider line' }] },
      { id: 'size',  type: 'select', label: 'Size', default: 'medium',
        options: [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] },
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

export type RepeaterItem = Record<string, string | boolean>;
export type SettingValue = string | boolean | RepeaterItem[];

/** The default settings object for a section type (from each field's `default`). */
export function sectionDefaults(type: string): Record<string, SettingValue> {
  const schema = SCHEMA_BY_TYPE.get(type);
  if (!schema) return {};
  const out: Record<string, SettingValue> = {};
  for (const f of schema.fields) {
    out[f.id] = f.type === 'repeater' ? [] : (f.default ?? (f.type === 'checkbox' ? false : ''));
  }
  return out;
}

/** Coerces one raw value to its field's stored shape (scalars only; not repeaters). */
function coerceValue(f: SectionField, v: unknown): string | boolean {
  if (f.type === 'checkbox') return v === true || v === 'true' || v === 'on' || v === '1';
  if (f.type === 'color') return sanitizeColor(v);
  return v == null ? (typeof f.default === 'string' ? f.default : '') : String(v);
}

export interface StoredSection {
  id: string;
  type: string;
  [key: string]: SettingValue;
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
      if (f.type === 'repeater') {
        const items = Array.isArray(v) ? v : [];
        section[f.id] = items.map((rawItem) => {
          const it = rawItem && typeof rawItem === 'object' ? rawItem as Record<string, unknown> : {};
          const item: RepeaterItem = {};
          for (const itf of f.itemFields ?? []) item[itf.id] = coerceValue(itf, it[itf.id]);
          return item;
        });
      } else {
        section[f.id] = coerceValue(f, v);
      }
    }
    out.push(section);
  }
  return out;
}
