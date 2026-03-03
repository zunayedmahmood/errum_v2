'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, X, Loader2, AlertCircle, Package } from 'lucide-react';

import catalogService from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import { getCardPriceText } from '@/lib/ecommerceCardUtils';
import type { SimpleProduct } from '@/services/catalogService';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const getPrimaryImageUrl = (p: SimpleProduct) =>
  (Array.isArray(p.images) && p.images[0]?.url) || '/placeholder-product.png';

const getCategoryName = (p: SimpleProduct) =>
  typeof p.category === 'object' && p.category ? p.category.name : typeof p.category === 'string' ? p.category : '';

/* ─── component ───────────────────────────────────────────────────────────── */

export default function SearchClient({ initialQuery = '' }: { initialQuery?: string }) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query,    setQuery]    = useState(initialQuery);
  const [results,  setResults]  = useState<SimpleProduct[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  /* Run search whenever the URL query changes (including on mount if already has query) */
  useEffect(() => {
    if (!initialQuery.trim()) {
      // No query — show empty search UI, focus input
      setResults([]);
      setTotal(0);
      setSearched(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    runSearch(initialQuery.trim());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const runSearch = async (q: string) => {
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const response = await catalogService.searchProducts({ q, per_page: 48, page: 1 });
      const cards    = buildCardProductsFromResponse(response);
      setResults(cards);
      setTotal(response.pagination?.total ?? cards.length);
    } catch (err: any) {
      console.error('Search error:', err);
      setError('Search failed. Please check your connection and try again.');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.replace(`/e-commerce/search?q=${encodeURIComponent(q)}`);
    runSearch(q);
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
    setTotal(0);
    setSearched(false);
    router.replace('/e-commerce/search');
    inputRef.current?.focus();
  };

  /* ── render ── */
  return (
    // Search should inherit the e-commerce dark theme (layout already sets dark background).
    <div className="ec-root min-h-screen">
      {/* ── Search bar hero ── */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="ec-container py-8 sm:py-10">
          <p className="ec-eyebrow mb-2">Catalogue</p>
          <h1 className="ec-heading mb-5 text-2xl font-semibold text-white sm:text-3xl">
            Search Products
          </h1>

          <form onSubmit={onSubmit} className="relative max-w-2xl">
            <SearchIcon
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50"
              size={18}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, SKU or category…"
              autoComplete="off"
              className="w-full rounded-xl border border-white/15 bg-black/30 py-3 pl-11 pr-28 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/25 focus:ring-2 focus:ring-white/10 transition"
            />
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                className="absolute right-[5.5rem] top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition"
                aria-label="Clear"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Results area ── */}
      <div className="ec-container py-6 sm:py-8">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-white/70">
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-white" />
            <p className="text-sm">Searching for "{initialQuery || query}"…</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="mx-auto max-w-lg rounded-2xl border border-rose-300/30 bg-rose-500/10 p-5 flex items-start gap-3">
            <AlertCircle className="mt-0.5 flex-shrink-0 text-rose-300" size={20} />
            <div>
              <p className="font-medium text-rose-200">Something went wrong</p>
              <p className="mt-0.5 text-sm text-rose-200/80">{error}</p>
            </div>
          </div>
        )}

        {/* ── Empty state (no query yet) ── */}
        {!loading && !error && !searched && !initialQuery && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <SearchIcon size={28} className="text-white/50" />
            </div>
            <p className="ec-heading text-lg font-medium text-white/80">Start typing to search</p>
            <p className="mt-1 text-sm text-white/50">Search by product name, SKU or category</p>
          </div>
        )}

        {/* ── No results ── */}
        {!loading && !error && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <Package size={28} className="text-white/50" />
            </div>
            <p className="ec-heading text-lg font-medium text-white/80">No products found</p>
            <p className="mt-1 text-sm text-white/55">
              No results for <span className="font-medium">"{initialQuery || query}"</span>. Try a different keyword.
            </p>
          </div>
        )}

        {/* ── Results ── */}
        {!loading && !error && results.length > 0 && (
          <>
            {/* <p className="mb-5 text-sm text-white/55">
              <span className="font-semibold text-white">{total.toLocaleString()}</span> result{total !== 1 ? 's' : ''} for{' '}
              <span className="font-semibold text-white">"{initialQuery || query}"</span>
            </p> */}

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {results.map(product => {
                const imageUrl     = getPrimaryImageUrl(product);
                const categoryName = getCategoryName(product);
                const priceText    = getCardPriceText(product);
                const inStock      = product.in_stock !== false;
                const hasVariants  = product.has_variants;

                return (
                  <Link
                    key={product.id}
                    href={`/e-commerce/product/${product.id}`}
                    className="group ec-card ec-card-hover overflow-hidden rounded-2xl"
                  >
                    {/* image */}
                    <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                      <img
                        src={imageUrl}
                        alt={product.display_name || product.base_name || product.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        onError={e => { (e.currentTarget as HTMLImageElement).src = '/placeholder-product.png'; }}
                      />

                      {/* stock badge */}
                      <span
                        className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-medium shadow-sm ${
                          inStock
                            ? 'border-green-200 bg-green-50/95 text-green-700'
                            : 'border-neutral-200 bg-white/90 text-neutral-600'
                        }`}
                      >
                        {inStock ? 'In Stock' : 'Out of Stock'}
                      </span>

                      {/* variants badge */}
                      {hasVariants && (
                        <span className="absolute left-2 top-2 rounded-full border border-white/70 bg-white/90 px-2 py-1 text-[10px] font-medium text-neutral-800 shadow-sm backdrop-blur">
                          {product.total_variants ?? ''}+ options
                        </span>
                      )}

                      {/* hover CTA */}
                      <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                        <div className="w-full rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-center text-xs font-semibold text-neutral-900 shadow-sm backdrop-blur">
                          {hasVariants ? 'Select options' : 'View product'}
                        </div>
                      </div>
                    </div>

                    {/* info */}
                    <div className="p-3 sm:p-4">
                      {categoryName && (
                        <p className="mb-1 line-clamp-1 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                          {categoryName}
                        </p>
                      )}
                      <h3 className="line-clamp-3 min-h-[3.75rem] text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 transition-colors">
                        {product.display_name || product.base_name || product.name}
                      </h3>
                      <p className="mt-2 text-base font-bold text-amber-600">{priceText}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
