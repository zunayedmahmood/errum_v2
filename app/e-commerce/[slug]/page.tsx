"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import { groupProductsByMother } from '@/lib/ecommerceProductGrouping';
import { X } from 'lucide-react';

/**
 * Normalizes keys for comparison (slugs, names, etc.)
 */
const normalizeKey = (value: string) =>
  decodeURIComponent(value || '')
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

/**
 * Flattens nested category tree into a flat list
 */
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

/**
 * Gets all descendant category nodes including the root
 */
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

/**
 * Builds a set of allowed category IDs and normalized keys for a given category
 */
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

/**
 * Verifies if a product belongs to the allowed categories
 */
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
const API_PER_PAGE = 60;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Fetches products from the service without noisy error logging
 */
const getProductsSilent = (params: GetProductsParams) =>
  catalogService.getProducts({ ...(params as any), _suppressErrorLog: true } as GetProductsParams);

/**
 * Groups flat products into representative mother products for display
 */
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

    // Propagate images across variants
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

/**
 * Category feed page component
 */
export default function CategoryPage() {
  const params = useParams() as any;
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

  const selectedSort: GetProductsParams['sort_by'] = 'newest';
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isClosingFilters, setIsClosingFilters] = useState(false);

  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
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

  /**
   * Identifies the current active category from the flat list
   */
  const activeCategory = useMemo(() => {
    return (
      flatCategories.find((cat) => {
        const slugKey = normalizeKey(cat.slug || '');
        const nameKey = normalizeKey(cat.name || '');
        return slugKey === normalizedSlug || nameKey === normalizedSlug;
      }) || null
    );
  }, [flatCategories, normalizedSlug]);

  /**
   * Fetches the category tree for the sidebar
   */
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

  /**
   * Builds the API parameters for the catalog request
   */
  const buildAttemptParams = (): Record<string, any> => {
    const baseParams: GetProductsParams & Record<string, any> = {
      page: 1,
      per_page: API_PER_PAGE,
      sort_by: selectedSort,
    };

    if (selectedPriceRange !== 'all') {
      const [min, max] = selectedPriceRange.split('-').map(Number);
      if (!Number.isNaN(min)) baseParams.min_price = min;
      if (!Number.isNaN(max)) baseParams.max_price = max;
    }

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

  /**
   * Generates a unique key for caching product results
   */
  const getCacheKey = () => {
    const slugKey = normalizeKey(categorySlug || '');
    return [
      'cat',
      slugKey,
      String(activeCategory?.id || ''),
      selectedSort,
      selectedPriceRange,
    ].join('::');
  };

  /**
   * Ensures enough cards are loaded/grouped to fill the requested UI page
   */
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

  /**
   * Main function to fetch products for the display
   */
  const fetchProducts = async (uiPage = 1) => {
    if (categoriesLoading) return;

    setLoading(true);
    setPartialLoadWarning(null);
    try {
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
    cacheRef.current = {};
    fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory?.id, categoriesLoading, selectedPriceRange]);

  const handleImageError = (productId: number) => {
    setImageErrors((prev) => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  };

  /**
   * Handles adding a product to the cart
   */
  const handleAddToCart = async (product: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (product.has_variants) {
        router.push(`/e-commerce/product/${product.id}`);
        return;
      }
      await addToCart(product.id, 1);
      setIsCartOpen(true);
    } catch (err) {
      console.error('Error adding to cart:', err);
    }
  };

  /**
   * Navigates to the product detail page
   */
  const handleProductClick = (product: SimpleProduct) => {
    router.push(`/e-commerce/product/${product.id}`);
  };

  /**
   * Handles category selection change
   */
  const handleCategoryChange = (categoryNameOrSlug: string) => {
    if (categoryNameOrSlug === 'all') {
      router.push('/e-commerce/products');
      return;
    }
    router.push(`/e-commerce/${encodeURIComponent(categoryNameOrSlug)}`);
  };

  const closeFilters = () => {
    setIsClosingFilters(true);
    setTimeout(() => {
      setIsFiltersOpen(false);
      setIsClosingFilters(false);
    }, 450);
  };

  /**
   * Handles pagination page change
   */
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
        <div className="ec-root ec-darkify min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 rounded w-1/4 mb-8 animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
              <div className="flex gap-8">
                <div className="w-64 h-96 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="ec-card aspect-[3/4] rounded-2xl animate-pulse bg-white/5" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />

      <div className="ec-root ec-darkify min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Jost', sans-serif" }}>{activeCategory?.name || 'Products'}</h1>
            <p className="text-white/40 font-medium tracking-wide ec-eyebrow uppercase text-xs">
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
                selectedStock="all"
                onStockChange={() => { }}
              />
            </aside>

            <main className="flex-1">
              {/* Mobile: Filters button */}
              <div className="xl:hidden flex items-center justify-between gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-white"
                >
                  Filters
                </button>
              </div>

              {partialLoadWarning && !error && (
                <div className="mb-4 rounded-lg border border-amber-200/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {partialLoadWarning}
                </div>
              )}

              {error ? (
                <div className="text-center py-20">
                  <p className="text-rose-400 mb-6">{error}</p>
                  <button
                    onClick={() => fetchProducts(currentPage)}
                    className="px-8 py-3 bg-[var(--gold)] text-white rounded-xl hover:bg-[#9a6b2e]"
                  >
                    Try Again
                  </button>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-20 ec-surface bg-white/2">
                  <p className="text-white/60 text-lg">No products found in this category</p>
                  <p className="text-white/30 mt-2 text-sm">Try adjusting your filters or browse other collections</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => (
                      <PremiumProductCard
                        key={product.id}
                        product={product as SimpleProduct}
                        imageErrored={imageErrors.has(product.id)}
                        onImageError={handleImageError}
                        onOpen={handleProductClick}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex justify-center items-center mt-12 gap-3">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-20 transition-all text-sm"
                      >
                        Previous
                      </button>

                      <div className="flex items-center gap-1.5 mx-2">
                        {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                          const pageNum = i + 1;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              className={`h-10 w-10 rounded-xl text-sm font-medium transition-all ${currentPage === pageNum
                                  ? 'bg-[var(--gold)] text-white shadow-lg shadow-gold/20'
                                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-20 transition-all text-sm"
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
        <div className="fixed inset-0 z-[100] xl:hidden">
          <div 
            className={`fixed inset-0 bg-black/60 backdrop-blur-md ${isClosingFilters ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
            onClick={closeFilters}
          />
          <div className={`fixed top-0 right-0 bottom-0 z-[101] w-[85%] max-w-sm bg-[#0d0d0d] shadow-[-20px_0_80px_rgba(0,0,0,0.8)] flex flex-col ${isClosingFilters ? 'ec-anim-slide-out-right' : 'ec-anim-slide-in-right'}`}>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-white uppercase tracking-tight" style={{ fontFamily: "'Jost', sans-serif" }}>Filters</h2>
              <button 
                onClick={closeFilters} 
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:text-white bg-white/5 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto ec-scrollbar p-6 space-y-10 pb-32">
              <CategorySidebar
                categories={categories}
                activeCategory={categorySlug}
                onCategoryChange={(v) => {
                  closeFilters();
                  handleCategoryChange(v);
                }}
                selectedPriceRange={selectedPriceRange}
                onPriceRangeChange={setSelectedPriceRange}
                selectedStock="all"
                onStockChange={() => { }}
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-10">
              <button 
                onClick={closeFilters}
                className="w-full py-4 rounded-xl bg-[var(--gold)] text-white font-bold shadow-[0_10px_30px_rgba(176,124,58,0.3)]"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
