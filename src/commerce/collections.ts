import {
  findCollectionBySlug,
  findAllCollections,
  type CollectionRow,
} from '../db/queries/collections';
import { listCollectionProducts, listProducts } from './products';
import type { ProductSummary } from '../theme/context';

export interface Collection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  productCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface CollectionPage extends Collection {
  products: ProductSummary[];
  pagination: {
    currentPage: number; totalPages: number;
    hasNext: boolean;    hasPrev: boolean;
    nextUrl: string | null; prevUrl: string | null;
  };
  sort: { current: string; options: { value: string; label: string }[] };
}

function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id, title: row.title, slug: row.slug, description: row.description,
    productCount: row.product_count,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
  };
}

const SORT_OPTIONS = [
  { value: 'featured',   label: 'Featured' },
  { value: 'price-asc',  label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest',     label: 'Newest' },
];

export async function getCollectionPage(slug: string, sortBy = 'featured'): Promise<CollectionPage | null> {
  let products: ProductSummary[];
  let meta: Collection;

  if (slug === 'all') {
    products = await listProducts();
    meta = { id: '', title: 'All Products', slug: 'all', description: null, productCount: products.length, seoTitle: null, seoDescription: null };
  } else {
    const row = findCollectionBySlug(slug);
    if (!row) return null;
    products = await listCollectionProducts(row.id);
    meta = rowToCollection(row);
  }

  const sorted = [...products];
  if (sortBy === 'price-asc')  sorted.sort((a, b) => a.price.amount - b.price.amount);
  if (sortBy === 'price-desc') sorted.sort((a, b) => b.price.amount - a.price.amount);
  if (sortBy === 'newest')     sorted.sort((a, b) => b.id.localeCompare(a.id));

  return {
    ...meta,
    products: sorted,
    pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false, nextUrl: null, prevUrl: null },
    sort: { current: sortBy, options: SORT_OPTIONS },
  };
}

export async function listCollections(): Promise<Collection[]> {
  return findAllCollections().map(rowToCollection);
}

/** Products for a homepage featured section — all products when collectionSlug is blank. */
export async function listFeaturedProducts(collectionSlug: string, limit: number, sort: 'featured' | 'newest' = 'featured'): Promise<ProductSummary[]> {
  if (!collectionSlug) return listProducts(limit);
  const row = findCollectionBySlug(collectionSlug);
  if (!row) return [];
  return listCollectionProducts(row.id, limit, sort);
}
