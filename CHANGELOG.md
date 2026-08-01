# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0: minor = features, patch = fixes).

## [Unreleased]

### Added
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
