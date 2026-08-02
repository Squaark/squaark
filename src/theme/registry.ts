import path from 'path';
import { createReadStream } from 'fs';
import { ThemeEngine } from './engine';
import { loadManifest, resolveConfig, resolveConfigNested, buildCssVars, type ThemeManifest } from './config';
import { findActiveTheme, type ThemeRow } from '../db/queries/themes';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export class ThemeRegistry {
  private engine: ThemeEngine | null = null;
  private activeId: string | null = null;
  private manifest: ThemeManifest | null = null;
  private cssVars = '';
  private nestedConfig: Record<string, Record<string, unknown>> = {};

  async init(fastify: FastifyInstance): Promise<void> {
    const theme = findActiveTheme();
    if (!theme) throw new Error('No active theme found in database');
    await this.load(theme);
    this.registerAssetRoute(fastify);
  }

  /**
   * Registers the `/theme/assets/*` route ONCE, at boot. The handler resolves
   * against whichever theme is active at request time, so switching themes just
   * swaps the in-memory engine — it never re-registers a route on the
   * already-listening server (which throws "Cannot add route").
   */
  private registerAssetRoute(fastify: FastifyInstance): void {
    fastify.get('/theme/assets/*', async (req: FastifyRequest, reply: FastifyReply) => {
      const hashedName = (req.params as Record<string, string>)['*'];
      const asset = this.currentEngine.resolveAssetFile(hashedName);
      if (!asset) return reply.code(404).send('Asset not found');
      reply.header('Content-Type', asset.mime);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(createReadStream(asset.filePath));
    });
  }

  private async load(theme: ThemeRow): Promise<void> {
    const themeDir = path.resolve(process.cwd(), theme.directory);
    const engine = new ThemeEngine(themeDir);
    await engine.init();

    const manifest = loadManifest(themeDir);
    const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
    const resolved = resolveConfig(manifest, overrides);

    this.engine = engine;
    this.activeId = theme.id;
    this.manifest = manifest;
    this.cssVars = buildCssVars(resolved);
    this.nestedConfig = resolveConfigNested(manifest, overrides);
  }

  /** Apply overrides to the in-memory registry without writing to DB — used by the live preview. */
  applyPreview(overrides: Record<string, unknown>): void {
    if (!this.manifest) return;
    const resolved = resolveConfig(this.manifest, overrides);
    this.cssVars = buildCssVars(resolved);
    this.nestedConfig = resolveConfigNested(this.manifest, overrides);
    this.engine?.invalidateAll();
  }

  /** Hot-swap to a new active theme. Call after activateTheme() in DB. */
  async reload(fastify: FastifyInstance): Promise<void> {
    const theme = findActiveTheme();
    if (!theme) return;
    if (theme.id === this.activeId) {
      // Same theme, just refresh config vars + invalidate cache
      const manifest = loadManifest(path.resolve(process.cwd(), theme.directory));
      const overrides = JSON.parse(theme.config_overrides || '{}') as Record<string, unknown>;
      const resolved = resolveConfig(manifest, overrides);
      this.cssVars = buildCssVars(resolved);
      this.nestedConfig = resolveConfigNested(manifest, overrides);
      this.engine?.invalidateAll();
      return;
    }
    // Different theme — swap the engine + config in memory. The asset route
    // registered at init already delegates to currentEngine, so nothing new
    // needs registering here (doing so would throw once the server is listening).
    this.engine = null;
    await this.load(theme);
  }

  get currentEngine(): ThemeEngine {
    if (!this.engine) throw new Error('ThemeRegistry not initialised');
    return this.engine;
  }

  get currentManifest(): ThemeManifest | null {
    return this.manifest;
  }

  get currentCssVars(): string {
    return this.cssVars;
  }

  get currentThemeConfig(): Record<string, Record<string, unknown>> {
    return this.nestedConfig;
  }

  get currentActiveId(): string | null {
    return this.activeId;
  }
}

export const themeRegistry = new ThemeRegistry();
