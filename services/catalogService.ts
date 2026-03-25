import api from '@/lib/axios';
import axios from 'axios';
import { getBaseProductName, getColorLabel, getSizeLabel } from '@/lib/productNameUtils';
import inventoryService from './inventoryService';

/**
 * -----------------------------
 * Core Catalog Models
 * -----------------------------
 */
export interface ProductImage {
  id: number;
  url: string;
  is_primary: boolean;
  alt_text?: string;
  display_order?: number;
}

export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
  image_url?: string;
  product_count?: number;
  parent_id?: number | null;
  slug?: string;
}

export interface Product {
  id: number;
  name: string;
  base_name?: string;
  variation_suffix?: string | null;
  display_name?: string;
  option_label?: string;
  has_variants?: boolean;
  total_variants?: number;
  variants?: Product[];
  sku: string;
  slug?: string;
  description: string;
  short_description?: string;
  cost_price: number;
  selling_price: number;
  price: number;
  weight?: number;
  dimensions?: string;
  in_stock: boolean;
  stock_quantity: number;
  category: ProductCategory | string;
  images: ProductImage[];
  tags?: string[];
  attributes?: { [key: string]: any };
  ratings?: {
    average: number;
    count: number;
  };
  batches?: any[];
  created_at: string;
  updated_at: string;
}

export interface SimpleProduct {
  id: number;
  name: string;
  base_name?: string;
  variation_suffix?: string | null;
  display_name?: string;
  option_label?: string;
  has_variants?: boolean;
  total_variants?: number;
  variants?: Product[];
  sku: string;
  selling_price: number;
  in_stock: boolean;
  stock_quantity: number;
  category?: ProductCategory | string | null;
  images: ProductImage[];
}

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  has_more_pages: boolean;
}

/**
 * Public grouped catalog structure (Feb 2026 API)
 */
export interface CatalogGroupedProduct {
  base_name: string;
  description?: string;
  category: ProductCategory | null;
  has_variants: boolean;
  main_variant: Product;
  variants: Product[]; // variants excluding main_variant
  total_variants: number;
  in_stock_variants: number;
  total_stock: number;
  min_price: number;
  max_price: number;
}

export interface CatalogProductsResponse {
  products: Product[]; // flattened variants for backward compatibility
  grouped_products?: CatalogGroupedProduct[];
  pagination: PaginationMeta;
  meta?: {
    filters_applied?: { [key: string]: any };
    query?: string;
    total_results?: number;
  };
}

export interface ProductDetailResponse {
  product: Product;
  related_products: SimpleProduct[];
}

export interface BranchStock {
  store_id: number;
  store_name: string;
  store_address: string;
  total_quantity: number;
}

export interface BranchStockResponse {
  success: boolean;
  data: BranchStock[];
}

export interface CategoriesResponse {
  categories: CatalogCategory[];
}

export interface SearchProductsResponse {
  products: Product[];
  grouped_products?: CatalogGroupedProduct[];
  pagination: PaginationMeta;
  meta: {
    query: string;
    total_results: number;
  };
}

export interface SuggestedProductsResponse {
  suggested_products: SimpleProduct[];
}

export interface CartData {
  id?: number;
  product_id: number;
  quantity: number;
  variant_options?: {
    color?: string;
    size?: string;
    [key: string]: any;
  };
  notes?: string;
}

export interface CartResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface GetProductsParams {
  category_id?: number;
  category?: string;
  category_slug?: string;
  sort_order?: 'asc' | 'desc';
  sort?: string;
  order?: 'asc' | 'desc';
  direction?: 'asc' | 'desc';
  search?: string;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  sort_by?: 'price_asc' | 'price_desc' | 'newest' | 'name';
  per_page?: number;
  page?: number;
  featured?: boolean;
  new_arrivals?: boolean;
  /** Internal-only: suppress noisy console errors for expected retry probes */
  _suppressErrorLog?: boolean;
}

export interface SearchProductsParams {
  q: string;
  category_id?: number;
  min_price?: number;
  max_price?: number;
  sort?: string;
  per_page?: number;
  page?: number;
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  image_url?: string;
  color?: string;
  icon?: string;
  product_count?: number;
  parent_id?: number | null;
  children?: Category[];
}

/**
 * Aliases used by other services/components
 */
export interface CatalogImage {
  id: number;
  image_url: string;
  is_primary?: boolean;
}
export type CatalogProductImage = ProductImage;
export interface CatalogCategory {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  image_url?: string;
  color?: string;
  icon?: string;
  parent_id?: number | null;
  is_active?: boolean;
  product_count?: number;
  children?: CatalogCategory[];
  parent?: CatalogCategory | null;
}

