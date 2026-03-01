import { GroupedProduct, ProductResponse, SimpleProduct } from '@/services/catalogService';

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toUnixMs = (value: unknown): number => {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
};

export const getVariantListForCard = (product: SimpleProduct): SimpleProduct[] => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const combined = [product, ...variants].filter(Boolean) as SimpleProduct[];
  return dedupeVariants(combined);
};

export const getCardNewestSortKey = (product: SimpleProduct): number => {
  const variants = getVariantListForCard(product);
  let newestTime = 0;
  let newestId = 0;

  variants.forEach((item) => {
    newestId = Math.max(newestId, toNumber((item as any)?.id));
    newestTime = Math.max(
      newestTime,
      toUnixMs((item as any)?.created_at),
      toUnixMs((item as any)?.updated_at),
    );
  });

  // Timestamp drives order. ID is a tiebreaker for records without dates.
  return newestTime > 0 ? newestTime * 100000 + newestId : newestId;
};

const dedupeVariants = (variants: SimpleProduct[]): SimpleProduct[] => {
  const seen = new Set<string>();
  const list: SimpleProduct[] = [];

  variants.forEach((variant) => {
    const key =
      (variant as any)?.id != null
        ? `id:${(variant as any).id}`
        : (variant as any)?.sku
          ? `sku:${(variant as any).sku}`
          : `${variant?.name || ''}|${(variant as any)?.base_name || ''}`;

    if (seen.has(key)) return;
    seen.add(key);
    list.push(variant);
  });

  return list;
};

const pickSharedImages = (items: SimpleProduct[]): SimpleProduct['images'] => {
  for (const p of items) {
    const imgs = (p as any)?.images;
    if (Array.isArray(imgs) && imgs.length > 0) return imgs;
  }
  return [];
};

/**
 * If a card has variants and any variant has images, copy the first available image-set
 * to card + sibling variants that have empty images.
 */
const propagateImagesAcrossVariants = (card: SimpleProduct): SimpleProduct => {
  const variants = getVariantListForCard(card);
  const shared = pickSharedImages([card, ...variants]);
  if (shared.length === 0) return card;

  if (!Array.isArray((card as any).images) || (card as any).images.length === 0) {
    (card as any).images = shared;
  }

  if (Array.isArray((card as any).variants)) {
    (card as any).variants = (card as any).variants.map((v: any) => {
      const vImgs = Array.isArray(v?.images) ? v.images : [];
      return vImgs.length > 0 ? v : { ...v, images: shared };
    });
  }

  return card;
};

/**
 * KEY FIX FOR HOMEPAGE/CATEGORY LISTS:
 * Many list endpoints return products WITHOUT variants, so variant-propagation can't work.
 * But the list contains multiple records with the same SKU; only one may have images.
 * This copies images across all products with the same SKU within the list.
 */
const propagateImagesAcrossListBySku = (list: SimpleProduct[]): SimpleProduct[] => {
  const skuToImages = new Map<string, any[]>();

  // First pass: capture the first available images per SKU
  for (const p of list) {
    const sku = String((p as any)?.sku || '').trim();
    const imgs = (p as any)?.images;
    if (!sku) continue;
    if (!skuToImages.has(sku) && Array.isArray(imgs) && imgs.length > 0) {
      skuToImages.set(sku, imgs);
    }
  }

  if (skuToImages.size === 0) return list;

  // Second pass: fill missing images
  return list.map((p) => {
    const sku = String((p as any)?.sku || '').trim();
    if (!sku) return p;

    const shared = skuToImages.get(sku);
    const imgs = (p as any)?.images;

    if (shared && (!Array.isArray(imgs) || imgs.length === 0)) {
      return { ...(p as any), images: shared };
    }
    return p;
  });
};

