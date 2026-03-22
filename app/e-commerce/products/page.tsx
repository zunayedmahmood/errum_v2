'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
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

const PRODUCTS_PER_PAGE = 15;

/**
 * Product Feed Page
 * 
 * A high-end, high-performance product feed leveraging server-side 
 * SKU grouping and filtering for a seamless shopping experience.
 */
export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();

  // --- State ---
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

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

      // We use grouped_products if the backend grouping logic is active
      const displayProducts = response.grouped_products?.length
        ? response.grouped_products.map(gp => gp.main_variant)
        : response.products;

      setProducts(displayProducts as SimpleProduct[]);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to load products:', error);
      fireToast('Error loading products. Please try again.', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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

  // --- UI Helpers ---
  const flattenedCategories = useMemo(() => {
    const list: Array<{ id: number; name: string; depth: number }> = [];
    const walk = (cats: CatalogCategory[], depth = 0) => {
      cats.forEach(c => {
        list.push({ id: c.id, name: c.name, depth });
        if (c.children?.length) walk(c.children, depth + 1);
      });
    };
    walk(categories);
    return list;
  }, [categories]);

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
          className={`h-10 w-10 rounded-xl text-sm font-medium transition-all ${pagination.current_page === i
              ? 'bg-[var(--gold)] text-white shadow-lg shadow-gold/20'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div className="ec-root ec-bg-texture min-h-screen">
      <Navigation />

      {/* Hero Section */}
      <header className="relative py-16 md:py-24 overflow-hidden border-b border-white/5">
        <div className="ec-container text-center relative z-10 ec-anim-fade-up">
          <span className="ec-eyebrow mb-4">Discover the Collection</span>
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold text-white mb-6" style={{ fontFamily: "'Jost', sans-serif" }}>
            Curated <span style={{ color: 'var(--gold)' }}>Excellence</span>
          </h1>
          <p className="max-w-2xl mx-auto text-white/50 text-lg leading-relaxed font-light" style={{ fontFamily: "'Jost', sans-serif" }}>
            Explore our premium selection of handcrafted items and digital masterpieces,
            blending timeless aesthetics with modern functionality.
          </p>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-gold/10 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
        </div>
      </header>

      <main className="ec-container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Sidebar / Filters (Left 3 columns) */}
          <aside className="lg:col-span-3 space-y-8">
            {/* Search Bar - ALWAYS top, but not sticky on mobile */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-white/30 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Search</h3>
              <form onSubmit={handleSearchSubmit} className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-[var(--gold)] transition-colors" />
                <input
                  type="text"
                  placeholder="Find anything..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 focus:border-[var(--gold)]/40 transition-all text-sm"
                  style={{ fontFamily: "'Jost', sans-serif" }}
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

              <div className="mt-8 space-y-4">
                <h3 className="text-[11px] font-bold tracking-[0.2em] text-white/30 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort By</h3>
                <div className="ec-dark-card p-2">
                  <select
                    value={sortBy}
                    onChange={e => handleSortChange(e.target.value)}
                    className="w-full bg-transparent text-white/80 py-2.5 px-3 focus:outline-none cursor-pointer text-sm"
                    style={{ fontFamily: "'Jost', sans-serif" }}
                  >
                    <option value="newest" className="bg-neutral-900">Newest First</option>
                    <option value="price_asc" className="bg-neutral-900">Price: Low to High</option>
                    <option value="price_desc" className="bg-neutral-900">Price: High to Low</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mobile Filters Trigger */}
            <div className="lg:hidden">
              <button
                onClick={() => setShowMobileFilters(true)}
                className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Filter className="h-4 w-4" /> Filters & Sorting
              </button>
            </div>
          </aside>

          {/* Main Content (Right 9 columns) */}
          <div className="lg:col-span-9">
            {/* Results Header */}
            <div className="mb-10 flex items-center justify-between">
              {!isLoading && pagination && (
                <p className="text-[11px] font-bold tracking-[0.2em] text-white/30 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                  Displaying {pagination.total} results
                </p>
              )}
              {isRefreshing && (
                <div className="flex items-center gap-2 text-[var(--gold)] text-xs animate-pulse font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" /> Synchronizing...
                </div>
              )}
            </div>

            {/* Product Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 min-h-[600px] content-start">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="ec-card aspect-[3/4] rounded-2xl animate-pulse bg-white/5" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="min-h-[500px] flex flex-col items-center justify-center text-center ec-surface bg-white/[0.02] backdrop-blur-md rounded-3xl border border-white/5">
                <div className="p-8 rounded-full bg-white/5 mb-6">
                  <ShoppingBag className="h-10 w-10 text-white/10" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2" style={{ fontFamily: "'Jost', sans-serif" }}>No products found</h3>
                <p className="text-white/30 max-w-sm mb-8 text-sm font-light" style={{ fontFamily: "'Jost', sans-serif" }}>
                  We couldn't find items matching your criteria. Try adjusting your filters or search query.
                </p>
                <button
                  onClick={() => {
                    setSearchInput('');
                    updateURL({ search: null, category: 'all', sort: 'newest', price: 'all' });
                  }}
                  className="px-10 py-3.5 rounded-2xl bg-[var(--gold)] text-white font-semibold hover:bg-[#9a6b2e] transition-all text-sm"
                  style={{ fontFamily: "'Jost', sans-serif" }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
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
                  <div className="mt-20 flex flex-col items-center gap-6">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={pagination.current_page === 1}
                        onClick={() => handlePageChange(pagination.current_page - 1)}
                        className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-20 transition-all text-sm"
                      >
                        Prev
                      </button>

                      <div className="flex items-center gap-1.5 mx-2">
                        {renderPaginationRange()}
                      </div>

                      <button
                        disabled={pagination.current_page === pagination.last_page}
                        onClick={() => handlePageChange(pagination.current_page + 1)}
                        className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-20 transition-all text-sm"
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
                 <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/20 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Sort By</h3>
                 <div className="grid grid-cols-1 gap-2">
                   {[
                     { id: 'newest', label: 'Newest First' },
                     { id: 'price_asc', label: 'Price: Low to High' },
                     { id: 'price_desc', label: 'Price: High to Low' },
                   ].map(opt => (
                     <button
                       key={opt.id}
                       onClick={() => handleSortChange(opt.id)}
                       className={`text-left p-4 rounded-xl border transition-all ${sortBy === opt.id ? 'border-[var(--gold)] bg-[var(--gold)]/10 text-white' : 'border-white/5 bg-white/5 text-white/60'}`}
                     >
                       {opt.label}
                     </button>
                   ))}
                 </div>
              </div>
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
    </div>
  );
}
