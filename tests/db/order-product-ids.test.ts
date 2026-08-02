import { describe, it, expect } from 'vitest';
import { execute } from '../../src/db/connection';
import { getOrderProductIds } from '../../src/db/queries/orders';

// Minimal fixtures: two products, one with two variants, both in one order.
function seedOrder() {
  execute("INSERT INTO products (id, title, slug, published) VALUES ('p1','P1','p1',1),('p2','P2','p2',1)");
  execute(
    `INSERT INTO product_variants (id, product_id, title, price, inventory_quantity, position)
     VALUES ('v1a','p1','A',100,5,0),('v1b','p1','B',100,5,1),('v2','p2','',100,5,0)`,
  );
  execute(
    `INSERT INTO orders (id, order_number, email, status, subtotal, discount_amount, shipping, total, currency)
     VALUES ('o1',2001,'x@y.com','paid',300,0,0,300,'GBP')`,
  );
  execute(
    `INSERT INTO order_items (id, order_id, variant_id, product_title, variant_title, price, quantity, line_total)
     VALUES ('i1','o1','v2','P2','',100,1,100),('i2','o1','v1a','P1','A',100,1,100),('i3','o1','v1b','P1','B',100,1,100)`,
  );
}

describe('getOrderProductIds', () => {
  it('returns distinct product ids in line-item order (dedupes multiple variants of one product)', () => {
    seedOrder();
    // p2 line comes first, then p1 (via v1a); v1b (also p1) must not duplicate p1.
    expect(getOrderProductIds('o1')).toEqual(['p2', 'p1']);
  });

  it('returns an empty array for an unknown order', () => {
    expect(getOrderProductIds('nope')).toEqual([]);
  });
});
