import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/db/connection';
import { findPublishedPosts, countPublishedPosts, findPublishedPostBySlug } from '../../src/db/queries/posts';

const day = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};

beforeAll(() => {
  db.exec(`
    INSERT INTO posts (id,title,slug,status,published_at) VALUES
      ('a','Live','live','published','${day(-2)}'),
      ('b','Draft','draft','draft','${day(-2)}'),
      ('c','Scheduled','scheduled','published','${day(5)}');
  `);
});

describe('post publishing rules', () => {
  it('lists only published posts that are past their publish date', () => {
    const slugs = findPublishedPosts(50, 0).map(p => p.slug);
    expect(slugs).toContain('live');
    expect(slugs).not.toContain('draft');      // not published
    expect(slugs).not.toContain('scheduled');  // future date
    expect(countPublishedPosts()).toBe(1);
  });

  it('serves a published post by slug, but not a draft', () => {
    expect(findPublishedPostBySlug('live')?.title).toBe('Live');
    expect(findPublishedPostBySlug('draft')).toBeNull();
    expect(findPublishedPostBySlug('scheduled')).toBeNull();
  });
});
