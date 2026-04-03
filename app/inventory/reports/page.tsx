'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import businessAnalyticsService, { type CommandCenterResponse, type NamedValue, type ReportingFilters, type TopProductRow } from '@/services/businessAnalyticsService';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CalendarDays,
  DollarSign,
  Download,
  Gauge,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function percent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function MiniBars({ data, money = false }: { data: NamedValue[]; money?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = Math.max((item.value / max) * 100, item.value > 0 ? 8 : 0);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
              <span className="truncate pr-4">{item.label}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{money ? currency(item.value) : item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ points }: { points: CommandCenterResponse['data']['sales_trend'] }) {
  const values = points.map((p) => p.net_sales);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const width = 900;
  const height = 240;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const scaleY = (value: number) => {
    const range = max - min || 1;
    return height - ((value - min) / range) * (height - 24) - 12;
  };
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${scaleY(p.net_sales)}`)
    .join(' ');
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sales Trend</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Net sales movement across the selected period</p>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
          <div>Peak: {currency(max)}</div>
          <div>Lowest: {currency(min)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-60 min-w-[700px] w-full">
          <defs>
            <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((g) => {
            const y = 16 + (g * (height - 32)) / 3;
            return <line key={g} x1="0" y1={y} x2={width} y2={y} stroke="rgba(148,163,184,.22)" strokeDasharray="4 4" />;
          })}
          <path d={area} fill="url(#salesArea)" />
          <path d={path} fill="none" stroke="rgb(79 70 229)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={`${p.date}-${i}`}>
              <circle cx={i * stepX} cy={scaleY(p.net_sales)} r="4" fill="rgb(99 102 241)" />
              {i < points.length - 1 && (
                <text x={i * stepX + 2} y={height - 6} fontSize="11" fill="rgb(107 114 128)">
                  {p.date.slice(5)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function DonutLike({ title, data }: { title: string; data: NamedValue[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const tones = ['#6366F1', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
        <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(148,163,184,.18)" strokeWidth="16" />
          {data.map((item, i) => {
            const fraction = item.value / total;
            const dash = fraction * circumference;
            const currentOffset = offset;
            offset += dash;
            return (
              <circle
                key={item.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={tones[i % tones.length]}
                strokeWidth="16"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 80 80)"
                strokeLinecap="butt"
              />
            );
          })}
          <text x="80" y="76" textAnchor="middle" className="fill-gray-500 text-[12px]">Total</text>
          <text x="80" y="96" textAnchor="middle" className="fill-gray-900 dark:fill-white text-[18px] font-semibold">{total}</text>
        </svg>
        <div className="w-full space-y-3">
          {data.map((item, i) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: tones[i % tones.length] }} />
                <span className="truncate text-gray-600 dark:text-gray-300">{item.label}</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopProductsTable({ rows }: { rows: TopProductRow[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Best Sellers</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Top products by sold units and revenue</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="py-3 pr-3">Product</th>
              <th className="py-3 pr-3">SKU</th>
              <th className="py-3 pr-3 text-right">Units</th>
              <th className="py-3 pr-3 text-right">Revenue</th>
              <th className="py-3 pr-3 text-right">Profit</th>
              <th className="py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.product_id} className="border-b border-gray-100 dark:border-gray-800/70">
                <td className="py-3 pr-3 font-medium text-gray-900 dark:text-white">{row.name}</td>
                <td className="py-3 pr-3 text-gray-500 dark:text-gray-400">{row.sku || '-'}</td>
                <td className="py-3 pr-3 text-right text-gray-900 dark:text-white">{row.units}</td>
                <td className="py-3 pr-3 text-right text-gray-900 dark:text-white">{currency(row.revenue)}</td>
                <td className="py-3 pr-3 text-right text-emerald-600 dark:text-emerald-400">{currency(row.gross_profit)}</td>
                <td className="py-3 text-right text-gray-900 dark:text-white">{row.stock_on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventoryReportsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CommandCenterResponse['data'] | null>(null);
  const [filters, setFilters] = useState<ReportingFilters>({ from: todayStr(-29), to: todayStr() });
  const [liveRows, setLiveRows] = useState<TopProductRow[]>([]);

  const loadData = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError('');
      const res = await businessAnalyticsService.getCommandCenter(filters);
      setData(res.data);
      const live = await businessAnalyticsService.getLiveBestSellers(filters);
      setLiveRows(live?.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load command center');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data) return;
    const timer = setInterval(async () => {
      try {
        const live = await businessAnalyticsService.getLiveBestSellers(filters);
        setLiveRows(live?.data || []);
      } catch {
        // ignore silent polling errors
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [data, filters]);

  const headlineCards = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      { label: 'Net Sales', value: currency(k.net_sales), icon: DollarSign, accent: 'from-emerald-500 to-teal-400', sub: `${k.total_orders} orders` },
      { label: 'Gross Profit', value: currency(k.gross_profit), icon: TrendingUp, accent: 'from-indigo-500 to-cyan-400', sub: `Margin ${percent(k.margin_pct)}` },
      { label: 'Inventory Value', value: currency(k.inventory_value), icon: Boxes, accent: 'from-amber-500 to-orange-400', sub: `${k.low_stock_count} low stock` },
      { label: 'Repeat Customers', value: String(k.repeat_customers), icon: Users, accent: 'from-fuchsia-500 to-pink-400', sub: `${percent(k.repeat_customer_rate)} repeat rate` },
    ];
  }, [data]);

  const exportCsv = async () => {
    const response = await businessAnalyticsService.exportSummary(filters);
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `command-center-${filters.from || 'from'}-${filters.to || 'to'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <Header toggleSidebar={() => setSidebarOpen(true)} darkMode={darkMode} setDarkMode={setDarkMode} />
      <main className="lg:ml-64">
        <div className="p-4 md:p-6 xl:p-8">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                <Gauge className="h-3.5 w-3.5" /> Business Command Center
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Executive Reporting Module</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                A single visual control room for sales, profitability, customer repeat behavior, branch performance, inventory pressure and live best sellers.
              </p>
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:flex-row md:items-end">
              <label className="text-sm text-gray-600 dark:text-gray-300">
                <span className="mb-1 block">From</span>
                <input type="date" value={filters.from || ''} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} className="rounded-xl border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
              </label>
              <label className="text-sm text-gray-600 dark:text-gray-300">
                <span className="mb-1 block">To</span>
                <input type="date" value={filters.to || ''} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} className="rounded-xl border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
              </label>
              <button onClick={() => loadData()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {headlineCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <div className={`h-1 w-full bg-gradient-to-r ${card.accent}`} />
                      <div className="p-5">
                        <div className="mb-4 flex items-start justify-between">
                          <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                            <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{card.value}</h3>
                          </div>
                          <div className={`rounded-2xl bg-gradient-to-br p-3 text-white ${card.accent}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{card.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: 'Gross Sales', value: currency(data.kpis.gross_sales), icon: ShoppingBag },
                  { label: 'Discount', value: currency(data.kpis.total_discount), icon: Activity },
                  { label: 'AOV', value: currency(data.kpis.avg_order_value), icon: DollarSign },
                  { label: 'Returns', value: String(data.kpis.return_count), icon: AlertTriangle },
                  { label: 'Refund Amount', value: currency(data.kpis.refund_amount), icon: CalendarDays },
                  { label: 'Out of Stock', value: String(data.kpis.out_of_stock_count), icon: Package },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</span>
                        <Icon className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="text-xl font-bold text-gray-900 dark:text-white">{item.value}</div>
                    </div>
                  );
                })}
              </div>

              <TrendChart points={data.sales_trend} />

              <div className="grid gap-6 xl:grid-cols-3">
                <DonutLike title="Order Status Mix" data={data.status_mix} />
                <DonutLike title="Order Channel Mix" data={data.order_type_mix} />
                <DonutLike title="Payment Status Mix" data={data.payment_status_mix} />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Category Momentum</h3>
                  <MiniBars data={data.category_performance} money />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Payment Method Mix</h3>
                  <MiniBars data={data.payment_method_mix} money />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <TopProductsTable rows={data.top_products} />
                </div>
                <div className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Live Best Seller Tracker</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Auto-refresh every 20 seconds</p>
                      </div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live
                      </span>
                    </div>
                    <div className="space-y-3">
                      {liveRows.map((row, idx) => (
                        <div key={`${row.product_id}-${idx}`} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-900 dark:text-white">{row.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{row.sku || 'No SKU'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-gray-900 dark:text-white">{row.units}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">units</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Executive Insights</h3>
                    <div className="space-y-3">
                      {data.insights.map((insight, i) => (
                        <div key={i} className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">{insight}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Stock Watchlist</h3>
                  <div className="space-y-3">
                    {data.stock_watchlist.map((row) => (
                      <div key={row.product_id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900 dark:text-white">{row.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{row.sku || 'No SKU'}</div>
                          </div>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">short by {row.shortage}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <div>Available <div className="mt-1 font-semibold text-gray-900 dark:text-white">{row.available_quantity}</div></div>
                          <div>Reorder <div className="mt-1 font-semibold text-gray-900 dark:text-white">{row.reorder_level}</div></div>
                          <div>30d Revenue <div className="mt-1 font-semibold text-gray-900 dark:text-white">{currency(row.revenue_30d)}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Branch Performance</h3>
                  <MiniBars data={data.branch_performance.map((store) => ({ label: store.store_name, value: store.net_sales }))} money />
                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          <th className="py-3 pr-3">Store</th>
                          <th className="py-3 pr-3 text-right">Orders</th>
                          <th className="py-3 pr-3 text-right">Sales</th>
                          <th className="py-3 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.branch_performance.map((store) => (
                          <tr key={store.store_id} className="border-b border-gray-100 dark:border-gray-800/70">
                            <td className="py-3 pr-3 font-medium text-gray-900 dark:text-white">{store.store_name}</td>
                            <td className="py-3 pr-3 text-right">{store.orders}</td>
                            <td className="py-3 pr-3 text-right">{currency(store.net_sales)}</td>
                            <td className="py-3 text-right">{percent(store.margin_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Hourly Order Pulse</h3>
                <MiniBars data={data.today_hourly_orders} />
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
