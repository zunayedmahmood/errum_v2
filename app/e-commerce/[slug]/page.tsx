"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
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
  const { addToCart, setIsCartOpen } = useCart();

  const categorySlug = params.slug || '';

  const [products, setProducts] = useState<(Product | SimpleProduct)[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [activeCategoryName, setActiveCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialLoadWarning, setPartialLoadWarning] = useState<string | null>(null);

  const [selectedSort, setSelectedSort] = useState<GetProductsParams['sort_by']>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isClosingFilters, setIsClosingFilters] = useState(false);
  
  // Notify navigation about mobile sidebar state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mobile-sidebar-toggle', { detail: { open: isFiltersOpen } }));
    return () => {
      window.dispatchEvent(new CustomEvent('mobile-sidebar-toggle', { detail: { open: false } }));
    };
  }, [isFiltersOpen]);

  const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const fetchProductsIdRef = useRef(0);

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
      search: searchQuery || undefined,
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
      selectedSort || '',
      selectedPriceRange,
      searchQuery,
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

    const currentFetchId = ++fetchProductsIdRef.current;
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

      // Check if this is still the latest request before state updates
      if (currentFetchId !== fetchProductsIdRef.current) return;

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
      if (currentFetchId === fetchProductsIdRef.current) {
        console.error('Error fetching products:', err);
        setError('Failed to load products');
        setPartialLoadWarning(null);
        setProducts([]);
        setTotalResults(0);
      }
    } finally {
      if (currentFetchId === fetchProductsIdRef.current) {
        setLoading(false);
      }
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
  }, [activeCategory?.id, categoriesLoading, selectedPriceRange, selectedSort, searchQuery]);

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
        <div className="ec-root bg-[var(--bg-root)] min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 rounded w-1/4 mb-8 animate-pulse" style={{ background: 'var(--ivory-ghost)' }}></div>
              <div className="flex gap-8">
                <div className="w-64 h-96 rounded-lg animate-pulse" style={{ background: 'var(--bg-surface)' }}></div>
                <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] rounded-lg animate-pulse bg-gray-100" />
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

      <div className="ec-root bg-[var(--bg-root)] min-h-screen">
        <div className="bg-[var(--bg-surface)] border-b border-[var(--border-default)] mb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <h1 className="text-4xl font-light text-[var(--text-primary)] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{activeCategory?.name || 'Products'}</h1>
            <p className="text-[var(--text-muted)] font-medium tracking-wide ec-eyebrow uppercase text-xs">
              {totalResults} {totalResults === 1 ? 'item' : 'items'} found
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
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
                selectedSort={selectedSort}
                onSortChange={setSelectedSort}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </aside>

            <main className="flex-1">
              {/* Mobile: Filters button placeholder (removed in favor of bottom pill) */}

              {partialLoadWarning && !error && (
                <div className="mb-4 rounded-lg border border-amber-200/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {partialLoadWarning}
                </div>
              )}

              {error ? (
                <div className="text-center py-24 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-default)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 mx-auto mb-6">
                    <X className="h-8 w-8 text-rose-500" />
                  </div>
                  <h3 className="text-xl font-medium text-[var(--text-primary)] mb-2">Failed to load products</h3>
                  <p className="text-[var(--text-secondary)] mb-8 max-w-xs mx-auto">We encountered an issue while reaching our catalog servers. Please check your connection and try again.</p>
                  <button
                    onClick={() => fetchProducts(currentPage)}
                    className="px-10 py-3.5 bg-[var(--text-primary)] text-[var(--bg-root)] rounded-xl hover:opacity-90 font-bold transition-all"
                  >
                    Try Again
                  </button>
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center bg-[var(--bg-surface)] rounded-3xl border border-dashed border-[var(--border-default)] ec-anim-fade-up">
                  <div className="h-20 w-20 rounded-full bg-[var(--bg-root)] flex items-center justify-center mb-6">
                    <X className="h-8 w-8 text-[var(--text-muted)] opacity-40" />
                  </div>
                  <h3 className="text-2xl font-light text-[var(--text-primary)] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Nothing here yet</h3>
                  <p className="text-[var(--text-secondary)] mb-8 max-w-xs mx-auto text-sm">We couldn't find any products matching your current filters. Try adjusting them or browse our full collection.</p>
                  <button 
                    onClick={() => {
                      setSelectedPriceRange('all');
                      handleCategoryChange('all');
                    }}
                    className="ec-btn bg-[var(--text-primary)] text-[var(--bg-root)] hover:opacity-90 px-10"
                  >
                    Browse All Products
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-12 gap-x-4 md:gap-6">
                    {products.map((product, index) => (
                      <PremiumProductCard
                        key={product.id}
                        product={product as SimpleProduct}
                        animDelay={Math.min(index, 9) * 60}
                        imageErrored={imageErrors.has(product.id)}
                        onImageError={handleImageError}
                        onOpen={handleProductClick}
                        onAddToCart={handleAddToCart}
                      />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex justify-center items-center mt-12 gap-1.5 sm:gap-3">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] disabled:opacity-20 transition-all text-xs sm:text-sm"
                      >
                        Previous
                      </button>

                      <div className="flex items-center gap-1 sm:gap-1.5 mx-1 sm:mx-2">
                        {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                          const pageNum = i + 1;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl text-xs sm:text-sm font-medium transition-all ${currentPage === pageNum
                                  ? 'bg-[var(--cyan)] text-[var(--text-on-accent)] shadow-lg shadow-cyan/20'
                                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]'
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
                        className="px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] disabled:opacity-20 transition-all text-xs sm:text-sm"
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



      {/* Mobile filter drawer (Bottom Sheet) */}
      {isFiltersOpen && (
        <div className="fixed inset-0 z-[100] xl:hidden flex items-end">
          <div 
            className={`fixed inset-0 bg-black/60 backdrop-blur-md ${isClosingFilters ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
            onClick={closeFilters}
          />
          <div className={`relative z-[101] w-full bg-[var(--bg-lifted)] rounded-t-3xl shadow-[var(--shadow-lifted)] flex flex-col max-h-[90vh] ${isClosingFilters ? 'ec-anim-slide-out-down' : 'ec-anim-slide-in-up'}`}>
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-[var(--border-strong)] rounded-full mx-auto my-3" />
            
            <div className="flex items-center justify-between p-6 pt-2 border-b border-[var(--border-default)]">
              <h2 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-tight" style={{ fontFamily: "'Jost', sans-serif" }}>Filters & Sort</h2>
              <button 
                onClick={closeFilters} 
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto ec-scrollbar p-6 space-y-8 pb-32 focus-within:pb-80">
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
                selectedSort={selectedSort}
                onSortChange={setSelectedSort}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--bg-lifted)] via-[var(--bg-lifted)] to-transparent pt-10">
              <button 
                onClick={closeFilters}
                className="w-full py-4 rounded-2xl bg-[var(--text-primary)] text-[var(--bg-root)] font-bold shadow-[var(--shadow-lifted)] hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2.4 — Mobile Filter Pill */}
      <div className="xl:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 max-w-[320px]">
        <button
          onClick={() => setIsFiltersOpen(true)}
          className="w-full py-4 bg-[var(--bg-lifted)] text-[var(--text-primary)] rounded-full font-bold shadow-[var(--shadow-lifted)] flex items-center justify-center gap-3 active:scale-95 transition-all text-sm uppercase tracking-widest border border-[var(--border-strong)]"
          style={{ fontFamily: "'Jost', sans-serif" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
          Filter & Sort
        </button>
      </div>
    </>
  );
}
