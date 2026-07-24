import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '../../types';
import { render } from '../../admin/render';
import { getAdminById } from '../../admin/auth';
import { getAllSettings } from '../../db/queries/admin';
import { processUploadedImage } from '../../admin/images';
import { execute, query, queryOne } from '../../db/connection';
import { findAllBands } from '../../db/queries/tax';
import type { MultipartFile } from '@fastify/multipart';

interface ProductRow {
  id: string; title: string; slug: string; description: string | null;
  vendor: string | null; tags_text: string; published: number;
  tax_band_id: string | null;
  created_at: string; updated_at: string;
}
interface VariantRow {
  id: string; title: string; price: number; compare_at_price: number | null;
  sku: string | null; inventory_quantity: number; position: number;
}
interface ImageRow {
  id: string; original: string; thumbnail: string; medium: string; large: string;
  alt: string; position: number;
}

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/products', listProducts);
  fastify.get('/products/new', newProductPage);
  fastify.post('/products/new', createProduct);
  fastify.get('/products/:id', editProductPage);
  fastify.post('/products/:id', updateProduct);
  fastify.post('/products/:id/delete', deleteProduct);
  fastify.post('/products/:id/images', uploadImage);
  fastify.post('/products/:id/images/:imageId/delete', deleteImage);
}

function adminCtx(req: FastifyRequest) {
  return {
    admin: getAdminById(req.session.adminId!)!,
    settings: getAllSettings(),
  };
}

async function listProducts(req: FastifyRequest<{ Querystring: { page?: string } }>, reply: FastifyReply) {
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const products = query<ProductRow>(
    'SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset],
  );
  const total = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM products')?.n ?? 0;
  return reply.type('text/html').send(
    render('products/list', {
      ...adminCtx(req), products, total,
      page, totalPages: Math.ceil(total / limit),
      pageTitle: 'Products',
    }),
  );
}

async function newProductPage(req: FastifyRequest, reply: FastifyReply) {
  return reply.type('text/html').send(
    render('products/form', { ...adminCtx(req), product: null, variants: [], images: [], taxBands: findAllBands(), pageTitle: 'New product' }),
  );
}

async function editProductPage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const product = queryOne<ProductRow>('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) return reply.code(404).type('text/html').send(render('404', { pageTitle: 'Not found' }));
  const variants = query<VariantRow>('SELECT * FROM product_variants WHERE product_id = ? ORDER BY position', [product.id]);
  const images = query<ImageRow>('SELECT * FROM product_images WHERE product_id = ? ORDER BY position', [product.id]);
  return reply.type('text/html').send(
    render('products/form', { ...adminCtx(req), product, variants, images, taxBands: findAllBands(), pageTitle: product.title }),
  );
}

async function createProduct(
  req: FastifyRequest<{ Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { title, slug, description, vendor, tags_text, published,
          variant_title, price, compare_at_price, sku, inventory_quantity,
          seo_title, seo_description, free_shipping } = req.body;

  if (!title || !slug) {
    return reply.type('text/html').send(
      render('products/form', { ...adminCtx(req), product: req.body, variants: [], images: [],
        error: 'Title and slug are required', pageTitle: 'New product' }),
    );
  }

  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  const priceInt = Math.round(parseFloat(price || '0') * 100);
  const compareInt = compare_at_price ? Math.round(parseFloat(compare_at_price) * 100) : null;
  const qty = parseInt(inventory_quantity || '0', 10);

  const tax_band_id = req.body.tax_band_id?.trim() || null;
  execute(
    `INSERT INTO products (id, title, slug, description, vendor, tags_text, published, seo_title, seo_description, free_shipping, tax_band_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, title.trim(), slug.trim(), description || null, vendor || null, tags_text || '', published === '1' ? 1 : 0,
     seo_title || null, seo_description || null, free_shipping === '1' ? 1 : 0, tax_band_id],
  );
  execute(
    `INSERT INTO product_variants (id, product_id, title, price, compare_at_price, sku, inventory_quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [variantId, productId, variant_title || 'Default', priceInt, compareInt, sku || null, qty],
  );

  return reply.redirect(`/admin/products/${productId}?created=1`);
}

async function updateProduct(
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string> }>,
  reply: FastifyReply,
) {
  const { id } = req.params;
  const product = queryOne<ProductRow>('SELECT id FROM products WHERE id = ?', [id]);
  if (!product) return reply.code(404).send('Not found');

  const { title, slug, description, vendor, tags_text, published, seo_title, seo_description, free_shipping } = req.body;
  const tax_band_id_update = req.body.tax_band_id?.trim() || null;
  execute(
    `UPDATE products SET title=?, slug=?, description=?, vendor=?, tags_text=?, published=?, seo_title=?, seo_description=?, free_shipping=?, tax_band_id=?, updated_at=datetime('now') WHERE id=?`,
    [title, slug, description || null, vendor || null, tags_text || '', published === '1' ? 1 : 0,
     seo_title || null, seo_description || null, free_shipping === '1' ? 1 : 0, tax_band_id_update, id],
  );

  // Update variants if provided
  const variantIds = (req.body.variant_ids ?? '').split(',').filter(Boolean);
  for (const vid of variantIds) {
    const vPrice = Math.round(parseFloat(req.body[`price_${vid}`] || '0') * 100);
    const vCompare = req.body[`compare_at_price_${vid}`]
      ? Math.round(parseFloat(req.body[`compare_at_price_${vid}`]) * 100) : null;
    const vQty = parseInt(req.body[`inventory_quantity_${vid}`] || '0', 10);
    execute(
      `UPDATE product_variants SET title=?, price=?, compare_at_price=?, sku=?, inventory_quantity=?, updated_at=datetime('now') WHERE id=? AND product_id=?`,
      [req.body[`variant_title_${vid}`] || 'Default', vPrice, vCompare, req.body[`sku_${vid}`] || null, vQty, vid, id],
    );
  }

  return reply.redirect(`/admin/products/${id}?saved=1`);
}

async function deleteProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  execute('DELETE FROM products WHERE id = ?', [req.params.id]);
  return reply.redirect('/admin/products?deleted=1');
}

async function uploadImage(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const product = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [req.params.id]);
  if (!product) return reply.code(404).send('Not found');

  const data = await req.file();
  if (!data) return reply.redirect(`/admin/products/${req.params.id}?error=no_file`);

  const buf = await data.toBuffer();
  const processed = await processUploadedImage(buf, data.filename);

  const maxPos = queryOne<{ m: number }>('SELECT COALESCE(MAX(position),0) AS m FROM product_images WHERE product_id = ?', [product.id])?.m ?? 0;
  execute(
    'INSERT INTO product_images (id, product_id, original, thumbnail, medium, large, alt, position) VALUES (?,?,?,?,?,?,?,?)',
    [crypto.randomUUID(), product.id, processed.original, processed.thumbnail, processed.medium, processed.large, '', maxPos + 1],
  );

  return reply.redirect(`/admin/products/${req.params.id}?uploaded=1`);
}

async function deleteImage(
  req: FastifyRequest<{ Params: { id: string; imageId: string } }>,
  reply: FastifyReply,
) {
  execute('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
  return reply.redirect(`/admin/products/${req.params.id}`);
}
