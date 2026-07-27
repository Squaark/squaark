import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes rich-text HTML written by an admin/staff user (product
 * descriptions, page content, page-builder sections) before it's rendered
 * unescaped to storefront visitors. Staff is a lower-privileged role than
 * admin, and imported content (WooCommerce) is also untrusted input — this
 * is the single choke point all of it passes through, rather than trusting
 * every write path to have sanitized already.
 */
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: [
      'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div',
      'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'img', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // allowedTags/allowedAttributes are both replacement allowlists, not
    // additive to any built-in default — <script>, <iframe>, on*-handler
    // attributes, and javascript:/data: URLs are all excluded simply by
    // never appearing in these lists.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}