// Backward-compatible aliases for older imports
export type GroupedProduct = CatalogGroupedProduct;
export type ProductResponse = CatalogProductsResponse;

/**
 * -----------------------------
 * Internal helpers
 * -----------------------------
 */
const toNumber = (value: any, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeString = (value: any, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
};

const normalizeBoolean = (value: any, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }

  return fallback;
};


const toAbsoluteAssetUrl = (value: any): string => {
  const raw = normalizeString(value || '');
  if (!raw) return '';

  // Already absolute URL (http://, https://, protocol-relative, data URI)
  if (/^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw)) {
    return raw;
  }

  // Keep only known frontend-local placeholder assets untouched.
  // IMPORTANT: real product images can also arrive as `/images/...` from backend,
  // so we must not treat every `/images/*` path as local.
  const isFrontendPlaceholder =
    /^\/(?:images\/)?placeholder-product\.(?:png|jpe?g|webp|svg)$/i.test(raw) ||
    /^\/placeholder-product\.(?:png|jpe?g|webp|svg)$/i.test(raw);

  if (isFrontendPlaceholder) {
    return raw;
  }

  // Legacy category image paths: `category/...` should resolve from `/storage/category/...`.
  // This is important for the e-commerce homepage/category sections.
  let normalizedRaw = raw;
  if (/^\/?category\//i.test(normalizedRaw) && !/\/storage\/category\//i.test(normalizedRaw)) {
    normalizedRaw = normalizedRaw.replace(/^\/?category\//i, '/storage/category/');
  }

  const apiBase = normalizeString(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  const appBase = normalizeString(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');

  const backendBase =
    (apiBase ? apiBase.replace(/\/api(?:\/v\d+)?$/i, '') : '') ||
    appBase ||
    '';

  if (!backendBase) return normalizedRaw;

  const path = normalizedRaw.startsWith('/') ? normalizedRaw : `/${normalizedRaw}`;
  return `${backendBase}${path}`;
};

const normalizeImage = (image: any, index = 0): ProductImage | null => {
  if (!image) return null;

  const url = toAbsoluteAssetUrl(
    image.url ||
    image.image_url ||
    image.src ||
    image.path ||
    image.image ||
    ''
  );

  if (!url || typeof url !== 'string') return null;

  const displayOrder = toNumber(
    image.display_order ??
      image.sort_order ??
      image.order ??
      image.position ??
      image.sequence ??
      index,
    index
  );

  return {
    id: toNumber(image.id, index + 1),
    url,
    is_primary: normalizeBoolean(
      image.is_primary ?? image.primary ?? image.isPrimary,
      index === 0
    ),
    alt_text: image.alt_text || image.alt || undefined,
    display_order: displayOrder,
  };
};

const normalizeImages = (images: any): ProductImage[] => {
  if (!Array.isArray(images)) return [];
  const normalized = images
    .map((img, idx) => normalizeImage(img, idx))
    .filter((img): img is ProductImage => Boolean(img));

  normalized.sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;

    const orderDiff = toNumber(a.display_order, 0) - toNumber(b.display_order, 0);
    if (orderDiff !== 0) return orderDiff;

    return toNumber(a.id, 0) - toNumber(b.id, 0);
  });

  return normalized;
};


/**
 * -----------------------------
 * Image propagation helpers
 * -----------------------------
 * Some API payloads attach images to only one variant (or omit images for related products).
 * For a better UX, if any item in a variant group has images, we reuse that image set for siblings
 * that have an empty images array.
 */
const cloneImages = (imgs: ProductImage[]): ProductImage[] => imgs.map((i) => ({ ...i }));

/**
 * Collect ALL images from ALL items that have images, de-duplicated by id.
 * This ensures a variant with no images shows every image from every
 * sibling variant — not just the images from the first sibling found.
 */
const pickSharedImages = (items: Array<{ images?: ProductImage[] | null }>): ProductImage[] => {
  const seen = new Set<number>();
  const all: ProductImage[] = [];
  for (const it of items) {
    const imgs = Array.isArray(it?.images) ? (it.images as ProductImage[]) : [];
    for (const img of imgs) {
      if (!seen.has(img.id)) {
        seen.add(img.id);
        all.push({ ...img });
      }
    }
  }
  return all;
};

