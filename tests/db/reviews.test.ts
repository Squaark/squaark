import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/db/connection';
import {
  createReview, emailBoughtProduct, getRatingSummary, listPublishedReviews,
  setReviewStatus, countReviewsByStatus, getRatingSummaries,
} from '../../src/db/queries/reviews';

beforeAll(() => {
  db.exec(`
    INSERT INTO products (id,title,slug,is_digital) VALUES ('p1','Widget','widget-rv',0);
    INSERT INTO product_variants (id,product_id,title,price,inventory_quantity) VALUES ('v1','p1','Default',1500,10);
    INSERT INTO orders (id,order_number,email,status,total) VALUES
      ('o1',7001,'buyer@x.com','paid',1500),
      ('o2',7002,'pending@x.com','pending',1500);
    INSERT INTO order_items (id,order_id,variant_id,product_title,variant_title,sku,price,quantity,line_total) VALUES
      ('i1','o1','v1','Widget','Default',NULL,1500,1,1500),
      ('i2','o2','v1','Widget','Default',NULL,1500,1,1500);
  `);
});

describe('emailBoughtProduct', () => {
  it('is true only for an email with a PAID order for the product', () => {
    expect(emailBoughtProduct('buyer@x.com', 'p1')).toBe(true);
    expect(emailBoughtProduct('BUYER@X.COM', 'p1')).toBe(true);   // case-insensitive
    expect(emailBoughtProduct('pending@x.com', 'p1')).toBe(false); // order not paid
    expect(emailBoughtProduct('nobody@x.com', 'p1')).toBe(false);
  });
});

describe('createReview', () => {
  it('honours the moderation flag and auto-verifies purchasers', () => {
    const pending = createReview(
      { productId: 'p1', rating: 5, title: 'Nice', body: 'Love it', authorName: 'Jane', email: 'buyer@x.com' },
      false, // require approval
    );
    expect(pending.status).toBe('pending');

    const live = createReview(
      { productId: 'p1', rating: 3, title: null, body: 'Ok', authorName: 'Sam', email: 'nobody@x.com' },
      true, // auto-publish
    );
    expect(live.status).toBe('published');

    // buyer's review is verified; non-buyer's is not
    const rows = db.prepare("SELECT author_name, verified FROM reviews").all() as { author_name: string; verified: number }[];
    expect(rows.find(r => r.author_name === 'Jane')?.verified).toBe(1);
    expect(rows.find(r => r.author_name === 'Sam')?.verified).toBe(0);
  });
});

describe('summaries count published only', () => {
  it('excludes pending reviews, then includes them once approved', () => {
    // From the previous test: one pending (5★) + one published (3★).
    let summary = getRatingSummary('p1');
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(3);
    expect(listPublishedReviews('p1')).toHaveLength(1);

    const pendingId = (db.prepare("SELECT id FROM reviews WHERE status='pending'").get() as { id: string }).id;
    setReviewStatus(pendingId, 'published');

    summary = getRatingSummary('p1');
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(4); // (5 + 3) / 2
    expect(getRatingSummaries(['p1']).get('p1')?.count).toBe(2);

    expect(countReviewsByStatus().published).toBe(2);
  });
});
