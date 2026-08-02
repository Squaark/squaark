import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { execute } from '../../db/connection';
import { findAllPosts, findPostById, type PostRow } from '../../db/queries/posts';
import { savePageImage } from '../../admin/store-media';

export async function postRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/posts', listPosts);
  fastify.get('/posts/new', newPostPage);
  fastify.post('/posts/new', createPost);
  fastify.get('/posts/:id', editPostPage);
  fastify.post('/posts/:id', updatePost);
  fastify.post('/posts/:id/delete', deletePost);
  fastify.post<{ Params: { id: string } }>('/posts/:id/sections/image', (req, reply) => uploadImage(req, reply));
  fastify.post<{ Params: { id: string } }>('/posts/:id/featured-image', (req, reply) => uploadImage(req, reply));
}

function adminCtx(req: FastifyRequest) {
  return { admin: getAdminById(req.session.adminId!)!, settings: getAllSettings() };
}

function parseSections(raw: string | undefined): unknown[] {
  try { return JSON.parse(raw || '[]') ?? []; } catch { return []; }
}

/** Collapse a field that may arrive twice (two `content` inputs) to one value. */
function one(v: unknown): string | undefined {
  return Array.isArray(v) ? (v[v.length - 1] as string) : (v as string | undefined);
}

function safeSectionsAttr(sections: unknown[]): string {
  return JSON.stringify(sections).replace(/'/g, '&#39;');
}

function today(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

/** Reads the post fields out of the form body (shared by create + update). */
function readBody(body: Record<string, string>) {
  const status = body.status === 'published' ? 'published' : 'draft';
  const publishedAt = (body.published_at ?? '').trim() || (status === 'published' ? today() : null);
  const sections = body.sections;
  const sectionsJson = (() => { try { JSON.parse(sections); return sections; } catch { return '[]'; } })();
  return {
    title: (body.title ?? '').trim(),
    slug: (body.slug ?? '').trim(),
    excerpt: body.excerpt || '',
    content: one(body.content) || '',
    sections: sectionsJson || '[]',
    featuredImage: (one(body.featured_image) ?? '').trim() || null,
    author: (body.author ?? '').trim() || null,
    status,
    publishedAt,
    seoTitle: body.seo_title || null,
    seoDescription: body.seo_description || null,
  };
}

async function listPosts(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('posts/list', { ...adminCtx(req), posts: findAllPosts(), pageTitle: 'Blog', pageSection: 'blog' }, reply),
  );
}

async function newPostPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    await render('posts/form', { ...adminCtx(req), post: null, sectionsSafe: '[]', pageTitle: 'New post', pageSection: 'blog' }, reply),
  );
}

async function editPostPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const post = findPostById(req.params.id);
  if (!post) return reply.code(404).type('text/html').send(await render('404', { pageTitle: 'Not found' }, reply));
  return reply.type('text/html').send(
    await render('posts/form', {
      ...adminCtx(req), post,
      sectionsSafe: safeSectionsAttr(parseSections(post.sections)),
      saved: 'saved' in (req.query as Record<string, string>),
      created: 'created' in (req.query as Record<string, string>),
      pageTitle: post.title, pageSection: 'blog',
    }, reply),
  );
}

async function createPost(req: FastifyRequest<{ Body: Record<string, string> }>, reply: FastifyReply) {
  const b = readBody(req.body);
  if (!b.title || !b.slug) {
    return reply.type('text/html').send(
      await render('posts/form', {
        ...adminCtx(req), post: req.body, sectionsSafe: safeSectionsAttr(parseSections(req.body.sections)),
        error: 'Title and slug are required', pageTitle: 'New post', pageSection: 'blog',
      }, reply),
    );
  }
  const id = crypto.randomUUID();
  execute(
    `INSERT INTO posts (id, title, slug, excerpt, content, sections, featured_image, author, status, published_at, seo_title, seo_description)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.title, b.slug, b.excerpt, b.content, b.sections, b.featuredImage, b.author, b.status, b.publishedAt, b.seoTitle, b.seoDescription],
  );
  return reply.redirect(`/admin/posts/${id}?created=1`);
}

async function updatePost(req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>, reply: FastifyReply) {
  const existing = findPostById(req.params.id);
  if (!existing) return reply.code(404).send('Not found');
  const b = readBody(req.body);
  execute(
    `UPDATE posts SET title=?, slug=?, excerpt=?, content=?, sections=?, featured_image=?, author=?, status=?, published_at=?, seo_title=?, seo_description=?, updated_at=datetime('now')
     WHERE id=?`,
    [b.title, b.slug, b.excerpt, b.content, b.sections, b.featuredImage, b.author, b.status, b.publishedAt, b.seoTitle, b.seoDescription, req.params.id],
  );
  return reply.redirect(`/admin/posts/${req.params.id}?saved=1`);
}

async function deletePost(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  execute('DELETE FROM posts WHERE id = ?', [req.params.id]);
  return reply.redirect('/admin/posts?deleted=1');
}

/** Shared image upload for section images and the featured image; returns { url }. */
async function uploadImage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const post = findPostById(req.params.id) as PostRow | null;
  if (!post) return reply.code(404).send({ error: 'Post not found' });
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: 'No file uploaded' });
  try {
    const url = await savePageImage(req.params.id, await data.toBuffer(), data.mimetype);
    return reply.send({ url });
  } catch (err: unknown) {
    return reply.code(400).send({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
}
