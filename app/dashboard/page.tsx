'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  FileClock,
  Landmark,
  Loader2,
  PackageCheck,
  PackageOpen,
  Percent,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import executiveDashboardService, { DashboardPeriod } from '@/services/executiveDashboardService';

type AnyRecord = Record<string, any>;
type Visibility = Record<string, boolean>;

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const initialCustomDates = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: localDate(first), to: localDate(now) };
};

export default function DashboardPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, isLoading: authLoading, canSelectStore, scopedStoreId } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const initialDates = useMemo(initialCustomDates, []);
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [storeId, setStoreId] = useState<number | 'all'>(scopedStoreId || 'all');
  const [data, setData] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scopedStoreId) setStoreId(scopedStoreId);
  }, [scopedStoreId]);

  const loadDashboard = useCallback(async (fresh = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      if (!data) setLoading(true);
      if (fresh) setRefreshing(true);
      setError(null);

      const overview = await executiveDashboardService.getOverview(
        {
          period,
          date_from: period === 'custom' ? dateFrom : undefined,
          date_to: period === 'custom' ? dateTo : undefined,
          store_id: storeId,
          fresh,
        },
        controller.signal,
      );

      setData(overview);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setError(err?.response?.data?.message || err?.message || 'Unable to load dashboard reports.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [data, dateFrom, dateTo, period, storeId]);

  useEffect(() => {
    if (!authLoading) loadDashboard(false);
    return () => requestRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, period, dateFrom, dateTo, storeId]);

  const canSwitchDashboardStore = canSelectStore && ['super-admin', 'admin'].includes(role || '');

  const meta = data?.meta || {};
  const kpis = data?.kpis || {};
  const visibility: Visibility = meta.visibility || {};
  const sales = data?.sales || {};
  const profitability = data?.profitability || {};
  const liquidity = data?.liquidity || {};
  const inventory = data?.inventory || {};
  const operations = data?.operations || {};
  const receivables = data?.receivables || {};
  const payables = data?.payables || {};
  const purchases = data?.purchases || {};
  const approvals = data?.approvals || {};
  const performance = data?.performance || {};
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const series = Array.isArray(sales.series) ? sales.series : [];

  const periodLabel = useMemo(() => {
    const selected = PERIOD_OPTIONS.find((item) => item.value === period)?.label || 'Selected period';
    if (!meta.date_from || !meta.date_to) return selected;
    return `${selected} · ${formatDate(meta.date_from)} – ${formatDate(meta.date_to)}`;
  }, [meta.date_from, meta.date_to, period]);

  const exportCsv = () => {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ['ERRUM ERP Dashboard Report'],
      ['Period', `${meta.date_from || ''} to ${meta.date_to || ''}`],
      ['Store scope', meta.store_scope === 'all' ? 'All branches' : selectedStoreName(meta.stores, meta.store_id)],
      ['Generated at', meta.generated_at || ''],
      [],
      ['KPI', 'Value', 'Previous', 'Change %'],
      ...Object.entries(kpis).map(([key, item]: [string, any]) => [
        titleCase(key),
        number(item?.value),
        number(item?.previous_value),
        number(item?.change_percentage),
      ]),
      [],
      ['Payment method', 'Gross', 'Commission', 'Net'],
      ...(sales.payment_mix?.methods || []).map((item: any) => [item.name, number(item.gross_amount), number(item.commission_amount), number(item.net_amount)]),
      [],
      ['Top product', 'SKU', 'Quantity', 'Revenue'],
      ...(performance.top_products || []).map((item: any) => [item.product_name, item.sku, number(item.quantity), number(item.revenue)]),
      [],
      ['Top store', 'Orders', 'Sales'],
      ...(performance.top_stores || []).map((item: any) => [item.store_name, number(item.orders), number(item.sales)]),
      [],
      ['Alert', 'Severity', 'Value', 'Message'],
      ...alerts.map((item: any) => [item.title, item.severity, item.value, item.message]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `errum-dashboard-${meta.date_from || 'report'}-${meta.date_to || ''}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (authLoading || (loading && !data)) {
    return <DashboardShell darkMode={darkMode} setDarkMode={setDarkMode} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}><DashboardSkeleton /></DashboardShell>;
  }

  if (error && !data) {
    return <DashboardShell darkMode={darkMode} setDarkMode={setDarkMode} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}><div className="flex min-h-full items-center justify-center p-6"><div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900 dark:bg-slate-950"><AlertCircle className="mx-auto h-11 w-11 text-rose-500" /><h1 className="mt-4 text-xl font-black">Dashboard reports are unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{error}</p><button onClick={() => loadDashboard(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white dark:bg-cyan-400 dark:text-slate-950"><RefreshCw className="h-4 w-4" />Try again</button></div></div></DashboardShell>;
  }

  return (
    <DashboardShell darkMode={darkMode} setDarkMode={setDarkMode} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
      <div className="mx-auto w-full max-w-[1700px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-slate-950 text-white shadow-sm dark:border-slate-800">
          <div className="relative px-5 py-6 sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,.22),transparent_38%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  <span>ERP command centre</span>
                  <span className="h-1 w-1 rounded-full bg-slate-500" />
                  <span>{roleLabel(role)}</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Business performance, risks and actions in one place.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Monitor sales, collections, profit, liquidity, dues, inventory, purchasing and fulfilment without opening separate reports.</p>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:min-w-[500px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Report window</div>
                  <div className="mt-1 text-sm font-semibold">{periodLabel}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Data freshness</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{meta.generated_at ? `Updated ${formatTime(meta.generated_at)}` : 'Live'}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <select value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)} className="bg-transparent text-sm font-semibold outline-none">
                  {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value} className="text-slate-900">{option.label}</option>)}
                </select>
              </div>

              {period === 'custom' && (
                <>
                  <input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-700" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-slate-700" />
                </>
              )}

              {canSwitchDashboardStore && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <Store className="h-4 w-4 text-slate-400" />
                  <select value={storeId} onChange={(event) => setStoreId(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="max-w-[220px] bg-transparent text-sm font-semibold outline-none">
                    <option value="all" className="text-slate-900">All branches</option>
                    {(meta.stores || []).map((store: any) => <option key={store.id} value={store.id} className="text-slate-900">{store.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={exportCsv} disabled={!data} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"><Download className="h-4 w-4" />Export CSV</button>
              <button onClick={() => loadDashboard(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>
            </div>
          </div>
        </section>

        {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-semibold">Dashboard data could not be fully refreshed</div><div className="mt-1 text-sm opacity-80">{error}</div></div></div>}

        <ReportSection eyebrow="Executive snapshot" title="What changed in the selected period" description="Each card compares the selected window with the immediately preceding equivalent period.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            <KpiCard title="Gross sales" icon={<ShoppingBag />} item={kpis.gross_sales} format="currency" series={series.map((item: any) => number(item.sales))} />
            <KpiCard title="Net sales" icon={<ReceiptText />} item={kpis.net_sales} format="currency" series={series.map((item: any) => number(item.net_sales))} />
            <KpiCard title="Net collections" icon={<WalletCards />} item={kpis.collections} format="currency" series={(sales.payment_mix?.methods || []).map((item: any) => number(item.net_amount))} />
            <KpiCard title="Orders" icon={<PackageCheck />} item={kpis.orders} format="number" series={series.map((item: any) => number(item.orders))} />
            <KpiCard title="Average order" icon={<CircleDollarSign />} item={kpis.average_order_value} format="currency" series={series.map((item: any) => item.orders ? number(item.sales) / number(item.orders) : 0)} />
            <KpiCard title="Online sales" icon={<ShoppingBag />} item={kpis.online_sales} format="currency" neutral />
            {visibility.profitability && <KpiCard title="Gross profit" icon={<TrendingUp />} item={kpis.gross_profit} format="currency" series={series.map((item: any) => number(item.net_sales))} />}
            {visibility.profitability && <KpiCard title="Gross margin" icon={<Percent />} item={kpis.gross_margin_percentage} format="percent" />}
            {visibility.profitability && <KpiCard title="Net profit" icon={<BarChart3 />} item={kpis.net_profit} format="currency" />}
            {visibility.profitability && <KpiCard title="Net margin" icon={<Percent />} item={kpis.net_margin_percentage} format="percent" />}
            {visibility.receivables && <KpiCard title="Customer due" icon={<Users />} item={kpis.customer_due} format="currency" neutral />}
            {visibility.payables && <KpiCard title="Supplier due" icon={<Truck />} item={kpis.supplier_due} format="currency" neutral />}
          </div>
        </ReportSection>

        <section className="grid gap-5 2xl:grid-cols-[1.55fr_.9fr]">
          <ReportCard className="min-w-0">
            <CardHeader title="Sales and refund trend" subtitle="Gross sales, net sales and refunds across the selected report window" actionHref="/purchase-history" />
            <SalesChart data={series} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniMetric label="Gross sales" value={money(sales.gross_sales)} />
              <MiniMetric label="Refunded" value={money(sales.refund_value)} tone="danger" />
              <MiniMetric label="Returns" value={`${number(sales.return_count).toLocaleString()} · ${money(sales.return_value)}`} />
              <MiniMetric label="Return rate" value={percent(sales.return_rate_percentage)} tone={number(sales.return_rate_percentage) > 5 ? 'warning' : 'success'} />
            </div>
          </ReportCard>

          <ReportCard>
            <CardHeader title="Sales channel mix" subtitle="Where the period's order value originated" actionHref="/orders" />
            <div className="space-y-4">
              {(sales.channels || []).map((channel: any, index: number) => (
                <ProgressRow key={channel.channel || index} label={channel.label} value={money(channel.sales)} percentage={number(channel.percentage)} detail={`${number(channel.orders).toLocaleString()} orders`} />
              ))}
              {!sales.channels?.length && <EmptyState text="No sales channels recorded in this period." />}
            </div>
          </ReportCard>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <ReportCard>
            <CardHeader title="Collection and payment reconciliation" subtitle="Gross customer payment, processing commission and expected net receipt" actionHref="/accounting/payment-commissions" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800"><th className="py-3 pr-3">Method</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">Commission</th><th className="pl-3 py-3 text-right">Net receipt</th></tr></thead>
                <tbody>
                  {(sales.payment_mix?.methods || []).map((method: any) => <tr key={`${method.code}-${method.payment_method_id}`} className="border-b border-slate-100 last:border-0 dark:border-slate-900"><td className="py-3 pr-3"><div className="font-semibold">{method.name}</div><div className="text-xs text-slate-400">{titleCase(method.type)}</div></td><td className="px-3 py-3 text-right font-medium">{money(method.gross_amount)}</td><td className="px-3 py-3 text-right text-rose-600 dark:text-rose-300">{money(method.commission_amount)}</td><td className="pl-3 py-3 text-right font-bold text-emerald-700 dark:text-emerald-300">{money(method.net_amount)}</td></tr>)}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 font-bold dark:border-slate-700"><td className="py-3">Total</td><td className="px-3 py-3 text-right">{money(sales.payment_mix?.total_gross)}</td><td className="px-3 py-3 text-right text-rose-600 dark:text-rose-300">{money(sales.payment_mix?.total_commission)}</td><td className="pl-3 py-3 text-right text-emerald-700 dark:text-emerald-300">{money(sales.payment_mix?.total_net)}</td></tr></tfoot>
              </table>
            </div>
          </ReportCard>

          {visibility.profitability && <ReportCard>
            <CardHeader title="Profit bridge" subtitle="How net sales become period profit" actionHref="/accounting" />
            <div className="space-y-3">
              <BridgeRow label="Net sales" value={number(sales.net_sales)} base={Math.max(number(sales.net_sales), 1)} positive />
              <BridgeRow label="Cost of goods sold" value={number(profitability.cogs)} base={Math.max(number(sales.net_sales), 1)} />
              <BridgeRow label="Operating expenses" value={number(profitability.operating_expenses)} base={Math.max(number(sales.net_sales), 1)} />
              <BridgeRow label="Payment commissions" value={number(profitability.payment_commissions)} base={Math.max(number(sales.net_sales), 1)} />
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <MiniMetric label="Gross profit" value={money(profitability.gross_profit)} tone={number(profitability.gross_profit) >= 0 ? 'success' : 'danger'} />
                <MiniMetric label="Net profit" value={money(profitability.net_profit)} tone={number(profitability.net_profit) >= 0 ? 'success' : 'danger'} />
                <MiniMetric label="Gross margin" value={percent(profitability.gross_margin_percentage)} />
                <MiniMetric label="Net margin" value={percent(profitability.net_margin_percentage)} tone={number(profitability.net_margin_percentage) >= 0 ? 'success' : 'danger'} />
              </div>
            </div>
          </ReportCard>}
        </section>

        {(visibility.liquidity || visibility.capital) && <ReportSection eyebrow="Financial position" title="Liquidity, dues and capital exposure" description="Ledger balances are shown as of the selected end date; aging panels show current outstanding exposure.">
          <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr_1fr]">
            {visibility.liquidity && <ReportCard>
              <CardHeader title="Liquidity snapshot" subtitle={`As of ${formatDate(liquidity.as_of || meta.date_to)}`} actionHref="/accounting" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <BalanceTile icon={<Banknote />} label="Cash balance" value={money(liquidity.cash_balance)} />
                <BalanceTile icon={<Landmark />} label="Bank balance" value={money(liquidity.bank_balance)} />
                <BalanceTile icon={<WalletCards />} label="Mobile wallets" value={money(liquidity.mobile_wallet_balance)} />
                <BalanceTile icon={<Boxes />} label="Stock value" value={money(inventory.stock_value)} />
              </div>
              {!!liquidity.wallets?.length && <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">{liquidity.wallets.map((wallet: any) => <div key={wallet.account_id} className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">{wallet.name}</span><span className="font-semibold">{money(wallet.balance)}</span></div>)}</div>}
            </ReportCard>}

            {visibility.receivables && <AgingCard title="Customer due aging" subtitle={`${number(receivables.count).toLocaleString()} outstanding orders`} data={receivables} href="/orders" />}
            {visibility.payables && <AgingCard title="Supplier due aging" subtitle={`${number(payables.count).toLocaleString()} open purchase commitments`} data={payables} href="/purchase-order" />}
          </div>

          {visibility.capital && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Fixed assets" value={money(liquidity.fixed_asset_value)} icon={<Landmark />} />
            <SummaryTile label="Owner investment" value={money(liquidity.investment_balance)} icon={<CircleDollarSign />} />
            <SummaryTile label="Loan balance" value={money(liquidity.loan_balance)} icon={<CreditCard />} />
            <SummaryTile label="VAT / tax liability" value={money(liquidity.tax_liability)} icon={<ReceiptText />} />
          </div>}
        </ReportSection>}

        <ReportSection eyebrow="Inventory and fulfilment" title="Operational health and stock risks" description="Current inventory snapshot combined with selected-period order operations.">
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1.05fr]">
            <ReportCard>
              <CardHeader title="Inventory health" subtitle={`${number(inventory.quantity).toLocaleString()} units · ${number(inventory.product_store_count).toLocaleString()} product/store records`} actionHref="/inventory/view-new" />
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Stock value" value={money(inventory.stock_value)} />
                <MiniMetric label="Low stock" value={number(inventory.low_stock_count).toLocaleString()} tone={number(inventory.low_stock_count) ? 'warning' : 'success'} />
                <MiniMetric label="Out of stock" value={number(inventory.out_of_stock_count).toLocaleString()} tone={number(inventory.out_of_stock_count) ? 'danger' : 'success'} />
                <MiniMetric label="Alert threshold" value={`${number(inventory.low_stock_threshold)} units`} />
              </div>
              <div className="mt-5 space-y-3">
                {(inventory.age_buckets || []).map((bucket: any) => <ProgressRow key={bucket.label} label={bucket.label} value={money(bucket.amount)} percentage={number(bucket.percentage)} />)}
              </div>
            </ReportCard>

            <ReportCard>
              <CardHeader title="Low-stock watchlist" subtitle="The most urgent product/store combinations" actionHref="/inventory/view-new" />
              <div className="space-y-2">
                {(inventory.low_stock_items || []).slice(0, 8).map((item: any) => <Link key={`${item.product_id}-${item.store_id}`} href="/inventory/view-new" className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-900"><div className="min-w-0"><div className="truncate text-sm font-semibold">{item.product_name}</div><div className="truncate text-xs text-slate-400">{item.sku} · {item.store_name}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.status === 'out_of_stock' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{number(item.quantity).toLocaleString()}</span></Link>)}
                {!inventory.low_stock_items?.length && <EmptyState text="No stock alerts at the current threshold." icon={<CheckCircle2 className="h-8 w-8" />} />}
              </div>
            </ReportCard>

            <ReportCard>
              <CardHeader title="Order fulfilment pipeline" subtitle={`${number(operations.pending_unfulfilled).toLocaleString()} pending or unfulfilled orders`} actionHref="/orders" />
              <div className="space-y-3">
                {(operations.pipeline || []).slice(0, 8).map((stage: any) => {
                  const max = Math.max(...(operations.pipeline || []).map((item: any) => number(item.orders)), 1);
                  return <ProgressRow key={stage.status} label={stage.label} value={`${number(stage.orders).toLocaleString()} orders`} percentage={(number(stage.orders) / max) * 100} detail={money(stage.value)} />;
                })}
                {!operations.pipeline?.length && <EmptyState text="No order activity in the selected period." />}
              </div>
            </ReportCard>
          </div>
        </ReportSection>

        <section className="grid gap-5 xl:grid-cols-2">
          <RankedTable title="Top products" subtitle="Highest sales value in the selected period" href="/reports/daily-branch" columns={['Product', 'Qty', 'Revenue']} rows={(performance.top_products || []).map((item: any) => [<div key="name"><div className="font-semibold">{item.product_name}</div><div className="text-xs text-slate-400">{item.sku}</div></div>, number(item.quantity).toLocaleString(), money(item.revenue)])} />
          <RankedTable title="Branch performance" subtitle="Sales contribution across the selected scope" href="/dashboard/stores-summary" columns={['Branch', 'Orders', 'Sales']} rows={(performance.top_stores || []).map((item: any) => [<div key="name" className="font-semibold">{item.store_name}</div>, number(item.orders).toLocaleString(), money(item.sales)])} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <ReportCard>
            <CardHeader title="Action centre" subtitle="Exceptions that need management attention" />
            <div className="grid gap-3 md:grid-cols-2">
              {alerts.map((alert: any, index: number) => <AlertItem key={`${alert.title}-${index}`} alert={alert} />)}
              {!alerts.length && <div className="md:col-span-2"><EmptyState text="No material exceptions were detected for this dashboard scope." icon={<CheckCircle2 className="h-8 w-8" />} /></div>}
            </div>
          </ReportCard>

          {visibility.approvals && <ReportCard>
            <CardHeader title="Pending approvals" subtitle="Open control actions across purchasing, expenses and returns" actionHref="/activity-logs" />
            <div className="space-y-3">
              <ApprovalRow label="Purchase orders" value={approvals.purchase_orders} href="/purchase-order" icon={<ShoppingBag />} />
              <ApprovalRow label="Expenses" value={approvals.expenses} href="/accounting" icon={<ReceiptText />} />
              <ApprovalRow label="Returns" value={approvals.returns} href="/returns" icon={<RotateCcw />} />
              <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white dark:bg-cyan-400 dark:text-slate-950"><div className="text-xs uppercase tracking-[0.16em] opacity-60">Total waiting</div><div className="mt-1 text-3xl font-black">{number(approvals.total).toLocaleString()}</div></div>
            </div>
          </ReportCard>}
        </section>

        <section className={`grid gap-5 ${visibility.payables ? 'xl:grid-cols-3' : 'xl:grid-cols-1'}`}>
          {visibility.payables && <SummaryTile label="Purchase value" value={money(purchases.purchase_value)} description={`${number(purchases.purchase_count).toLocaleString()} purchase orders`} icon={<ShoppingBag />} href="/purchase-order" />}
          {visibility.payables && <SummaryTile label="Received purchase value" value={money(purchases.received_value)} description={`Outstanding ${money(purchases.outstanding_amount)}`} icon={<PackageOpen />} href="/purchase-order" />}
          <SummaryTile label="Returns and refunds" value={money(sales.refund_value)} description={`${number(sales.refund_count).toLocaleString()} completed refunds`} icon={<RotateCcw />} href="/returns" />
        </section>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <div className="font-semibold text-slate-700 dark:text-slate-200">How to read this dashboard</div>
          <div className="mt-1">{(meta.notes || []).join(' ')}</div>
        </div>
      </div>
    </DashboardShell>
  );
}

function DashboardShell({ darkMode, setDarkMode, sidebarOpen, setSidebarOpen, children }: any) {
  return <div className={darkMode ? 'dark' : ''}><div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100"><Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} /><div className="flex min-w-0 flex-1 flex-col overflow-hidden"><Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} /><main className="flex-1 overflow-y-auto">{children}</main></div></div></div>;
}

function ReportSection({ eyebrow, title, description, children }: any) {
  return <section><div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400">{eyebrow}</div><h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}</div>{children}</section>;
}

function ReportCard({ children, className = '' }: any) {
  return <div className={`rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}>{children}</div>;
}

function CardHeader({ title, subtitle, actionHref }: any) {
  return <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-base font-black tracking-tight">{title}</h3>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>{actionHref && <Link href={actionHref} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-cyan-700 hover:text-cyan-600 dark:text-cyan-300">Open report <ArrowRight className="h-3.5 w-3.5" /></Link>}</div>;
}

function KpiCard({ title, icon, item, format, series = [], neutral = false }: any) {
  const change = number(item?.change_percentage);
  const positive = change > 0;
  const negative = change < 0;
  return <Link href={item?.href || '#'} className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-700"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">{React.cloneElement(icon, { className: 'h-5 w-5' })}</div>{!neutral && <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${positive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : negative ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-900'}`}>{positive ? <ArrowUpRight className="h-3 w-3" /> : negative ? <ArrowDownRight className="h-3 w-3" /> : null}{Math.abs(change).toFixed(1)}%</div>}</div><div className="mt-4 truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</div><div className="mt-1 truncate text-2xl font-black tracking-tight">{formatValue(item?.value, format)}</div><div className="mt-3 flex items-end justify-between gap-3"><div className="truncate text-[11px] text-slate-400">Previous {formatValue(item?.previous_value, format)}</div>{series.length > 1 && <Sparkline values={series} />}</div></Link>;
}

function Sparkline({ values }: { values: number[] }) {
  const clean = values.map(number);
  const max = Math.max(...clean, 1);
  const min = Math.min(...clean, 0);
  const range = Math.max(max - min, 1);
  const points = clean.map((value, index) => `${(index / Math.max(clean.length - 1, 1)) * 72},${24 - ((value - min) / range) * 20}`).join(' ');
  return <svg viewBox="0 0 72 28" className="h-7 w-[72px] overflow-visible"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-500" /></svg>;
}

function SalesChart({ data }: { data: any[] }) {
  if (!data.length) return <EmptyState text="No sales activity in the selected period." />;
  const width = 900;
  const height = 260;
  const padX = 36;
  const padY = 24;
  const max = Math.max(...data.map((item) => Math.max(number(item.sales), number(item.refunds))), 1);
  const x = (index: number) => padX + (index / Math.max(data.length - 1, 1)) * (width - padX * 2);
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2);
  const salesPoints = data.map((item, index) => `${x(index)},${y(number(item.sales))}`).join(' ');
  const refundPoints = data.map((item, index) => `${x(index)},${y(number(item.refunds))}`).join(' ');
  const areaPath = `M ${x(0)} ${height - padY} L ${salesPoints.replace(/ /g, ' L ')} L ${x(data.length - 1)} ${height - padY} Z`;
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height + 35}`} className="min-w-[680px] w-full"><defs><linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" /><stop offset="100%" stopColor="#06b6d4" stopOpacity="0" /></linearGradient></defs>{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={padX} x2={width - padX} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeDasharray="4 5" /><text x={2} y={y(max * ratio) + 4} fontSize="10" fill="currentColor" className="text-slate-400">{compactMoney(max * ratio)}</text></g>)}<path d={areaPath} fill="url(#salesArea)" /><polyline points={salesPoints} fill="none" stroke="#06b6d4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><polyline points={refundPoints} fill="none" stroke="#fb7185" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />{data.map((item, index) => index % labelEvery === 0 || index === data.length - 1 ? <text key={item.key} x={x(index)} y={height + 15} textAnchor="middle" fontSize="10" fill="currentColor" className="text-slate-400">{item.label}</text> : null)}</svg><div className="mt-1 flex items-center justify-center gap-5 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><span className="h-1 w-5 rounded bg-cyan-500" />Gross sales</span><span className="inline-flex items-center gap-2"><span className="h-1 w-5 rounded bg-rose-400" />Refunds</span></div></div>;
}

function ProgressRow({ label, value, percentage, detail }: any) {
  const pct = Math.max(0, Math.min(number(percentage), 100));
  return <div><div className="mb-1.5 flex items-end justify-between gap-3"><div><div className="text-sm font-semibold">{label}</div>{detail && <div className="text-[11px] text-slate-400">{detail}</div>}</div><div className="text-right"><div className="text-sm font-bold">{value}</div><div className="text-[10px] text-slate-400">{pct.toFixed(1)}%</div></div></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${pct}%` }} /></div></div>;
}

