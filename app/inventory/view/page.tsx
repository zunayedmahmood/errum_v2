'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CategoryTreeSelector from '@/components/product/CategoryTreeSelector';
import categoryService from '@/services/categoryService';
import inventoryService, {
  InventoryDatePreset,
  InventoryOverviewItem,
  InventoryOverviewResponse,
  InventoryOverviewStoreRow,
  InventoryStockStatus,
} from '@/services/inventoryService';

interface Category {
  id: number;
  title: string;
  name?: string;
  slug?: string;
  parent_id?: number;
  children?: Category[];
}

type ExpandedStoreKey = `${string}:${number}`;

const DATE_PRESETS: Array<{ value: InventoryDatePreset; label: string }> = [
  { value: '365', label: 'Last 1 year' },
  { value: '90', label: 'Last 90 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
  { value: 'today', label: 'Today' },
  { value: 'custom', label: 'Custom range' },
];

const nf = new Intl.NumberFormat('en-US');

const number = (value: number | null | undefined, digits = 0) => {
  const n = Number(value || 0);
  return nf.format(digits > 0 ? Number(n.toFixed(digits)) : Math.round(n));
};

const money = (value: number | null | undefined) => `BDT ${number(value || 0)}`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysText = (value?: number | null) => {
  if (value === null || value === undefined) return 'No sales';
  if (value > 3650) return 'Very high';
  return `${number(value, 1)} days`;
};

function getStatusLabel(status: InventoryStockStatus) {
  switch (status) {
    case 'out_of_stock': return 'Out of stock';
    case 'no_stock': return 'No stock';
    case 'low': return 'Low stock';
    case 'high': return 'High stock';
    case 'slow_moving': return 'Slow moving';
    default: return 'Normal';
  }
}

function getStatusClasses(status: InventoryStockStatus) {
  switch (status) {
    case 'out_of_stock':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border-red-200 dark:border-red-800';
    case 'low':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200 border-orange-200 dark:border-orange-800';
    case 'high':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border-blue-200 dark:border-blue-800';
    case 'slow_moving':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200 border-purple-200 dark:border-purple-800';
    case 'no_stock':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600';
    default:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800';
  }
}

function StatusBadge({ status }: { status: InventoryStockStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClasses(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        </div>
        <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StoreSummaryCard({ store, isExpanded, onToggle }: { store: InventoryOverviewStoreRow; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onToggle} className="flex min-w-[200px] items-center gap-2 text-left">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <p className="font-black text-gray-900 dark:text-white">{store.store_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{store.po_count} PO · {store.batch_count} batch</p>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={store.stock_status} />
          <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-black text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white">
            Stock: {number(store.current_stock)}
          </span>
          <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
            Sold: {number(store.total_sell)}
          </span>
          <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
            Cover: {daysText(store.days_of_cover)}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <MiniMetric label="Purchase" value={store.total_purchase} />
            <MiniMetric label="Sell" value={store.total_sell} />
            <MiniMetric label="Dispatch Out" value={store.total_dispatch_out} />
            <MiniMetric label="Dispatch Receive" value={store.total_dispatch_received} />
            <MiniMetric label="Defect" value={store.total_defect} />
            <MiniMetric label="Velocity/day" value={number(store.velocity_per_day, 3)} />
            <MiniMetric label="Retail stock value" value={money(store.stock_value)} />
            <MiniMetric label="Revenue" value={money(store.sales_revenue)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-xs uppercase text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">PO</th>
                  <th className="px-3 py-2 text-left">Batch</th>
                  <th className="px-3 py-2 text-right">Purchased</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Sell-through</th>
                  <th className="px-3 py-2 text-right">Velocity/day</th>
                  <th className="px-3 py-2 text-left">Received</th>
                  <th className="px-3 py-2 text-left">Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {store.batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No PO/batch rows found in this selected date range.
                    </td>
                  </tr>
                ) : (
                  store.batches.map((batch) => (
                    <tr key={batch.batch_id} className="text-gray-800 dark:text-gray-200">
                      <td className="px-3 py-2 font-bold">{batch.po_number || 'Manual/Direct'}</td>
                      <td className="px-3 py-2">{batch.batch_number}</td>
                      <td className="px-3 py-2 text-right">{number(batch.original_qty)}</td>
                      <td className="px-3 py-2 text-right font-black">{number(batch.remaining_stock)}</td>
                      <td className="px-3 py-2 text-right">{number(batch.units_sold)}</td>
                      <td className="px-3 py-2 text-right">{number(batch.sell_through_pct, 1)}%</td>
                      <td className="px-3 py-2 text-right">{number(batch.velocity_per_day, 3)}</td>
                      <td className="px-3 py-2">{formatDate(batch.po_received_date || batch.po_order_date || batch.batch_created_at)}</td>
                      <td className="px-3 py-2">{batch.vendor_name || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function RecommendationBox({ item }: { item: InventoryOverviewItem }) {
  const rec = item.movement_recommendation;
  if (!rec) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
        No transfer recommendation for this product in the selected period.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-100">
        <ArrowRightLeft className="h-4 w-4" />
        Move {number(rec.suggested_quantity)} unit(s) from {rec.from_store_name} to {rec.to_store_name}
        <span className="rounded-full bg-white px-2 py-0.5 text-xs uppercase text-blue-700 dark:bg-blue-950 dark:text-blue-200">
          {rec.urgency}
        </span>
      </div>
      <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">{rec.reason}</p>
    </div>
  );
}

function ViewInventoryPageContent() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<InventoryDatePreset>('365');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [data, setData] = useState<InventoryOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedStores, setExpandedStores] = useState<Set<ExpandedStoreKey>>(new Set());



  const fetchCategories = useCallback(async () => {
    try {
      const res: any = await categoryService.getTree(true);
      setCategories(Array.isArray(res) ? res : (res?.data || []));
    } catch (e) {
      console.warn('Failed to load categories', e);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await inventoryService.getInventoryOverview({
        date_preset: datePreset,
        start_date: datePreset === 'custom' ? startDate || undefined : undefined,
        end_date: datePreset === 'custom' ? endDate || undefined : undefined,
        category_id: selectedCategoryId || undefined,
        search: appliedSearch || undefined,
        page,
        per_page: perPage,
        skipStoreScope: true,
      });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load inventory overview.');
    } finally {
      setLoading(false);
    }
  }, [datePreset, startDate, endDate, selectedCategoryId, appliedSearch, page, perPage]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const toggleProduct = (key: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleStore = (groupKey: string, storeId: number) => {
    const key = `${groupKey}:${storeId}` as ExpandedStoreKey;
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetToFirstPage = () => setPage(1);

  const summary = data?.summary;
  const products = data?.items || [];

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Inventory Intelligence View</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Date-filtered PO, batch, sales, dispatch, defect, velocity and store movement recommendation in one place.
                </p>
                {data?.filters && (
                  <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Movement period: {formatDate(data.filters.start_date)} to {formatDate(data.filters.end_date)} · Current stock is latest live stock.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={fetchOverview}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</label>
                  <select
                    value={datePreset}
                    onChange={(e) => {
                      setDatePreset(e.target.value as InventoryDatePreset);
                      resetToFirstPage();
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    {DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                  </select>
                </div>

                {datePreset === 'custom' && (
                  <>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Start</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); resetToFirstPage(); }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">End</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); resetToFirstPage(); }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </>
                )}

                <div className={datePreset === 'custom' ? 'lg:col-span-3' : 'lg:col-span-4'}>
                  <CategoryTreeSelector
                    categories={categories as any}
                    selectedCategoryId={selectedCategoryId ? String(selectedCategoryId) : ''}
                    onSelect={(id) => { setSelectedCategoryId(id ? Number(id) : null); resetToFirstPage(); }}
                    label="Category"
                    required={false}
                    placeholder="All categories"
                    showSelectedInfo={false}
                    allowClear={true}
                    clearText="All categories"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setAppliedSearch(draftSearch.trim());
                          resetToFirstPage();
                        }
                      }}
                      placeholder="Product, SKU, variation"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2 lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => { setAppliedSearch(draftSearch.trim()); resetToFirstPage(); }}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {summary && (
              <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
                <MetricCard icon={Package} label="Products" value={number(summary.total_products)} hint={`${number(summary.page_products)} on page`} />
                <MetricCard icon={Boxes} label="Current Stock" value={number(summary.total_current_stock)} />
                <MetricCard icon={ShoppingCart} label="Sold" value={number(summary.total_sell)} hint="In selected period" />
                <MetricCard icon={CalendarDays} label="Purchased" value={number(summary.total_purchase)} hint="PO received/ordered" />
                <MetricCard icon={Truck} label="Dispatch Out" value={number(summary.total_dispatch_out)} />
                <MetricCard icon={Building2} label="Dispatch Receive" value={number(summary.total_dispatch_received)} />
                <MetricCard icon={AlertTriangle} label="Low Stock" value={number(summary.low_stock_count)} />
                <MetricCard icon={ArrowRightLeft} label="Suggestions" value={number(summary.recommendation_count)} />
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-white">Product-wise stock intelligence</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Expand a product, then expand any store to see purchase/sell/dispatch/defect and batch/PO details.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Rows</span>
                  <select
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center p-16 text-gray-500 dark:text-gray-400">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading inventory intelligence...
                </div>
              ) : products.length === 0 ? (
                <div className="p-16 text-center text-gray-500 dark:text-gray-400">
                  <Package className="mx-auto mb-3 h-12 w-12 opacity-60" />
                  No products found for this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        <th className="px-4 py-3 text-right">PO/Batch</th>
                        <th className="px-4 py-3 text-right">Purchase</th>
                        <th className="px-4 py-3 text-right">Sell</th>
                        <th className="px-4 py-3 text-right">Dispatch</th>
                        <th className="px-4 py-3 text-right">Defect</th>
                        <th className="px-4 py-3 text-right">Velocity</th>
                        <th className="px-4 py-3 text-left">Health</th>
                        <th className="px-4 py-3 text-left">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {products.map((item) => {
                        const expanded = expandedProducts.has(item.group_key);
                        return (
                          <tr key={item.group_key} className="align-top">
                            <td colSpan={11} className="p-0">
                              <div className="grid grid-cols-[minmax(260px,1.4fr)_minmax(140px,.8fr)_90px_90px_90px_90px_100px_80px_90px_120px_minmax(220px,1fr)] items-center gap-0 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                                <button type="button" onClick={() => toggleProduct(item.group_key)} className="flex items-start gap-2 text-left">
                                  {expanded ? <ChevronDown className="mt-1 h-4 w-4 text-gray-500" /> : <ChevronRight className="mt-1 h-4 w-4 text-gray-500" />}
                                  <div>
                                    <p className="font-black text-gray-900 dark:text-white">{item.product_name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {item.sku} · {item.variations.length} variation(s)</p>
                                  </div>
                                </button>
                                <div className="text-gray-700 dark:text-gray-300">
                                  <p className="font-bold">{item.category_name || 'Uncategorized'}</p>
                                  <p className="text-xs text-gray-500">{item.subcategory_name || '-'}</p>
                                </div>
                                <Cell value={number(item.current_stock)} strong />
                                <Cell value={`${number(item.po_count)} / ${number(item.batch_count)}`} />
                                <Cell value={number(item.total_purchase)} />
                                <Cell value={number(item.total_sell)} />
                                <Cell value={`${number(item.total_dispatch_out)} / ${number(item.total_dispatch_received)}`} />
                                <Cell value={number(item.total_defect)} />
                                <Cell value={number(item.velocity_per_day, 3)} />
                                <div><StatusBadge status={item.stock_status} /></div>
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                  {item.movement_recommendation
                                    ? `Move ${number(item.movement_recommendation.suggested_quantity)}: ${item.movement_recommendation.from_store_name} → ${item.movement_recommendation.to_store_name}`
                                    : 'No move needed'}
                                </div>
                              </div>

                              {expanded && (
                                <div className="space-y-4 border-t border-gray-100 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                  <RecommendationBox item={item} />

                                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                                    <MiniMetric label="Available" value={number(item.available_stock)} />
                                    <MiniMetric label="Reserved" value={number(item.reserved_stock)} />
                                    <MiniMetric label="Stock cover" value={daysText(item.days_of_cover)} />
                                    <MiniMetric label="Retail stock value" value={money(item.stock_value)} />
                                    <MiniMetric label="Stores" value={item.stores.length} />
                                    <MiniMetric label="Variations" value={item.variations.length} />
                                    <MiniMetric label="PO count" value={item.po_count} />
                                    <MiniMetric label="Batch count" value={item.batch_count} />
                                  </div>

                                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                                    <p className="mb-2 text-sm font-black text-gray-900 dark:text-white">Variation stock</p>
                                    <div className="flex flex-wrap gap-2">
                                      {item.variations.map((variation) => (
                                        <span key={variation.product_id} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                          {variation.variation_suffix || 'Default'}: {number(variation.current_stock)} stock {number(variation.reserved_stock)} reserved
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    {item.stores.map((store) => {
                                      const storeKey = `${item.group_key}:${store.store_id}` as ExpandedStoreKey;
                                      return (
                                        <StoreSummaryCard
                                          key={storeKey}
                                          store={store}
                                          isExpanded={expandedStores.has(storeKey)}
                                          onToggle={() => toggleStore(item.group_key, store.store_id)}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {data && data.last_page > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    Page {data.page} of {data.last_page} · {number(data.total)} product groups
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-white"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= data.last_page || loading}
                      onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-white"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Cell({ value, strong = false }: { value: string | number; strong?: boolean }) {
  return (
    <div className={`text-right ${strong ? 'font-black text-gray-900 dark:text-white' : 'font-bold text-gray-700 dark:text-gray-300'}`}>
      {value}
    </div>
  );
}

export default function ViewInventoryPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-300">Loading inventory view...</div>}>
      <ViewInventoryPageContent />
    </Suspense>
  );
}
