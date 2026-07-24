import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../connection';

export interface ProductFileRow {
  id: string;
  product_id: string;
  filename: string;
  original_name: string;
  mime_type: string | null;
  size: number;
  created_at: string;
}

export interface OrderDownloadRow {
  id: string;
  order_id: string;
  order_item_id: string;
  product_file_id: string;
  token: string;
  download_count: number;
  max_downloads: number | null;
  expires_at: string | null;
  created_at: string;
  // Joined fields
  original_name: string;
  filename: string;
  product_title: string;
}

export function findFileForProduct(productId: string): ProductFileRow | null {
  return queryOne<ProductFileRow>(
    'SELECT * FROM product_files WHERE product_id = ? ORDER BY created_at DESC LIMIT 1',
    [productId],
  );
}

export function saveProductFile(
  productId: string,
  filename: string,
  originalName: string,
  mimeType: string | null,
  size: number,
): ProductFileRow {
  // One file per product — delete old before inserting
  execute('DELETE FROM product_files WHERE product_id = ?', [productId]);
  const id = randomUUID();
  execute(
    'INSERT INTO product_files (id, product_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?,?)',
    [id, productId, filename, originalName, mimeType, size],
  );
  return queryOne<ProductFileRow>('SELECT * FROM product_files WHERE id = ?', [id])!;
}

export function deleteProductFile(productId: string): void {
  execute('DELETE FROM product_files WHERE product_id = ?', [productId]);
}

export interface CreatedDownload {
  token: string;
  productTitle: string;
  originalName: string;
}

export function createOrderDownloads(orderId: string, expiryDays = 30): CreatedDownload[] {
  const rows = query<{
    order_item_id: string;
    product_file_id: string;
    original_name: string;
    product_title: string;
  }>(`
    SELECT
      oi.id AS order_item_id,
      pf.id AS product_file_id,
      pf.original_name,
      oi.product_title
    FROM order_items oi
    JOIN product_variants pv ON pv.id = oi.variant_id
    JOIN product_files pf ON pf.product_id = pv.product_id
    WHERE oi.order_id = ?
  `, [orderId]);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);
  const expiresStr = expiresAt.toISOString().replace('T', ' ').split('.')[0];

  const created: CreatedDownload[] = [];
  for (const row of rows) {
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    execute(
      `INSERT INTO order_downloads (id, order_id, order_item_id, product_file_id, token, expires_at)
       VALUES (?,?,?,?,?,?)`,
      [randomUUID(), orderId, row.order_item_id, row.product_file_id, token, expiresStr],
    );
    created.push({ token, productTitle: row.product_title, originalName: row.original_name });
  }
  return created;
}

export function findDownloadByToken(token: string): OrderDownloadRow | null {
  return queryOne<OrderDownloadRow>(`
    SELECT
      od.*,
      pf.original_name,
      pf.filename,
      oi.product_title
    FROM order_downloads od
    JOIN product_files pf ON pf.id = od.product_file_id
    JOIN order_items oi ON oi.id = od.order_item_id
    WHERE od.token = ?
  `, [token]);
}

export function incrementDownloadCount(downloadId: string): void {
  execute(
    `UPDATE order_downloads SET download_count = download_count + 1 WHERE id = ?`,
    [downloadId],
  );
}

export function findDownloadsForOrder(orderId: string): OrderDownloadRow[] {
  return query<OrderDownloadRow>(`
    SELECT
      od.*,
      pf.original_name,
      pf.filename,
      oi.product_title
    FROM order_downloads od
    JOIN product_files pf ON pf.id = od.product_file_id
    JOIN order_items oi ON oi.id = od.order_item_id
    WHERE od.order_id = ?
    ORDER BY od.created_at
  `, [orderId]);
}