const propagateSharedImages = <T extends { images?: ProductImage[]; variants?: any[] }>(product: T): T => {
  if (!product) return product;

  const variants = Array.isArray((product as any).variants) ? (product as any).variants : [];
  const shared = pickSharedImages([product as any, ...variants]);

  if (shared.length) {
    if (!Array.isArray((product as any).images) || (product as any).images.length === 0) {
      (product as any).images = cloneImages(shared);
    }
    for (const v of variants) {
      if (!v) continue;
      if (!Array.isArray(v.images) || v.images.length === 0) {
        v.images = cloneImages(shared);
      }
    }
  }

  return product;
};

const propagateSharedImagesBySku = <T extends { sku?: string; images?: ProductImage[] }>(items: T[]): T[] => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const sharedBySku = new Map<string, ProductImage[]>();

  // First pass: pool ALL images for each SKU across all items (not just first found)
  for (const it of items) {
    const sku = normalizeString((it as any)?.sku || '').trim();
    const imgs = Array.isArray((it as any)?.images) ? ((it as any).images as ProductImage[]) : [];
    if (!sku || !imgs.length) continue;
    const existing = sharedBySku.get(sku) || [];
    const existingIds = new Set(existing.map((i) => i.id));
    const merged = [...existing, ...imgs.filter((i) => !existingIds.has(i.id)).map((i) => ({ ...i }))];
    sharedBySku.set(sku, merged);
  }

  for (const it of items) {
    const sku = normalizeString((it as any)?.sku || '').trim();
    const imgs = Array.isArray((it as any)?.images) ? ((it as any).images as ProductImage[]) : [];
    if (sku && imgs.length === 0 && sharedBySku.has(sku)) {
      (it as any).images = cloneImages(sharedBySku.get(sku)!);
    }
  }

  return items;
};


const normalizeCategory = (category: any): ProductCategory | null => {
  if (!category) return null;

  if (typeof category === 'string') {
    const name = category.trim();
    if (!name) return null;
    return {
      id: 0,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
    };
  }

  const id = toNumber(category.id, 0);
  const name = normalizeString(category.name || category.title || category.label);

  if (!name) return null;

  return {
    id,
    name,
    description: normalizeString(category.description || ''),
    image_url: toAbsoluteAssetUrl(category.image_url || category.image || undefined),
    product_count: toNumber(category.product_count, 0),
    parent_id: category.parent_id ?? null,
    slug: category.slug || name.toLowerCase().replace(/\s+/g, '-'),
  };
};

const normalizeAttributes = (raw: any, variationSuffix?: string | null) => {
  const attrs: Record<string, any> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...raw }
      : {};

  // If backend only sends variation_suffix, infer color/size for UI selectors.
  const suffix = normalizeString(variationSuffix || '');
  if (suffix && (!attrs.color || !attrs.size)) {
    const syntheticName = `X${suffix.startsWith('-') ? '' : '-'}${suffix}`;
    const inferredColor = getColorLabel(syntheticName);
    const inferredSize = getSizeLabel(syntheticName);

    if (!attrs.color && inferredColor) attrs.color = inferredColor;
    if (!attrs.size && inferredSize) attrs.size = inferredSize;
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
};

