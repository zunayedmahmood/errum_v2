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

export const toMoneyNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatPrice = (value: number | string | undefined | null): string =>
  `Tk ${Math.max(0, toMoneyNumber(value)).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

const positivePrices = (values: unknown[]): number[] => values
  .map((value) => toMoneyNumber(value, 0))
  .filter((value) => value > 0);

export const productPriceRange = (product?: SimpleProduct | null): { min: number; max: number } => {
  if (!product) return { min: 0, max: 0 };
  const raw = product as any;
  const variantPrices = Array.isArray(raw.variants)
    ? raw.variants.flatMap((variant: any) => [
        variant?.selling_price,
        variant?.price,
        variant?.sale_price,
        variant?.min_price,
      ])
    : [];
  const prices = positivePrices([
    raw.min_price,
    raw.selling_price,
    raw.price,
    raw.sale_price,
    raw.max_price,
    ...variantPrices,
  ]);
  if (!prices.length) return { min: 0, max: 0 };
  const explicitMin = toMoneyNumber(raw.min_price, 0);
  const explicitMax = toMoneyNumber(raw.max_price, 0);
  return {
    min: explicitMin > 0 ? explicitMin : Math.min(...prices),
    max: explicitMax > 0 ? explicitMax : Math.max(...prices),
  };
};

export const formatProductPrice = (product?: SimpleProduct | null): string => {
  const { min, max } = productPriceRange(product);
  if (min > 0 && max > 0 && Math.abs(max - min) > 0.009) {
    return `${formatPrice(min)} – ${formatPrice(max).replace(/^Tk\s*/, '')}`;
  }
  return formatPrice(min || max);
};

const itemAvailableStock = (item: any): number => {
  const available = toMoneyNumber(
    item?.available_inventory ?? item?.available_quantity ?? item?.total_available,
    Number.NaN,
  );
  if (Number.isFinite(available)) return Math.max(0, available);
  const stock = toMoneyNumber(
    item?.stock_quantity ?? item?.total_stock ?? item?.quantity ?? item?.physical_quantity,
    0,
  );
  const reserved = toMoneyNumber(item?.reserved_inventory ?? item?.reserved_quantity, 0);
  return Math.max(0, stock - reserved);
};

/** A product group is sold out only when every one of its variations is unavailable. */
export const productHasStock = (product?: SimpleProduct | null): boolean => {
  if (!product) return false;
  const raw = product as any;
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  if (variants.some((variant: any) => itemAvailableStock(variant) > 0 || variant?.in_stock === true)) return true;
  if (itemAvailableStock(raw) > 0) return true;
  return raw.in_stock === true && variants.length === 0;
};

export const groupedDisplayProducts = (response: any): SimpleProduct[] => {
  if (Array.isArray(response?.grouped_products) && response.grouped_products.length) {
    return response.grouped_products
      .map((group: any) => {
        const main = group?.main_variant || group?.mainVariant || group?.product;
        if (!main) return null;
        const variants = [main, ...(Array.isArray(group?.variants) ? group.variants : [])]
          .filter(Boolean)
          .filter((variant: any, index: number, all: any[]) => all.findIndex((item) => item?.id === variant?.id) === index);
        const prices = positivePrices([
          group?.min_price,
          group?.max_price,
          ...variants.flatMap((variant: any) => [variant?.selling_price, variant?.price, variant?.sale_price]),
        ]);
        const minPrice = toMoneyNumber(group?.min_price, 0) || (prices.length ? Math.min(...prices) : 0);
        const maxPrice = toMoneyNumber(group?.max_price, 0) || (prices.length ? Math.max(...prices) : minPrice);
        const totalAvailable = group?.total_available != null
          ? Math.max(0, toMoneyNumber(group.total_available, 0))
          : variants.reduce((sum: number, variant: any) => sum + itemAvailableStock(variant), 0);
        const inStock = toMoneyNumber(group?.in_stock_variants, 0) > 0
          || totalAvailable > 0
          || variants.some((variant: any) => variant?.in_stock === true || itemAvailableStock(variant) > 0);

        return {
          ...main,
          has_variants: group?.has_variants ?? variants.length > 1,
          total_variants: group?.total_variants ?? group?.variants_count ?? variants.length,
          variants,
          min_price: minPrice,
          max_price: maxPrice,
          selling_price: minPrice || toMoneyNumber(main?.selling_price ?? main?.price, 0),
          price: minPrice || toMoneyNumber(main?.price ?? main?.selling_price, 0),
          total_available: totalAvailable,
          available_inventory: totalAvailable,
          stock_quantity: Math.max(
            totalAvailable,
            toMoneyNumber(group?.total_stock, 0),
            variants.reduce((sum: number, variant: any) => sum + toMoneyNumber(variant?.stock_quantity, 0), 0),
          ),
          in_stock: inStock,
        } as SimpleProduct;
      })
      .filter((product: SimpleProduct | null): product is SimpleProduct => Boolean(product));
  }

  return Array.isArray(response?.products)
    ? response.products.map((product: SimpleProduct) => ({
        ...product,
        in_stock: productHasStock(product),
      }))
    : [];
};

