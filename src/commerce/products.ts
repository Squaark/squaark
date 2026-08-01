import {
  findAllProducts,
  findProductsByCollection,
  findProductBySlug,
  findProductImages,
  findProductVariants,
  findRelatedProducts,
  searchProducts as dbSearchProducts,
  type ProductRow,
  type ProductImageRow,
  type VariantRow,
} from '../db/queries/products';
import type { ProductSummary, Image, Variant } from '../theme/context';
import { money } from '../theme/context';
import { getRatingSummaries } from '../db/queries/reviews';

/** Attaches published-review rating summaries to a set of product cards in one batch query. */
function attachRatings(summaries: ProductSummary[]): ProductSummary[] {
  if (summaries.length === 0) return summaries;
  const ratings = getRatingSummaries(summaries.map((s) => s.id));
  for (const s of summaries) s.rating = ratings.get(s.id) ?? null;
  return summaries;
}

function rowToImage(row: {
  img_original: string | null; img_thumbnail: string | null;
  img_medium: string | null;   img_large: string | null;
  img_alt: string | null;
}, title = ''): Image | null {
  if (!row.img_original) return null;
  return {
    original:  row.img_original,
    thumbnail: row.img_thumbnail ?? row.img_original,
    medium:    row.img_medium    ?? row.img_original,
    large:     row.img_large     ?? row.img_original,
    alt:       row.img_alt       ?? title,
  };
}

function imageRowToImage(row: ProductImageRow): Image {
  return { original: row.original, thumbnail: row.thumbnail, medium: row.medium, large: row.large, alt: row.alt };
}

function variantRowToVariant(row: VariantRow): Variant {
  return {
    id:             row.id,
    title:          row.title,
    price:          money(row.price),
    compareAtPrice: row.compare_at_price != null && row.compare_at_price > 0 ? money(row.compare_at_price) : null,
    sku:            row.sku,
    available:      row.inventory_quantity > 0,
    options:        row.options ? JSON.parse(row.options) : {},
    image:          rowToImage(row),
  };
}

export function rowToProductSummary(row: ProductRow): ProductSummary {
  return {
    id:             row.id,
    title:          row.title,
    slug:           row.slug,
    price:          money(row.price ?? 0),
    compareAtPrice: row.compare_at_price != null && row.compare_at_price > 0 ? money(row.compare_at_price) : null,
    onSale:         row.on_sale === 1,
    available:      row.available === 1,
    vendor:         row.vendor,
    image:          rowToImage(row, row.title),
    taxRate:        row.tax_rate ?? null,
  };
}

export async function listProducts(limit?: number): Promise<ProductSummary[]> {
  return attachRatings(findAllProducts(limit).map(rowToProductSummary));
}

export async function searchProducts(q: string): Promise<ProductSummary[]> {
  return attachRatings(dbSearchProducts(q).map(rowToProductSummary));
}

export async function listCollectionProducts(collectionId: string, limit?: number, sort: 'featured' | 'newest' = 'featured'): Promise<ProductSummary[]> {
  return attachRatings(findProductsByCollection(collectionId, limit, sort).map(rowToProductSummary));
}

export interface FullProduct {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: ReturnType<typeof money>;
  compareAtPrice: ReturnType<typeof money> | null;
  onSale: boolean;
  images: Image[];
  variants: Variant[];
  options: { name: string; values: string[] }[];
  available: boolean;
  vendor: string | null;
  tags: string[];
  relatedProducts: ProductSummary[];
  seoTitle: string | null;
  seoDescription: string | null;
  taxRate: string | null;
}

export async function getProduct(slug: string): Promise<FullProduct | null> {
  const row = findProductBySlug(slug);
  if (!row) return null;

  const imageRows   = findProductImages(row.id);
  const variantRows = findProductVariants(row.id);
  const relatedRows = findRelatedProducts(row.id);

  const images = imageRows.length
    ? imageRows.map(imageRowToImage)
    : (rowToImage(row, row.title) ? [rowToImage(row, row.title)!] : []);

  return {
    id:             row.id,
    title:          row.title,
    slug:           row.slug,
    description:    row.description ?? '',
    price:          money(row.price ?? 0),
    compareAtPrice: row.compare_at_price != null && row.compare_at_price > 0 ? money(row.compare_at_price) : null,
    onSale:         row.on_sale === 1,
    images,
    variants:       variantRows.map(variantRowToVariant),
    options:        [],
    available:      row.available === 1,
    vendor:         row.vendor,
    tags:           row.tags_text ? row.tags_text.split(' ').filter(Boolean) : [],
    relatedProducts: attachRatings(relatedRows.map(rowToProductSummary)),
    seoTitle:       row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    taxRate:        row.tax_rate ?? null,
  };
}
