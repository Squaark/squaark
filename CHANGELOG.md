# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0: minor = features, patch = fixes).

## [Unreleased]

### Added
- Pre-orders: a product with an availability window can additionally allow **pre-orders** (Product → Availability → "Allow pre-orders"). During the upcoming window customers can order it (sold against stock) — the storefront shows an enabled **Pre-order** button and a "ships from …" note, and each order line is flagged as a pre-order with its ship date in the admin order view and the confirmation email, so fulfilment can be held until then. With pre-orders off, an upcoming product just shows "Coming soon" and stays unpurchasable.
- Product calendar (availability windows): a product can be given an optional **Available from** / **Available until** date. It stays visible the whole time, but is only purchasable between those dates — outside the window the add-to-cart button is disabled (showing "Available from …" or "No longer available") and the store enforces it server-side — both at add-to-cart and re-checked at checkout — so a scheduled/seasonal drop can go up early and open/close on its own. Product cards show a "Coming soon" / "Unavailable" badge. Works in both bundled themes.
- Usage metering & limits (hosted groundwork): the app measures products, unique monthly visitors and upload storage, and can enforce per-store limits **injected by the host** (via settings or env — `limit_products` / `LIMIT_PRODUCTS`, etc.). Over-limit product creation is blocked admin-side (never the storefront), with an optional `upgrade_url`. No limits are set by default, so a standalone/self-hosted install stays unlimited. Pricing, plans and billing deliberately live in the hosted control plane, not in this open-source app.
- Mega menus: any header navigation link can now open a mega menu, configured under Navigation. Each mega menu holds any number of columns, and every column is one of three types — plain **links**, **categories** (pick a collection from a dropdown, with an optional picture), or **products** (pick a collection + how many to show, displayed as thumbnails, a list with images, or a text-only list, with an optional "Show more" link to the collection). The panel is centred at the content width, and each menu can lay its columns out automatically or in a fixed number of columns per row. Works in both bundled themes (opens on hover with keyboard focus support on desktop, expands inline on mobile).
- Nova theme: a second bundled storefront theme (activate it in Admin → Themes) sharing Linen's full template set, restyled via its own colour tokens and stylesheet.
- Blog: a full blog built on the pages/CMS engine — posts use the same page-builder sections, plus a featured image, author byline and publish date (with scheduling). Chronological `/blog` index (paginated), `/blog/:slug` post pages with BlogPosting structured data, an RSS feed at `/blog/rss.xml`, and posts in the sitemap. Managed under a new admin "Blog" section.
- Automatic discounts (no code needed), managed under Promotions → Automatic: an order discount (% or fixed off over an optional spend threshold) and buy-X-get-Y (BOGO — buy N get M at X% off, targeting all products or a collection), each with an optional date window. Applied at the cart and shown as their own lines; order-level discounts take the better of code vs automatic, BOGO stacks. (Free-shipping-over-X already exists as a shipping rate type.)
- Related & upsell products: the product-page "You may also like" is now genuinely related (products sharing a collection, topped up so the row is never thin) instead of random, with an optional manual per-product picker in the admin; plus a "You might also like" recommendations row on the cart page based on what's in the cart (AOV).
- Product reviews: star ratings + reviews on product pages (open submission with an automatic "Verified purchase" badge when the email matches a paid order), average rating on product cards, admin moderation (approve/reject, delete, with a toggle between approve-first and publish-instantly), and schema.org Product/AggregateRating structured data for search rich results.
- Abandoned-checkout recovery: emails customers who start checkout but don't pay, once, after a configurable delay (Settings → Store; blank/0 = off), with a token-signed one-click unsubscribe. Editable `abandoned_cart` template.
- Order CSV export from the orders admin.
- Low-stock alerts: emails the store owner when a product variant drops to/below a configurable threshold after a paid order (Settings → Store; blank to disable, 0 = only when sold out). Editable `low_stock` email template.
- Promo banners: a scheduled, site-wide announcement bar managed under Promotions → Banners, with an optional link/CTA, a copy-to-clipboard discount-code pill, custom colours, visitor dismiss, and start/end dates (newest live banner wins).
- Configurable cart word (Cart / Basket / Bag) that drives the label, URL and nav together, with no restart.
- Zero-config "direct" email transport (MX delivery, best-effort) alongside SMTP and Resend.
- Order fulfilment workflow: mark shipped, tracking number, status changes, and the `order_shipped` email.
- Refund / cancellation from the order admin (Stripe & PayPal).
- Merchant new-order email notification.
- Customer password reset flow.
- Database backup/restore scripts (`npm run db:backup` / `db:restore`) and a `/health` endpoint.

### Changed
- The admin "Discounts" section is now "Promotions", with discount codes and banners as tabs within it.
- Inventory is now decremented on paid orders, with a pre-checkout stock re-check.
- Storefront assets (htmx, Alpine, Inter font) are self-hosted — no third-party runtime requests.
- WooCommerce import skips WooCommerce's own system pages (cart, checkout, my-account, shop, …).

### Fixed
- Admin styling left broken by the earlier Tailwind removal (status badges, utility classes).
- Theme-editor image upload no longer reloads the page and discards unsaved edits.
- Order confirmation emails rendered blank totals.

## [0.1.0]

- Initial release.

[Unreleased]: https://github.com/Squaark/squaark/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Squaark/squaark/releases/tag/v0.1.0
