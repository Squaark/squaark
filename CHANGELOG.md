# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0: minor = features, patch = fixes).

## [Unreleased]

### Added
- Configurable cart word (Cart / Basket / Bag) that drives the label, URL and nav together, with no restart.
- Zero-config "direct" email transport (MX delivery, best-effort) alongside SMTP and Resend.
- Order fulfilment workflow: mark shipped, tracking number, status changes, and the `order_shipped` email.
- Refund / cancellation from the order admin (Stripe & PayPal).
- Merchant new-order email notification.
- Customer password reset flow.
- Database backup/restore scripts (`npm run db:backup` / `db:restore`) and a `/health` endpoint.

### Changed
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
