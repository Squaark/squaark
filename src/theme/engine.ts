import Handlebars from 'handlebars';
import { LRUCache } from 'lru-cache';
import { readFile, readdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import { getAllSettings } from '../db/queries/admin';
import { buildAssetManifest, buildReverseManifest, getMimeType, type AssetManifest } from './assets';
import { registerHelpers } from './helpers';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export class ThemeEngine {
  private cache = new LRUCache<string, HandlebarsTemplateDelegate>({ max: 100 });
  private hbs: typeof Handlebars;
  private assetManifest: AssetManifest = {};
  private reverseManifest: AssetManifest = {};

  constructor(public readonly themePath: string) {
    this.hbs = Handlebars.create();
  }

  async init(): Promise<void> {
    this.assetManifest = await buildAssetManifest(this.themePath);
    this.reverseManifest = buildReverseManifest(this.assetManifest);
    await this.registerPartials();
    registerHelpers(
      this.hbs,
      (filename) => this.resolveAsset(filename),
      (type, slugs) => this.resolveUrl(type, slugs),
    );
  }

  async render(templateName: string, context: unknown): Promise<string> {
    const key = templateName;
    let compiled = this.cache.get(key);

    if (!compiled) {
      const filePath = path.join(this.themePath, `${templateName}.hbs`);
      if (!existsSync(filePath)) {
        throw new Error(`Template not found: ${templateName}`);
      }
      const src = await readFile(filePath, 'utf-8');
      compiled = this.hbs.compile(src, { preventIndent: true });
      this.cache.set(key, compiled);
    }

    return compiled(context);
  }

  resolveAsset(filename: string): string {
    const hashed = this.assetManifest[filename];
    return `/theme/assets/${hashed ?? filename}`;
  }

  resolveUrl(type: string, slugs: string[]): string {
    switch (type) {
      case 'product':    return `/products/${slugs[0] ?? ''}`;
      case 'collection': return `/collections/${slugs[0] ?? ''}`;
      case 'cart':       return `/${(getAllSettings().cart_label || 'Cart').toLowerCase()}`;
      case 'search':     return '/search';
      case 'page':       return `/${slugs[0] ?? ''}`;
      default:           return '/';
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  /** Register a Fastify route for /theme/assets/* with hash-stripping and immutable caching. */
  registerAssetRoutes(fastify: FastifyInstance): void {
    const assetsDir = path.join(this.themePath, 'assets');

    fastify.get('/theme/assets/*', async (req: FastifyRequest, reply: FastifyReply) => {
      const hashedName = (req.params as Record<string, string>)['*'];
      const originalName = this.reverseManifest[hashedName] ?? hashedName;
      const filePath = path.join(assetsDir, originalName);

      if (!existsSync(filePath)) {
        return reply.code(404).send('Asset not found');
      }

      const ext = path.extname(originalName);
      reply.header('Content-Type', getMimeType(ext));
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(createReadStream(filePath));
    });
  }

  private async registerPartials(): Promise<void> {
    const partialsDir = path.join(this.themePath, 'partials');
    if (!existsSync(partialsDir)) return;
    await this.walkPartials(partialsDir, partialsDir);
  }

  private async walkPartials(baseDir: string, dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkPartials(baseDir, fullPath);
      } else if (entry.name.endsWith('.hbs')) {
        const name = path.relative(baseDir, fullPath)
          .replace(/\.hbs$/, '')
          .replace(/\\/g, '/');
        const src = await readFile(fullPath, 'utf-8');
        this.hbs.registerPartial(name, src);
      }
    }
  }
}
