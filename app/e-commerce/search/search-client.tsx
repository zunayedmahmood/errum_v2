'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Filter,
  Loader2,
  ShoppingBag,
  X
} from 'lucide-react';

import Navigation from '@/components/ecommerce/Navigation';
import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, {
  SimpleProduct,
  PaginationMeta
} from '@/services/catalogService';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import PriceRangeSelector from '@/components/ecommerce/products/PriceRangeSelector';
import { fireToast } from '@/lib/globalToast';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';

const PRODUCTS_PER_PAGE = 30;

/**
 * Search Client Component
 * 
 * Provides a premium search experience with SKU grouping, 
 * price filtering, and character-change debounced search.
 */
export default function SearchClient({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();

  // --- Filter State (Synced with URL) ---
  const query = searchParams.get('q') || '';
  const sortBy = (searchParams.get('sort') as 'newest' | 'price_asc' | 'price_desc') || 'newest';
  const priceRange = searchParams.get('price') || 'all';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // --- Local State ---
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(query || initialQuery);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isClosingFilters, setIsClosingFilters] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<any[]>([]);
  const fetchIdRef = useRef(0);
  const [openCategoryId, setOpenCategoryId] = useState<number | string | null>(null);

  // Filter state from URL
  const selectedCategoryId = searchParams.get('category') || 'all';

  // Open the parent category of the selected subcategory on mount
  useEffect(() => {
    if (categories.length && selectedCategoryId !== 'all') {
      const findAndOpenParent = (cats: any[], targetId: string): boolean => {
        for (const cat of cats) {
          if (String(cat.id) === targetId) return true;
          if (cat.children?.length) {
            if (findAndOpenParent(cat.children, targetId)) {
              setOpenCategoryId(cat.id);
              return true;
            }
          }
        }
        return false;
      };
      findAndOpenParent(categories, String(selectedCategoryId));
    }
  }, [categories, selectedCategoryId]);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await catalogService.getCategories();
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };
    fetchCategories();
  }, []);


  // --- Navigation Helper ---
  const updateURL = useCallback((updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === 'all' || (key === 'page' && value === 1)) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    // If changing filters, reset to page 1
    if (!updates.page && (updates.q !== undefined || updates.sort !== undefined || updates.price !== undefined || updates.category !== undefined)) {
      params.delete('page');
    }

    router.push(`/e-commerce/search?${params.toString()}`);
  }, [searchParams, router]);

  // Debounced search effect (500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== query) {
        updateURL({ q: searchInput || null });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, updateURL, query]);

  // Synchronize local search input if URL query changes (e.g., back button or initial load)
  useEffect(() => {
    if (query !== searchInput) {
      setSearchInput(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Fetch results effect
  useEffect(() => {
    if (query.trim()) {
      fetchResults();
    } else {
      setProducts([]);
      setPagination(null);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sortBy, priceRange, currentPage, selectedCategoryId]);

  const fetchResults = async () => {
    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      // Parse price range for the public catalog API
      let min_cost: number | undefined;
      let max_cost: number | undefined;
      
      if (priceRange !== 'all') {
        const parts = priceRange.split('-');
        if (parts.length === 2) {
          min_cost = Number(parts[0]);
          max_cost = Number(parts[1]);
        }
      }

      const params = {
        q: query,
        page: currentPage,
        per_page: PRODUCTS_PER_PAGE,
        category_id: selectedCategoryId !== 'all' ? Number(selectedCategoryId) : undefined,
        min_price: min_cost,
        max_price: max_cost,
        sort_by: sortBy,
        group_by_sku: true, // Ensuring unique products by SKU
      };

      // Use the public getProducts endpoint which doesn't require authentication
      // and supports search, category, and price filtering.
      const qParams = params as any;
      const queryParams = {
        ...qParams,
        search: qParams.q || qParams.search,
      };
      const response = await catalogService.getProducts(queryParams as any);

      // Check if this is still the most recent request
      if (currentFetchId !== fetchIdRef.current) return;

      // Use buildCardProductsFromResponse to ensure grouping, de-duplication, and image propagation
      const buildResults = buildCardProductsFromResponse(response as any);
      setProducts(buildResults);
      setPagination(response.pagination);
    } catch (error) {
      if (currentFetchId === fetchIdRef.current) {
        console.error('Search failed:', error);
        fireToast('Error loading search results.', 'error');
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handlePriceChange = (val: string) => {
    updateURL({ price: val });
  };

  const handleSortChange = (val: string) => {
    updateURL({ sort: val });
  };

  const handlePageChange = (page: number) => {
    updateURL({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProductClick = (product: SimpleProduct) => {
    router.push(`/e-commerce/product/${product.id}`);
  };

  const closeFilters = () => {
    setIsClosingFilters(true);
    setTimeout(() => {
      setShowMobileFilters(false);
      setIsClosingFilters(false);
    }, 450);
  };

  const handleAddToCart = async (product: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.has_variants) {
      handleProductClick(product);
      return;
    }
    try {
      await addToCart(product.id, 1);
      fireToast(`Added ${product.name} to cart`, 'success');
    } catch (err: any) {
      fireToast(err.message || 'Failed to add to cart', 'error');
    }
  };

  const handleImageError = (id: number) => {
    setImageErrors(prev => new Set(prev).add(id));
  };

  const handleCategoryToggle = (id: number | string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenCategoryId(prev => (prev === id ? null : id));
  };

  const renderCategory = (cat: any, depth = 0, isMobile = false) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const isOpen = openCategoryId === cat.id;
    const isSelected = String(selectedCategoryId) === String(cat.id);

    return (
      <div key={cat.id} className="flex flex-col gap-1">
        <div className="flex items-center gap-1 group">
          <button
            onClick={() => updateURL({ category: String(cat.id) })}
            className={`flex-1 text-left px-4 py-2.5 rounded-xl transition-all text-sm truncate ${isSelected
                ? 'bg-[var(--gold)] text-[var(--text-on-accent)] shadow-lg shadow-gold/20'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--ivory-ghost)]'
              } ${isMobile && !isSelected ? 'border border-[var(--border-default)] bg-[var(--bg-depth)]' : ''}`}
            style={{
              fontFamily: "'Jost', sans-serif",
              paddingLeft: depth > 0 ? `${16 + depth * 12}px` : undefined
            }}
          >
            {cat.name}
          </button>
          {hasChildren && (
            <button
              onClick={(e) => handleCategoryToggle(cat.id, e)}
              className={`p-2 rounded-xl transition-all ${isOpen ? 'text-[var(--cyan)] bg-[var(--cyan-pale)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-depth)]'
                }`}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {hasChildren && isOpen && (
          <div className="flex flex-col gap-1 mt-1 max-h-[400px] overflow-y-auto ec-scrollbar pr-1">
            {cat.children.map((child: any) => renderCategory(child, depth + 1, isMobile))}
          </div>
        )}
      </div>
    );
  };

  // Rendering pagination numbers (consistent with products page)
  const renderPaginationRange = () => {
    if (!pagination || pagination.last_page <= 1) return null;

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.current_page - 2);
    let end = Math.min(pagination.last_page, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl text-xs sm:text-sm font-medium transition-all ${pagination.current_page === i
              ? 'bg-[var(--gold)] text-[var(--text-on-accent)] shadow-lg shadow-gold/20'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--ivory-ghost)] hover:text-[var(--text-primary)]'
            }`}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div className="ec-root min-h-screen bg-[var(--bg-root)]">
      <Navigation />

      {/* Hero Header */}
      <header className="relative py-12 md:py-20 overflow-hidden border-b border-[var(--border-default)] bg-[var(--bg-depth)]">
        <div className="ec-container text-center relative z-10 ec-anim-fade-up">
          <span className="ec-eyebrow mb-3 text-[var(--cyan)]">Catalogue Search</span>
          <h1 className="text-4xl md:text-6xl font-medium text-[var(--text-primary)] mb-8" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Finding <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>"{query || '...'}"</span>
          </h1>

          <div className="max-w-2xl mx-auto relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-muted)] group-focus-within:text-[var(--cyan)] transition-colors" />
            <input
              type="text"
              placeholder="Search by name, SKU, or category..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-14 pr-12 py-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cyan-border)] transition-all text-base"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Background glow (Ivory Theme) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-[var(--gold-pale)] blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-[var(--cyan-pale)] blur-[100px]" />
        </div>
      </header>

      <main className="ec-container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Sidebar (Desktop) */}
          <aside className="lg:col-span-3 space-y-10 lg:block hidden">
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Product Collections</h3>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    updateURL({ category: 'all' });
                    setOpenCategoryId(null);
                  }}
                  className={`text-left px-4 py-2.5 rounded-xl transition-all text-sm ${selectedCategoryId === 'all'
                      ? 'bg-[var(--gold)] text-[var(--text-on-accent)] shadow-lg shadow-gold/20'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--ivory-ghost)]'
                    }`}
                  style={{ fontFamily: "'Jost', sans-serif" }}
                >
                  Show All
                </button>
                {categories.map((cat) => renderCategory(cat, 0, false))}
              </div>
            </div>

            <PriceRangeSelector
              selectedPriceRange={priceRange}
              onPriceRangeChange={handlePriceChange}
            />

            <div className="space-y-4">
              <h3 className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort Results</h3>
              <div className="ec-surface p-2">
                <select
                  value={sortBy}
                  onChange={e => handleSortChange(e.target.value)}
                  className="w-full bg-transparent text-[var(--text-primary)] py-2.5 px-3 focus:outline-none cursor-pointer text-sm"
                  style={{ fontFamily: "'Jost', sans-serif" }}
                >
                  <option value="newest">Newest Arrivals</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          </aside>

          {/* Mobile Filter Toggle */}
          <div className="lg:hidden mb-6">
            <button
              onClick={() => setShowMobileFilters(true)}
              className="w-full py-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Filter className="h-4 w-4 text-[var(--cyan)]" /> Filters & Sorting
            </button>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-9">
            <div className="mb-12 flex items-center justify-between border-b border-[var(--border-default)] pb-6">
              {!isLoading && pagination && (
                <p className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {pagination.total} items matched your search
                </p>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="ec-card aspect-[3/4] rounded-2xl animate-pulse bg-[var(--bg-depth)]" />
                ))}
              </div>
            ) : !query.trim() ? (
              <div className="min-h-[400px] flex flex-col items-center justify-center text-center">
                <div className="p-8 rounded-full bg-[var(--bg-depth)] mb-6">
                  <Search className="h-10 w-10 text-[var(--text-muted)] opacity-20" />
                </div>
                <h3 className="text-2xl font-medium text-[var(--text-primary)] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Start searching</h3>
                <p className="text-[var(--text-secondary)] max-w-xs text-sm font-light">
                  Enter a product name, SKU, or category to see our premium collection.
                </p>
              </div>
            ) : products.length === 0 ? (
              <div className="min-h-[400px] flex flex-col items-center justify-center text-center ec-surface py-20 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-default)]">
                <div className="p-8 rounded-full bg-[var(--bg-depth)] mb-6">
                  <ShoppingBag className="h-10 w-10 text-[var(--text-muted)] opacity-20" />
                </div>
                <h3 className="text-2xl font-medium text-[var(--text-primary)] mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>No matches found</h3>
                <p className="text-[var(--text-secondary)] max-w-xs mb-8 text-sm font-light">
                  We couldn't find any results for "{query}". Try different keywords or adjust your filters.
                </p>
                <button
                  onClick={() => {
                    setSearchInput('');
                    updateURL({ q: null, price: 'all', sort: 'newest' });
                  }}
                  className="px-10 py-4 rounded-2xl bg-[var(--gold)] text-[var(--text-on-accent)] font-bold hover:opacity-90 transition-all text-[12px] tracking-[0.2em] uppercase"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                  {products.map((product, idx) => (
                    <div
                      key={product.id}
                      className="ec-anim-fade-up"
                      style={{ animationDelay: `${(idx % 8) * 0.05}s` }}
                    >
                      <PremiumProductCard
                        product={product}
                        imageErrored={imageErrors.has(product.id)}
                        onImageError={handleImageError}
                        onOpen={handleProductClick}
                        onAddToCart={handleAddToCart}
                      />
                    </div>
                  ))}
                </div>

                {pagination && pagination.last_page > 1 && (
                  <div className="mt-20 flex flex-col items-center gap-6">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        disabled={pagination.current_page === 1}
                        onClick={() => handlePageChange(pagination.current_page - 1)}
                        className="h-9 px-3 sm:h-10 sm:px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--ivory-ghost)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-all text-xs sm:text-sm font-bold tracking-widest uppercase"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        Prev
                      </button>
                      <div className="flex items-center gap-1 sm:gap-1.5 mx-1 sm:mx-2">
                        {renderPaginationRange()}
                      </div>
                      <button
                        disabled={pagination.current_page === pagination.last_page}
                        onClick={() => handlePageChange(pagination.current_page + 1)}
                        className="h-9 px-3 sm:h-10 sm:px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--ivory-ghost)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-all text-xs sm:text-sm font-bold tracking-widest uppercase"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Filters Drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm ${isClosingFilters ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
            onClick={closeFilters}
          />
          <div className={`fixed top-0 right-0 bottom-0 z-[101] w-[85%] max-w-[400px] bg-[var(--bg-root)] shadow-2xl flex flex-col ${isClosingFilters ? 'ec-anim-slide-out-right' : 'ec-anim-slide-in-right'}`}>
            <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
              <h2 className="text-xl font-medium text-[var(--text-primary)] uppercase tracking-widest" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Filters</h2>
              <button
                onClick={closeFilters}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-depth)] border border-[var(--border-default)] transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto ec-scrollbar p-6 space-y-10 pb-32">
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Collections</h3>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      updateURL({ category: 'all' });
                      setOpenCategoryId(null);
                    }}
                    className={`px-4 py-4 rounded-xl border text-sm text-left font-medium transition-all ${selectedCategoryId === 'all' ? 'border-[var(--cyan-border)] bg-[var(--cyan-pale)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}
                  >
                    All Collections
                  </button>
                  <div className="max-h-[400px] overflow-y-auto ec-scrollbar pr-1">
                    {categories.map((cat) => renderCategory(cat, 0, true))}
                  </div>
                </div>
              </div>

              <PriceRangeSelector
                selectedPriceRange={priceRange}
                onPriceRangeChange={handlePriceChange}
              />

              <div className="space-y-4">
                <h3 className="text-[10px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort Results</h3>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'newest', label: 'Newest Arrivals' },
                    { id: 'price_asc', label: 'Price: Low to High' },
                    { id: 'price_desc', label: 'Price: High to Low' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleSortChange(opt.id)}
                      className={`text-left p-5 rounded-xl border transition-all text-sm font-medium ${sortBy === opt.id ? 'border-[var(--cyan-border)] bg-[var(--cyan-pale)] text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-[var(--bg-root)] border-t border-[var(--border-default)]">
              <button
                onClick={closeFilters}
                className="w-full py-5 rounded-2xl bg-[var(--gold)] text-[var(--text-on-accent)] font-bold shadow-lg tracking-[0.2em] uppercase text-xs transition-transform active:scale-[0.98]"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
