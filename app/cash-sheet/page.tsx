'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import cashSheetService, { CashSheetResponse, CashSheetBranchDay } from '@/services/cashSheetService';
import { CalendarDays, RefreshCcw, Loader2, AlertCircle, FileText, ArrowRightLeft, Info } from 'lucide-react';

function dhakaMonthString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}`;
}

function prettyDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(date);
}

function money(value: number) {
  const rounded = Math.round(Number(value || 0));
  return `৳${rounded.toLocaleString('en-BD')}`;
}

function MoneyCell({ value, bold = false }: { value: number; bold?: boolean }) {
  const negative = Number(value) < 0;
  const zero = Number(value) === 0;
  return (
    <td className={`whitespace-nowrap px-2 py-2 text-right text-xs ${bold ? 'font-semibold' : ''} ${negative ? 'text-rose-600 dark:text-rose-400' : zero ? 'text-gray-400 dark:text-gray-600' : 'text-gray-800 dark:text-gray-100'}`}>
      {zero ? '—' : money(value)}
    </td>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const negative = value < 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-xl font-bold ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{money(value)}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function branchForStore(branches: CashSheetBranchDay[], storeId: number): CashSheetBranchDay {
  return branches.find((b) => b.store_id === storeId) || {
    store_id: storeId,
    store_name: '',
    daily_sale: 0,
    cash: 0,
    bank: 0,
    ex_on: 0,
    salary: 0,
    daily_cost: 0,
    cash_to_bank: 0,
    raw_cash: 0,
    raw_bank: 0,
    cash_cost: 0,
    bank_cost: 0,
    cash_refunds: 0,
    bank_refunds: 0,
  };
}

export default function MonthlyCashSheetPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, scopedStoreId, isLoading: authLoading } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(dhakaMonthString());
  const [sheet, setSheet] = useState<CashSheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSheet = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cashSheetService.getSheet(month);
      setSheet(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load monthly cash sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, authLoading]);

  const visibleStores = useMemo(() => {
    const stores = sheet?.stores || [];
    if (scopedStoreId) return stores.filter((s) => Number(s.id) === Number(scopedStoreId));
    return stores;
  }, [sheet?.stores, scopedStoreId]);

  const isAdminLike = role === 'admin' || role === 'super-admin';

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6 min-w-0">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <FileText size={22} className="text-blue-600" />
                <h1 className="text-2xl font-bold">Monthly Cash Sheet</h1>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                Fresh live aggregation of commercial sales and real cash/bank movement. Sales stay on order date; payments, refunds, costs, settlements, and owner entries stay on their own business dates.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white">
                <CalendarDays size={16} className="text-gray-500" />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-transparent outline-none"
                />
              </label>
              <button
                onClick={loadSheet}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                Refresh
              </button>
              <Link href="/cash-sheet/summary" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                Summary
              </Link>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {sheet && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <StatCard label="Total Sale" value={sheet.summary.totals.sale} hint="Branch + online order value" />
                <StatCard label="Branch Cash" value={sheet.summary.totals.cash} hint="Can be negative" />
                <StatCard label="Bank" value={sheet.summary.totals.bank} hint="Branch bank + online advance" />
                <StatCard label="Final Bank" value={sheet.summary.totals.final_bank} hint="Bank + SSLZC + Pathao" />
                <StatCard label="COD/Due" value={sheet.summary.online.cod} hint="COD receivable tracker" />
                <StatCard label="Daily Cost" value={sheet.summary.totals.daily_cost} hint="Manual + accounting costs" />
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Info size={13} /> Timezone: {sheet.timezone}</span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-900">Range: {sheet.date_from} → {sheet.date_to}</span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-900">UTC offset env: {sheet.utc_offset_hours}</span>
                {!isAdminLike && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Branch view: own store only</span>}
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="max-h-[72vh] overflow-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-20 bg-gray-100 text-xs uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                      <tr>
                        <th className="sticky left-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-3 text-left dark:border-gray-800 dark:bg-gray-900">Date</th>
                        {visibleStores.map((store) => (
                          <th key={store.id} colSpan={7} className="border-b border-r border-gray-200 px-3 py-2 text-center dark:border-gray-800">
                            {store.name}
                          </th>
                        ))}
                        <th colSpan={4} className="border-b border-r border-gray-200 px-3 py-2 text-center dark:border-gray-800">Online / Ecommerce</th>
                        <th colSpan={2} className="border-b border-r border-gray-200 px-3 py-2 text-center dark:border-gray-800">Disbursement</th>
                        <th colSpan={4} className="border-b border-r border-gray-200 px-3 py-2 text-center dark:border-gray-800">Day Totals</th>
                        <th colSpan={2} className="border-b border-gray-200 px-3 py-2 text-center dark:border-gray-800">Owner Remain</th>
                      </tr>
                      <tr className="text-[11px]">
                        <th className="sticky left-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 dark:border-gray-800 dark:bg-gray-900"></th>
                        {visibleStores.map((store) => (
                          <FragmentHeader key={store.id} />
                        ))}
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Sales</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Advance</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">SSLZC</th>
                        <th className="border-b border-r border-gray-200 px-2 py-2 dark:border-gray-800">COD/Due</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">SSLZC Rcv</th>
                        <th className="border-b border-r border-gray-200 px-2 py-2 dark:border-gray-800">Pathao Rcv</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Sale</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Cash</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Bank</th>
                        <th className="border-b border-r border-gray-200 px-2 py-2 dark:border-gray-800">Final Bank</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Cash</th>
                        <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Bank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {sheet.data.map((row) => (
                        <tr key={row.date} className="hover:bg-blue-50/50 dark:hover:bg-gray-800/50">
                          <td className="sticky left-0 z-10 whitespace-nowrap border-r border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
                            <div>{prettyDate(row.date)}</div>
                            <div className="text-[10px] font-normal text-gray-400">{row.date}</div>
                          </td>
                          {visibleStores.map((store) => {
                            const b = branchForStore(row.branches, store.id);
                            return (
                              <FragmentCells key={`${row.date}-${store.id}`} b={b} />
                            );
                          })}
                          <MoneyCell value={row.online.daily_sales} />
                          <MoneyCell value={row.online.advance} />
                          <MoneyCell value={row.online.online_payment} />
                          <MoneyCell value={row.online.cod} />
                          <MoneyCell value={row.disbursements.sslzc_received} />
                          <MoneyCell value={row.disbursements.pathao_received} />
                          <MoneyCell value={row.totals.sale} bold />
                          <MoneyCell value={row.totals.cash} bold />
                          <MoneyCell value={row.totals.bank} bold />
                          <MoneyCell value={row.totals.final_bank} bold />
                          <MoneyCell value={row.owner.cash_after_cost} />
                          <MoneyCell value={row.owner.bank_after_cost} />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-gray-100 text-xs font-bold text-gray-800 dark:bg-gray-900 dark:text-gray-100">
                      <tr>
                        <td className="sticky left-0 border-r border-gray-200 bg-gray-100 px-3 py-3 dark:border-gray-800 dark:bg-gray-900">Month Total</td>
                        {visibleStores.map((store) => {
                          const b = sheet.summary.stores.find((s) => s.store_id === store.id);
                          return <FragmentCells key={`sum-${store.id}`} b={b || branchForStore([], store.id)} />;
                        })}
                        <MoneyCell value={sheet.summary.online.daily_sales} bold />
                        <MoneyCell value={sheet.summary.online.advance} bold />
                        <MoneyCell value={sheet.summary.online.online_payment} bold />
                        <MoneyCell value={sheet.summary.online.cod} bold />
                        <MoneyCell value={sheet.summary.disbursements.sslzc_received} bold />
                        <MoneyCell value={sheet.summary.disbursements.pathao_received} bold />
                        <MoneyCell value={sheet.summary.totals.sale} bold />
                        <MoneyCell value={sheet.summary.totals.cash} bold />
                        <MoneyCell value={sheet.summary.totals.bank} bold />
                        <MoneyCell value={sheet.summary.totals.final_bank} bold />
                        <MoneyCell value={sheet.summary.owner.cash_after_cost} bold />
                        <MoneyCell value={sheet.summary.owner.bank_after_cost} bold />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  <p className="font-semibold">Date rule</p>
                  <p className="mt-1 text-xs">Payments use payment_received_date first, then completed/processed/created timestamps. Month rows are grouped by Dhaka business date.</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <p className="font-semibold">Cancellation/refund rule</p>
                  <p className="mt-1 text-xs">Cancelled/refunded order value leaves the Sale column, but completed money-in remains. Refunds subtract separately on refund date.</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                  <p className="font-semibold flex items-center gap-1"><ArrowRightLeft size={14} /> Ex/On rule</p>
                  <p className="mt-1 text-xs">Exchange extra collection adds to cash/bank and Ex/On. Exchange refund subtracts from both money movement and Ex/On.</p>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function FragmentHeader() {
  return (
    <>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Sale</th>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Cash</th>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Bank</th>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Ex/On</th>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Salary</th>
      <th className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">Cost</th>
      <th className="border-b border-r border-gray-200 px-2 py-2 dark:border-gray-800">→Bank</th>
    </>
  );
}

function FragmentCells({ b }: { b: Partial<CashSheetBranchDay> }) {
  return (
    <>
      <MoneyCell value={Number(b.daily_sale || 0)} />
      <MoneyCell value={Number(b.cash || 0)} />
      <MoneyCell value={Number(b.bank || 0)} />
      <MoneyCell value={Number(b.ex_on || 0)} />
      <MoneyCell value={Number(b.salary || 0)} />
      <MoneyCell value={Number(b.daily_cost || 0)} />
      <MoneyCell value={Number(b.cash_to_bank || 0)} />
    </>
  );
}
