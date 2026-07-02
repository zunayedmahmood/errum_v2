'use client';

import React, { useEffect, useMemo, useState } from 'react';
import businessAnalyticsService, { TopProductRow, ReportingFilters } from '@/services/businessAnalyticsService';
import categoryService from '@/services/categoryService';
import ReportCard from './ReportCard';
import { ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
}

export default function BestSellersCard({
  initialData,
  initialFilters,
}: {
  initialData: TopProductRow[];
  initialFilters: ReportingFilters;
}) {
  const [data, setData] = useState<TopProductRow[]>(initialData || []);
  const [filters, setFilters] = useState<ReportingFilters>(initialFilters || {});
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState<string | number>(initialFilters?.category_id || '');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sortBy, setSortBy] = useState('revenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [meta, setMeta] = useState<PageMeta>({ current_page: 1, last_page: 1, per_page: 25, total: initialData?.length || 0, from: initialData?.length ? 1 : 0, to: initialData?.length || 0 });
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = async (nextPage = page, overrides: Partial<ReportingFilters> = {}) => {
    setLoading(true);
    try {
      const res = await businessAnalyticsService.getTopProducts({
        ...filters,
        ...overrides,
        category_id: (overrides.category_id ?? categoryId) || undefined,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
        page: nextPage,
        per_page: perPage,
        sort_by: sortBy,
        sort_direction: sortDirection,
      });
      setData(res.data || []);
      setMeta(res.meta || { current_page: nextPage, last_page: 1, per_page: perPage, total: res.data?.length || 0, from: res.data?.length ? 1 : 0, to: res.data?.length || 0 });
      setPage(res.meta?.current_page || nextPage);
    } catch (error) {
      console.error('Failed to fetch product performance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilters(initialFilters || {});
    setCategoryId(initialFilters?.category_id || '');
    fetchData(1, initialFilters || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialFilters), perPage, sortBy, sortDirection]);

  useEffect(() => {
    categoryService.getAll({ tree: true, per_page: 1000 }).then((res: any) => {
      const cats = Array.isArray(res) ? res : (res?.data || []);
      setCategories(cats);
    }).catch((err) => {
      console.error('Failed to load categories:', err);
    });
  }, []);

  const flattenedCategories = useMemo(() => {
    const flat: { id: number; title: string }[] = [];
    const traverse = (list: any[], level = 0, parents: string[] = []) => {
      list.forEach((cat) => {
        const title = cat.title || cat.name || `Category ${cat.id}`;
        const path = [...parents, title].join(' > ');
        flat.push({ id: cat.id, title: `${'— '.repeat(level)}${path}` });
        const children = cat.children || cat.all_children || [];
        if (children.length > 0) traverse(children, level + 1, [...parents, title]);
      });
    };
    traverse(categories);
    return flat;
  }, [categories]);

  const applyLocalFilters = () => {
    setPage(1);
    fetchData(1);
  };

  return (
    <ReportCard
      title="All Product Performance"
      subtitle="Every sold product is ranked and paginated. Filter by branch, category, SKU, and price."
      isLoading={loading}
      onRefresh={() => fetchData(page)}
      headerAction={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded-xl border p-2 transition-all ${showFilters ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      }
    >
      {showFilters && (
        <div className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Category / Subcategory</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">All categories</option>
              {flattenedCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Min price</label>
            <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Max price</label>
            <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <option value="revenue">Revenue</option>
              <option value="units">Units</option>
              <option value="gross_profit">Profit</option>
              <option value="orders">Orders</option>
              <option value="stock_on_hand">Stock</option>
              <option value="margin_pct">Margin %</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <option value="desc">High to low</option>
              <option value="asc">Low to high</option>
            </select>
            <button onClick={applyLocalFilters} className="rounded-xl bg-gray-900 p-2 text-white dark:bg-white dark:text-gray-900" title="Apply product filters"><Search className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
        <span>Showing {meta.from || 0}-{meta.to || 0} of {meta.total || 0} products</span>
        <span>Page {meta.current_page || page} of {meta.last_page || 1}</span>
      </div>

      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-gray-50/80 text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-800/30 dark:text-gray-400">
              <th className="px-4 py-3 text-left font-black">Rank</th>
              <th className="px-4 py-3 text-left font-black">Product</th>
              <th className="px-4 py-3 text-left font-black">Category</th>
              <th className="px-4 py-3 text-right font-black">Orders</th>
              <th className="px-4 py-3 text-right font-black">Units</th>
              <th className="px-4 py-3 text-right font-black">Revenue</th>
              <th className="px-4 py-3 text-right font-black">Profit</th>
              <th className="px-4 py-3 text-right font-black">Margin</th>
              <th className="px-4 py-3 text-right font-black">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((row, index) => (
              <tr key={`${row.product_id}-${row.sku}-${index}`} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/50">
                <td className="px-4 py-4 font-black text-gray-500">#{row.rank || (meta.from + index)}</td>
                <td className="px-4 py-4">
                  <div className="font-bold text-gray-900 dark:text-white">{row.name}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{row.sku || 'No SKU'}</div>
                </td>
                <td className="px-4 py-4 text-xs font-semibold text-gray-600 dark:text-gray-300">{row.category || 'Uncategorized'}</td>
                <td className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-300">{row.orders || 0}</td>
                <td className="px-4 py-4 text-right font-black text-gray-900 dark:text-white">{row.units}</td>
                <td className="px-4 py-4 text-right font-bold text-gray-900 dark:text-white">{currency(row.revenue)}</td>
                <td className="px-4 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{currency(row.gross_profit)}</td>
                <td className="px-4 py-4 text-right font-semibold text-gray-700 dark:text-gray-300">{Number(row.margin_pct || 0).toFixed(1)}%</td>
                <td className="px-4 py-4 text-right">
                  <span className={`rounded-lg px-2 py-1 text-xs font-black ${row.stock_on_hand <= 5 ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>{row.stock_on_hand}</span>
                </td>
              </tr>
            ))}
            {data.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">No product performance found for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          disabled={page <= 1 || loading}
          onClick={() => fetchData(page - 1)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <div className="text-xs font-bold text-gray-500">Page {meta.current_page || page} / {meta.last_page || 1}</div>
        <button
          disabled={page >= (meta.last_page || 1) || loading}
          onClick={() => fetchData(page + 1)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </ReportCard>
  );
}
