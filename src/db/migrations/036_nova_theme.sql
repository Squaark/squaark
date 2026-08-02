-- Register the bundled "Nova" theme. Inactive by default (Linen stays active);
-- the merchant switches to it in Admin → Themes. INSERT OR IGNORE so re-running
-- against a store that already has it is a no-op. The registry loads the theme's
-- manifest from its directory, so the manifest column here can stay '{}'.
INSERT OR IGNORE INTO themes (id, name, slug, version, description, author, directory, manifest, active)
VALUES (
  'theme-nova-builtin',
  'Nova',
  'nova',
  '1.0.0',
  'Bold, modern storefront with a hero product slider',
  'Core Team',
  'themes/nova',
  '{}',
  0
);
