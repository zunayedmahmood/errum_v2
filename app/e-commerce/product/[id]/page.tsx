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
  ChevronRight
} from 'lucide-react';

import { useCart } from '@/app/e-commerce/CartContext';
import Navigation from '@/components/ecommerce/Navigation';
import { getBaseProductName, getColorLabel, getSizeLabel } from '@/lib/productNameUtils';
import { adaptCatalogGroupedProducts, groupProductsByMother } from '@/lib/ecommerceProductGrouping';
import CartSidebar from '@/components/ecommerce/cart/CartSidebar';
import catalogService, {
  Product,
  ProductDetailResponse,
  SimpleProduct,
  ProductImage
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
  stock_quantity: number | null; // ✅ allow null safely
  images: ProductImage[] | null; // ✅ allow null safely
}

const normalizeVariantText = (value: any): string =>
  String(value ?? '')
    .trim()
    .replace(/[‐‑‒–—−﹘﹣－]/g, '-')
    .replace(/\s+/g, ' ');

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
  const [relatedProducts, setRelatedProducts] = useState<SimpleProduct[]>([]);

  // Suggested Products State
  const [suggestedProducts, setSuggestedProducts] = useState<SimpleProduct[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

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
  // Helper functions
  // Fetch suggested products
  useEffect(() => {
    if (!productId) return;

    const fetchSuggestedProducts = async () => {
      try {
        setLoadingSuggestions(true);
        const response = await catalogService.getSuggestedProducts(4);

        if (response.suggested_products && response.suggested_products.length > 0) {
          setSuggestedProducts([...response.suggested_products].sort((a, b) => getNewestKey(b) - getNewestKey(a)));
        } else {
          setSuggestedProducts([]);
        }
      } catch (err: any) {
        console.error('❌ Error fetching suggested products:', err);
        setSuggestedProducts([]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestedProducts();
  }, [productId]);

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
    if (stockQty <= 0) return;

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

  const handleAddSuggestedToCart = async (item: SimpleProduct, e: React.MouseEvent) => {
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

  const handleToggleSuggestedWishlist = (item: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();

    const isItemInWishlist = wishlistUtils.isInWishlist(item.id);

    if (isItemInWishlist) {
      wishlistUtils.remove(item.id);
    } else {
      wishlistUtils.add({
        id: item.id,
        name: item.name,
        image: item.images?.[0]?.url || '/placeholder-product.png',
        price: Number((item as any).selling_price ?? 0),
        sku: item.sku,
      });
    }
  };

  const handleQuantityChange = (delta: number) => {
    if (!selectedVariant) return;
    const stockQty = Number(selectedVariant.stock_quantity ?? 0);
    const newQuantity = quantity + delta;
    if (newQuantity >= 1 && newQuantity <= stockQty) {
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
      <div className="min-h-screen bg-transparent">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-neutral-600 text-sm">Loading product...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product || !selectedVariant) {
    return (
      <div className="min-h-screen bg-transparent">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-neutral-900 mb-3">
              Product Not Found
            </h1>
            <p className="text-neutral-600 mb-6 text-sm">{error}</p>
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

  const safeImages =
    Array.isArray(selectedVariant.images) && selectedVariant.images.length > 0
      ? selectedVariant.images
      : [{ id: 0, url: '/placeholder-product.png', is_primary: true, alt_text: 'Product' } as any];

  const primaryImage =
    safeImages[selectedImageIndex]?.url || safeImages[0]?.url;

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
  // Premium UI
  // ---------------------------
  return (
    <div className="min-h-screen bg-transparent">
      <Navigation />

      <CartSidebar
        isOpen={cartSidebarOpen}
        onClose={() => setCartSidebarOpen(false)}
      />

      {/* Premium breadcrumb bar */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 text-[11px] sm:text-xs text-neutral-500">
            <button
              onClick={() => router.push('/e-commerce')}
              className="hover:text-neutral-900 transition"
            >
              Home
            </button>
            <span className="text-gray-300">/</span>
            <button
              onClick={() => router.back()}
              className="hover:text-neutral-900 transition"
            >
              {getCategoryName(product.category) || 'Products'}
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-neutral-900 font-medium">{baseName}</span>
          </div>
        </div>
      </div>

      {/* Luxury background wash */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-rose-100/50 blur-3xl" />
          <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-rose-50/40 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-white" />
        </div>

        {/* Product Details */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">

            {/* Image Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-square bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm group">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50/60 to-transparent" />

                <img
                  src={primaryImage}
                  alt={selectedVariant.name}
                  className="relative w-full h-full object-contain p-8 md:p-10"
                />

                {safeImages.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur p-2.5 md:p-3 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                    >
                      <ChevronLeft size={22} className="text-gray-800" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur p-2.5 md:p-3 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-white"
                    >
                      <ChevronRight size={22} className="text-gray-800" />
                    </button>
                  </>
                )}

                {!selectedVariant.in_stock && (
                  <div className="absolute top-4 left-4 rounded-xl bg-rose-600 text-white px-3 py-1.5 text-[10px] sm:text-xs font-bold tracking-wide">
                    OUT OF STOCK
                  </div>
                )}

                {selectedVariant.in_stock && stockQty > 0 && stockQty < 5 && (
                  <div className="absolute top-4 left-4 rounded-xl bg-amber-500 text-white px-3 py-1.5 text-[10px] sm:text-xs font-bold tracking-wide">
                    Only {stockQty} left
                  </div>
                )}
              </div>

              {safeImages.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {safeImages.map((img, index) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`aspect-square rounded-2xl overflow-hidden border bg-white transition-all ${
                        selectedImageIndex === index
                          ? 'border-gray-900 ring-1 ring-gray-900'
                          : 'border-gray-100 hover:border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={`View ${index + 1}`}
                        className="w-full h-full object-contain p-2"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Buy Column (premium card) */}
            <div className="lg:sticky lg:top-24 space-y-6">
              <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
                {/* Title */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                    Errum Collection
                  </p>
                  <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-neutral-900">
                    {baseName}
                  </h1>
                </div>

                {/* Price */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-2xl sm:text-3xl font-bold text-amber-600">
                    {formatBDT(sellingPrice)}
                  </span>

                  {costPrice > sellingPrice && sellingPrice > 0 && (
                    <>
                      <span className="text-sm sm:text-base text-neutral-400 line-through">
                        {formatBDT(costPrice)}
                      </span>
                      <span className="text-[10px] sm:text-xs font-semibold text-neutral-900 bg-neutral-50 border border-rose-200 px-2.5 py-1 rounded-full">
                        Save {discountPercent}%
                      </span>
                    </>
                  )}
                </div>

                {/* Stock micro status */}
                <div className="mt-3">
                  {selectedVariant.in_stock && stockQty > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-emerald-700">
                        In stock • {stockQty} available
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full bg-neutral-50 border border-rose-200 px-3 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                      <span className="text-[10px] sm:text-xs font-medium text-neutral-900">
                        Out of stock
                      </span>
                    </div>
                  )}
                </div>

                {/* SKU */}
                {selectedVariant.sku && (
                  <div className="mt-4 text-[11px] text-neutral-500">
                    SKU: <span className="font-semibold text-gray-800">{selectedVariant.sku}</span>
                  </div>
                )}

                {/* Description */}
                {(product.short_description || product.description) && (
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <h3 className="text-xs font-semibold text-neutral-900 tracking-wide uppercase">
                      Description
                    </h3>
                    <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                      {product.short_description || product.description}
                    </p>
                  </div>
                )}

                {/* Unified Variation Options */}
                {hasMultipleVariants && (
                  <div className="mt-6">
                    <label className="block text-xs font-semibold text-neutral-900 mb-3 tracking-wide uppercase">
                      Variations ({productVariants.length})
                      {selectedVariationLabel && (
                        <span className="ml-2 font-normal text-neutral-500 normal-case tracking-normal">
                          (Selected: {selectedVariationLabel})
                        </span>
                      )}
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {variationChoices.map(({ variant, label }) => {
                        const isSelected = selectedVariant.id === variant.id;
                        const isAvailable = !!variant.in_stock;

                        return (
                          <button
                            key={variant.id}
                            onClick={() => handleVariantChange(variant)}
                            disabled={!isAvailable}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : isAvailable
                                ? 'border-neutral-200 bg-white text-gray-800 hover:border-neutral-300 hover:bg-neutral-50'
                                : 'border-gray-100 bg-neutral-50 text-neutral-400 cursor-not-allowed line-through'
                            }`}
                            title={variant.sku || label}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quantity + Actions */}
                <div className="mt-7">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-semibold text-neutral-900 tracking-wide uppercase">
                      Quantity
                    </label>
                    <div className="flex items-center rounded-xl border border-neutral-200 bg-white">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                        className="p-2.5 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="px-4 py-1 text-sm font-semibold min-w-[48px] text-center">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(1)}
                        disabled={quantity >= stockQty}
                        className="p-2.5 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleAddToCart}
                      disabled={!selectedVariant.in_stock || isAdding || stockQty <= 0}
                      className={`
                        flex-1 rounded-xl py-3.5 text-sm font-semibold
                        flex items-center justify-center gap-2 transition-all
                        ${isAdding
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-900 text-white hover:bg-black disabled:bg-gray-200 disabled:text-neutral-400 disabled:cursor-not-allowed'
                        }
                      `}
                    >
                      <ShoppingCart size={18} />
                      {isAdding ? 'Added' : 'Add to Cart'}
                    </button>

                    <button
                      onClick={handleToggleWishlist}
                      className={`rounded-xl border px-3.5 py-3.5 transition-all ${
                        isInWishlist
                          ? 'border-rose-200 bg-neutral-50 text-neutral-900'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-rose-200 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                      aria-label="Wishlist"
                    >
                      <Heart size={18} className={isInWishlist ? 'fill-current' : ''} />
                    </button>

                    <button
                      onClick={handleShare}
                      className="rounded-xl border border-neutral-200 bg-white px-3.5 py-3.5 text-neutral-700 hover:bg-neutral-50 transition"
                      aria-label="Share"
                    >
                      <Share2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Meta */}
                <div className="mt-6 border-t border-gray-100 pt-5 space-y-2 text-[11px] sm:text-xs">
                  {product.category && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Category</span>
                      <span className="font-semibold text-gray-800">
                        {getCategoryName(product.category) || 'N/A'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Availability</span>
                    <span className={`font-semibold ${
                      selectedVariant.in_stock && stockQty > 0 ? 'text-emerald-700' : 'text-neutral-900'
                    }`}>
                      {selectedVariant.in_stock && stockQty > 0
                        ? `In Stock (${stockQty})`
                        : 'Out of Stock'
                      }
                    </span>
                  </div>
                </div>
              </div>


            </div>
          </div>

          {/* YOU MAY ALSO LIKE */}
          <div className="mt-14 md:mt-20">
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                  Curated for you
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
                  You may also like
                </h2>
              </div>
            </div>

            {loadingSuggestions && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
              </div>
            )}

            {!loadingSuggestions && suggestedProducts.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                <p className="text-neutral-500 text-sm">
                  No suggested products available at the moment.
                </p>
              </div>
            )}

            {!loadingSuggestions && suggestedProducts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {suggestedProducts.map((item) => {
                  const itemImage = item.images?.[0]?.url || '/placeholder-product.png';
                  const isItemInWishlist = wishlistUtils.isInWishlist(item.id);
                  const sp = Number((item as any).selling_price ?? 0);

                  return (
                    <div
                      key={item.id}
                      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => router.push(`/e-commerce/product/${item.id}`)}
                    >
                      <div className="relative aspect-square bg-neutral-50">
                        <img
                          src={itemImage}
                          alt={item.name}
                          className="w-full h-full object-contain p-5 group-hover:scale-[1.03] transition-transform duration-300"
                        />

                        {!item.in_stock && (
                          <div className="absolute top-3 left-3 bg-rose-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold">
                            OUT OF STOCK
                          </div>
                        )}

                        <div className="absolute bottom-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleToggleSuggestedWishlist(item, e)}
                            className={`p-2 rounded-full shadow-sm border transition ${
                              isItemInWishlist
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                            }`}
                            title={isItemInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                          >
                            <Heart
                              className={`h-4 w-4 ${isItemInWishlist ? 'fill-current' : ''}`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-neutral-900 line-clamp-2 min-h-[2.5rem]">
                          {item.name}
                        </h3>

                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-base font-bold text-neutral-900">
                            {formatBDT(sp)}
                          </span>

                          <button
                            onClick={(e) => handleAddSuggestedToCart(item, e)}
                            disabled={!item.in_stock}
                            className={`p-2.5 rounded-full transition ${
                              item.in_stock
                                ? 'bg-gray-900 text-white hover:bg-black'
                                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                            }`}
                            title={item.in_stock ? 'Add to cart' : 'Out of stock'}
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Features */}
          <div className="mt-14 md:mt-18 border-t border-gray-100 pt-10">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-100">
                <h3 className="font-bold text-neutral-900 mb-2 text-sm">
                  Free Shipping
                </h3>
                <p className="text-neutral-600 text-sm">
                  Free shipping on all orders over ৳5,000
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-100">
                <h3 className="font-bold text-neutral-900 mb-2 text-sm">
                  Easy Returns
                </h3>
                <p className="text-neutral-600 text-sm">
                  30-day return policy for all products
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-100">
                <h3 className="font-bold text-neutral-900 mb-2 text-sm">
                  Secure Payment
                </h3>
                <p className="text-neutral-600 text-sm">
                  100% secure payment processing
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
