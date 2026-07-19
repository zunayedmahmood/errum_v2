import type { CatalogCategory, SimpleProduct } from '@/services/catalogService';

export const ERRUM_CYAN = '#18d6d2';

export const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-');

export const flattenCategories = (categories: CatalogCategory[]): CatalogCategory[] => {
  const out: CatalogCategory[] = [];
  const walk = (nodes: CatalogCategory[]) => nodes.forEach((node) => {
    out.push(node);
    if (node.children?.length) walk(node.children);
  });
  walk(categories || []);
  return out;
};

export const findCategory = (categories: CatalogCategory[], key?: string | null) => {
  if (!key) return undefined;
  const decoded = decodeURIComponent(key).toLowerCase();
  return flattenCategories(categories).find((category) =>
    String(category.id) === decoded ||
    (category.slug || '').toLowerCase() === decoded ||
    slugify(category.name) === decoded ||
    category.name.toLowerCase() === decoded
  );
};

export const categoryName = (product?: SimpleProduct | null): string => {
  if (!product?.category) return '';
  return typeof product.category === 'string' ? product.category : product.category.name || '';
};

export const productName = (product?: SimpleProduct | null): string =>
  product?.display_name || product?.base_name || product?.name || 'ERRUM DROP';

export const productImage = (product?: SimpleProduct | null): string =>
  product?.images?.find((image) => image.is_primary)?.url || product?.images?.[0]?.url || '/images/placeholder-product.jpg';

export const categoryImage = (category?: CatalogCategory | null): string =>
  category?.banner_url || category?.banner || category?.image_url || category?.image || '/images/placeholder-product.jpg';

export const formatPrice = (value: number | string | undefined | null): string =>
  `Tk ${Math.max(0, Number(value || 0)).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`;

export const groupedDisplayProducts = (response: any): SimpleProduct[] => {
  if (Array.isArray(response?.grouped_products) && response.grouped_products.length) {
    return response.grouped_products.map((group: any) => ({
      ...group.main_variant,
      has_variants: group.has_variants,
      total_variants: group.total_variants,
      variants: [group.main_variant, ...(group.variants || [])],
    }));
  }
  return Array.isArray(response?.products) ? response.products : [];
};
