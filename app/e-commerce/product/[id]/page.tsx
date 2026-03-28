'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ShoppingCart,
  Heart,
  Share2,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  MapPin
} from 'lucide-react';

import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';

import { useCart } from '@/app/e-commerce/CartContext';
import Navigation from '@/components/ecommerce/Navigation';
import { getBaseProductName, getColorLabel, getSizeLabel } from '@/lib/productNameUtils';
import { adaptCatalogGroupedProducts, groupProductsByMother } from '@/lib/ecommerceProductGrouping';
import CartSidebar from '@/components/ecommerce/cart/CartSidebar';
import catalogService, {
  Product,
  ProductCategory,
  ProductDetailResponse,
  SimpleProduct,
  ProductImage,
  BranchStock
} from '@/services/catalogService';
import cartService from '@/services/cartService';
import { wishlistUtils } from '@/lib/wishlistUtils';

// Types for product variations
interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  color?: string;
  size?: string;
  variation_suffix?: string | null;
  option_label?: string;
  selling_price: number | null; // ✅ allow null safely
  in_stock: boolean;
  stock_quantity: number | null;
  available_inventory: number | null; // ✅ from reserved_products — drives button & badge
  images: ProductImage[] | null; // ✅ allow null safely
}

const normalizeVariantText = (value: any): string =>
  String(value ?? '')
    .trim()
    .replace(/[‐‑‒–—−﹘﹣－]/g, '-')
    .replace(/\s+/g, ' ');

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const parseMarketSizePairs = (value: string): string[] => {
  const text = normalizeVariantText(value)
    .replace(/[|,;/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return [];

  const pairs: string[] = [];
  const seen = new Set<string>();
  const re = /(US|EU|UK|BD|CM|MM)\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const market = String(match[1] || '').toUpperCase();
    const size = String(match[2] || '').trim();
    if (!market || !size) continue;

    const key = `${market}-${size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(`${market} ${size}`);
  }

  // Helpful fallback for values like "40 US 7" where EU is implied.
  if (pairs.length > 0) {
    const hasUS = pairs.some((p) => p.startsWith('US '));
    const hasEU = pairs.some((p) => p.startsWith('EU '));

    if (hasUS && !hasEU) {
      const twoDigit = text.match(/\b(3\d|4\d|5\d|60)\b/);
      if (twoDigit && !seen.has(`EU-${twoDigit[1]}`)) {
        pairs.unshift(`EU ${twoDigit[1]}`);
      }
    }
  }

  return pairs;
};

const normalizeSizeDescriptor = (value: string): string | undefined => {
  const text = normalizeVariantText(value);
  if (!text) return undefined;

  const pairs = parseMarketSizePairs(text);
  if (pairs.length > 0) {
    return Array.from(new Set(pairs)).join(' / ');
  }

  return undefined;
};

const SIZE_WORD_TOKENS = new Set([
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL',
  'FREE SIZE', 'FREESIZE', 'ONE SIZE', 'ONESIZE',
]);

const isLikelySizeToken = (token: string): boolean => {
  const t = normalizeVariantText(token).toUpperCase();
  if (!t) return false;
  if (SIZE_WORD_TOKENS.has(t)) return true;

  if (parseMarketSizePairs(t).length > 0) return true;

  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    // shoes/apparel size ranges + compact single digit sizes.
    return (n >= 1 && n <= 15) || (n >= 20 && n <= 60);
  }

  if (/^\d{1,3}(US|EU|UK|BD|CM|MM)$/i.test(t)) return true;

  return /^(US|EU|UK|BD|CM|MM)\s*\d{1,3}(?:\.\d+)?$/i.test(t);
};

const MARKET_SIZE_TOKENS = new Set(['US', 'EU', 'UK', 'BD', 'CM', 'MM']);
const NON_COLOR_TOKENS = new Set(['NA', 'N/A', 'NOT', 'APPLICABLE', 'NOT APPLICABLE']);

const isNumericToken = (value: string): boolean => /^\d{1,3}(?:\.\d+)?$/.test(normalizeVariantText(value));

const prettifyToken = (token: string): string => {
  const t = normalizeVariantText(token).replace(/_/g, ' ');
  if (!t) return '';
  const up = t.toUpperCase();
  if (MARKET_SIZE_TOKENS.has(up) || NON_COLOR_TOKENS.has(up)) return up;
  if (isNumericToken(t)) return t;
  return t
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const normalizeColorToken = (token: string): string => {
  const up = normalizeVariantText(token).toUpperCase();
  if (NON_COLOR_TOKENS.has(up)) return '';
  return prettifyToken(token);
};

const parseVariationSuffix = (suffix?: string | null): { color?: string; size?: string; label?: string } => {
  const raw = normalizeVariantText(suffix || '');
  if (!raw) return {};

  const marketPairsFromRaw = parseMarketSizePairs(raw);
  const trimmed = raw.startsWith('-') ? raw.slice(1) : raw;
  const tokens = trimmed.split('-').map((t) => normalizeVariantText(t)).filter(Boolean);
  if (!tokens.length) {
    const sizeOnly = normalizeSizeDescriptor(raw);
    return sizeOnly
      ? { size: sizeOnly, label: sizeOnly }
      : {};
  }

  const usedAsSize = new Set<number>();
  const sizeParts: string[] = [];

  // First pass: explicit market-size pairs (e.g., US-7, EU-40)
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const currentUp = current.toUpperCase();
    const nextIsNumeric = isNumericToken(next);

    if (MARKET_SIZE_TOKENS.has(currentUp) && nextIsNumeric) {
      sizeParts.push(`${currentUp} ${next}`);
      usedAsSize.add(i);
      usedAsSize.add(i + 1);
      i += 1;
      continue;
    }

    // Pattern like 40-US-7 should preserve 40 and only pair US-7.
    const nextUp = next.toUpperCase();
    const hasTrailingNumeric = i + 2 < tokens.length && isNumericToken(tokens[i + 2]);
    if (isNumericToken(current) && MARKET_SIZE_TOKENS.has(nextUp) && !hasTrailingNumeric) {
      sizeParts.push(`${nextUp} ${current}`);
      usedAsSize.add(i);
      usedAsSize.add(i + 1);
      i += 1;
    }
  }

  // Second pass: leftover tokens that look like size values (e.g., 7, 40, XL)
  for (let i = 0; i < tokens.length; i += 1) {
    if (usedAsSize.has(i)) continue;
    const token = tokens[i];
    if (isLikelySizeToken(token)) {
      // If US size already exists and this is a plain 2-digit number, treat as EU size.
      const hasUS = sizeParts.some((s) => s.startsWith('US '));
      const n = Number(token);
      if (hasUS && /^\d{2}$/.test(token) && n >= 30 && n <= 60) {
        sizeParts.push(`EU ${token}`);
      } else {
        sizeParts.push(prettifyToken(token));
      }
      usedAsSize.add(i);
    }
  }

  // Ensure market-size pairs are never lost for values like "EU 40 US 7"
  // where tokenization may keep them in a single token.
  marketPairsFromRaw.forEach((pair) => sizeParts.push(pair));

  const colorTokens = tokens
    .filter((_, idx) => !usedAsSize.has(idx))
    .map((t) => normalizeColorToken(t))
    .filter(Boolean);

  const color = colorTokens.length ? colorTokens.join(' ') : undefined;
  const dedupedSizeParts = Array.from(new Set(sizeParts.filter(Boolean)));
  const size = dedupedSizeParts.length ? dedupedSizeParts.join(' / ') : undefined;

  const label =
    (color && size && `${color} / ${size}`) ||
    color ||
    size ||
    tokens.map((t) => prettifyToken(t)).filter(Boolean).join(' ');

  return { color, size, label: label || undefined };
};

const deriveVariantMeta = (variant: any, name: string) => {
  const parsed = parseVariationSuffix(variant?.variation_suffix);

  const rawColor = normalizeVariantText(variant?.attributes?.color || variant?.color);
  const rawSize = normalizeVariantText(variant?.attributes?.size || variant?.size);

  const color =
    (rawColor ? normalizeColorToken(rawColor) : '') ||
    parsed.color ||
    getColorLabel(name) ||
    undefined;

  const size =
    (rawSize ? normalizeSizeDescriptor(rawSize) || prettifyToken(rawSize) : '') ||
    parsed.size ||
    normalizeSizeDescriptor(name || '') ||
    getSizeLabel(name) ||
    undefined;

  const variationSuffix = normalizeVariantText(variant?.variation_suffix || '') || null;

  const optionLabel =
    normalizeVariantText(
      variant?.option_label ||
      parsed.label ||
      (variationSuffix ? parseVariationSuffix(variationSuffix).label : '') ||
      [color, size].filter(Boolean).join(' / ')
    ) ||
    undefined;

  return { color, size, variationSuffix, optionLabel };
};

const getVariationDisplayLabel = (variant: ProductVariant, index: number): string => {
  const explicit = normalizeVariantText(variant.option_label || '');
  if (explicit) return explicit;

  const parts = [normalizeVariantText(variant.color || ''), normalizeVariantText(variant.size || '')]
    .filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' / ');
  }

  const fromSuffix = parseVariationSuffix(variant.variation_suffix).label;
  if (fromSuffix) return normalizeVariantText(fromSuffix);

  if (variant.sku) return `SKU ${variant.sku}`;
  return `Option ${index + 1}`;
};

const getCategoryId = (category: Product['category'] | null | undefined): number | undefined => {
  if (!category || typeof category === 'string') return undefined;
  const id = Number(category.id);
  return Number.isFinite(id) ? id : undefined;
};

const getCategoryName = (category: Product['category'] | null | undefined): string | undefined => {
  if (!category) return undefined;
  if (typeof category === 'string') {
    const value = category.trim();
    return value || undefined;
  }

  const value = String(category.name || '').trim();
  return value || undefined;
};

const getCategorySlug = (category: Product['category'] | null | undefined): string | undefined => {
  if (!category) return undefined;
  if (typeof category === 'string') return slugify(category);
  if (category.slug) return category.slug;
  return slugify(category.name);
};


const getNewestKey = (product: SimpleProduct): number => {
  const variantIds = Array.isArray((product as any).variants)
    ? ((product as any).variants as any[]).map((v) => Number(v?.id) || 0)
    : [];
  const selfId = Number(product?.id) || 0;
  return Math.max(selfId, ...variantIds);
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id ? parseInt(params.id as string) : null;

  const { refreshCart } = useCart();

  // State
  const [product, setProduct] = useState<Product | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<SimpleProduct[]>([]);
  const [branchStocks, setBranchStocks] = useState<BranchStock[]>([]);
  const [loadingBranchStock, setLoadingBranchStock] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [cartSidebarOpen, setCartSidebarOpen] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);

  // ✅ Safe price formatter (prevents toLocaleString crash)
  const formatBDT = (value: any) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '৳0.00';
    return `৳${n.toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    const token =
      localStorage.getItem('auth_token') ||
      localStorage.getItem('customer_token') ||
      localStorage.getItem('token');
    return !!token;
  };


  // Fetch product data and variations
  useEffect(() => {
    if (!productId) {
      setError('Invalid product ID');
      setLoading(false);
      return;
    }

    const fetchProductAndVariations = async () => {
      try {
        setLoading(true);
        setError(null);

        const response: ProductDetailResponse = await catalogService.getProduct(productId);
        const mainProduct = response.product;

        setProduct(mainProduct);
        setRelatedProducts([...(response.related_products || [])].sort((a, b) => getNewestKey(b) - getNewestKey(a)));

        // Fetch branch stock for the current product
        setLoadingBranchStock(true);
        catalogService.getBranchStock(productId).then(stocks => {
          setBranchStocks(stocks);
          setLoadingBranchStock(false);
        }).catch(() => {
          setLoadingBranchStock(false);
        });

        const directVariantsRaw = Array.isArray((mainProduct as any).variants)
          ? (mainProduct as any).variants
          : [];

        const buildVariantFromAny = (variant: any): ProductVariant => {
          const name = variant?.name || '';
          const meta = deriveVariantMeta(variant, name);

          return {
            id: Number(variant?.id),
            name,
            sku: variant?.sku || `product-${variant?.id}`,
            color: meta.color,
            size: meta.size,
            variation_suffix: meta.variationSuffix,
            option_label: meta.optionLabel,
            selling_price: Number(variant?.selling_price ?? variant?.price ?? 0),
            in_stock:
              typeof variant?.in_stock === 'boolean'
                ? variant.in_stock
                : Number(variant?.stock_quantity || 0) > 0,
            stock_quantity: Number(variant?.stock_quantity || 0),
            available_inventory: variant?.available_inventory != null
              ? Number(variant.available_inventory)
              : Number(variant?.stock_quantity || 0),
            images: Array.isArray(variant?.images) ? variant.images : [],
          };
        };

        // Prefer backend-provided grouped variants from single-product endpoint
        if (directVariantsRaw.length > 0) {
          const deduped = new Map<number, ProductVariant>();

          directVariantsRaw.forEach((variant: any) => {
            const normalized = buildVariantFromAny(variant);
            if (!deduped.has(normalized.id)) deduped.set(normalized.id, normalized);
          });

          const currentVariant = buildVariantFromAny(mainProduct);
          if (!deduped.has(currentVariant.id)) deduped.set(currentVariant.id, currentVariant);

          const variations = Array.from(deduped.values()).sort((a, b) => {
            const aColor = (a.color || '').toLowerCase();
            const bColor = (b.color || '').toLowerCase();
            const aSize = (a.size || '').toLowerCase();
            const bSize = (b.size || '').toLowerCase();

            if (aColor !== bColor) return aColor.localeCompare(bColor);
            return aSize.localeCompare(bSize);
          });

          setProductVariants(variations);
          setSelectedVariant(
            variations.find((v) => v.id === productId) ||
            variations.find((v) => v.in_stock) ||
            variations[0] ||
            null
          );

          return;
        }

        const allProductsResponse = await catalogService.getProducts({
          // Pull a wider range so we can find sibling variations even when each variation has a unique SKU.
          per_page: 500,
        });

        setAllProducts(allProductsResponse.products);

        const mainBaseName = getBaseProductName(
          mainProduct.name || '',
          (mainProduct as any).base_name || undefined
        );
        const mainCategoryId = getCategoryId(mainProduct.category);

        const groupedFromApi = Array.isArray(allProductsResponse.grouped_products)
          ? adaptCatalogGroupedProducts(allProductsResponse.grouped_products)
          : [];

        const grouped = groupedFromApi.length > 0
          ? groupedFromApi
          : groupProductsByMother(allProductsResponse.products, {
            // Home sections group by mother name irrespective of category payload shape.
            // Use same behavior on details page so "X options" always matches.
            useCategoryInKey: false,
            preferSkuGrouping: false,
          });

        const selectedGroupById = grouped.find((g) =>
          g.variants.some((v) => Number(v.id) === Number(mainProduct.id))
        );

        const selectedGroupByRule = grouped.find((g) => {
          const sameSku = !!mainProduct.sku && g.variants.some((v) => v.sku === mainProduct.sku);

          const sameBase =
            g.baseName.trim().toLowerCase() === mainBaseName.trim().toLowerCase();

          const sameCategory = mainCategoryId
            ? !g.category?.id || g.category.id === mainCategoryId
            : true;

          return sameSku || (sameBase && sameCategory);
        });

        const selectedGroup = selectedGroupById || selectedGroupByRule;

        const variations: ProductVariant[] = (selectedGroup?.variants || [])
          .map((variant) => {
            const raw = (variant as any).raw || {};
            const meta = deriveVariantMeta(raw, variant.name || raw?.name || '');

            return {
              id: variant.id,
              name: variant.name,
              sku: variant.sku || `product-${variant.id}`,
              color: meta.color || variant.color || getColorLabel(variant.name),
              size: meta.size || variant.size || getSizeLabel(variant.name),
              variation_suffix: meta.variationSuffix || raw?.variation_suffix || null,
              option_label: meta.optionLabel,
              selling_price: variant.price ?? raw.selling_price ?? null,
              in_stock: !!variant.in_stock,
              stock_quantity: variant.stock_quantity ?? raw.stock_quantity ?? 0,
              available_inventory: (variant as any).available_inventory ?? raw.available_inventory ?? variant.stock_quantity ?? raw.stock_quantity ?? 0,
              images: raw.images ?? [],
            } as ProductVariant;
          })
          .sort((a, b) => {
            const aColor = (a.color || '').toLowerCase();
            const bColor = (b.color || '').toLowerCase();
            const aSize = (a.size || '').toLowerCase();
            const bSize = (b.size || '').toLowerCase();

            if (aColor !== bColor) return aColor.localeCompare(bColor);
            return aSize.localeCompare(bSize);
          });

        // ✅ If no variations were found for this SKU, still show the product itself
        if (variations.length === 0) {
          const selfMeta = deriveVariantMeta(mainProduct as any, mainProduct.name);
          const selfVariant: ProductVariant = {
            id: mainProduct.id,
            name: mainProduct.name,
            sku: mainProduct.sku || `product-${mainProduct.id}`,
            color: selfMeta.color || getColorLabel(mainProduct.name),
            size: selfMeta.size || getSizeLabel(mainProduct.name),
            variation_suffix: selfMeta.variationSuffix || (mainProduct as any).variation_suffix || null,
            option_label: selfMeta.optionLabel,
            selling_price: (mainProduct as any).selling_price ?? null,
            in_stock: !!(mainProduct as any).in_stock,
            stock_quantity: (mainProduct as any).stock_quantity ?? 0,
            available_inventory: (mainProduct as any).available_inventory ?? (mainProduct as any).stock_quantity ?? 0,
            images: (mainProduct as any).images ?? [],
          };

          setProductVariants([selfVariant]);
          setSelectedVariant(selfVariant);
          return;
        }

        setProductVariants(variations);

        const currentVariant = variations.find(v => v.id === productId);
        if (currentVariant) {
          setSelectedVariant(currentVariant);
        } else if (variations.length > 0) {
          setSelectedVariant(variations[0]);
        }

      } catch (err: any) {
        console.error('Error fetching product:', err);
        setError(err.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    };

    fetchProductAndVariations();
  }, [productId]);

  const variationChoices = useMemo(() => {
    return productVariants
      .map((variant, index) => ({
        variant,
        label: getVariationDisplayLabel(variant, index),
      }))
      .sort((a, b) => {
        // In-stock first
        if (a.variant.in_stock !== b.variant.in_stock) {
          return a.variant.in_stock ? -1 : 1;
        }

        // Keep same labels grouped
        const lcmp = a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
        if (lcmp !== 0) return lcmp;

        return a.variant.id - b.variant.id;
      });
  }, [productVariants]);

  // Listen for wishlist updates
  useEffect(() => {
    const updateWishlistStatus = () => {
      if (selectedVariant) {
        setIsInWishlist(wishlistUtils.isInWishlist(selectedVariant.id));
      }
    };
    updateWishlistStatus();
    window.addEventListener('wishlist-updated', updateWishlistStatus);
    return () => window.removeEventListener('wishlist-updated', updateWishlistStatus);
  }, [selectedVariant]);

  // Handlers
  const handleVariantChange = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    setSelectedImageIndex(0);
    setQuantity(1);
    router.push(`/e-commerce/product/${variant.id}`);
  };

  const handleToggleWishlist = () => {
    if (!selectedVariant) return;

    if (isInWishlist) {
      wishlistUtils.remove(selectedVariant.id);
    } else {
      wishlistUtils.add({
        id: selectedVariant.id,
        name: selectedVariant.name,
        image: (selectedVariant.images && selectedVariant.images[0]?.url) || '',
        price: Number(selectedVariant.selling_price ?? 0),
        sku: selectedVariant.sku,
      });
    }
  };

  // Add to cart
  const handleAddToCart = async () => {
    if (!selectedVariant || !selectedVariant.in_stock) return;

    const stockQty = Number(selectedVariant.stock_quantity ?? 0);
    const currentAvailable = Number(selectedVariant.available_inventory ?? stockQty);
    if (currentAvailable <= 0) return;

    setIsAdding(true);

    try {
      await cartService.addToCart({
        product_id: selectedVariant.id,
        quantity: quantity,
        variant_options: {
          color: selectedVariant.color,
          size: selectedVariant.size,
        },
        notes: undefined
      });

      await refreshCart();

      setTimeout(() => {
        setIsAdding(false);
        setCartSidebarOpen(true);
      }, 800);

    } catch (error: any) {
      console.error('Error adding to cart:', error);
      setIsAdding(false);

      const errorMessage = error.message || '';
      const displayMessage = errorMessage.includes('Insufficient stock')
        ? errorMessage
        : 'Failed to add item to cart. Please try again.';
      alert(displayMessage);
    }
  };

  const handleQuickAddToCart = async (item: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!item.in_stock) return;

    try {
      const color = getColorLabel(item.name);
      const size = getSizeLabel(item.name);

      await cartService.addToCart({
        product_id: item.id,
        quantity: 1,
        variant_options: { color, size },
        notes: undefined
      });

      await refreshCart();
      setCartSidebarOpen(true);

    } catch (error: any) {
      console.error('Error adding to cart:', error);

      const errorMessage = error.message || '';
      const displayMessage = errorMessage.includes('Insufficient stock')
        ? errorMessage
        : 'Failed to add item to cart. Please try again.';
      alert(displayMessage);
    }
  };



  const handleQuantityChange = (delta: number) => {
    if (!selectedVariant) return;
    const availQty = Number(selectedVariant.available_inventory ?? selectedVariant.stock_quantity ?? 0);
    const newQuantity = quantity + delta;
    if (newQuantity >= 1 && newQuantity <= availQty) {
      setQuantity(newQuantity);
    }
  };

  const handlePrevImage = () => {
    if (!selectedVariant) return;
    const imgs = Array.isArray(selectedVariant.images) ? selectedVariant.images : [];
    if (imgs.length === 0) return;

    setSelectedImageIndex(prev =>
      prev === 0 ? imgs.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    if (!selectedVariant) return;
    const imgs = Array.isArray(selectedVariant.images) ? selectedVariant.images : [];
    if (imgs.length === 0) return;

    setSelectedImageIndex(prev =>
      prev === imgs.length - 1 ? 0 : prev + 1
    );
  };

  const handleShare = () => {
    if (navigator.share && product) {
      navigator.share({
        title: product.name,
        text: product.short_description || product.description,
        url: window.location.href,
      }).catch(err => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  // ---------------------------
  // Loading / Error
  // ---------------------------
  if (loading) {
    return (
      <div className="ec-root min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--gold)' }}></div>
            <p className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading product...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product || !selectedVariant) {
    return (
      <div className="ec-root min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-3 text-white">
              Product Not Found
            </h1>
            <p className="mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{error}</p>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-xs font-semibold text-white hover:bg-black transition"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }
  // ---------------------------
  // Derived safe values
  // ---------------------------
  const baseName = getBaseProductName(product.name);

  const sellingPrice = Number(selectedVariant.selling_price ?? 0);
  const costPrice = Number((product as any).cost_price ?? 0);
  const stockQty = Number(selectedVariant.stock_quantity ?? 0);
  // available_inventory = total - reserved. Falls back to stockQty if backend doesn't send it.
  const availableInventory = Number(selectedVariant.available_inventory ?? stockQty);

  const safeImages =
    Array.isArray(selectedVariant.images) && selectedVariant.images.length > 0
      ? selectedVariant.images
      : [{ id: 0, url: '/placeholder-product.png', is_primary: true, alt_text: 'Product' } as any];

  const primaryImage = safeImages[selectedImageIndex]?.url || safeImages[0]?.url;

  const discountPercent =
    costPrice > sellingPrice && costPrice > 0
      ? Math.round(((costPrice - sellingPrice) / costPrice) * 100)
      : 0;

  const hasMultipleVariants = productVariants.length > 1;
  const selectedVariantIndex = Math.max(
    0,
    productVariants.findIndex((variant) => variant.id === selectedVariant.id)
  );
  const selectedVariationLabel = getVariationDisplayLabel(selectedVariant, selectedVariantIndex);

  // ---------------------------
  // Main render
  // ---------------------------
  return (
    <div className="ec-root min-h-screen">
      <Navigation />
      <CartSidebar isOpen={cartSidebarOpen} onClose={() => setCartSidebarOpen(false)} />

      {/* Breadcrumb */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="ec-container py-3 hidden sm:block">
          <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: "'DM Mono', monospace", color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
            <button onClick={() => router.push('/e-commerce')} className="transition-colors hover:text-white">HOME</button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
            <button onClick={() => router.back()} className="transition-colors hover:text-white">
              {getCategoryName(product.category)?.toUpperCase() || 'PRODUCTS'}
            </button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }} className="truncate max-w-xs">{baseName.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main product section */}
      <div className="ec-container py-8 md:py-12">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-start">

          {/* ── Image Gallery ── */}
          <div className="space-y-3">
            {/* Main image */}
            <div
              className="relative overflow-hidden group"
              style={{ borderRadius: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', aspectRatio: '1/1' }}
            >
              <img
                src={primaryImage}
                alt={selectedVariant.name}
                className="w-full h-full object-contain p-6 md:p-8 transition-transform duration-500 group-hover:scale-[1.03]"
              />

              {/* Stock badge */}
              {!selectedVariant.in_stock && (
                <div className="absolute top-4 left-4 rounded-xl px-3 py-1.5 text-[10px] font-bold tracking-widest" style={{ background: 'rgba(239,68,68,0.9)', color: 'white', fontFamily: "'DM Mono', monospace" }}>
                  OUT OF STOCK
                </div>
              )}
              {selectedVariant.in_stock && stockQty > 0 && stockQty < 5 && (
                <div className="absolute top-4 left-4 rounded-xl px-3 py-1.5 text-[10px] font-bold" style={{ background: 'rgba(176,124,58,0.9)', color: 'white', fontFamily: "'DM Mono', monospace" }}>
                  ONLY {stockQty} LEFT
                </div>
              )}
              {discountPercent > 0 && (
                <div className="absolute top-4 right-4 rounded-xl px-3 py-1.5 text-[10px] font-bold" style={{ background: 'var(--gold)', color: 'white', fontFamily: "'DM Mono', monospace" }}>
                  -{discountPercent}%
                </div>
              )}

              {/* Nav arrows (Always visible dots on mobile, arrows on hover desktop) */}
              {safeImages.length > 1 && (
                <>
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 pointer-events-none">
                    <button onClick={handlePrevImage}
                      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full opacity-0 sm:group-hover:opacity-100 transition-all shadow-lg"
                      style={{ background: 'rgba(13,13,13,0.7)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                      <ChevronLeft size={20} className="text-white" />
                    </button>
                    <button onClick={handleNextImage}
                      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full opacity-0 sm:group-hover:opacity-100 transition-all shadow-lg"
                      style={{ background: 'rgba(13,13,13,0.7)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                      <ChevronRight size={20} className="text-white" />
                    </button>
                  </div>
                  
                  {/* Dots for mobile */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 sm:hidden">
                    {safeImages.map((_, i) => (
                      <div key={i} className={`h-1.5 rounded-full transition-all ${i === selectedImageIndex ? 'w-4 bg-[var(--gold)]' : 'w-1.5 bg-white/20'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {safeImages.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {safeImages.map((img, index) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageIndex(index)}
                    className="relative overflow-hidden transition-all"
                    style={{
                      borderRadius: '12px',
                      aspectRatio: '1/1',
                      border: `1px solid ${selectedImageIndex === index ? 'var(--gold)' : 'rgba(255,255,255,0.09)'}`,
                      background: 'rgba(255,255,255,0.04)',
                      boxShadow: selectedImageIndex === index ? '0 0 0 1px var(--gold)' : 'none',
                    }}
                  >
                    <img src={img.url} alt={`View ${index + 1}`} className="w-full h-full object-contain p-1.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Buy Column ── */}
          <div className="lg:sticky lg:top-24 space-y-4">
            {/* Main info card */}
            <div className="ec-dark-card p-6 sm:p-7">
              {/* Category label */}
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }}>
                {getCategoryName(product.category)?.toUpperCase() || 'ERRUM COLLECTION'}
              </p>

              {/* Product name */}
              <h1 className="mt-2 text-white" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                {baseName}
              </h1>

              {/* Price row */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-3xl font-bold" style={{ color: 'var(--gold)', fontFamily: "'Jost', sans-serif" }}>
                  {formatBDT(sellingPrice)}
                </span>
                {costPrice > sellingPrice && sellingPrice > 0 && (
                  <>
                    <span className="text-lg line-through" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Jost', sans-serif" }}>
                      {formatBDT(costPrice)}
                    </span>
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: 'rgba(176,124,58,0.15)', border: '1px solid rgba(176,124,58,0.25)', color: 'var(--gold-light)', fontFamily: "'DM Mono', monospace" }}>
                      SAVE {discountPercent}%
                    </span>
                  </>
                )}
              </div>

              {/* Stock status */}
              <div className="mt-3">
                {selectedVariant.in_stock && stockQty > 0 ? (
                  availableInventory > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      <span className="text-[11px] font-medium text-green-400" style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>
                        AVAILABLE FOR ORDER · IN STOCK ({availableInventory})
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      <span className="text-[11px] font-medium text-red-400" style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>ALL STOCK RESERVED</span>
                    </div>
                  )
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    <span className="text-[11px] font-medium text-red-400" style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>OUT OF STOCK</span>
                  </div>
                )}
              </div>

              {/* SKU */}
              {selectedVariant.sku && (
                <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.08em' }}>
                  SKU: {selectedVariant.sku}
                </p>
              )}

              {/* Description */}
              {(product.short_description || product.description) && (
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
                    Description
                  </p>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {product.short_description || product.description}
                  </p>
                </div>
              )}

              {/* Variation Options */}
              {hasMultipleVariants && (
                <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="mb-3 text-[10px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
                    VARIATIONS ({productVariants.length})
                    {selectedVariationLabel && (
                      <span className="ml-2 normal-case tracking-normal text-[var(--gold-light)]"> · {selectedVariationLabel}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {variationChoices.map(({ variant, label }) => {
                      const isSelected = selectedVariant.id === variant.id;
                      const isAvailable = !!variant.in_stock;
                      return (
                        <button
                          key={variant.id}
                          onClick={() => handleVariantChange(variant)}
                          disabled={!isAvailable}
                          className="px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all"
                          style={{
                            border: isSelected ? '1px solid var(--gold)' : isAvailable ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
                            background: isSelected ? 'rgba(176,124,58,0.15)' : 'rgba(255,255,255,0.04)',
                            color: isSelected ? 'var(--gold-light)' : isAvailable ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                            textDecoration: isAvailable ? 'none' : 'line-through',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            fontFamily: "'Jost', sans-serif",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity + CTA */}
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>QUANTITY</p>
                  <div className="flex items-center rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
                    <button onClick={() => handleQuantityChange(-1)} disabled={quantity <= 1}
                      className="flex h-9 w-9 items-center justify-center transition-colors disabled:opacity-40"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Minus size={14} />
                    </button>
                    <span className="min-w-[40px] text-center text-[14px] font-semibold text-white">{quantity}</span>
                    <button onClick={() => handleQuantityChange(1)} disabled={quantity >= stockQty}
                      className="flex h-9 w-9 items-center justify-center transition-colors disabled:opacity-40"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleAddToCart}
                    disabled={!selectedVariant.in_stock || isAdding || availableInventory <= 0}
                    className="flex-1 ec-btn justify-center"
                    style={{
                      background: isAdding ? 'rgba(34,197,94,0.85)' : 'var(--gold)',
                      color: 'white',
                      boxShadow: isAdding ? 'none' : availableInventory > 0 ? '0 4px 16px rgba(176,124,58,0.3)' : 'none',
                      opacity: (!selectedVariant.in_stock || availableInventory <= 0) ? 0.4 : 1,
                      cursor: (!selectedVariant.in_stock || availableInventory <= 0) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ShoppingCart size={16} />
                    {isAdding ? 'Added ✓' : availableInventory <= 0 ? 'All stock already reserved' : 'Add to Cart'}
                  </button>
                  <button onClick={handleToggleWishlist}
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-all"
                    style={{
                      border: `1px solid ${isInWishlist ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`,
                      background: isInWishlist ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                      color: isInWishlist ? '#f87171' : 'rgba(255,255,255,0.5)',
                    }}>
                    <Heart size={16} className={isInWishlist ? 'fill-current' : ''} />
                  </button>
                  <button onClick={handleShare}
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.color = 'white'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}>
                    <Share2 size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Meta card */}
            <div className="ec-dark-card px-5 py-4 space-y-2.5">
              {product.category && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}>CATEGORY</span>
                  <span className="text-[12px] font-medium text-white">{getCategoryName(product.category)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}>AVAILABILITY</span>
                <span className="text-[12px] font-medium" style={{ color: selectedVariant.in_stock && availableInventory > 0 ? '#4ade80' : '#f87171' }}>
                  {selectedVariant.in_stock && availableInventory > 0 
                    ? `available for order: in stock(${availableInventory})` 
                    : (stockQty > 0 ? 'all stock reserved' : 'Out of Stock')}
                </span>
              </div>
            </div>
            {/* Branch Inventory Table */}
            {!loadingBranchStock && branchStocks.length > 0 && (
              <div className="ec-dark-card overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                  <MapPin size={14} className="text-[var(--gold)]" />
                  <span className="text-[11px] font-semibold tracking-wider text-white/90 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                    Branch Availability
                  </span>
                </div>
                <div className="overflow-x-auto ec-scrollbar">
                  <table className="w-full text-left min-w-[300px]">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-white/30" style={{ fontFamily: "'DM Mono', monospace" }}>
                        <th className="px-5 py-3 font-medium">Branch Location</th>
                        <th className="px-5 py-3 font-medium text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {branchStocks.map((stock) => (
                        <tr key={stock.store_id} className="group hover:bg-white/[0.01] transition-colors">
                          <td className="px-5 py-3">
                            <p className="text-[12px] font-medium text-white/80 group-hover:text-white transition-colors">
                              {stock.store_name}
                            </p>
                            {stock.store_address && (
                              <p className="text-[10px] text-white/20 line-clamp-1">{stock.store_address}</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-[12px] font-semibold text-[var(--gold)]">
                              {stock.total_quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Trust strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { icon: '🚚', label: 'Free Delivery', sub: 'On ৳1,000+' },
                { icon: '↩', label: 'Easy Returns', sub: '7-day policy' },
                { icon: '✓', label: 'Authentic', sub: '100% genuine' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="ec-dark-card p-3 flex sm:flex-col items-center sm:text-center gap-3 sm:gap-1">
                  <div className="text-xl sm:text-lg">{icon}</div>
                  <div>
                    <p className="text-[11px] font-semibold text-white">{label}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '3rem' }}>
            <p className="ec-eyebrow mb-3">Pairs Well With</p>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-white" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                Related Essentials
              </h2>
              <button
                onClick={() => {
                  const slug = getCategorySlug(product.category);
                  if (slug) {
                    router.push(`/e-commerce/${slug}`);
                  } else {
                    router.push('/e-commerce/search?category=' + getCategoryId(product.category));
                  }
                }}
                className="flex items-center gap-2 text-[11px] font-semibold transition-colors hover:text-[var(--gold)]"
                style={{ fontFamily: "'DM Mono', monospace", color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}
              >
                VIEW ALL <ArrowRight size={12} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {relatedProducts.slice(0, 4).map(item => (
                <PremiumProductCard
                  key={item.id}
                  product={item}
                  onOpen={(p) => router.push(`/e-commerce/product/${p.id}`)}
                  onAddToCart={(p, e) => handleQuickAddToCart(p, e)}
                />
              ))}
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