const normalizeProduct = (
  raw: any,
  context?: {
    base_name?: string;
    description?: string;
    category?: ProductCategory | null;
  }
): Product => {
  const category = normalizeCategory(raw?.category) || context?.category || null;

  const name = normalizeString(raw?.name || raw?.product_name || context?.base_name || 'Product');
  const baseName = normalizeString(raw?.base_name || context?.base_name || getBaseProductName(name));
  const variationSuffix =
    raw?.variation_suffix !== undefined && raw?.variation_suffix !== null
      ? normalizeString(raw?.variation_suffix)
      : null;

  const sellingPrice = toNumber(raw?.selling_price ?? raw?.price ?? raw?.sale_price, 0);
  const costPrice = toNumber(raw?.cost_price ?? raw?.regular_price ?? sellingPrice, sellingPrice);
  const stockQty = toNumber(raw?.stock_quantity ?? raw?.quantity ?? raw?.available_quantity, 0);

  const explicitInStock = raw?.in_stock;
  const inStock = typeof explicitInStock === 'boolean' ? explicitInStock : stockQty > 0;

  // Pull images from the root product first.
  // If the root has no images, pool ALL images from ALL sibling variants
  // (not just the first one found), de-duplicated by id.
  // This handles list endpoints that return:
  //   { images: [], variants: [ { images: [] }, { images: [{...}] } ] }
  const rawImages = raw?.images || raw?.product_images || raw?.media || [];
  const rawVariants: any[] = Array.isArray(raw?.variants) ? raw.variants : [];
  const fallbackRawImages: any[] =
    (!Array.isArray(rawImages) || rawImages.length === 0) && rawVariants.length > 0
      ? (() => {
          const seen = new Set<any>();
          const pool: any[] = [];
          for (const v of rawVariants) {
            if (!Array.isArray(v?.images)) continue;
            for (const img of v.images) {
              const key = img?.id ?? img?.url ?? img;
              if (key && !seen.has(key)) {
                seen.add(key);
                pool.push(img);
              }
            }
          }
          return pool;
        })()
      : [];
  const images = normalizeImages(rawImages.length > 0 ? rawImages : fallbackRawImages);

  return {
    id: toNumber(raw?.id, 0),
    name,
    base_name: baseName || undefined,
    variation_suffix: variationSuffix,
    display_name: normalizeString(raw?.display_name || '' ) || undefined,
    option_label: normalizeString(raw?.option_label || '' ) || undefined,
    has_variants: raw?.has_variants !== undefined ? Boolean(raw?.has_variants) : undefined,
    total_variants: raw?.total_variants !== undefined ? toNumber(raw?.total_variants, 0) : undefined,
    sku: normalizeString(raw?.sku || raw?.product_sku || ''),
    slug: raw?.slug || undefined,
    description: normalizeString(raw?.description || ''),
    short_description: normalizeString(raw?.short_description || ''),
    cost_price: costPrice,
    selling_price: sellingPrice,
    price: sellingPrice,
    weight: raw?.weight !== undefined ? toNumber(raw.weight, 0) : undefined,
    dimensions: raw?.dimensions || undefined,
    in_stock: inStock,
    stock_quantity: stockQty,
    category: category || '',
    images,
    tags: Array.isArray(raw?.tags) ? raw.tags : undefined,
    attributes: normalizeAttributes(raw?.attributes || raw?.custom_fields, variationSuffix),
    ratings: raw?.ratings
      ? {
        average: toNumber(raw.ratings.average, 0),
        count: toNumber(raw.ratings.count, 0),
      }
      : undefined,
    batches: Array.isArray(raw?.batches) ? raw.batches : undefined,
    created_at: normalizeString(raw?.created_at || ''),
    updated_at: normalizeString(raw?.updated_at || raw?.created_at || ''),
  };
};

const flattenGroupedProducts = (groups: CatalogGroupedProduct[]): Product[] => {
  const flattened: Product[] = [];
  const seen = new Set<number>();

  for (const group of groups) {
    const variants = [group.main_variant, ...(group.variants || [])];
    for (const variant of variants) {
      if (!variant || !variant.id || seen.has(variant.id)) continue;
      seen.add(variant.id);
      flattened.push(variant);
    }
  }

  return flattened;
};

const getCategoryKey = (category: ProductCategory | string): string => {
  if (!category) return 'cat:none';
  if (typeof category === 'string') return `cat:${category.trim().toLowerCase()}`;
  if (category.id) return `cat:${category.id}`;
  return `cat:${(category.name || '').trim().toLowerCase()}`;
};

