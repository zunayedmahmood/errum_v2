'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import { findCategory, groupedDisplayProducts, slugify } from './storefrontUtils';

interface Props { categorySlug?: string | null; forcedSearch?: string | null; }

const priceOptions = [
  { value: 'all', label: 'All Prices' },
  { value: '0-500', label: 'Under Tk 500' },
  { value: '500-1000', label: 'Tk 500 - Tk 1,000' },
  { value: '1000-2000', label: 'Tk 1,000 - Tk 2,000' },
  { value: '2000-5000', label: 'Tk 2,000 - Tk 5,000' },
  { value: '5000-999999', label: 'Above Tk 5,000' },
];

function CategoryTree({ categories, activeId, onSelect }: { categories: CatalogCategory[]; activeId?: number; onSelect: (category?: CatalogCategory) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const render = (category: CatalogCategory, level = 0): React.ReactNode => {
    const children = category.children || [];
    const open = expanded.has(category.id) || children.some((child) => child.id === activeId);
    return <div key={category.id} className="ref-filter-category">
      <div style={{ paddingLeft: `${level * 14}px` }}>
        <button className={activeId === category.id ? 'is-active' : ''} onClick={() => onSelect(category)}>{category.name}</button>
        {!!children.length && <button aria-label="Toggle subcategories" onClick={() => setExpanded((current) => { const next = new Set(current); next.has(category.id) ? next.delete(category.id) : next.add(category.id); return next; })}><ChevronDown size={13} className={open ? 'is-open' : ''} /></button>}
      </div>
      {!!children.length && open && <div>{children.map((child) => render(child, level + 1))}</div>}
    </div>;
  };
  return <>{categories.map((category) => render(category))}</>;
}

export default function ReferenceCatalogPage({ categorySlug, forcedSearch }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sort = searchParams.get('sort') || 'newest';
  const price = searchParams.get('price') || 'all';
  const search = forcedSearch ?? searchParams.get('search') ?? searchParams.get('q') ?? '';
  const activeCategory = useMemo(() => findCategory(categories, categorySlug || searchParams.get('category')), [categories, categorySlug, searchParams]);

  useEffect(() => { catalogService.getCategories().then(setCategories).catch(() => setCategories([])); }, []);
  useEffect(() => { setPage(1); setProducts([]); }, [activeCategory?.id, sort, price, search]);

  const loadProducts = useCallback(async (targetPage: number, append: boolean) => {
    setLoading(true);
    try {
      const request: any = { page: targetPage, per_page: 30, group_by_sku: true, sort_by: sort };
      if (activeCategory) request.category_id = activeCategory.id;
      if (search) request.search = search;
      if (price !== 'all') {
        const [min, max] = price.split('-'); request.min_price = Number(min); request.max_price = Number(max);
      }
      const response = await catalogService.getProducts(request);
      const next = groupedDisplayProducts(response);
      setProducts((current) => append ? [...current, ...next.filter((product) => !current.some((item) => item.id === product.id))] : next);
      setLastPage(response.pagination?.last_page || 1);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  }, [activeCategory, price, search, sort]);

  useEffect(() => { loadProducts(1, false); }, [loadProducts]);

  const update = (values: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value && value !== 'all' ? params.set(key, value) : params.delete(key));
    const path = categorySlug ? `/e-commerce/${categorySlug}` : '/e-commerce/products';
    router.push(`${path}${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };

  const selectCategory = (category?: CatalogCategory) => {
    setFiltersOpen(false);
    router.push(category ? `/e-commerce/${category.slug || slugify(category.name)}` : '/e-commerce/products');
  };

  const filters = <div className="ref-catalog-filters">
    <section><h3>CATEGORIES</h3><button className={!activeCategory ? 'ref-filter-all is-active' : 'ref-filter-all'} onClick={() => selectCategory()}>ALL CATEGORIES</button><CategoryTree categories={categories.filter((category) => !category.parent_id)} activeId={activeCategory?.id} onSelect={selectCategory} /></section>
    <section><h3>PRICE RANGE</h3>{priceOptions.map((option) => <label key={option.value}><input type="radio" name="price" checked={price === option.value} onChange={() => update({ price: option.value })} /><span>{option.label}</span></label>)}</section>
    {(activeCategory || price !== 'all' || search) && <button className="ref-clear-filters" onClick={() => router.push('/e-commerce/products')}>CLEAR ALL FILTERS</button>}
  </div>;

  return <main className="ref-storefront ref-catalog-page">
    <Navigation />
    <header className="ref-catalog-header">
      <div><span>ERRUM CATALOG</span><h1>{activeCategory || search ? 'FILTERED DROPS' : 'ALL RELEASES'}</h1><p>{search ? `Results for “${search}”` : 'Showing latest available releases'}</p></div>
      <label>SORT BY:<select value={sort} onChange={(event) => update({ sort: event.target.value })}><option value="newest">New Releases</option><option value="price_asc">Price Low to High</option><option value="price_desc">Price High to Low</option><option value="name">Name A-Z</option></select></label>
    </header>
    <button className={`ref-mobile-filter-toggle ${filtersOpen ? 'is-open' : ''}`} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal size={17} /> FILTERS & COLLECTIONS <ChevronDown size={17} /></button>
    {filtersOpen && <div className="ref-mobile-filter-panel">{filters}</div>}
    <div className="ref-catalog-layout">
      <aside>{filters}</aside>
      <section className="ref-catalog-results">
        <div className="ref-product-grid">
          {loading && !products.length && Array.from({ length: 8 }).map((_, index) => <div className="ref-product-skeleton" key={`skeleton-${index}`}><div /><i /><b /></div>)}
          {products.map((product, index) => <PremiumProductCard key={product.id} product={product} onOpen={(item) => router.push(`/e-commerce/product/${item.id}`)} onAddToCart={() => undefined} animDelay={(index % 12) * 35} />)}
        </div>
        {loading && !!products.length && <div className="ref-loading-grid">LOADING DROPS...</div>}
        {!loading && !products.length && <div className="ref-empty-state"><h2>NO DROPS FOUND</h2><p>Try another collection or price range.</p></div>}
        {!loading && page < lastPage && <button className="ref-load-more" onClick={() => { const next = page + 1; setPage(next); loadProducts(next, true); }}>LOAD MORE DROPS</button>}
      </section>
    </div>
  </main>;
}
