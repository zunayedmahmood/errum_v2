'use client';

import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Filter,
  ChevronDown,
  ShoppingBag,
  Loader2,
  ArrowRight,
  SlidersHorizontal,
  X
} from 'lucide-react';

import Navigation from '@/components/ecommerce/Navigation';
import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, {
  CatalogCategory,
  SimpleProduct,
  PaginationMeta
} from '@/services/catalogService';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import CategorySidebar from '@/components/ecommerce/category/CategorySidebar';
import { fireToast } from '@/lib/globalToast';

const PRODUCTS_PER_PAGE = 30;

/**
 * Product Feed Page
 * 
 * A high-end, high-performance product feed leveraging server-side 
 * SKU grouping and filtering for a seamless shopping experience.
 */
export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div className="ec-root ec-bg-texture min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--gold)]" />
      </div>
    }>
      <ProductsPageContent />
    </Suspense>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();

  // --- State ---
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const fetchIdRef = useRef(0);

  // --- Filter State (Synced with URL) ---
  const query = searchParams.get('search') || '';
  const categoryId = searchParams.get('category') || 'all';
  const sortBy = (searchParams.get('sort') as 'newest' | 'price_asc' | 'price_desc') || 'newest';
  const priceRange = searchParams.get('price') || 'all';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // --- Local UI State ---
  const [searchInput, setSearchInput] = useState(query);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isClosingFilters, setIsClosingFilters] = useState(false);
  
  // Notify navigation about mobile sidebar state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mobile-sidebar-toggle', { detail: { open: showMobileFilters } }));
    return () => {
      window.dispatchEvent(new CustomEvent('mobile-sidebar-toggle', { detail: { open: false } }));
    };
  }, [showMobileFilters]);

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
    if (!updates.page) {
      params.delete('page');
    }

    router.push(`/e-commerce/products?${params.toString()}`);
  }, [searchParams, router]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== query) {
        updateURL({ search: searchInput || null });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, updateURL, query]);

  // --- Effects ---
  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId, sortBy, priceRange, currentPage]);

  // Update local search input if URL query changes (e.g. back button)
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  // --- Actions ---
  const fetchCategories = async () => {
    try {
      const data = await catalogService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const fetchProducts = async () => {
    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      const params: any = {
        page: currentPage,
        per_page: PRODUCTS_PER_PAGE,
        sort_by: sortBy === 'newest' ? 'created_at' : sortBy,
        sort_order: sortBy === 'price_asc' ? 'asc' : 'desc',
        group_by_sku: true,
      };

      if (query) params.search = query;
      if (categoryId !== 'all') params.category_id = categoryId;

      if (priceRange !== 'all') {
        const [min, max] = priceRange.split('-');
        if (min) params.min_price = min;
        if (max) params.max_price = max;
      }

      const response = await catalogService.getProducts(params);

      // Check if this is still the most recent request
      if (currentFetchId !== fetchIdRef.current) return;

      // We use grouped_products if the backend grouping logic is active
      const displayProducts = response.grouped_products?.length
        ? response.grouped_products.map(gp => gp.main_variant)
        : response.products;

      setProducts(displayProducts as SimpleProduct[]);
      setPagination(response.pagination);
    } catch (error) {
      if (currentFetchId === fetchIdRef.current) {
        console.error('Failed to load products:', error);
        fireToast('Error loading products. Please try again.', 'error');
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateURL({ search: searchInput || null });
  };

  const handleCategoryChange = (val: string) => {
    updateURL({ category: val });
  };

  const handleSortChange = (val: string) => {
    updateURL({ sort: val });
  };

  const handlePriceChange = (val: string) => {
    updateURL({ price: val });
  };

  const handlePageChange = (page: number) => {
    updateURL({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageError = (id: number) => {
    setImageErrors(prev => new Set(prev).add(id));
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

  // Rendering pagination numbers
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
              ? 'bg-[var(--gold)] text-white shadow-lg'
              : 'bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--ivory-ghost)]'
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

      {/* Hero Section */}
      <header className="relative py-16 md:py-24 border-b border-[var(--border-default)] bg-[var(--bg-depth)]">
        <div className="ec-container text-center relative z-10 ec-anim-fade-up">
          <span className="ec-eyebrow mb-4 text-[var(--cyan)]">Discover the Collection</span>
          <h1 className="text-4xl md:text-6xl font-medium text-[var(--text-primary)] mb-6" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Curated <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Excellence</span>
          </h1>
          <p className="max-w-2xl mx-auto text-[var(--text-secondary)] text-lg leading-relaxed font-light">
            Explore our premium selection of handcrafted items and digital masterpieces,
            blending timeless aesthetics with modern functionality.
          </p>
        </div>
      </header>

      <main className="ec-container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Sidebar / Filters (Left 3 columns) */}
          <aside className="lg:col-span-3 space-y-10">
            {/* Search Bar */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Search</h3>
              <form onSubmit={handleSearchSubmit} className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] group-focus-within:text-[var(--cyan)] transition-colors" />
                <input
                  type="text"
                  placeholder="Find anything..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cyan-border)] transition-all text-sm"
                />
              </form>
            </div>

            {/* Unified Filters Sidebar */}
            <div className="hidden lg:block">
              <CategorySidebar
                categories={categories}
                activeCategory={String(categoryId)}
                onCategoryChange={handleCategoryChange}
                selectedPriceRange={priceRange}
                onPriceRangeChange={handlePriceChange}
                selectedStock="all"
                onStockChange={() => {}}
                useIdForRouting={true}
              />

              <div className="mt-10 space-y-4">
                <h3 className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort By</h3>
                <div className="ec-surface p-2">
                  <select
                    value={sortBy}
                    onChange={e => handleSortChange(e.target.value)}
                    className="w-full bg-transparent text-[var(--text-primary)] py-3 px-4 focus:outline-none cursor-pointer text-sm"
                  >
                    <option value="newest">Newest First</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mobile Filters Trigger */}
            <div className="lg:hidden">
              <button
                onClick={() => setShowMobileFilters(true)}
                className="w-full py-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] flex items-center justify-center gap-3 text-sm font-bold tracking-widest"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                <SlidersHorizontal className="h-4 w-4 text-[var(--cyan)]" /> FILTERS & SORTING
              </button>
            </div>
          </aside>

          {/* Main Content (Right 9 columns) */}
          <div className="lg:col-span-9">
            {/* Results Header */}
            <div className="mb-12 flex items-center justify-between border-b border-[var(--border-default)] pb-6">
              {!isLoading && pagination && (
                <p className="text-[11px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                  Displaying {pagination.total} results
                </p>
              )}
              {isRefreshing && (
                <div className="flex items-center gap-2 text-[var(--cyan)] text-xs animate-pulse font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" /> Synchronizing...
                </div>
              )}
            </div>

            {/* Product Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8 min-h-[600px] content-start">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-2xl animate-shimmer bg-[var(--bg-depth)] border border-[var(--border-default)]" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="min-h-[500px] flex flex-col items-center justify-center text-center ec-surface py-20">
                <div className="p-10 rounded-full bg-[var(--bg-depth)] border border-[var(--border-default)] mb-8">
                  <ShoppingBag className="h-12 w-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-2xl font-medium text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>No products found</h3>
                <p className="text-[var(--text-secondary)] max-w-sm mb-10 text-sm font-light">
                  We couldn&apos;t find items matching your criteria. Try adjusting your filters or search query.
                </p>
                <button
                  onClick={() => {
                    setSearchInput('');
                    updateURL({ search: null, category: 'all', sort: 'newest', price: 'all' });
                  }}
                  className="px-10 py-5 rounded-2xl bg-[var(--gold)] text-white font-bold hover:bg-[var(--gold-strong)] transition-all text-[12px] tracking-[0.2em] uppercase"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
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

                {/* Pagination */}
                {pagination && pagination.last_page > 1 && (
                  <div className="mt-24 flex flex-col items-center gap-6">
                    <div className="flex items-center gap-2 sm:gap-4">
                      <button
                        disabled={pagination.current_page === 1}
                        onClick={() => handlePageChange(pagination.current_page - 1)}
                        className="h-9 px-4 sm:h-11 sm:px-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--ivory-ghost)] disabled:opacity-30 transition-all text-[10px] sm:text-xs font-bold tracking-widest uppercase"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        Prev
                      </button>

                      <div className="flex items-center gap-1 sm:gap-2">
                        {renderPaginationRange()}
                      </div>

                      <button
                        disabled={pagination.current_page === pagination.last_page}
                        onClick={() => handlePageChange(pagination.current_page + 1)}
                        className="h-9 px-4 sm:h-11 sm:px-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--ivory-ghost)] disabled:opacity-30 transition-all text-[10px] sm:text-xs font-bold tracking-widest uppercase"
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
        <div className="fixed inset-0 z-[100] xl:hidden">
          <div 
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm ${isClosingFilters ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
            onClick={closeFilters}
          />
          <div className={`fixed top-0 right-0 bottom-0 z-[101] w-[85%] max-w-sm bg-[var(--bg-root)] shadow-2xl flex flex-col ${isClosingFilters ? 'ec-anim-slide-out-right' : 'ec-anim-slide-in-right'}`}>
            <div className="flex items-center justify-between p-8 border-b border-[var(--border-default)]">
              <h2 className="text-xl font-medium text-[var(--text-primary)] uppercase tracking-widest" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Filters</h2>
              <button 
                onClick={closeFilters} 
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-depth)] border border-[var(--border-default)] transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto ec-scrollbar p-8 space-y-12 pb-32">
                <CategorySidebar
                categories={categories}
                activeCategory={String(categoryId)}
                onCategoryChange={(val) => {
                  handleCategoryChange(val);
                  closeFilters();
                }}
                selectedPriceRange={priceRange}
                onPriceRangeChange={(val) => {
                  handlePriceChange(val);
                  closeFilters();
                }}
                selectedStock="all"
                onStockChange={() => { }}
                useIdForRouting={true}
              />

              <div className="mt-8 space-y-4">
                 <h3 className="text-[10px] font-bold tracking-[0.25em] text-[var(--text-muted)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort By</h3>
                 <div className="grid grid-cols-1 gap-3">
                   {[
                     { id: 'newest', label: 'Newest First' },
                     { id: 'price_asc', label: 'Price: Low to High' },
                     { id: 'price_desc', label: 'Price: High to Low' },
                   ].map(opt => (
                     <button
                       key={opt.id}
                       onClick={() => handleSortChange(opt.id)}
                       className={`text-left p-5 rounded-2xl border transition-all text-sm font-medium ${sortBy === opt.id ? 'border-[var(--cyan-border)] bg-[var(--cyan-pale)] text-[var(--cyan)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}
                     >
                       {opt.label}
                     </button>
                   ))}
                 </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 bg-[var(--bg-root)] border-t border-[var(--border-default)]">
              <button 
                onClick={closeFilters}
                className="w-full py-5 rounded-2xl bg-[var(--gold)] text-white font-bold shadow-lg tracking-widest uppercase text-xs"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