const buildGroupedProductsFromFlat = (products: Product[]): CatalogGroupedProduct[] => {
  const groups = new Map<string, Product[]>();

  products.forEach((product) => {
    const baseName = normalizeString(product.base_name || getBaseProductName(product.name));
    const key = `${baseName.toLowerCase()}|${getCategoryKey(product.category)}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      ...product,
      base_name: baseName,
    });
  });

  const groupedProducts: CatalogGroupedProduct[] = [];

  for (const [, variants] of groups.entries()) {
    if (!variants.length) continue;

    const sorted = [...variants].sort((a, b) => {
      const aStock = a.in_stock ? 1 : 0;
      const bStock = b.in_stock ? 1 : 0;
      if (bStock !== aStock) return bStock - aStock;

      const aPrice = toNumber(a.selling_price, 0);
      const bPrice = toNumber(b.selling_price, 0);
      if (bPrice !== aPrice) return bPrice - aPrice;

      return a.id - b.id;
    });

    const mainVariant = sorted[0];
    const otherVariants = sorted.slice(1);

    const allPrices = sorted.map((v) => toNumber(v.selling_price, 0));
    const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
    const maxPrice = allPrices.length ? Math.max(...allPrices) : 0;
    const totalStock = sorted.reduce((acc, v) => acc + toNumber(v.stock_quantity, 0), 0);
    const inStockVariants = sorted.filter((v) => v.in_stock || toNumber(v.stock_quantity, 0) > 0).length;

    groupedProducts.push({
      base_name: normalizeString(mainVariant.base_name || getBaseProductName(mainVariant.name)),
      description: mainVariant.description,
      category: normalizeCategory(mainVariant.category) || null,
      has_variants: sorted.length > 1,
      main_variant: mainVariant,
      variants: otherVariants,
      total_variants: sorted.length,
      in_stock_variants: inStockVariants,
      total_stock: totalStock,
      min_price: minPrice,
      max_price: maxPrice,
    });
  }

  return groupedProducts;
};

const normalizeGroupedProduct = (rawGroup: any): CatalogGroupedProduct => {
  const category = normalizeCategory(rawGroup?.category);
  const baseName = normalizeString(
    rawGroup?.base_name ||
    rawGroup?.main_variant?.base_name ||
    rawGroup?.mainVariant?.base_name ||
    rawGroup?.main_variant?.name ||
    rawGroup?.mainVariant?.name ||
    'Product'
  );
  const description = normalizeString(rawGroup?.description || '');

  const rawMain = rawGroup?.main_variant || rawGroup?.mainVariant || rawGroup?.main || rawGroup?.product || rawGroup;

  const mainVariant = normalizeProduct(rawMain, {
    base_name: baseName,
    description,
    category,
  });

  const rawVariantsArray = Array.isArray(rawGroup?.variants) ? rawGroup.variants : [];
  const normalizedAllVariants = rawVariantsArray
    .map((variant: any) =>
      normalizeProduct(variant, {
        base_name: baseName,
        description,
        category,
      })
    )
    .filter((v: Product) => v.id > 0);

  // API docs indicate variants excludes main. Some implementations may include main, so de-dupe.
  const variants = normalizedAllVariants.filter((v: Product) => v.id !== mainVariant.id);

  const all = [mainVariant, ...variants];

  // If only one variant has images, reuse them for siblings that have none.
  const sharedImages = pickSharedImages(all);
  if (sharedImages.length) {
    if (!mainVariant.images || mainVariant.images.length === 0) {
      mainVariant.images = cloneImages(sharedImages);
    }
    for (const v of variants) {
      if (!v.images || v.images.length === 0) {
        v.images = cloneImages(sharedImages);
      }
    }
  }


  const allPrices = all.map((v) => toNumber(v.selling_price, 0));
  const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length ? Math.max(...allPrices) : 0;

  const totalStock = all.reduce((sum, v) => sum + toNumber(v.stock_quantity, 0), 0);
  const inStockVariants = all.filter((v) => v.in_stock || toNumber(v.stock_quantity, 0) > 0).length;

  return {
    base_name: baseName,
    description,
    category: category || null,
    has_variants: rawGroup?.has_variants ?? all.length > 1,
    main_variant: mainVariant,
    variants,
    total_variants: all.length,
    in_stock_variants: inStockVariants,
    total_stock: totalStock,
    min_price: minPrice,
    max_price: maxPrice,
  };
};

const isPaginatorShape = (obj: any): boolean => {
  return !!obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.data) &&
    (obj.current_page !== undefined || obj.per_page !== undefined || obj.total !== undefined);
};

const extractPaginator = (raw: any): any => {
  if (!raw || typeof raw !== 'object') return null;
  if (isPaginatorShape(raw)) return raw;

  // Sometimes wrapped again in data
  if (raw.data && isPaginatorShape(raw.data)) return raw.data;

  // Laravel-like wrapper: { products: [], pagination: {...} } handled elsewhere
  return null;
};

const normalizePagination = (source: any, itemCount: number): PaginationMeta => {
  const currentPage = toNumber(source?.current_page ?? source?.page, 1) || 1;
  const perPage = toNumber(source?.per_page, itemCount || 20) || (itemCount || 20);
  const total = toNumber(source?.total, itemCount);
  const lastPage = toNumber(source?.last_page, Math.max(1, Math.ceil((total || itemCount || 1) / Math.max(perPage, 1))));

  return {
    current_page: currentPage,
    per_page: perPage,
    total,
    last_page: Math.max(1, lastPage),
    has_more_pages: Boolean(source?.has_more_pages ?? (currentPage < Math.max(1, lastPage))),
  };
};

const parseProductsPayload = (payload: any): CatalogProductsResponse => {
  // 1) Legacy shape: { products: [...], pagination: {...} }
  if (payload && Array.isArray(payload.products)) {
    const products = payload.products.map((p: any) => normalizeProduct(p));
    const groupedProducts = Array.isArray(payload.grouped_products)
      ? payload.grouped_products.map((g: any) => normalizeGroupedProduct(g))
      : buildGroupedProductsFromFlat(products);

    return {
      products,
      grouped_products: groupedProducts,
      pagination: normalizePagination(payload.pagination, products.length),
      meta: payload.meta,
    };
  }

  // 2) Feb 2026 grouped paginator shape
  const paginator = extractPaginator(payload);
  if (paginator) {
    const rows = Array.isArray(paginator.data) ? paginator.data : [];

    const looksGrouped = rows.some((row: any) => row && (row.main_variant || row.mainVariant || row.base_name));

    if (looksGrouped) {
      const groupedProducts = rows.map((row: any) => normalizeGroupedProduct(row));
      const products = flattenGroupedProducts(groupedProducts);

      return {
        products,
        grouped_products: groupedProducts,
        pagination: normalizePagination(paginator, groupedProducts.length),
        meta: payload?.meta,
      };
    }

    // Flat paginated rows
    const products = rows.map((row: any) => normalizeProduct(row));
    return {
      products,
      grouped_products: buildGroupedProductsFromFlat(products),
      pagination: normalizePagination(paginator, products.length),
      meta: payload?.meta,
    };
  }

  // 3) Bare list fallback
  if (Array.isArray(payload)) {
    const products = payload.map((row: any) => normalizeProduct(row));
    return {
      products,
      grouped_products: buildGroupedProductsFromFlat(products),
      pagination: normalizePagination({}, products.length),
      meta: undefined,
    };
  }

  // 4) Unknown shape fallback
  return {
    products: [],
    grouped_products: [],
    pagination: normalizePagination({}, 0),
    meta: undefined,
  };
};


const normalizeCatalogCategoryTree = (raw: any): CatalogCategory | null => {
  if (!raw || typeof raw !== 'object') return null;

  const name = normalizeString(raw.name || raw.title || raw.label || '');
  if (!name) return null;

  const childrenRaw = Array.isArray(raw.children) ? raw.children : [];
  const children = childrenRaw
    .map((child: any) => normalizeCatalogCategoryTree(child))
    .filter((child): child is CatalogCategory => Boolean(child));

  return {
    id: toNumber(raw.id, 0),
    name,
    slug: normalizeString(raw.slug || name.toLowerCase().replace(/\s+/g, '-')),
    description: normalizeString(raw.description || '') || undefined,
    image: toAbsoluteAssetUrl(
      raw.image ||
      raw.image_url ||
      raw.image_path ||
      raw.thumbnail ||
      raw.thumbnail_url ||
      raw.photo ||
      raw.photo_url ||
      raw.media_url ||
      raw.cover ||
      raw.cover_image ||
      raw.icon_url ||
      (raw.media && (raw.media.url || raw.media.path)) ||
      undefined
      ) || undefined,
    image_url: toAbsoluteAssetUrl(
      raw.image_url ||
      raw.image ||
      raw.image_path ||
      raw.thumbnail ||
      raw.thumbnail_url ||
      raw.photo ||
      raw.photo_url ||
      raw.media_url ||
      raw.cover ||
      raw.cover_image ||
      raw.icon_url ||
      (raw.media && (raw.media.url || raw.media.path)) ||
      undefined
    ) || undefined,
    color: normalizeString(raw.color || '') || undefined,
    icon: normalizeString(raw.icon || '') || undefined,
    parent_id: raw.parent_id ?? null,
    is_active: raw.is_active !== undefined ? Boolean(raw.is_active) : undefined,
    product_count: toNumber(raw.product_count, 0),
    children,
    parent: null,
  };
};

const linkCategoryParents = (nodes: CatalogCategory[], parent: CatalogCategory | null = null) => {
  nodes.forEach((node) => {
    node.parent = parent;
    if (Array.isArray(node.children) && node.children.length > 0) {
      linkCategoryParents(node.children, node);
    }
  });
};

/**
 * -----------------------------
 * Catalog Service
 * -----------------------------
 */
const catalogService = {
  async getProducts(params?: GetProductsParams): Promise<CatalogProductsResponse> {
    const suppressErrorLog = Boolean((params as any)?._suppressErrorLog);
    try {
      const requestParams: Record<string, any> = { ...(params || {}) };
      delete requestParams._suppressErrorLog;

      // Backwards/forwards compatible category filters:
      // Some backends expect `category` (slug/name) while others use `category_id`.
      if (!requestParams.category && !requestParams.category_slug && requestParams.category_id) {
        // Keep category_id, but allow servers that also accept `category_id` + `category` to work.
        // (CategoryPage sets these explicitly.)
      }

      // Backwards/forwards compatible sort mapping:
      // Different API versions have used different parameter names.
      const sortBy = requestParams.sort_by;
      if (sortBy === 'newest') {
        requestParams.sort_order = requestParams.sort_order || 'desc';
        requestParams.sort = requestParams.sort || 'created_at';
        requestParams.order = requestParams.order || 'desc';
        requestParams.direction = requestParams.direction || 'desc';
      } else if (sortBy === 'price_asc') {
        requestParams.sort = requestParams.sort || 'selling_price';
        requestParams.order = requestParams.order || 'asc';
        requestParams.sort_order = requestParams.sort_order || 'asc';
        requestParams.direction = requestParams.direction || 'asc';
      } else if (sortBy === 'price_desc') {
        requestParams.sort = requestParams.sort || 'selling_price';
        requestParams.order = requestParams.order || 'desc';
        requestParams.sort_order = requestParams.sort_order || 'desc';
        requestParams.direction = requestParams.direction || 'desc';
      } else if (sortBy === 'name') {
        requestParams.sort = requestParams.sort || 'name';
        requestParams.order = requestParams.order || 'asc';
        requestParams.sort_order = requestParams.sort_order || 'asc';
        requestParams.direction = requestParams.direction || 'asc';
      }

      const response = await api.get('/catalog/products', { params: requestParams });
      const payload = response?.data?.data ?? response?.data ?? {};
      const parsed = parseProductsPayload(payload);
      return parsed;
    } catch (error) {
      if (!suppressErrorLog) {
        console.error('Error fetching products:', error);
      }
      throw new Error('Failed to fetch products');
    }
  },

  async getProduct(productIdentifier: number | string): Promise<ProductDetailResponse> {
    try {
      const response = await api.get(`/catalog/products/${productIdentifier}`);
      const payload = response?.data?.data ?? response?.data ?? {};

      // Legacy shape: { product, related_products }
      if (payload?.product) {
        const rawProduct = payload.product;
        const category = normalizeCategory(rawProduct?.category);
        const baseName = normalizeString(rawProduct?.base_name || getBaseProductName(rawProduct?.name || ''));
        const description = normalizeString(rawProduct?.description || '');

        const product = normalizeProduct(rawProduct, {
          base_name: baseName,
          description,
          category,
        });

        // Keep variants when legacy payload nests them under product.
        const variantsRaw = Array.isArray(rawProduct?.variants)
          ? rawProduct.variants
          : Array.isArray(payload?.variants)
            ? payload.variants
            : [];

        const normalizedVariants = variantsRaw.map((v: any) =>
          normalizeProduct(v, {
            base_name: baseName,
            description,
            category,
          })
        );

        (product as any).variants = normalizedVariants;

        // Ensure missing variant images inherit from any sibling that has an image.
        propagateSharedImages(product as any);

        const related = Array.isArray(payload.related_products)
          ? payload.related_products.map((p: any) =>
              normalizeProduct(p) as SimpleProduct
            )
          : [];

        // Related products often omit images for sibling variants. Reuse by SKU when possible.
        propagateSharedImagesBySku([...(product as any).variants || [], ...(related as any)]);

        return {
          product,
          related_products: related,
        };
      }

      // New shape: direct product payload with variants
      if (payload && (payload.id || payload.sku)) {
        const category = normalizeCategory(payload.category);
        const baseName = normalizeString(payload.base_name || getBaseProductName(payload.name || ''));
        const description = normalizeString(payload.description || '');

        const product = normalizeProduct(payload, {
          base_name: baseName,
          description,
          category,
        });

        // Attach normalized variants for consumers that want to use the new structure.
        const variantsRaw = Array.isArray(payload.variants) ? payload.variants : [];
        const variants = variantsRaw.map((v: any) =>
          normalizeProduct(v, {
            base_name: baseName,
            description,
            category,
          })
        );

        (product as any).variants = variants;

        // Ensure missing variant images inherit from any sibling that has an image.
        propagateSharedImages(product as any);

        const related = Array.isArray(payload.related_products)
          ? payload.related_products.map((p: any) =>
              normalizeProduct(p, { base_name: baseName, description, category }) as SimpleProduct
            )
          : [];

        // Related products often omit images for sibling variants. Reuse by SKU when possible.
        propagateSharedImagesBySku([...(product as any).variants || [], ...(related as any)]);

        return {
          product,
          related_products: related,
        };
      }

      throw new Error('Product data missing from response');
    } catch (error) {
      console.error('Error fetching product:', error);
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error('Product not found');
      }
      throw new Error('Failed to fetch product details');
    }
  },

  async getCategories(): Promise<CatalogCategory[]> {
    try {
      const response = await api.get('/catalog/categories');
      const payload = response?.data?.data;

      const rawCategories =
        (Array.isArray(payload) ? payload : null) ||
        (Array.isArray(payload?.categories) ? payload.categories : null) ||
        (Array.isArray(response?.data?.categories) ? response.data.categories : []);

      const normalized = (rawCategories || [])
        .map((cat: any) => normalizeCatalogCategoryTree(cat))
        .filter((cat): cat is CatalogCategory => Boolean(cat));

      linkCategoryParents(normalized);
      return normalized;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  },

  async searchProducts(params: SearchProductsParams): Promise<SearchProductsResponse> {
    const mappedParams = {
      search: params.q,
      category_id: params.category_id,
      min_price: params.min_price,
      max_price: params.max_price,
      sort_by: params.sort as any,
      per_page: params.per_page,
      page: params.page,
    };

    try {
      // Preferred: unified public catalog endpoint
      const response = await api.get('/catalog/products', { params: mappedParams });
      const payload = response?.data?.data ?? response?.data ?? {};
      const parsed = parseProductsPayload(payload);

      return {
        products: parsed.products,
        grouped_products: parsed.grouped_products,
        pagination: parsed.pagination,
        meta: {
          query: params.q,
          total_results: parsed.pagination.total,
        },
      };
    } catch (error) {
      // Backward-compatible fallback
      try {
        const response = await api.get('/catalog/search', { params });
        const payload = response?.data?.data ?? response?.data ?? {};
        const parsed = parseProductsPayload(payload);

        return {
          products: parsed.products,
          grouped_products: parsed.grouped_products,
          pagination: parsed.pagination,
          meta: {
            query: params.q,
            total_results: parsed.pagination.total,
          },
        };
      } catch (fallbackError) {
        console.error('Error searching products:', fallbackError || error);
        throw new Error('Failed to search products');
      }
    }
  },

  async getFeaturedProducts(limit: number = 8): Promise<SimpleProduct[]> {
    try {
      const response = await api.get('/catalog/featured-products', {
        params: { limit }
      });

      const payload = response?.data?.data ?? response?.data ?? [];

      if (Array.isArray(payload)) {
        return payload.map((p: any) => normalizeProduct(p) as SimpleProduct);
      }

      if (Array.isArray(payload?.products)) {
        return payload.products.map((p: any) => normalizeProduct(p) as SimpleProduct);
      }

      return [];
    } catch (error) {
      console.error('Error fetching featured products:', error);
      throw new Error('Failed to fetch featured products');
    }
  },

  async getSuggestedProducts(limit: number = 4): Promise<SuggestedProductsResponse> {
    try {
      const response = await api.get('/catalog/suggested-products', {
        params: { limit }
      });

      const payload = response?.data?.data ?? response?.data ?? {};

      if (Array.isArray(payload?.suggested_products)) {
        return {
          suggested_products: payload.suggested_products.map((p: any) => normalizeProduct(p) as SimpleProduct),
        };
      }

      if (Array.isArray(payload?.products)) {
        return {
          suggested_products: payload.products.map((p: any) => normalizeProduct(p) as SimpleProduct),
        };
      }

      if (Array.isArray(payload)) {
        return {
          suggested_products: payload.map((p: any) => normalizeProduct(p) as SimpleProduct),
        };
      }

      return { suggested_products: [] };
    } catch (error) {
      console.error('Error fetching suggested products:', error);
      return { suggested_products: [] };
    }
  },

  async addToCart(cartData: CartData): Promise<CartResponse> {
    try {
      const response = await api.post('/cart/add', cartData);
      return response.data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw new Error('Failed to add product to cart');
    }
  },

  async addToWishlist(productId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/wishlist/add', { product_id: productId });
      return response.data;
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      throw new Error('Failed to add product to wishlist');
    }
  },

  async getBranchStock(productId: number): Promise<BranchStock[]> {
    try {
      const response = await inventoryService.getGlobalInventory({ product_id: productId });
      if (response.success && response.data.length > 0) {
        // Take the first product match (since we filtered by product_id)
        const productInventory = response.data[0];
        
        // Map to BranchStock[] format
        return productInventory.stores.map(s => ({
          store_id: s.store_id,
          store_name: s.store_name,
          store_address: s.store_address || '',
          total_quantity: s.quantity
        }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching branch stock:', error);
      return [];
    }
  },
};

export default catalogService;