import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { execute, query, queryOne } from '../../db/connection';

interface CollectionRow {
  id: string; title: string; slug: string; description: string | null;
  published: number; created_at: string;
}

export async function collectionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/collections', listCollections);
  fastify.get('/collections/new', newCollectionPage);
  fastify.post('/collections/new', createCollection);
  fastify.get('/collections/:id', editCollectionPage);
  fastify.post('/collections/:id', updateCollection);
  fastify.post('/collections/:id/delete', deleteCollection);
  fastify.post('/collections/:id/products/add', addProductToCollection);
  fastify.post('/collections/:id/products/:productId/remove', removeProductFromCollection);
}

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

async function listCollections(req: FastifyRequest, reply: FastifyReply) {
  const collections = query<CollectionRow>('SELECT * FROM collections ORDER BY created_at DESC');
  return reply.type('text/html').send(
    render('collections/list', { ...adminCtx(req), collections, pageTitle: 'Collections' }),
  );
}

async function newCollectionPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    render('collections/form', { ...adminCtx(req), collection: null, products: [], allProducts: [], pageTitle: 'New collection' }),
  );
}

async function editCollectionPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const collection = queryOne<CollectionRow>('SELECT * FROM collections WHERE id = ?', [req.params.id]);
  if (!collection) return reply.code(404).type('text/html').send(render('404', { pageTitle: 'Not found' }));

  const products = query<{ id: string; title: string; slug: string }>(
    `SELECT p.id, p.title, p.slug FROM products p
     JOIN collection_products cp ON cp.product_id = p.id
     WHERE cp.collection_id = ? ORDER BY cp.position`,
    [collection.id],
  );
  const allProducts = query<{ id: string; title: string; slug: string }>(
    'SELECT id, title, slug FROM products WHERE published = 1 ORDER BY title',
  );
  return reply.type('text/html').send(
    render('collections/form', { ...adminCtx(req), collection, products, allProducts, pageTitle: collection.title }),
  );
}

async function createCollection(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { title, slug, description, published, seo_title, seo_description } = req.body;
  if (!title || !slug) {
    return reply.type('text/html').send(
      render('collections/form', { ...adminCtx(req), collection: req.body, products: [], allProducts: [],
        error: 'Title and slug are required', pageTitle: 'New collection' }),
    );
  }
  const id = crypto.randomUUID();
  execute(
    'INSERT INTO collections (id, title, slug, description, published, seo_title, seo_description) VALUES (?,?,?,?,?,?,?)',
    [id, title.trim(), slug.trim(), description || null, published === '1' ? 1 : 0,
     seo_title || null, seo_description || null],
  );
  return reply.redirect(`/admin/collections/${id}?created=1`);
}

async function updateCollection(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { title, slug, description, published, seo_title, seo_description } = req.body;
  execute(
    `UPDATE collections SET title=?, slug=?, description=?, published=?, seo_title=?, seo_description=?, updated_at=datetime('now') WHERE id=?`,
    [title, slug, description || null, published === '1' ? 1 : 0,
     seo_title || null, seo_description || null, req.params.id],
  );
  return reply.redirect(`/admin/collections/${req.params.id}?saved=1`);
}

async function deleteCollection(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  execute('DELETE FROM collections WHERE id = ?', [req.params.id]);
  return reply.redirect('/admin/collections?deleted=1');
}

async function addProductToCollection(
  req: FastifyRequest<{ Params: { id: string }; Body: { product_id: string } }>,
  reply: FastifyReply,
) {
  const maxPos = queryOne<{ m: number }>(
    'SELECT COALESCE(MAX(position),0) AS m FROM collection_products WHERE collection_id = ?',
    [req.params.id],
  )?.m ?? 0;
  execute(
    'INSERT OR IGNORE INTO collection_products (collection_id, product_id, position) VALUES (?,?,?)',
    [req.params.id, req.body.product_id, maxPos + 1],
  );
  return reply.redirect(`/admin/collections/${req.params.id}`);
}

async function removeProductFromCollection(
  req: FastifyRequest<{ Params: { id: string; productId: string } }>,
  reply: FastifyReply,
) {
  execute(
    'DELETE FROM collection_products WHERE collection_id = ? AND product_id = ?',
    [req.params.id, req.params.productId],
  );
  return reply.redirect(`/admin/collections/${req.params.id}`);
}
