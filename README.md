# Squaark

Self-hosted ecommerce platform. Keeping it simple with Node.js + SQLite.

## Requirements

- Node.js 22+ (`better-sqlite3` requires it as of v13). 22 (LTS) is the tested baseline — CI, Docker, and `.nvmrc` all pin it — but `better-sqlite3`, `argon2`, and `sharp` all ship N-API prebuilt binaries now, so newer versions (e.g. 26) work fine too.
- npm

If you're ever on a platform/Node combination with no prebuilt binary available, these fall back to a from-source compile, which needs a C++ toolchain (`build-essential` on Debian/Ubuntu, `apk add python3 make g++` on Alpine). The `Dockerfile` sidesteps this by installing the toolchain in the build stage regardless.

## Quick start

```bash
git clone <this repo>
cd squaark
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000/admin](http://localhost:3000/admin). With no admin account yet you'll land on a setup page to create your credentials.

The database schema is created automatically on first boot, there is no separate migration step.

## After logging in

1. **Settings > Store** - store name, currency, contact email, tagline. Toggle customer accounts on/off here.
2. **Settings > Email** - how transactional emails get sent. Defaults to logging to the server console (fine for local dev). For real sending, pick Resend (API key only) or a custom SMTP provider. Use the test button to confirm it works.
3. **Settings > Payments** - paste in Stripe and/or PayPal credentials. Both providers can be active at the same time.
4. **Settings > Logs** - live view of payment events, sent emails, and server errors. Useful for debugging without touching the server.
5. **Emails** - editable Handlebars templates for order confirmation, shipping, admin notifications, password reset. Live preview against sample data.
6. **Themes** - the `linen` theme is active by default. Customise colours, fonts, and layout from its config page, or upload a different theme.
7. **Pages** - build pages with a section builder (text, image, image + text, CTA, columns), or import from a WordPress export via **Import**.
8. **Navigation** - edit the main and footer nav links.
9. **Users** - add staff accounts with restricted access (products and orders only, no settings or theme access).
10. **Products / Collections** - `npm run db:seed` loads sample catalogue data, or add your own.

The dashboard shows basic traffic analytics (page views, unique visitors, top pages, referrers) collected from storefront requests. No external service or cookie consent needed — bots are filtered by user agent and IPs are hashed before storage.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with hot reload |
| `npm start` | Start the built server (`npm run build` first) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run db:migrate` | Apply pending migrations manually |
| `npm run db:seed` | Seed with sample products/collections |

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `development` | Set to `production` when deploying |
| `THEME_DIR` | `themes/linen` | Active theme directory |
| `UPLOADS_DIR` | `uploads` | Product image uploads |
| `SESSION_SECRET` | (dev default) | Use a strong random value in production |
| `DATABASE_PATH` | `data/store.db` | SQLite file location |

Store-level settings (name, currency, logo, email provider, etc.) are in the admin UI, not env vars.

## Docker

```bash
docker compose up
```

Multi-stage build: compiles in a build stage, ships only compiled output and production `node_modules`. A volume is mounted for `/data` (the database). Uploaded images under `/app/uploads` aren't persisted across container recreation unless you add a volume for that path too.

## Project structure

- `src/routes/` - Fastify routes: `storefront/`, `admin/`, `api/`
- `src/commerce/` - products, collections, cart, orders
- `src/theme/` - Handlebars engine, helpers, context builders
- `src/email/` - transactional email transports and templates
- `src/db/migrations/` - SQL migration files, applied on boot
- `themes/linen/` - bundled default theme
- `admin/` - admin panel Handlebars templates

See [theme_engine_spec.md](theme_engine_spec.md) for the full technical spec.
