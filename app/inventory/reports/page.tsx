'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import businessAnalyticsService, { type CommandCenterResponse, type ReportingFilters } from '@/services/businessAnalyticsService';
import storeService, { type Store } from '@/services/storeService';
import {
  AlertTriangle,
  CalendarDays,
  Download,
  Layers,
  Package,
  RefreshCw,
  ShoppingBag,
  Store as StoreIcon,
  Tag,
  TrendingUp,
} from 'lucide-react';

import SalesTrendCard from './components/SalesTrendCard';
import BestSellersCard from './components/BestSellersCard';
import ProductSelectModal from './components/ProductSelectModal';
import CategoryPerformanceCard from './components/CategoryPerformanceCard';
import StoreSalesOverviewCard from './components/StoreSalesOverviewCard';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr?: string) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-BD', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function InventoryReportsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CommandCenterResponse['data'] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [filters, setFilters] = useState<ReportingFilters>({ from: todayStr(-29), to: todayStr() });
  const [showProductModal, setShowProductModal] = useState(false);

  const loadData = async (silent = false) => loadDataWith(filters, silent);

  useEffect(() => {
    loadData();
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStores = async () => {
    try {
      const response: any = await storeService.getStores({ is_active: true, per_page: 1000 });
      const nextStores = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response)
            ? response
            : [];
      setStores(nextStores);
    } catch (err) {
      console.error('Failed to load stores', err);
    }
  };

  const loadDataWith = async (nextFilters: ReportingFilters, silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError('');
      const res = await businessAnalyticsService.getCommandCenter(nextFilters);
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (patch: Partial<ReportingFilters>) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    loadDataWith(nextFilters);
  };

  const exportCsv = async () => {
    const response = await businessAnalyticsService.exportSummary(filters);
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-reports-${filters.from || 'from'}-${filters.to || 'to'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickStats = useMemo(() => {
    if (!data) return [];

    const diffDays = Math.max(
      1,
      Math.round(
        (new Date(data.period.to).getTime() - new Date(data.period.from).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
    );

    const avgDailySales = data.kpis.net_sales / diffDays;
    const monthlyRunRate = avgDailySales * 30;
    const bestCategory = [...(data.category_performance || [])].sort((a, b) => b.value - a.value)[0];
    const bestProduct = [...(data.top_products || [])].sort((a, b) => b.revenue - a.revenue)[0];

    return [
      {
        label: 'Total Sales',
        value: currency(data.kpis.net_sales),
        sub: `${data.kpis.total_orders} orders in selected period`,
        icon: ShoppingBag,
        accent: 'from-indigo-500 to-cyan-400',
      },
      {
        label: 'Daily Average Sales',
        value: currency(avgDailySales),
        sub: `${diffDays} day reporting range`,
        icon: CalendarDays,
        accent: 'from-emerald-500 to-teal-400',
      },
      {
        label: 'Monthly Sales Run Rate',
        value: currency(monthlyRunRate),
        sub: 'Projected from current daily average',
        icon: TrendingUp,
        accent: 'from-fuchsia-500 to-pink-400',
      },
      {
        label: 'Best Category',
        value: bestCategory?.label || '—',
        sub: bestCategory ? `Sales ${currency(bestCategory.value)}` : 'No category data',
        icon: Tag,
        accent: 'from-amber-500 to-orange-400',
      },
      {
        label: 'Best Seller',
        value: bestProduct?.name || '—',
        sub: bestProduct ? `Revenue ${currency(bestProduct.revenue)}` : 'No product data',
        icon: Package,
        accent: 'from-violet-500 to-indigo-400',
      },
      {
        label: 'Top Store',
        value: [...(data.branch_performance || [])].sort((a, b) => b.net_sales - a.net_sales)[0]?.store_name || '—',
        sub: (() => {
          const topStore = [...(data.branch_performance || [])].sort((a, b) => b.net_sales - a.net_sales)[0];
          return topStore ? `Sales ${currency(topStore.net_sales)}` : 'No store data';
        })(),
        icon: StoreIcon,
        accent: 'from-sky-500 to-blue-400',
      },
    ];
  }, [data]);

  const selectedStoreName = useMemo(() => {
    if (!filters.store_id) return 'All stores';
    return stores.find((store) => String(store.id) === String(filters.store_id))?.name || `Store ${filters.store_id}`;
  }, [filters.store_id, stores]);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header toggleSidebar={() => setSidebarOpen(!sidebarOpen)} darkMode={darkMode} setDarkMode={setDarkMode} />
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 xl:p-8">
              <div className="mb-8 rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                      Inventory Reports
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white md:text-4xl">Simple Sales Overview</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                      Clear view of store-wise sales, best selling categories, best sellers, and daily or monthly sales without the clutter.
                    </p>
                    {data ? (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        Viewing {selectedStoreName} • {formatDateLabel(data.period.from)} to {formatDateLabel(data.period.to)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 xl:items-end">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <input
                        type="date"
                        value={filters.from || ''}
                        onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                        className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                      />
                      <input
                        type="date"
                        value={filters.to || ''}
                        onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                        className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                      />
                      <select
                        value={filters.store_id ? String(filters.store_id) : ''}
                        onChange={(e) => setFilters((prev) => ({ ...prev, store_id: e.target.value || undefined }))}
                        className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none transition focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                      >
                        <option value="">All stores</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                        <input
                          type="text"
                          placeholder="SKU filter"
                          value={filters.sku || ''}
                          onChange={(e) => setFilters((prev) => ({ ...prev, sku: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && loadData()}
                          className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400 dark:text-gray-200"
                        />
                        <button
                          onClick={() => setShowProductModal(true)}
                          className="rounded-xl p-2 text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                          title="Pick product"
                        >
                          <Layers className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => loadData()}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:scale-[1.01] dark:bg-white dark:text-gray-900"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Apply filters
                      </button>
                      <button
                        onClick={exportCsv}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Download className="h-4 w-4" /> Export
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-36 animate-pulse rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900/50" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  {error}
                </div>
              ) : data ? (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {quickStats.map((card) => {
                      const Icon = card.icon;
                      return (
                        <div key={card.label} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
                          <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{card.label}</div>
                              <div className="mt-2 text-xl font-black text-gray-900 dark:text-white">{card.value}</div>
                            </div>
                            <div className={`rounded-2xl bg-gradient-to-br p-3 text-white ${card.accent}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{card.sub}</div>
                        </div>
                      );
                    })}
                  </div>

                  <SalesTrendCard
                    initialData={data.sales_trend}
                    initialFilters={{
                      from: filters.from as string,
                      to: filters.to as string,
                      store_id: filters.store_id,
                      sku: filters.sku,
                    }}
                  />

                  <div className="grid gap-8 xl:grid-cols-2">
                    <StoreSalesOverviewCard data={data.branch_performance} />
                    <CategoryPerformanceCard data={data.category_performance} />
                  </div>

                  <BestSellersCard
                    initialData={data.top_products}
                    initialFilters={{
                      from: filters.from as string,
                      to: filters.to as string,
                      store_id: filters.store_id,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>

      {showProductModal && (
        <ProductSelectModal
          onClose={() => setShowProductModal(false)}
          onSelect={(sku) => {
            applyFilters({ sku });
            setShowProductModal(false);
          }}
        />
      )}
    </div>
  );
}