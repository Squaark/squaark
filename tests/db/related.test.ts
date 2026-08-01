import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/db/connection';
import { setRelatedProducts } from '../../src/db/queries/products';
import { getRelatedProducts, getCartRecommendations } from '../../src/commerce/products';

const ids = (list: { id: string }[]) => list.map((p) => p.id).sort();

beforeAll(() => {
  db.exec(`
    INSERT INTO collections (id,title,slug) VALUES ('c1','Cat','cat-rel');
    INSERT INTO products (id,title,slug,published) VALUES
      ('rp1','P1','rp1',1),('rp2','P2','rp2',1),('rp3','P3','rp3',1),('rp4','P4','rp4',1);
    INSERT INTO product_variants (id,product_id,title,price,inventory_quantity) VALUES
      ('rv1','rp1','d',100,5),('rv2','rp2','d',100,5),('rv3','rp3','d',100,5),('rv4','rp4','d',100,5);
    INSERT INTO collection_products (collection_id,product_id) VALUES ('c1','rp1'),('c1','rp2'),('c1','rp3');
    INSERT INTO carts (id) VALUES ('cart1');
    INSERT INTO cart_items (id,cart_id,variant_id,quantity) VALUES ('ci1','cart1','rv1',1);
  `);
});

describe('getRelatedProducts (auto by shared collection)', () => {
  it('returns same-collection products, excluding the product itself', () => {
    // rp1 shares c1 with rp2 & rp3; rp4 is not in the collection.
    expect(ids(getRelatedProducts('rp1', 2))).toEqual(['rp2', 'rp3']);
  });

  it('tops up a thin row with other products', () => {
    // Only 2 in-collection, ask for 4 → tops up with rp4 (the only other product).
    expect(ids(getRelatedProducts('rp1', 4))).toEqual(['rp2', 'rp3', 'rp4']);
  });
});

describe('getRelatedProducts (manual override)', () => {
  it('uses the merchant picks, in their order, over the automatic set', () => {
    setRelatedProducts('rp1', ['rp4', 'rp2']);
    const result = getRelatedProducts('rp1', 4).map((p) => p.id);
    expect(result).toEqual(['rp4', 'rp2']); // exact order, and rp3 (auto) is not included
    setRelatedProducts('rp1', []); // reset for isolation
    expect(ids(getRelatedProducts('rp1', 2))).toEqual(['rp2', 'rp3']); // back to auto
  });
});

describe('getCartRecommendations', () => {
  it('recommends products sharing a collection with cart items, excluding what is in the cart', () => {
    // cart1 has rp1 → recommend rp2 & rp3 (same collection), never rp1.
    const recs = ids(getCartRecommendations('cart1', 4));
    expect(recs).toEqual(['rp2', 'rp3']);
    expect(recs).not.toContain('rp1');
  });
});