function BridgeRow({ label, value, base, positive = false }: any) {
  const pct = Math.max(2, Math.min(100, (Math.abs(number(value)) / Math.max(number(base), 1)) * 100));
  return <div><div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-semibold">{label}</span><span className={`font-bold ${positive ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{positive ? '+' : '−'}{money(Math.abs(number(value)))}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><div className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} /></div></div>;
}

function AgingCard({ title, subtitle, data, href }: any) {
  return <ReportCard><CardHeader title={title} subtitle={subtitle} actionHref={href} /><div className="mb-4 text-3xl font-black">{money(data.total)}</div><div className="space-y-3">{(data.buckets || []).map((bucket: any, index: number) => <div key={bucket.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="font-semibold">{bucket.label}</span><span className={index === 3 && number(bucket.amount) > 0 ? 'font-bold text-rose-600 dark:text-rose-300' : 'font-bold'}>{money(bucket.amount)} · {number(bucket.count)} items</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><div className={`h-full rounded-full ${['bg-emerald-400', 'bg-cyan-400', 'bg-amber-400', 'bg-rose-500'][index]}`} style={{ width: `${Math.max(0, Math.min(number(bucket.percentage), 100))}%` }} /></div></div>)}</div></ReportCard>;
}

function RankedTable({ title, subtitle, href, columns, rows }: any) {
  return <ReportCard><CardHeader title={title} subtitle={subtitle} actionHref={href} /><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800"><th className="w-10 py-3">#</th>{columns.map((column: string, index: number) => <th key={column} className={`py-3 ${index ? 'text-right' : ''}`}>{column}</th>)}</tr></thead><tbody>{rows.map((row: any[], index: number) => <tr key={index} className="border-b border-slate-100 last:border-0 dark:border-slate-900"><td className="py-3 font-black text-slate-300 dark:text-slate-700">{String(index + 1).padStart(2, '0')}</td>{row.map((cell, cellIndex) => <td key={cellIndex} className={`py-3 ${cellIndex ? 'text-right font-semibold' : ''}`}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <EmptyState text="No ranked data is available for this period." />}</div></ReportCard>;
}

function AlertItem({ alert }: any) {
  const config: AnyRecord = { critical: { icon: <AlertTriangle />, className: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100' }, warning: { icon: <AlertCircle />, className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100' }, info: { icon: <FileClock />, className: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100' } };
  const selected = config[alert.severity] || config.info;
  return <Link href={alert.href || '#'} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${selected.className}`}><div className="flex items-start gap-3"><div className="mt-0.5">{React.cloneElement(selected.icon, { className: 'h-5 w-5' })}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="font-bold">{alert.title}</div><div className="shrink-0 text-lg font-black">{typeof alert.value === 'number' && Math.abs(alert.value) >= 1000 ? compactMoney(alert.value) : alert.value}</div></div><div className="mt-1 text-xs leading-5 opacity-75">{alert.message}</div></div></div></Link>;
}

function ApprovalRow({ label, value, href, icon }: any) {
  return <Link href={href} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3 transition hover:border-cyan-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-cyan-800 dark:hover:bg-slate-900"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">{React.cloneElement(icon, { className: 'h-4 w-4' })}</div><span className="text-sm font-semibold">{label}</span></div><span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white dark:bg-cyan-400 dark:text-slate-950">{number(value).toLocaleString()}</span></Link>;
}

function BalanceTile({ icon, label, value }: any) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-center gap-2 text-xs font-semibold text-slate-400">{React.cloneElement(icon, { className: 'h-4 w-4' })}{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>;
}

function SummaryTile({ label, value, description, icon, href }: any) {
  const content = <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div><div className="text-cyan-600 dark:text-cyan-400">{React.cloneElement(icon, { className: 'h-5 w-5' })}</div></div><div className="mt-2 text-2xl font-black">{value}</div>{description && <div className="mt-1 text-xs text-slate-400">{description}</div>}</div>;
  return href ? <Link href={href} className="transition hover:-translate-y-0.5">{content}</Link> : content;
}

function MiniMetric({ label, value, tone = 'default' }: any) {
  const classes: AnyRecord = { success: 'text-emerald-700 dark:text-emerald-300', warning: 'text-amber-700 dark:text-amber-300', danger: 'text-rose-700 dark:text-rose-300', default: '' };
  return <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900"><div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400">{label}</div><div className={`mt-1 text-base font-black ${classes[tone]}`}>{value}</div></div>;
}

function EmptyState({ text, icon = <PackageOpen className="h-8 w-8" /> }: any) {
  return <div className="flex min-h-[130px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-5 text-center text-slate-400 dark:border-slate-800"><div className="mb-2 opacity-60">{icon}</div><div className="text-sm">{text}</div></div>;
}

function DashboardSkeleton() {
  return <div className="mx-auto max-w-[1700px] space-y-6 p-6"><div className="h-56 animate-pulse rounded-[30px] bg-slate-200 dark:bg-slate-800" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-96 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" /><div className="h-96 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" /></div></div>;
}

function formatValue(value: unknown, type: string) {
  if (type === 'currency') return money(value);
  if (type === 'percent') return percent(value);
  return number(value).toLocaleString('en-BD', { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `৳ ${number(value).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function compactMoney(value: unknown) {
  const amount = number(value);
  if (Math.abs(amount) >= 10_000_000) return `৳${(amount / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(amount) >= 100_000) return `৳${(amount / 100_000).toFixed(1)}L`;
  if (Math.abs(amount) >= 1_000) return `৳${(amount / 1_000).toFixed(1)}K`;
  return `৳${amount.toFixed(0)}`;
}

function percent(value: unknown) {
  return `${number(value).toLocaleString('en-BD', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function titleCase(value: string) {
  return String(value || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'just now' : date.toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' });
}

function roleLabel(role: string | null) {
  return titleCase(role || 'employee');
}

function selectedStoreName(stores: any[], id: number) {
  return stores?.find((store) => Number(store.id) === Number(id))?.name || `Store ${id || ''}`;
}
