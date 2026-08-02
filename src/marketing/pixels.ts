// Marketing pixels — Meta (Facebook) Pixel + Google (GA4 / Google Ads) tags.
//
// These are the standard install snippets, built from the IDs a merchant enters
// under Settings → Marketing. Everything here is a pure string builder so the
// output can be unit-tested and injected verbatim into the page:
//   - buildPixelHead() → goes in <head> on every storefront page (fires PageView)
//   - buildPixelNoscript() → the <noscript> fallback, right after <body>
//   - buildPurchasePixel() → fires Purchase/conversion on the order-confirmation page
//
// IDs are public by design (they ship in the page source), so they're stored as
// ordinary settings, not secrets. The snippets self-disable when their ID is blank.

export interface PixelSettings {
  metaPixelId: string;
  ga4MeasurementId: string;
  googleAdsId: string;
  googleAdsConversionLabel: string;
}

export interface PurchaseData {
  orderId: string;
  value: number;        // major units, e.g. 29.99
  currency: string;     // ISO code, e.g. 'GBP'
  contentIds: string[]; // product ids in the order
}

/** Pulls the pixel-related settings out of the flat settings map. */
export function pixelSettings(settings: Record<string, string>): PixelSettings {
  return {
    metaPixelId: (settings.meta_pixel_id ?? '').trim(),
    ga4MeasurementId: (settings.ga4_measurement_id ?? '').trim(),
    googleAdsId: (settings.google_ads_id ?? '').trim(),
    googleAdsConversionLabel: (settings.google_ads_conversion_label ?? '').trim(),
  };
}

export function hasAnyPixel(p: PixelSettings): boolean {
  return !!(p.metaPixelId || p.ga4MeasurementId || p.googleAdsId);
}

// Pixel/measurement IDs are attacker-controllable only by the store admin, but
// they're interpolated into an inline <script>, so we still hard-restrict them
// to the characters real IDs use — a stray quote or angle bracket can't break
// out of the JS string context.
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '');
}

/** gtag needs the loader + base config shared by GA4 and Google Ads. */
function gtagConfigs(p: PixelSettings): { loaderId: string; configs: string[] } {
  const configs: string[] = [];
  if (p.ga4MeasurementId) configs.push(`gtag('config', '${safeId(p.ga4MeasurementId)}');`);
  if (p.googleAdsId) configs.push(`gtag('config', '${safeId(p.googleAdsId)}');`);
  // The library is loaded once, tagged with whichever id came first.
  const loaderId = safeId(p.ga4MeasurementId || p.googleAdsId);
  return { loaderId, configs };
}

/** The install snippet for <head> — loads the pixels and fires a page view. */
export function buildPixelHead(p: PixelSettings): string {
  const parts: string[] = [];

  if (p.metaPixelId) {
    const id = safeId(p.metaPixelId);
    parts.push(
      `<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>`,
    );
  }

  const { loaderId, configs } = gtagConfigs(p);
  if (loaderId) {
    parts.push(
      `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${loaderId}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs.join('\n')}
</script>`,
    );
  }

  return parts.join('\n');
}

/** The <noscript> fallback for the Meta Pixel — belongs immediately after <body>. */
export function buildPixelNoscript(p: PixelSettings): string {
  if (!p.metaPixelId) return '';
  const id = safeId(p.metaPixelId);
  return `<noscript><img height="1" width="1" style="display:none" alt=""
  src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>`;
}

/**
 * The purchase/conversion snippet for the order-confirmation page. Fires Meta
 * `Purchase`, GA4 `purchase`, and (if a conversion label is set) a Google Ads
 * conversion. Numbers are emitted as JS literals; strings are JSON-encoded so
 * arbitrary product ids/currency can't break out of the script.
 */
export function buildPurchasePixel(p: PixelSettings, data: PurchaseData): string {
  if (!hasAnyPixel(p)) return '';
  const value = Number.isFinite(data.value) ? data.value : 0;
  const currency = JSON.stringify((data.currency || 'GBP').replace(/[^A-Za-z]/g, ''));
  const ids = JSON.stringify(data.contentIds.map(String));
  const txn = JSON.stringify(String(data.orderId));
  const parts: string[] = [];

  if (p.metaPixelId) {
    parts.push(
      `<script>fbq('track', 'Purchase', {value: ${value}, currency: ${currency}, content_ids: ${ids}, content_type: 'product'});</script>`,
    );
  }

  if (p.ga4MeasurementId) {
    parts.push(
      `<script>gtag('event', 'purchase', {transaction_id: ${txn}, value: ${value}, currency: ${currency}});</script>`,
    );
  }

  if (p.googleAdsId && p.googleAdsConversionLabel) {
    const send = JSON.stringify(`${safeId(p.googleAdsId)}/${safeId(p.googleAdsConversionLabel)}`);
    parts.push(
      `<script>gtag('event', 'conversion', {send_to: ${send}, value: ${value}, currency: ${currency}, transaction_id: ${txn}});</script>`,
    );
  }

  return parts.join('\n');
}
