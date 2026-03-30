"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Store,
  Globe2,
  Bell,
  Clock,
  Package,
  Truck,
  CheckCircle2,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import axios from "axios";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

// ✅ Axios instance (same as you had, but safer extract below)
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

type AnyObj = Record<string, any>;

interface DashboardData {
  todayMetrics: AnyObj | null;
  last30Days: AnyObj | null;
  salesByChannel: AnyObj | null;
  topStores: AnyObj | null;
  topProducts: AnyObj | null;
  slowMoving: AnyObj | null;
  lowStock: AnyObj | null;
  inventoryAge: AnyObj | null;
  operations: AnyObj | null;
}

export default function FounderDashboard() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData] = useState<DashboardData>({
    todayMetrics: null,
    last30Days: null,
    salesByChannel: null,
    topStores: null,
    topProducts: null,
    slowMoving: null,
    lowStock: null,
    inventoryAge: null,
    operations: null,
  });

  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month">("today");
  const [branchFilter, setBranchFilter] = useState("all"); // reserved for store_id filter later


  // ✅ Normalizer: supports both shapes
  // A) { success:true, data:{...} }
  // B) { success:true, top_stores:[...], ... }  (flat)
  const extractPayload = (raw: any) => {
    const payload = raw?.data; // axios response => raw.data is server payload
    if (!payload) return null;
    if (payload?.success === false) return null;
    return payload?.data ?? payload;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const fetchEndpoint = async (endpoint: string, params?: any) => {
        try {
          const res = await axiosInstance.get(endpoint, { params });
          const extracted = extractPayload(res);
          if (!extracted) {
            console.warn(`Empty/invalid payload for ${endpoint}`, res.data);
            return null;
          }
          return extracted;
        } catch (err: any) {
          console.error(
            `Error fetching ${endpoint}:`,
            err?.response?.data || err?.message || err
          );
          return null;
        }
      };

      // optional store filter
      const storeParams = branchFilter !== "all" ? { store_id: branchFilter } : {};

      const [
        todayMetrics,
        last30Days,
        salesByChannel,
        topStores,
        topProducts,
        slowMoving,
        lowStock,
        inventoryAge,
        operations,
      ] = await Promise.all([
        fetchEndpoint("/dashboard/today-metrics", storeParams),
        fetchEndpoint("/dashboard/last-30-days-sales", storeParams),
        fetchEndpoint("/dashboard/sales-by-channel", { ...storeParams, period: timeFilter }),
        fetchEndpoint("/dashboard/top-stores", { ...storeParams, period: timeFilter, limit: 10 }),
        fetchEndpoint("/dashboard/today-top-products", { ...storeParams, limit: 5 }),
        fetchEndpoint("/dashboard/slow-moving-products", { ...storeParams, limit: 10, days: 90 }),
        fetchEndpoint("/dashboard/low-stock-products", { ...storeParams, threshold: 10 }),
        fetchEndpoint("/dashboard/inventory-age-by-value", storeParams),
        fetchEndpoint("/dashboard/operations-today", storeParams),
      ]);

      setData({
        todayMetrics,
        last30Days,
        salesByChannel,
        topStores,
        topProducts,
        slowMoving,
        lowStock,
        inventoryAge,
        operations,
      });

      // If the most important blocks fail, show top error banner
      if (!todayMetrics && !last30Days && !salesByChannel) {
        setError("Failed to load critical dashboard data. Please check your connection.");
      }
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      setError(err?.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, branchFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatCurrency = (amount: number) => {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return "৳ 0";
    return `৳ ${Number(amount).toLocaleString("en-BD")}`;
  };

  const formatPercentage = (value: number) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "0%";
    return `${Number(value).toFixed(1)}%`;
  };

  // ---------------------------
  // ✅ Normalize sections safely
  // ---------------------------
  const metrics = data.todayMetrics ?? null;

  // last30Days is usually { total_sales, total_orders, daily_sales:[...] }
  const sales30Days = data.last30Days ?? null;

  // channels: usually { total_orders, channels:[{channel_label,total_sales,percentage}] }
  const channels = data.salesByChannel ?? null;

  // topStores: might be { top_stores:[...], total_sales_all_stores, period }
  const topStores = data.topStores ?? null;

  // topProducts: might be { top_products:[...] }
  const topProducts = data.topProducts ?? null;

  // slowMoving: might be { slow_moving_products:[...] }
  const slowMoving = data.slowMoving ?? null;

  // lowStock: might be { summary:{...}, out_of_stock:[...], low_stock:[...] }
  const lowStock = data.lowStock ?? null;

  // inventoryAge: { age_categories:[{label, inventory_value, percentage_of_total}] }
  const inventoryAge = data.inventoryAge ?? null;

  // operations: often { operations_status:{ pending:{label,count}, ... }, summary:{...} }
  const operations = data.operations ?? null;

  // derive a stable list of pipeline stages from operations object
  const pipelineStages = useMemo(() => {
    const ops = operations?.operations_status || operations?.status_breakdown || operations?.pipeline || null;
    if (!ops) return [];

    // common keys order
    const keys = ["pending", "processing", "ready_for_pickup", "shipped", "delivered", "cancelled"];
    const list: Array<{ key: string; label: string; count: number }> = [];

    keys.forEach((k) => {
      if (ops[k]) {
        list.push({
          key: k,
          label: ops[k]?.label || k.replace(/_/g, " "),
          count: Number(ops[k]?.count ?? 0),
        });
      }
    });

    // if backend uses different keys, fallback to all entries
    if (!list.length) {
      Object.entries(ops).forEach(([k, v]: any) => {
        list.push({
          key: k,
          label: v?.label || k.replace(/_/g, " "),
          count: Number(v?.count ?? 0),
        });
      });
    }

    return list;
  }, [operations]);

  // Access Check
  const canAccess = role === 'super-admin' || role === 'admin';

  // Loading state
  if ((loading || authLoading) && !data.todayMetrics) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-xl mb-2 text-gray-900 dark:text-white">Loading Dashboard...</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Connecting to backend...</p>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  // Restriction UI
  if (!canAccess && !authLoading) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div className="text-center max-w-md p-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 shadow-xl backdrop-blur">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <p className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Access Restricted</p>
                <p className="text-gray-600 dark:text-gray-400">
                  You do not have access to this page. Please go to a page you have access to.
                </p>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  // Error state (only if no data at all)
  if (error && !data.todayMetrics && !data.last30Days) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div className="text-center max-w-md">
                <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <p className="text-xl mb-4 text-gray-900 dark:text-white">Error Loading Dashboard</p>
                <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
                <button
                  onClick={fetchDashboardData}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Try Again
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  // KPI derived fields
  const todaySales = Number(metrics?.total_sales ?? 0);
  const todayOrders = Number(metrics?.order_count ?? 0);
  const aov = Number(metrics?.average_order_value ?? 0);

  const grossMarginPct = Number(metrics?.gross_margin_percentage ?? 0);
  const grossMargin = Number(metrics?.gross_margin ?? 0);

  const netProfit = Number(metrics?.net_profit ?? 0);
  const netProfitPct = Number(metrics?.net_profit_percentage ?? 0);

  // MTD best-effort: prefer backend mtd_sales if exists, else last30Days total (fallback)
  const mtdSales = Number(metrics?.mtd_sales ?? sales30Days?.month_to_date_sales ?? sales30Days?.total_sales ?? 0);
  const mtdTarget = metrics?.mtd_target ? Number(metrics.mtd_target) : null;
  const mtdProgressPct = mtdTarget ? (mtdSales / Math.max(mtdTarget, 1)) * 100 : null;

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-auto">
            <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-purple-900 dark:to-slate-900">
              {/* Background glow - only visible in dark mode */}
              <div className="pointer-events-none fixed inset-0 -z-10 dark:block hidden">
                <div className="absolute -top-32 right-10 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
                <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
              </div>

              <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-6">
                {/* Warning banner for partial data */}
                {error && (data.todayMetrics || data.last30Days) && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <div className="flex-1">
                      <div className="font-semibold text-amber-400">Partial Data Load</div>
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        Some sections failed to load. Check console for details.
                      </div>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition text-sm disabled:opacity-50"
                    >
                      {refreshing ? "Refreshing..." : "Retry"}
                    </button>
                  </div>
                )}

                {/* HEADER */}
                <header className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <h1 className="text-xl font-semibold tracking-tight">Founder Dashboard</h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Live snapshot of sales, inventory, and operations across all channels.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Filters */}
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Time</span>
                        <button
                          onClick={() => setTimeFilter("today")}
                          className={`rounded-full px-3 py-1 text-xs transition ${timeFilter === "today"
                              ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100 shadow-inner"
                              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                        >
                          Today
                        </button>
                        <button
                          onClick={() => setTimeFilter("month")}
                          className={`rounded-full px-3 py-1 text-xs transition ${timeFilter === "month"
                              ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100 shadow-inner"
                              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                        >
                          This Month
                        </button>
                      </div>
                    </div>

                    <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 md:flex">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span>Live • Updated just now</span>
                    </div>

                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
                    >
                      <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
                    </button>

                    <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/70">
                      <Bell className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                      {Number(lowStock?.summary?.out_of_stock_count ?? 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-fuchsia-500 text-[9px] font-semibold text-white">
                          {lowStock?.summary?.out_of_stock_count ?? 0}
                        </span>
                      )}
                    </button>
                  </div>
                </header>

                {/* ✅ KPI ROW (cash snapshot removed) */}
                {metrics && (
                  <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                    <KpiCard
                      label="Today's Sales"
                      value={formatCurrency(todaySales)}
                      delta={`${todayOrders} orders • AOV: ${formatCurrency(aov)}`}
                      positive
                    />

                    <KpiCard
                      label="MTD Sales"
                      value={formatCurrency(mtdSales)}
                      delta={
                        mtdTarget
                          ? `${formatPercentage(mtdProgressPct || 0)} of target • Target: ${formatCurrency(mtdTarget)}`
                          : "Target not set"
                      }
                      positive
                    />

                    <KpiCard
                      label="Gross Margin (MTD)"
                      value={formatPercentage(grossMarginPct)}
                      delta={`GM: ${formatCurrency(grossMargin)}`}
                      positive={grossMarginPct >= 35}
                    />

                    <KpiCard
                      label="Est. Net Profit (MTD)"
                      value={formatCurrency(netProfit)}
                      delta={`Net margin: ${formatPercentage(netProfitPct)}`}
                      positive={netProfit >= 0}
                    />

                    <KpiCard
                      label="Orders Today"
                      value={String(todayOrders)}
                      delta={`Avg order: ${formatCurrency(aov)}`}
                      positive
                    />
                  </section>
                )}

                {/* MIDDLE GRID */}
                <section className="grid flex-1 gap-4 lg:grid-cols-[1.3fr,1.4fr]">
                  {/* LEFT COLUMN */}
                  <div className="flex flex-col gap-4">
                    {/* Daily sales chart */}
                    {sales30Days && Array.isArray(sales30Days.daily_sales) && (
                      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 shadow-sm dark:shadow-[0_0_40px_rgba(15,23,42,0.8)] backdrop-blur">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Daily Sales • Last 30 Days
                            </h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Total: {formatCurrency(Number(sales30Days.total_sales ?? 0))} •{" "}
                              {Number(sales30Days.total_orders ?? 0)} orders
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 h-40 rounded-2xl bg-gradient-to-b from-sky-500/10 via-slate-100 to-white dark:from-sky-500/15 dark:via-slate-900/40 dark:to-slate-950/80 p-3">
                          <div className="flex h-full items-end gap-1">
                            {(() => {
                              const allSales = sales30Days.daily_sales.map((d: any) => Number(d.total_sales ?? 0));
                              const maxSales = Math.max(...allSales, 1);
                              return sales30Days.daily_sales.map((day: any, i: number) => {
                                const height = (Number(day.total_sales ?? 0) / maxSales) * 100;
                                return (
                                  <div
                                    key={i}
                                    className="flex-1 rounded-t-full bg-gradient-to-t from-sky-400/40 via-sky-400/70 to-fuchsia-400/80 hover:opacity-100 transition cursor-pointer"
                                    style={{ height: `${Math.max(height, 8)}%` }}
                                    title={`${day.date}: ${formatCurrency(Number(day.total_sales ?? 0))}`}
                                  />
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sales by channel + Store performance */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {channels && (
                        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Sales by Channel • {timeFilter === "today" ? "Today" : "This Month"}
                          </h2>

                          <div className="flex items-center gap-3">
                            <div className="relative h-24 w-24">
                              <div className="absolute inset-0 rounded-full bg-[conic-gradient(at_top,_#0ea5e9_0,_#e879f9_70%,_#22c55e_100%)]" />
                              <div className="absolute inset-3 rounded-full bg-white dark:bg-slate-950" />
                              <div className="absolute inset-6 flex flex-col items-center justify-center text-[10px] text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-900 dark:text-slate-50">
                                  {Number(channels.total_orders ?? 0)}
                                </span>
                                <span>orders</span>
                              </div>
                            </div>

                            <div className="flex-1 space-y-2 text-[11px]">
                              {(channels.channels || []).map((channel: any, index: number) => {
                                const icons = [
                                  <Store key="store" className="h-3.5 w-3.5" />,
                                  <Globe2 key="globe" className="h-3.5 w-3.5" />,
                                  <ShoppingBag key="bag" className="h-3.5 w-3.5" />,
                                ];
                                return (
                                  <ChannelRow
                                    key={channel.channel || index}
                                    icon={icons[index] || <Store className="h-3.5 w-3.5" />}
                                    label={channel.channel_label || channel.channel || "Channel"}
                                    value={formatCurrency(Number(channel.total_sales ?? 0))}
                                    percent={formatPercentage(Number(channel.percentage ?? 0))}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Store performance */}
                      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Store Performance
                        </h2>

                        {Array.isArray(topStores?.top_stores) && topStores.top_stores.length > 0 ? (
                          <div className="space-y-2 text-[11px]">
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Top stores by sales • {timeFilter === "today" ? "Today" : "This Month"}
                            </p>

                            {topStores.top_stores.slice(0, 4).map((store: any) => (
                              <StoreCard
                                key={store.store_id}
                                rank={store.rank}
                                name={store.store_name}
                                location={store.store_location}
                                type={store.store_type}
                                sales={formatCurrency(Number(store.total_sales ?? 0))}
                                contribution={formatPercentage(Number(store.contribution_percentage ?? 0))}
                                orders={Number(store.order_count ?? 0)}
                              />
                            ))}

                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              Total period sales: {formatCurrency(Number(topStores.total_sales_all_stores ?? 0))}
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Store-wise analytics will appear once store sales data is available.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="flex flex-col gap-4">
                    {/* Top products */}
                    {Array.isArray(topProducts?.top_products) && (
                      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                        <div className="mb-3">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Top Products • Today
                          </h2>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            By revenue across all branches & channels.
                          </p>
                        </div>

                        <div className="grid gap-3 text-[11px] md:grid-cols-2 xl:grid-cols-3">
                          {topProducts.top_products.slice(0, 5).map((product: any) => (
                            <TopProductCard
                              key={product.product_id}
                              name={product.product_name}
                              category={product.product_sku}
                              sales={formatCurrency(Number(product.total_revenue ?? 0))}
                              qty={Number(product.total_quantity_sold ?? 0)}
                              branches={Number(product.order_count ?? 0)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Slow moving + inventory */}
                    <div className="grid gap-4 md:grid-cols-[1.4fr,1fr]">
                      {/* Slow moving */}
                      {Array.isArray(slowMoving?.slow_moving_products) && (
                        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Slow-Moving / Overstock
                          </h2>

                          <div className="space-y-2 text-[11px]">
                            {slowMoving.slow_moving_products.slice(0, 3).map((item: any) => (
                              <div
                                key={item.product_id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/70"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate text-slate-900 dark:text-slate-100">
                                    {item.product_name}
                                  </span>
                                  <span className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
                                    {formatCurrency(Number(item.stock_value ?? 0))}
                                  </span>
                                </div>

                                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                  <span>{Number(item.current_stock ?? 0)} pcs in stock</span>
                                  <span>{Number(item.days_of_supply ?? 0)} days supply</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inventory risk */}
                      <div className="flex flex-col gap-4">
                        {/* Low stock */}
                        {lowStock && (
                          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Low Stock / OOS
                            </h2>

                            <div className="space-y-2 text-[11px]">
                              {(lowStock.out_of_stock || []).slice(0, 2).map((item: any) => (
                                <div
                                  key={`${item.product_id}-${item.store_id}-out`}
                                  className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/70"
                                >
                                  <div className="flex-1">
                                    <div className="truncate text-slate-900 dark:text-slate-100">{item.product_name}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.store_name}</div>
                                  </div>
                                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                                    Out of stock
                                  </span>
                                </div>
                              ))}

                              {(lowStock.low_stock || []).slice(0, 1).map((item: any) => (
                                <div
                                  key={`${item.product_id}-${item.store_id}-low`}
                                  className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/70"
                                >
                                  <div className="flex-1">
                                    <div className="truncate text-slate-900 dark:text-slate-100">{item.product_name}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.store_name}</div>
                                  </div>
                                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                    Low stock
                                  </span>
                                </div>
                              ))}

                              {Number(lowStock?.summary?.out_of_stock_count ?? 0) === 0 &&
                                Number(lowStock?.summary?.low_stock_count ?? 0) === 0 && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    No stock alerts right now.
                                  </div>
                                )}
                            </div>
                          </div>
                        )}

                        {/* Inventory age */}
                        {Array.isArray(inventoryAge?.age_categories) && (
                          <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                            <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              Inventory Age (by value)
                            </h2>

                            <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                              <div className="flex h-full w-full">
                                {inventoryAge.age_categories.map((cat: any, i: number) => {
                                  const colors = [
                                    "bg-emerald-400/80",
                                    "bg-sky-400/80",
                                    "bg-amber-400/90",
                                    "bg-rose-500/90",
                                  ];
                                  return (
                                    <div
                                      key={i}
                                      className={`h-full ${colors[i] || "bg-slate-400/80"}`}
                                      style={{ width: `${Number(cat.percentage_of_total ?? 0)}%` }}
                                      title={`${cat.label}: ${formatCurrency(Number(cat.inventory_value ?? 0))}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              {inventoryAge.age_categories.map((cat: any, i: number) => {
                                const tones = ["fresh", "good", "watch", "danger"];
                                return (
                                  <AgeTile
                                    key={i}
                                    label={cat.label}
                                    value={formatCurrency(Number(cat.inventory_value ?? 0))}
                                    tone={tones[i] || "good"}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ✅ BOTTOM – OPERATIONS & ALERTS */}
                <section className="grid gap-4 lg:grid-cols-2">
                  {/* Operations */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Operations • Today
                      </h2>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        From order placed to delivered
                      </span>
                    </div>

                    {pipelineStages.length ? (
                      <div className="mb-1 grid gap-2 text-[11px] md:grid-cols-5">
                        {pipelineStages.slice(0, 5).map((stage) => {
                          const icons: Record<string, any> = {
                            pending: <Clock className="h-3 w-3" />,
                            processing: <Package className="h-3 w-3" />,
                            ready_for_pickup: <Truck className="h-3 w-3" />,
                            shipped: <Truck className="h-3 w-3" />,
                            delivered: <CheckCircle2 className="h-3 w-3" />,
                            cancelled: <RotateCcw className="h-3 w-3" />,
                          };

                          return (
                            <PipelineStage
                              key={stage.key}
                              label={stage.label}
                              count={stage.count}
                              value={`—`}
                              icon={icons[stage.key] || <Clock className="h-3 w-3" />}
                              highlight={stage.key === "delivered"}
                              warning={stage.key === "cancelled"}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        No operations data available for today.
                      </div>
                    )}

                    {operations?.summary ? (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                        <MiniStat label="Total orders" value={String(Number(operations.summary.total_orders ?? 0))} />
                        <MiniStat label="Delivered" value={String(Number(operations.summary.delivered_orders ?? 0))} />
                        <MiniStat label="Cancelled" value={String(Number(operations.summary.cancelled_orders ?? 0))} />
                        <MiniStat label="Pending" value={String(Number(operations.summary.pending_orders ?? 0))} />
                      </div>
                    ) : null}
                  </div>

                  {/* Alerts */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60 p-4 backdrop-blur">
                    <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Alerts & Exceptions
                    </h2>

                    <div className="space-y-2 text-[11px]">
                      {lowStock?.summary ? (
                        <>
                          {Number(lowStock.summary.out_of_stock_count ?? 0) > 0 && (
                            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 dark:border-rose-500/50 dark:bg-rose-500/10">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] bg-rose-500/10 text-rose-700 px-2 py-0.5 rounded-full dark:bg-rose-500/20 dark:text-rose-200">
                                  Critical
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-200">
                                  Recent
                                </span>
                              </div>
                              <div className="text-slate-900 dark:text-slate-50">Stock-out Alert</div>
                              <div className="text-[10px] text-slate-600 dark:text-slate-200">
                                {lowStock.summary.out_of_stock_count} products out of stock across branches
                              </div>
                            </div>
                          )}

                          {Number(lowStock.summary.low_stock_count ?? 0) > 0 && (
                            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/8">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] bg-amber-500/10 text-amber-700 px-2 py-0.5 rounded-full dark:bg-amber-500/15 dark:text-amber-200">
                                  Warning
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-200">
                                  Recent
                                </span>
                              </div>
                              <div className="text-slate-900 dark:text-slate-50">Low Stock Warning</div>
                              <div className="text-[10px] text-slate-600 dark:text-slate-200">
                                {lowStock.summary.low_stock_count} products running low on inventory
                              </div>
                            </div>
                          )}

                          {Number(lowStock.summary.out_of_stock_count ?? 0) === 0 &&
                            Number(lowStock.summary.low_stock_count ?? 0) === 0 && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                No alerts right now.
                              </div>
                            )}
                        </>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Alerts will appear once the backend provides stock summary.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/* Subcomponents */

function KpiCard({ label, value, delta, positive, neutral }: any) {
  const tone = neutral
    ? "text-slate-500 dark:text-slate-300"
    : positive
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  const Icon = neutral ? ShoppingBag : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-[0_0_25px_rgba(15,23,42,0.9)] backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</div>
      <div className={`mt-1 text-[10px] ${tone}`}>{delta}</div>
    </div>
  );
}

function MiniStat({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/70">
      <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  );
}

function TopProductCard({ name, category, sales, qty, branches }: any) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-gray-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/80 p-3 shadow-sm dark:shadow-[0_0_18px_rgba(15,23,42,0.9)]">
      <div className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="truncate text-[12px] font-semibold text-gray-900 dark:text-slate-50">{name}</div>
            <span className="mt-1 inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-900 px-2 py-0.5 text-[10px] text-gray-700 dark:text-slate-300">
              {category}
            </span>
          </div>
          <div className="text-right text-xs font-semibold text-purple-700 dark:text-fuchsia-300">{sales}</div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600 dark:text-slate-300">
        <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-900 px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 dark:bg-emerald-400" />
          <span>{qty} pcs sold</span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-900 px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-sky-400" />
          <span>{branches} orders</span>
        </div>
      </div>
    </div>
  );
}

function ChannelRow({ icon, label, value, percent }: any) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {icon}
        </div>
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
      </div>

      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-slate-600 dark:text-slate-300">{value}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {percent}
        </span>
      </div>
    </div>
  );
}

function StoreCard({ rank, name, location, type, sales, contribution, orders }: any) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/70">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {rank}
        </span>
        <div>
          <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-50">{name}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {location} • {type}
          </div>
        </div>
      </div>

      <div className="text-right text-[10px]">
        <div className="font-semibold text-slate-900 dark:text-slate-50">{sales}</div>
        <div className="text-slate-500 dark:text-slate-400">
          {orders} orders • {contribution} of total
        </div>
      </div>
    </div>
  );
}

function AgeTile({ label, value, tone }: any) {
  const toneStyles: Record<string, string> = {
    fresh:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/40",
    good:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/40",
    watch:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
    danger:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/12 dark:text-rose-200 dark:border-rose-500/50",
  };

  return (
    <div className={`rounded-2xl border px-3 py-2 text-[11px] ${toneStyles[tone] || toneStyles.good}`}>
      <div>{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}

function PipelineStage({ label, count, value, icon, highlight, warning }: any) {
  const base = "rounded-2xl border px-3 py-2 flex flex-col gap-0.5 bg-white dark:bg-slate-950/70";
  const color = highlight
    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10"
    : warning
      ? "border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
      : "border-slate-200 dark:border-slate-800";

  return (
    <div className={`${base} ${color}`}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-slate-700 dark:text-slate-200">{icon}</span>
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{count}</div>
      <div className="text-[10px] text-slate-600 dark:text-slate-200">{value}</div>
    </div>
  );
}