'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { RefreshCw, Calendar, BarChart3, Store, TrendingUp, Package, AlertTriangle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Toast from '@/components/Toast';
import dashboardService, { StoresSummaryPeriod, StoresSummaryResponse } from '@/services/dashboardService';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatBDT(value: number) {
  const n = Number(value ?? 0);
  return `৳${n.toLocaleString()}`;
}

export default function StoresSummaryPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [period, setPeriod] = useState<StoresSummaryPeriod>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [data, setData] = useState<StoresSummaryResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  const queryParams = useMemo(() => {
    // Custom range overrides period if both dates provided
    if (dateFrom && dateTo) {
      return { date_from: dateFrom, date_to: dateTo };
    }
    return { period };
  }, [period, dateFrom, dateTo]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getStoresSummary(queryParams);
      if (!res?.success) {
        setToast({ message: 'Failed to load stores summary', type: 'error' });
        setData(null);
        return;
      }
      setData(res.data);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to load stores summary', type: 'error' });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);

  const totals = data?.overall_totals;

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} darkMode={darkMode} />
      <div className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'} md:ml-64`}>
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Stores Summary</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Multi-store performance snapshot (sales, profit, inventory)
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as StoresSummaryPeriod)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
                <span className="text-gray-400">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <button
                onClick={fetchSummary}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {data?.period && (
            <div className="mb-6 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span>
                Period: <span className="font-medium">{data.period.type}</span> ({formatDate(data.period.start_date)} → {formatDate(data.period.end_date)})
              </span>
              <span className="ml-2 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                {data.store_count} store(s)
              </span>
            </div>
          )}

          {/* Overall cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><TrendingUp className="w-4 h-4" /> Total Sales</div>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{formatBDT(totals?.total_sales ?? 0)}</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Store className="w-4 h-4" /> Orders</div>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{(totals?.total_orders ?? 0).toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><TrendingUp className="w-4 h-4" /> Profit</div>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{formatBDT(totals?.total_profit ?? 0)}</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><Package className="w-4 h-4" /> Inventory Value</div>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{formatBDT(totals?.total_inventory_value ?? 0)}</div>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><AlertTriangle className="w-4 h-4" /> Returns</div>
              <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{(totals?.total_returns ?? 0).toLocaleString()}</div>
            </div>
          </div>

          {/* Stores table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Store Breakdown</h2>
              {loading && <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/30">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Store</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Sales</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Orders</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Net Profit</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Net Margin</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Inventory</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-900 dark:text-white">Low/Out</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.stores || []).map((s) => (
                    <tr key={s.store.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">{s.store.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{s.store.store_code} • {s.store.store_type}{s.store.address ? ` • ${s.store.address}` : ''}</div>
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">{formatBDT(s.sales.total_sales)}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">{s.sales.total_orders.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-white">{formatBDT(s.performance.net_profit)}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">{s.performance.net_margin_percentage}%</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">{formatBDT(s.inventory.total_value)}</td>
                      <td className="py-3 px-4 text-right text-sm">
                        <span className="text-yellow-700 dark:text-yellow-300">{s.inventory.low_stock_count}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-700 dark:text-red-300">{s.inventory.out_of_stock_count}</span>
                      </td>
                    </tr>
                  ))}

                  {(!data?.stores || data.stores.length === 0) && !loading && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-500 dark:text-gray-400">
                        No stores data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
