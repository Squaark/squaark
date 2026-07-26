import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { execute } from '../../src/db/connection';
import { searchProducts } from '../../src/db/queries/products';

describe('searchProducts LIKE-wildcard escaping', () => {
  beforeAll(() => {
    execute(
      'INSERT INTO products (id, title, slug, description, published) VALUES (?,?,?,?,1)',
      [randomUUID(), 'Cool Shirt', `cool-shirt-${randomUUID()}`, 'A plain shirt, nothing special'],
    );
    execute(
      'INSERT INTO products (id, title, slug, description, published) VALUES (?,?,?,?,1)',
      [randomUUID(), 'Nice Hat', `nice-hat-${randomUUID()}`, 'A hat made of 100% cotton'],
    );
  });

  it('does not treat a bare "%" as a match-everything wildcard', () => {
    // Only "Nice Hat" actually contains a literal "%" in its description.
    const results = searchProducts('%');
    expect(results.map((p) => p.title)).toEqual(['Nice Hat']);
  });

  it('does not treat a bare "_" as a single-character wildcard', () => {
    // Neither seeded product contains a literal underscore anywhere.
    expect(searchProducts('_')).toEqual([]);
  });

  it('still matches ordinary substrings normally', () => {
    expect(searchProducts('Shirt').map((p) => p.title)).toEqual(['Cool Shirt']);
  });

  it('matches a literal "%" in the query against a literal "%" in the data', () => {
    expect(searchProducts('100%').map((p) => p.title)).toEqual(['Nice Hat']);
  });
});
