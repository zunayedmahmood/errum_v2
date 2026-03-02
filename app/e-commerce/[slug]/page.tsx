"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Navigation from '@/components/ecommerce/Navigation';
import CartSidebar from '@/components/ecommerce/cart/CartSidebar';
import CategorySidebar from '@/components/ecommerce/category/CategorySidebar';
import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, {
  CatalogCategory,
  Product,
  SimpleProduct,
  GetProductsParams,
} from '@/services/catalogService';
import { getCardPriceText, getCardStockLabel } from '@/lib/ecommerceCardUtils';
import { groupProductsByMother } from '@/lib/ecommerceProductGrouping';

interface CategoryPageParams {
  slug: string;
}

const normalizeKey = (value: string) =>
  decodeURIComponent(value || '')
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

const flattenCategories = (cats: CatalogCategory[]): CatalogCategory[] => {
  const result: CatalogCategory[] = [];

  const walk = (items: CatalogCategory[]) => {
    items.forEach((cat) => {
      result.push(cat);
      if (Array.isArray(cat.children) && cat.children.length > 0) {
        walk(cat.children);
      }
    });
  };

  walk(cats);
  return result;
};


const getDescendantCategoryNodes = (category: CatalogCategory | null | undefined): CatalogCategory[] => {
  if (!category) return [];
  const nodes: CatalogCategory[] = [];
  const walk = (node: CatalogCategory) => {
    nodes.push(node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(category);
  return nodes;
};

const buildAllowedCategoryKeys = (category: CatalogCategory | null, slugFallback: string) => {
  const ids = new Set<number>();
  const keys = new Set<string>();

  const addKey = (v: string | undefined | null) => {
    const k = normalizeKey(String(v || ''));
    if (k) keys.add(k);
  };

  if (category) {
    for (const node of getDescendantCategoryNodes(category)) {
      const id = Number((node as any)?.id || 0);
      if (id > 0) ids.add(id);
      addKey(node.name);
      addKey(node.slug);
    }
  }

  addKey(slugFallback);

  return { ids, keys };
};

const productMatchesAllowedCategory = (
  product: Product | SimpleProduct,
  allowed: { ids: Set<number>; keys: Set<string> }
) => {
  if ((!allowed.ids || allowed.ids.size === 0) && (!allowed.keys || allowed.keys.size === 0)) return true;

  const cat: any = (product as any)?.category;
  const catId = Number(cat?.id || 0);
  if (catId > 0 && allowed.ids.has(catId)) return true;

  const candidateKeys = [
    cat?.slug,
    cat?.name,
    (product as any)?.category_slug,
    (product as any)?.category_name,
  ]
    .map((v) => normalizeKey(String(v || '')))
    .filter(Boolean);

  return candidateKeys.some((k) => allowed.keys.has(k));
};

const UI_CARDS_PER_PAGE = 20;
const MAX_API_PAGES = 50;
// Backend now supports category_slug filtering on /api/catalog/products.
// Keep a moderate page size for fast first paint, and "fill" by requesting
// additional pages only when grouping reduces visible cards.
const API_PER_PAGE = 60;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getProductsSilent = (params: GetProductsParams) =>
  catalogService.getProducts({ ...(params as any), _suppressErrorLog: true } as GetProductsParams);

const getPageSizeFromResponse = (response: Awaited<ReturnType<typeof catalogService.getProducts>> | null | undefined) => {
  const p = Number(response?.pagination?.per_page || 0);
  if (Number.isFinite(p) && p > 0) return p;
  const len = Array.isArray(response?.products) ? response!.products.length : 0;
  return Math.max(1, len || 20);
};


const buildCardProductsFromFlatCatalog = (rawProducts: (Product | SimpleProduct)[]): SimpleProduct[] => {
  const grouped = groupProductsByMother(rawProducts as any[], {
    useCategoryInKey: true,
    preferSkuGrouping: true,
  });

  return grouped.map((group) => {
    const rawVariants = (group.variants || [])
      .map((variant) => variant.raw)
      .filter(Boolean) as SimpleProduct[];

    const uniqueVariants = new Map<number, SimpleProduct>();
    rawVariants.forEach((variant) => {
      const id = Number((variant as any)?.id) || 0;
      if (!id) return;
      if (!uniqueVariants.has(id)) uniqueVariants.set(id, variant);
    });

    const all = Array.from(uniqueVariants.values());

    // Propagate images: find whichever variant has images and copy to all others
    const fallbackImages =
      all.find((v) => (v as any).images?.some((img: any) => img?.is_primary))?.images ||
      all.find((v) => Array.isArray((v as any).images) && (v as any).images.length > 0)?.images ||
      [];
    const allWithImages = fallbackImages.length
      ? all.map((v) =>
          Array.isArray((v as any).images) && (v as any).images.length > 0
            ? v
            : { ...(v as any), images: fallbackImages }
        )
      : all;

    const representative =
      (allWithImages.find((v) => Number(v.id) === Number((group.representative as any)?.id)) as SimpleProduct) ||
      (group.representative as SimpleProduct) ||
      allWithImages.find((variant) => Number(variant.stock_quantity || 0) > 0) ||
      allWithImages[0];

    if (!representative) {
      return {
        id: Number(group.representativeId || 0),
        name: group.baseName || 'Product',
        display_name: group.baseName || 'Product',
        base_name: group.baseName || 'Product',
        sku: '',
        selling_price: 0,
        stock_quantity: 0,
        description: '',
        images: [],
        in_stock: false,
        has_variants: false,
        total_variants: 0,
        variants: [],
      } as SimpleProduct;
    }

    const variantsWithoutRepresentative = allWithImages.filter(
      (variant) => Number(variant.id) !== Number(representative.id)
    );

    return {
      ...representative,
      name: group.baseName || (representative as any).base_name || representative.name,
      display_name: group.baseName || (representative as any).display_name || (representative as any).base_name || representative.name,
      base_name: group.baseName || (representative as any).base_name || representative.name,
      has_variants: all.length > 1,
      total_variants: all.length,
      variants: variantsWithoutRepresentative,
    } as SimpleProduct;
  });
};

export default function CategoryPage() {
  const params = useParams() as CategoryPageParams;
  const router = useRouter();
  const { addToCart } = useCart();

  const categorySlug = params.slug || '';

  const [products, setProducts] = useState<(Product | SimpleProduct)[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [activeCategoryName, setActiveCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);

  const [selectedSort, setSelectedSort] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
  const [selectedStock, setSelectedStock] = useState<string>('all');

  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  type CacheEntry = {
    key: string;
    attemptParams: Record<string, any>;
    fetchedApiPages: number;
    apiLastPage: number | null;
    hasMore: boolean;
    rawById: Map<number, Product | SimpleProduct>;
    rawOrdered: Array<Product | SimpleProduct>;
    cards: SimpleProduct[];
    partialWarning: string | null;
  };

  const cacheRef = useRef<Record<string, CacheEntry>>({});

  const normalizedSlug = useMemo(() => normalizeKey(categorySlug), [categorySlug]);
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const activeCategory = useMemo(() => {
    return (
      flatCategories.find((cat) => {
        const slugKey = normalizeKey(cat.slug || '');
        const nameKey = normalizeKey(cat.name || '');
        return slugKey === normalizedSlug || nameKey === normalizedSlug;
      }) || null
    );
  }, [flatCategories, normalizedSlug]);

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const categoryData = await catalogService.getCategories();
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };


  const buildAttemptParams = (): Record<string, any> => {
    const baseParams: GetProductsParams = {
      page: 1,
      per_page: API_PER_PAGE,
      sort_by: selectedSort as GetProductsParams['sort_by'],
    };

    if (selectedStock === 'in_stock') {
      baseParams.in_stock = true;
    } else if (selectedStock === 'out_of_stock') {
      baseParams.in_stock = false;
    }

    if (selectedPriceRange !== 'all') {
      const [min, max] = selectedPriceRange.split('-').map(Number);
      if (!Number.isNaN(min)) baseParams.min_price = min;
      if (!Number.isNaN(max)) baseParams.max_price = max;
    }

    // Prefer backend-side filtering so pagination happens *within the category*.
    // This avoids the "empty page" issue when the first N global products don't
    // include the desired category.
    if (activeCategory?.id || activeCategory?.slug) {
      return {
        ...baseParams,
        category_id: activeCategory?.id,
        category_slug: activeCategory?.slug,
      };
    }
    if (categorySlug) {
      return {
        ...baseParams,
        category_slug: categorySlug,
      };
    }
    return { ...baseParams };
  };

  const getCacheKey = () => {
    const slugKey = normalizeKey(categorySlug || '');
    return [
      'cat',
      slugKey,
      String(activeCategory?.id || ''),
      selectedSort,
      selectedPriceRange,
      selectedStock,
    ].join('::');
  };

  const ensureCardsForUiPage = async (entry: CacheEntry, uiPage: number) => {
    const targetCards = uiPage * UI_CARDS_PER_PAGE;
    const allowedCategory = buildAllowedCategoryKeys(activeCategory || null, categorySlug);
    const serverSideCategoryFiltered = Boolean(
      (entry.attemptParams as any)?.category_slug || (entry.attemptParams as any)?.category_id
    );

    const appendFilteredUniqueProducts = (items: (Product | SimpleProduct)[] | undefined | null) => {
      if (!Array.isArray(items) || items.length === 0) return 0;
      let added = 0;
      for (const rawItem of items) {
        if (!rawItem) continue;
        // If backend is filtering by category already, avoid extra client filtering.
        // Keep the fallback filter for older deployments.
        if (!serverSideCategoryFiltered) {
          if (!productMatchesAllowedCategory(rawItem, allowedCategory)) continue;
        }

        const itemId = Number((rawItem as any).id || 0);
        if (itemId > 0) {
          if (entry.rawById.has(itemId)) continue;
          entry.rawById.set(itemId, rawItem);
        }

        entry.rawOrdered.push(rawItem);
        added += 1;
      }
      return added;
    };

    while (entry.cards.length < targetCards && entry.hasMore && entry.fetchedApiPages < MAX_API_PAGES) {
      const nextApiPage = entry.fetchedApiPages + 1;

      try {
        const res = await getProductsSilent({ ...(entry.attemptParams as any), page: nextApiPage } as GetProductsParams);
        entry.fetchedApiPages = nextApiPage;

        const nextProducts = Array.isArray(res?.products) ? (res.products as any[]) : [];
        const lastPage = Number(res?.pagination?.last_page || 0);
        if (Number.isFinite(lastPage) && lastPage > 0) entry.apiLastPage = lastPage;

        appendFilteredUniqueProducts(nextProducts);

        if (nextProducts.length === 0) {
          entry.hasMore = false;
        } else if (res?.pagination?.has_more_pages === false) {
          entry.hasMore = false;
        } else if (entry.apiLastPage && entry.fetchedApiPages >= entry.apiLastPage) {
          entry.hasMore = false;
        }

        entry.cards = buildCardProductsFromFlatCatalog(entry.rawOrdered);
      } catch (err) {
        console.warn(`Error fetching products api page ${nextApiPage}`, err);
        entry.hasMore = false;
        entry.partialWarning = 'Some products could not be loaded due to a server data issue.';
        break;
      }
    }
  };

  const fetchProducts = async (uiPage = 1) => {
    if (categoriesLoading) return;

    setLoading(true);
    setPartialLoadWarning(null);
    try {
      const decodedSlugName = decodeURIComponent(categorySlug || '').replace(/-/g, ' ').trim();
      const key = getCacheKey();
      let entry = cacheRef.current[key];
      if (!entry) {
        entry = {
          key,
          attemptParams: buildAttemptParams(),
          fetchedApiPages: 0,
          apiLastPage: null,
          hasMore: true,
          rawById: new Map(),
          rawOrdered: [],
          cards: [],
          partialWarning: null,
        };
        cacheRef.current[key] = entry;
      }

      await ensureCardsForUiPage(entry, uiPage);

      const computedTotalPages = Math.max(1, Math.ceil(entry.cards.length / UI_CARDS_PER_PAGE));
      const safeUiPage = clamp(uiPage, 1, Math.max(computedTotalPages, entry.hasMore ? uiPage : computedTotalPages));
      const startIndex = (safeUiPage - 1) * UI_CARDS_PER_PAGE;
      const pageCards = entry.cards.slice(startIndex, startIndex + UI_CARDS_PER_PAGE);

      setProducts(pageCards);
      setTotalResults(entry.cards.length);
      setCurrentPage(safeUiPage);
      setTotalPages(entry.hasMore ? Math.max(computedTotalPages, safeUiPage + 1) : computedTotalPages);
      setError(null);
      setPartialLoadWarning(entry.partialWarning);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
      setPartialLoadWarning(null);
      setProducts([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setImageErrors(new Set());

    // Clear cache when category/filters change.
    cacheRef.current = {};
    fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory?.id, categoriesLoading, selectedSort, selectedPriceRange, selectedStock]);

  const handleImageError = (productId: number) => {
    setImageErrors((prev) => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  };

  const handleAddToCart = async (product: Product | SimpleProduct) => {
    try {
      if ((product as any).has_variants) {
        router.push(`/e-commerce/product/${product.id}`);
        return;
      }
      await addToCart(product.id, 1);
      setIsCartOpen(true);
    } catch (err) {
      console.error('Error adding to cart:', err);
    }
  };

  const handleProductClick = (productId: number | string) => {
    router.push(`/e-commerce/product/${productId}`);
  };

  const handleCategoryChange = (categoryNameOrSlug: string) => {
    if (categoryNameOrSlug === 'all') {
      router.push('/e-commerce/products');
      return;
    }
    router.push(`/e-commerce/${encodeURIComponent(categoryNameOrSlug)}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchProducts(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading && products.length === 0) {
    return (
      <>
        <Navigation />
        {/*
          Category pages still use a few legacy light-tailwind utility classes
          (bg-white, text-gray-900, etc.) inside the filter/sidebar.
          Wrap with ec-darkify so those utilities render correctly on the
          site-wide dark background.
        */}
        <div className="ec-root ec-darkify min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 rounded w-1/4 mb-8 animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
              <div className="flex gap-8">
                <div className="w-64 h-96 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="ec-dark-card">
                      <div className="h-64 bg-gray-200 rounded-t-lg"></div>
                      <div className="p-4 space-y-2">
                        <div className="h-4 bg-gray-200 rounded"></div>
                        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div></>
    );
  }

  return (
    <>
      <Navigation />

      <div className="ec-root ec-darkify min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{activeCategoryName || 'Products'}</h1>
            <p className="text-gray-600">
              {totalResults} {totalResults === 1 ? 'product' : 'products'} found
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Desktop sidebar */}
            <aside className="hidden xl:block w-64 flex-shrink-0">
              <CategorySidebar
                categories={categories}
                activeCategory={categorySlug}
                onCategoryChange={handleCategoryChange}
                selectedPriceRange={selectedPriceRange}
                onPriceRangeChange={setSelectedPriceRange}
                selectedStock={selectedStock}
                onStockChange={setSelectedStock}
              />
            </aside>

            <main className="flex-1">
              {/* Mobile: Filters button (drawer) */}
              <div className="xl:hidden flex items-center justify-between gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-white"
                >
                  Filters
                </button>

                <select
                  value={selectedSort}
                  onChange={(e) => setSelectedSort(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.06)] text-white focus:outline-none focus:ring-2 focus:ring-white/15"
                >
                  <option value="newest">Newest First</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="text-sm text-gray-600">Showing {products.length} of {totalResults} products</div>
                <select
                  value={selectedSort}
                  onChange={(e) => setSelectedSort(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-200"
                >
                  <option value="newest">Newest First</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>

              {partialLoadWarning && !error && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {partialLoadWarning}
                </div>
              )}

              {error ? (
                <div className="text-center py-12">
                  <p className="text-rose-600 mb-4">{error}</p>
                  <button
                    onClick={() => fetchProducts(currentPage)}
                    className="px-6 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800"
                  >
                    Try Again
                  </button>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No products found in this category</p>
                  <p className="text-gray-400 mt-2">Try adjusting your filters or browse other categories</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => {
                      const primaryImage = product.images?.[0]?.url || '';
                      const shouldUseFallback = imageErrors.has(product.id) || !primaryImage;
                      const imageUrl = shouldUseFallback
                        ? '/images/placeholder-product.jpg'
                        : primaryImage;

                      const stockLabel = getCardStockLabel(product);
                      const hasStock = stockLabel !== 'Out of Stock';

                      return (
                        <div
                          key={product.id}
                          className="ec-dark-card ec-dark-card-hover overflow-hidden group"
                        >
                          <div
                            className="relative h-64 bg-gray-100 cursor-pointer"
                            onClick={() => handleProductClick(product.id)}
                          >
                            <Image
                              src={imageUrl}
                              alt={(product as any).display_name || (product as any).base_name || product.name}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={shouldUseFallback ? undefined : () => handleImageError(product.id)}
                            />

                            <span
                              className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full ${
                                stockLabel === 'In Stock'
                                  ? 'bg-green-100 text-green-700'
                                  : hasStock
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-50 text-neutral-900'
                              }`}
                            >
                              {stockLabel}
                            </span>
                          </div>

                          <div className="p-4">
                            <h3
                              className="font-semibold text-gray-900 mb-2 line-clamp-2 cursor-pointer hover:text-neutral-900"
                              onClick={() => handleProductClick(product.id)}
                            >
                              {(product as any).display_name || (product as any).base_name || product.name}
                            </h3>

                            <div className="mb-3">
                              <span className="text-lg font-bold text-neutral-900">{getCardPriceText(product)}</span>
                            </div>

                            <button
                              onClick={() => handleAddToCart(product)}
                              className="w-full bg-neutral-900 text-white py-2 px-4 rounded-lg hover:bg-neutral-800 transition-colors"
                            >
                              {(product as any).has_variants ? 'Select Variation' : 'Add to Cart'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex justify-center items-center mt-8 gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}
                      >
                        Previous
                      </button>

                      {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                        const pageNum = i + 1;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => handlePageChange(pageNum)}
                            className={`px-4 py-2 rounded-lg ${
                              currentPage === pageNum ? 'bg-neutral-900 text-white' : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>

      <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

      {/* Mobile filter drawer */}
      {isFiltersOpen && (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setIsFiltersOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute right-0 top-0 h-full w-[86%] max-w-sm ec-dark-card border-l border-white/10 p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-semibold">Filters</div>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="px-3 py-2 rounded-lg border border-white/10 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.10)] text-white"
              >
                Close
              </button>
            </div>

            <CategorySidebar
              categories={categories}
              activeCategory={categorySlug}
              onCategoryChange={(v) => {
                setIsFiltersOpen(false);
                handleCategoryChange(v);
              }}
              selectedPriceRange={selectedPriceRange}
              onPriceRangeChange={setSelectedPriceRange}
              selectedStock={selectedStock}
              onStockChange={setSelectedStock}
            />

            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="mt-5 w-full px-4 py-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-white font-semibold"
            >
              Show Products
            </button>
          </div>
        </div>
      )}
    </>
  );
}
