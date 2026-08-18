'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Box,
  CircleDollarSign,
  Download,
  Info,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/contexts/ThemeContext';
import resellService, {
  ResellReport,
  ResellReportProduct,
  ResellVendorProfile,
} from '@/services/resellService';

const money = (value: unknown) =>
  `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

const number = (value: unknown) =>
  Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });

const getError = (error: any) =>
  error?.response?.data?.message ||
  (error?.response?.data?.errors
    ? Object.values(error.response.data.errors).flat().join(', ')
    : '') ||
  error?.message ||
  'Something went wrong';

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
};

export default function ResellReportsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ResellReport | null>(null);
  const [vendors, setVendors] = useState<ResellVendorProfile[]>([]);
  const [tab, setTab] = useState<'vendors' | 'products'>('vendors');
  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    resell_vendor_id: '',
    search: '',
    include_inactive: false,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, any> = {};
      if (appliedFilters.from_date) params.from_date = appliedFilters.from_date;
      if (appliedFilters.to_date) params.to_date = appliedFilters.to_date;
      if (appliedFilters.resell_vendor_id) params.resell_vendor_id = appliedFilters.resell_vendor_id;
      if (appliedFilters.search.trim()) params.search = appliedFilters.search.trim();
      if (appliedFilters.include_inactive) params.include_inactive = true;

      const data = await resellService.getReport(params);
      setReport(data);
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    resellService
      .getVendors({ include_inactive: true })
      .then((rows) => setVendors(Array.isArray(rows) ? rows : []))
      .catch(() => setVendors([]));
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const productRows = useMemo(() => report?.products || [], [report]);
  const vendorRows = useMemo(() => report?.vendors || [], [report]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
      setError('From date cannot be later than To date.');
      return;
    }
    setAppliedFilters({ ...filters });
  };

  const resetFilters = () => {
    const clean = {
      from_date: '',
      to_date: '',
      resell_vendor_id: '',
      search: '',
      include_inactive: false,
    };
    setFilters(clean);
    setAppliedFilters(clean);
  };

  const exportProducts = () => {
    const headers = [
      'Vendor', 'Product', 'SKU', 'Brand', 'Category', 'Ordered Qty', 'Received Qty',
      'Current Stock', 'Inventory Cost', 'Gross Sold', 'Returned', 'Net Sold', 'Net Sales', 'Vendor Earned (Sold Cost)',
      'Gross Profit', 'Margin %', 'Sell-through %', 'Last Received', 'Last Sale',
    ];
    const rows = productRows.map((row) => [
      row.vendor_name, row.product_name, row.sku || '', row.brand || '', row.category || '',
      row.ordered_quantity, row.received_quantity, row.stock_on_hand, row.stock_cost_value, row.gross_units_sold,
      row.returned_quantity, row.net_units_sold, row.net_sales, row.net_cogs,
      row.gross_profit, row.margin_percent, row.sell_through_percent,
      row.last_received_at || '', row.last_sale_at || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `resell-product-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const cards = [
    ['Resell Vendors', report?.summary.vendors || 0, Users],
    ['Resell Products', report?.summary.products || 0, ShoppingBag],
    ['Units Received', report?.summary.received_quantity || 0, PackageCheck],
    ['Units Left', report?.summary.stock_on_hand || 0, Box],
    ['Net Units Sold', report?.summary.net_units_sold || 0, TrendingUp],
    ['Inventory at Cost', money(report?.summary.stock_cost_value), Box],
    ['Vendor Earned', money(report?.summary.vendor_earned), CircleDollarSign],
    ['Paid Vendors', money(report?.summary.paid_amount), CircleDollarSign],
    ['Refunded by Vendors', money(report?.summary.refunded_amount), RotateCcw],
    ['Vendor Due', money(report?.summary.vendor_due), CircleDollarSign],
    ['Refund Due', money(report?.summary.refund_due), RotateCcw],
    ['Net Sales', money(report?.summary.net_sales), BarChart3],
    ['Gross Profit', money(report?.summary.gross_profit), TrendingUp],
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="min-w-0 flex-1">
        <Header
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        <main className="p-4 md:p-7">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link
                href="/resell"
                className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Resell Items
              </Link>
              <h1 className="text-3xl font-bold">Resell Reports</h1>
              <p className="mt-2 max-w-4xl text-sm text-gray-600 dark:text-gray-400">
                Live sell-through, stock, sold-cost liability, profit, purchase-order and vendor-payment reporting. Deleted sales,
                cancelled orders, returns, and exchange replacement orders are recalculated from current records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadReport}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                onClick={exportProducts}
                disabled={!productRows.length}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          <form
            onSubmit={applyFilters}
            className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">From date</span>
                <input
                  type="date"
                  value={filters.from_date}
                  onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">To date</span>
                <input
                  type="date"
                  value={filters.to_date}
                  onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700"
                />
              </label>
              <label className="text-sm xl:col-span-2">
                <span className="mb-1.5 block font-medium">Resell vendor</span>
                <select
                  value={filters.resell_vendor_id}
                  onChange={(e) => setFilters({ ...filters, resell_vendor_id: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700"
                >
                  <option value="">All resell vendors</option>
                  {vendors.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.vendor?.name}{row.is_active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm xl:col-span-2">
                <span className="mb-1.5 block font-medium">Product search</span>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    placeholder="Name, SKU or brand"
                    className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-10 pr-3 dark:border-gray-700"
                  />
                </div>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={filters.include_inactive}
                  onChange={(e) => setFilters({ ...filters, include_inactive: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Include inactive resell tags for historical reporting
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium dark:border-gray-700"
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </form>

          <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {cards.map(([label, value, Icon]: any) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <Icon className="mb-3 h-5 w-5 text-violet-600" />
                <div className="text-xl font-bold">{value}</div>
                <div className="mt-1 text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setTab('vendors')}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === 'vendors' ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-gray-500'}`}
            >
              <Users className="h-4 w-4" /> Vendor Summary
            </button>
            <button
              onClick={() => setTab('products')}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === 'products' ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-gray-500'}`}
            >
              <ShoppingBag className="h-4 w-4" /> Product Details
            </button>
          </div>

          {loading ? (
            <div className="flex h-72 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : tab === 'vendors' ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3">Vendor</th>
                      <th className="px-4 py-3 text-right">Products</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Sold</th>
                      <th className="px-4 py-3 text-right">Returned</th>
                      <th className="px-4 py-3 text-right">Net Sold</th>
                      <th className="px-4 py-3 text-right">Left</th>
                      <th className="px-4 py-3 text-right">Inventory Cost</th>
                      <th className="px-4 py-3 text-right">Net Sales</th>
                      <th className="px-4 py-3 text-right">Vendor Earned</th>
                      <th className="px-4 py-3 text-right">Profit</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Refunded</th>
                      <th className="px-4 py-3 text-right">Due</th>
                      <th className="px-4 py-3 text-right">Refund Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {vendorRows.map((row) => (
                      <tr key={row.resell_vendor_id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                        <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.vendor_name}</td>
                        <td className="px-4 py-4 text-right">{number(row.product_count)}</td>
                        <td className="px-4 py-4 text-right">{number(row.received_quantity)}</td>
                        <td className="px-4 py-4 text-right">{number(row.gross_units_sold)}</td>
                        <td className="px-4 py-4 text-right text-red-600">{number(row.returned_quantity)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{number(row.net_units_sold)}</td>
                        <td className="px-4 py-4 text-right">{number(row.stock_on_hand)}</td>
                        <td className="px-4 py-4 text-right">{money(row.stock_cost_value)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{money(row.net_sales)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{money(row.vendor_earned)}</td>
                        <td className={`px-4 py-4 text-right font-semibold ${row.gross_profit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(row.gross_profit)}</td>
                        <td className="px-4 py-4 text-right text-emerald-600">{money(row.paid_amount)}</td>
                        <td className="px-4 py-4 text-right text-blue-600">{money(row.refunded_amount)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-amber-600">{money(row.vendor_due)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-blue-600">{money(row.refund_due)}</td>
                      </tr>
                    ))}
                    {vendorRows.length === 0 && (
                      <tr><td colSpan={15} className="px-5 py-16 text-center text-gray-500">No report data matches these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Vendor</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Gross Sold</th>
                      <th className="px-4 py-3 text-right">Returned</th>
                      <th className="px-4 py-3 text-right">Net Sold</th>
                      <th className="px-4 py-3 text-right">Left</th>
                      <th className="px-4 py-3 text-right">Inventory Cost</th>
                      <th className="px-4 py-3 text-right">Net Sales</th>
                      <th className="px-4 py-3 text-right">Vendor Earned</th>
                      <th className="px-4 py-3 text-right">Profit</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                      <th className="px-4 py-3 text-right">Sell-through</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {productRows.map((row: ResellReportProduct) => (
                      <tr key={row.resell_product_id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                        <td className="min-w-64 px-4 py-4">
                          <div className="font-semibold">{row.product_name}</div>
                          <div className="mt-1 text-xs text-gray-500">SKU {row.sku || '—'}{row.brand ? ` · ${row.brand}` : ''}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">{row.vendor_name}</td>
                        <td className="px-4 py-4 text-right">{number(row.received_quantity)}</td>
                        <td className="px-4 py-4 text-right">{number(row.gross_units_sold)}</td>
                        <td className="px-4 py-4 text-right text-red-600">{number(row.returned_quantity)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{number(row.net_units_sold)}</td>
                        <td className="px-4 py-4 text-right">{number(row.stock_on_hand)}</td>
                        <td className="px-4 py-4 text-right">{money(row.stock_cost_value)}</td>
                        <td className="px-4 py-4 text-right font-semibold">{money(row.net_sales)}</td>
                        <td className="px-4 py-4 text-right">{money(row.net_cogs)}</td>
                        <td className={`px-4 py-4 text-right font-semibold ${row.gross_profit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(row.gross_profit)}</td>
                        <td className="px-4 py-4 text-right">{number(row.margin_percent)}%</td>
                        <td className="px-4 py-4 text-right">{number(row.sell_through_percent)}%</td>
                      </tr>
                    ))}
                    {productRows.length === 0 && (
                      <tr><td colSpan={13} className="px-5 py-16 text-center text-gray-500">No report data matches these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report?.rules && (
            <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/40">
              <div className="mb-3 flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
                <Info className="h-5 w-5" /> How this report stays accurate
              </div>
              <div className="grid gap-3 text-sm text-blue-900/80 md:grid-cols-2 xl:grid-cols-5 dark:text-blue-100/80">
                {Object.entries(report.rules).map(([key, description]) => (
                  <div key={key} className="rounded-xl bg-white/70 p-3 dark:bg-gray-900/40">
                    <div className="mb-1 font-semibold capitalize">{key.replaceAll('_', ' ')}</div>
                    <div>{description}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
