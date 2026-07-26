import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import AdmZip from 'adm-zip';
import { loadManifest } from '../theme/config';
import { registerTheme, findThemeBySlug } from '../db/queries/themes';

const THEMES_DIR = path.resolve(process.cwd(), 'themes');

export interface UploadResult {
  slug: string;
  name: string;
}

export async function installThemeFromZip(buffer: Buffer): Promise<UploadResult> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Find theme.json — must be at the root of a single top-level directory
  const themeJsonEntry = entries.find(e => /^[^/]+\/theme\.json$/.test(e.entryName));
  if (!themeJsonEntry) throw new Error('theme.json not found in zip root');

  const topDir = themeJsonEntry.entryName.split('/')[0];
  const manifestJson = JSON.parse(themeJsonEntry.getData().toString('utf-8'));
  const slug = (manifestJson.name as string).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const destDir = path.resolve(THEMES_DIR, slug);
  const destDirWithSep = destDir + path.sep;

  // Refuse to silently overwrite an already-installed theme — this used to
  // unconditionally delete whatever was at destDir, which meant a zip whose
  // theme.json "name" happened to match an existing (possibly currently
  // active) theme's slug would wipe its files and, since registerTheme()
  // upserts on slug, hijack its DB row (and active status) in place.
  if (findThemeBySlug(slug) || fs.existsSync(destDir)) {
    throw new Error(`A theme with the slug "${slug}" is already installed. Remove it first if you want to replace it.`);
  }

  // Security: validate each entry's FINAL resolved write path, not the raw
  // zip-relative name. Those can diverge — a raw name like
  // "mytheme/a/b/../../../evil.txt" normalizes to a harmless-looking
  // "evil.txt" once topDir's own segments absorb the "..", but the actual
  // write path is built by stripping topDir first and joining what's left
  // onto destDir — a *different* base with fewer segments to absorb the
  // same "..", so it can still escape destDir even though the raw name
  // "looked" safe. Resolving and checking the final path is the only way
  // this can't be fooled by segment-counting tricks. Collected up front so
  // nothing is written to disk if any single entry is malicious.
  const toExtract: Array<{ destPath: string; data: Buffer }> = [];
  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.startsWith(`${topDir}/`)) continue;
    const relative = entry.entryName.slice(topDir.length + 1);
    const destPath = path.resolve(destDir, relative);
    if (destPath !== destDir && !destPath.startsWith(destDirWithSep)) {
      throw new Error(`Invalid path in zip: ${entry.entryName}`);
    }
    toExtract.push({ destPath, data: entry.getData() });
  }

  fs.mkdirSync(destDir, { recursive: true });
  for (const { destPath, data } of toExtract) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, data);
  }

  const manifest = loadManifest(destDir);
  registerTheme(
    crypto.randomUUID(),
    manifest.name,
    slug,
    manifest.version ?? '1.0.0',
    manifest.description ?? '',
    manifest.author ?? '',
    `themes/${slug}`,
  );

  return { slug, name: manifest.name };
}