const groupToCardProduct = (group: GroupedProduct): SimpleProduct => {
  const rawVariants = [group.main_variant, ...(group.variants || [])].filter(Boolean) as SimpleProduct[];
  const allVariants = dedupeVariants(rawVariants);
  const main = group.main_variant || allVariants[0];

  if (!main) {
    return {
      id: 0,
      name: group.base_name || 'Product',
      display_name: group.base_name || 'Product',
      base_name: group.base_name || undefined,
      variation_suffix: '',
      sku: '',
      selling_price: 0,
      stock_quantity: 0,
      description: group.description || '',
      images: [],
      category: group.category,
      in_stock: false,
      has_variants: false,
      total_variants: 1,
      variants: [],
    } as any;
  }

  const card: SimpleProduct = {
    ...main,
    name: group.base_name || (main as any).base_name || (main as any).display_name || (main as any).name,
    display_name: group.base_name || (main as any).display_name || (main as any).base_name || (main as any).name,
    base_name: group.base_name || (main as any).base_name || (main as any).display_name || (main as any).name,
    description: (group as any).description ?? (main as any).description,
    category: (group as any).category || (main as any).category,
    has_variants: Boolean((group as any).has_variants || allVariants.length > 1),
    total_variants: allVariants.length,
    variants: allVariants,
  } as any;

  return propagateImagesAcrossVariants(card);
};

/**
 * Build card products from catalog API response (grouped OR flat), then:
 * 1) propagate images across same-SKU items in list (homepage/category)
 * 2) propagate images across variants when variants exist (product cards)
 */
export const buildCardProductsFromResponse = (response: ProductResponse): SimpleProduct[] => {
  const grouped =
    (Array.isArray((response as any)?.grouped_products)
      ? ((response as any).grouped_products as GroupedProduct[])
      : null) ||
    (Array.isArray((response as any)?.groupedProducts)
      ? ((response as any).groupedProducts as GroupedProduct[])
      : []);

  let out: SimpleProduct[] = [];

  if (grouped.length > 0) {
    out = grouped.map(groupToCardProduct);
  } else {
    const flat =
      (Array.isArray((response as any)?.products) ? ((response as any).products as SimpleProduct[]) : null) ||
      (Array.isArray((response as any)?.data) ? ((response as any).data as SimpleProduct[]) : null) ||
      (Array.isArray((response as any)?.items) ? ((response as any).items as SimpleProduct[]) : null) ||
      [];
    out = dedupeVariants(flat);
  }

  // ✅ Fix listing pages first
  out = propagateImagesAcrossListBySku(out);

  // ✅ Then ensure variant propagation where variants exist
  out = out.map((p) => propagateImagesAcrossVariants(p));

  return out;
};

export const getAdditionalVariantCount = (product: SimpleProduct): number => {
  const all = getVariantListForCard(product);
  return Math.max(0, all.length - 1);
};

export const getCardStockLabel = (product: SimpleProduct): string => {
  // Prefer explicit in_stock boolean if present
  if ((product as any).in_stock === true) return 'In Stock';

  const mainStock = Number((product as any).stock_quantity || 0);
  if (mainStock > 0) return 'In Stock';

  const allVariants = getVariantListForCard(product);
  const hasOtherStock = allVariants.some((variant) => {
    if ((variant as any).id && (product as any).id && (variant as any).id === (product as any).id) return false;
    if ((variant as any).in_stock === true) return true;
    return Number((variant as any).stock_quantity || 0) > 0;
  });

  if (hasOtherStock) return 'Available in other variants';
  return 'Out of Stock';
};

export const getCardPriceText = (product: SimpleProduct): string => {
  const variants = getVariantListForCard(product);
  const prices = variants
    .map((item) => toNumber((item as any).selling_price))
    .filter((price) => price > 0);

  if (prices.length === 0) {
    const fallback = toNumber((product as any).selling_price);
    return `৳${fallback.toLocaleString()}`;
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (minPrice === maxPrice) {
    return `৳${minPrice.toLocaleString()}`;
  }

  return `৳${minPrice.toLocaleString()} - ৳${maxPrice.toLocaleString()}`;
};