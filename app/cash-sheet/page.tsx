'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import cashSheetService, { CashSheetResponse, CashSheetBranchDay, StoreLite } from '@/services/cashSheetService';
import { CalendarDays, RefreshCcw, Loader2, AlertCircle, FileText, BarChart3 } from 'lucide-react';

const BRANCH_COLUMNS = ['Sale', 'Cash', 'Bank', 'Ex/On', 'Salary', 'Cost', '→ Bank'];
const OWNER_COLUMNS = ['+Cash', 'Total Cash', 'Cash-Cost', '+Bank', 'Total Bank', 'Bank-Cost', 'Cash Remain', 'Bank Remain'];

function dhakaDateParts(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
}

function dhakaMonthString(date = new Date()) {
  const parts = dhakaDateParts(date);
  return `${parts.year}-${parts.month}`;
}

function dhakaTodayString() {
  const parts = dhakaDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function prettyDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNo = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: 'UTC' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date);
  return `${dayNo} ${weekday}`;
}

function money(value: number) {
  const rounded = Math.round(Number(value || 0));
  if (rounded === 0) return '0';
  return `৳${rounded.toLocaleString('en-BD')}`;
}

type Tone = 'default' | 'sale' | 'cash' | 'bank' | 'salary' | 'cost' | 'muted' | 'blue' | 'green' | 'orange';

function toneClass(value: number, tone: Tone, bold = false) {
  if (Number(value) < 0) return 'font-semibold text-rose-600 dark:text-rose-400';
  if (Number(value) === 0) return 'text-slate-300 dark:text-slate-600';

  const map: Record<Tone, string> = {
    default: 'text-slate-700 dark:text-slate-200',
    sale: 'font-semibold text-emerald-600 dark:text-emerald-400',
    cash: 'text-slate-700 dark:text-slate-200',
    bank: 'text-blue-600 dark:text-blue-400',
    salary: 'font-semibold text-orange-500 dark:text-orange-400',
    cost: 'text-slate-700 dark:text-slate-200',
    muted: 'text-slate-500 dark:text-slate-400',
    blue: 'font-semibold text-blue-600 dark:text-blue-400',
    green: 'font-semibold text-emerald-600 dark:text-emerald-400',
    orange: 'font-semibold text-orange-500 dark:text-orange-400',
  };

  return `${bold ? 'font-semibold ' : ''}${map[tone]}`;
}

function MoneyCell({ value, tone = 'default', bold = false, edge = false }: { value: number; tone?: Tone; bold?: boolean; edge?: boolean }) {
  return (
    <td className={`whitespace-nowrap border-b border-r border-slate-100 px-1.5 py-1 text-right text-[11px] leading-5 dark:border-slate-800 ${edge ? 'border-r-slate-300 dark:border-r-slate-700' : ''} ${toneClass(value, tone, bold)}`}>
      {money(value)}
    </td>
  );
}

function DateCell({ date, today }: { date: string; today: string }) {
  return (
    <td className="sticky left-0 z-20 whitespace-nowrap border-b border-r border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-[1px_0_0_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex items-center gap-1.5">
        <span>{prettyDate(date)}</span>
        {date === today && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">Today</span>}
      </div>
    </td>
  );
}

function branchForStore(branches: CashSheetBranchDay[], storeId: number): CashSheetBranchDay {
  return branches.find((b) => Number(b.store_id) === Number(storeId)) || {
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

function StoreGroupHeader({ store }: { store: StoreLite }) {
  return (
    <th
      key={store.id}
      colSpan={BRANCH_COLUMNS.length}
      title={store.is_warehouse ? 'Warehouse' : 'Store'}
      className={`border-b border-r border-slate-300 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide dark:border-slate-700 ${store.is_warehouse ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'bg-indigo-50 text-blue-700 dark:bg-indigo-950 dark:text-indigo-300'}`}
    >
      {store.name}
    </th>
  );
}

function BranchHeaderCells() {
  return (
    <>
      {BRANCH_COLUMNS.map((column, idx) => (
        <th key={column} className={`border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 ${idx === BRANCH_COLUMNS.length - 1 ? 'border-r-slate-300 dark:border-r-slate-700' : ''}`}>
          {column}
        </th>
      ))}
    </>
  );
}

function BranchCells({ branch }: { branch: Partial<CashSheetBranchDay> }) {
  return (
    <>
      <MoneyCell value={Number(branch.daily_sale || 0)} tone="default" />
      <MoneyCell value={Number(branch.cash || 0)} tone="cash" />
      <MoneyCell value={Number(branch.bank || 0)} tone="bank" />
      <MoneyCell value={Number(branch.ex_on || 0)} tone="muted" />
      <MoneyCell value={Number(branch.salary || 0)} tone="salary" />
      <MoneyCell value={Number(branch.daily_cost || 0)} tone="cost" />
      <MoneyCell value={Number(branch.cash_to_bank || 0)} tone="muted" edge />
    </>
  );
}

export default function MonthlyCashSheetPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { isLoading: authLoading } = useAuth() as any;
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

  const visibleStores = useMemo(() => sheet?.stores || [], [sheet?.stores]);
  const today = useMemo(() => dhakaTodayString(), []);

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-slate-950' : 'bg-slate-100'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-3 md:p-4 min-w-0">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                <FileText size={20} className="text-blue-600" />
                <h1 className="text-xl font-bold">Monthly Cash Sheet</h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Spreadsheet view for all stores and warehouses. Active locations always show; inactive/soft-deleted locations return in historical months when they have cash-sheet data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                <CalendarDays size={15} className="text-slate-500" />
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-transparent outline-none" />
              </label>
              <button onClick={loadSheet} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Refresh
              </button>
              <Link href="/cash-sheet/summary" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                <BarChart3 size={15} /> Summary
              </Link>
            </div>
          </div>

          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {sheet && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-slate-900">Timezone: {sheet.timezone}</span>
                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-slate-900">Range: {sheet.date_from || month} → {sheet.date_to || month}</span>
                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-slate-900">Stores/Warehouses: {visibleStores.length}</span>
              </div>

              <div className="overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="max-h-[calc(100vh-178px)] overflow-auto">
                  <table className="min-w-max border-collapse text-xs">
                    <thead className="sticky top-0 z-30">
                      <tr>
                        <th rowSpan={2} className="sticky left-0 z-50 w-24 border-b border-r border-slate-200 bg-white px-2 py-2 text-left text-xs font-semibold text-slate-700 shadow-[1px_0_0_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Date
                        </th>
                        {visibleStores.map((store) => <StoreGroupHeader key={store.id} store={store} />)}
                        <th colSpan={4} className="border-b border-r border-purple-300 bg-purple-50 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">Online / Ecommerce</th>
                        <th colSpan={2} className="border-b border-r border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">Disbursements</th>
                        <th colSpan={4} className="border-b border-r border-teal-300 bg-teal-50 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">Day Totals</th>
                        <th colSpan={8} className="border-b border-r border-green-300 bg-green-50 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Owner</th>
                      </tr>
                      <tr>
                        {visibleStores.map((store) => <BranchHeaderCells key={`head-${store.id}`} />)}
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Sales</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Advance</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">SSLZC</th>
                        <th className="border-b border-r border-slate-300 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">COD</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">SSLZC Recv'd</th>
                        <th className="border-b border-r border-slate-300 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Pathao Recv'd</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Total Sale</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cash</th>
                        <th className="border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Bank</th>
                        <th className="border-b border-r border-slate-300 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Final Bank</th>
                        {OWNER_COLUMNS.map((column, idx) => (
                          <th key={column} className={`border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 ${idx === OWNER_COLUMNS.length - 1 ? 'border-r-slate-300 dark:border-r-slate-700' : ''}`}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.data.map((row) => (
                        <tr key={row.date} className="odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/70 dark:odd:bg-slate-950 dark:even:bg-slate-900/50 dark:hover:bg-slate-800/70">
                          <DateCell date={row.date} today={today} />
                          {visibleStores.map((store) => <BranchCells key={`${row.date}-${store.id}`} branch={branchForStore(row.branches, store.id)} />)}
                          <MoneyCell value={row.online.daily_sales} tone="sale" />
                          <MoneyCell value={row.online.advance} tone="blue" />
                          <MoneyCell value={row.online.online_payment} tone="muted" />
                          <MoneyCell value={row.online.cod} tone="muted" edge />
                          <MoneyCell value={row.disbursements.sslzc_received} tone="blue" />
                          <MoneyCell value={row.disbursements.pathao_received} tone="blue" edge />
                          <MoneyCell value={row.totals.sale} tone="sale" bold />
                          <MoneyCell value={row.totals.cash} tone="cash" bold />
                          <MoneyCell value={row.totals.bank} tone="bank" bold />
                          <MoneyCell value={row.totals.final_bank} tone="blue" bold edge />
                          <MoneyCell value={row.owner.cash_invest} tone="green" />
                          <MoneyCell value={row.owner.total_cash} tone="green" />
                          <MoneyCell value={row.owner.cash_cost} tone="muted" />
                          <MoneyCell value={row.owner.bank_invest} tone="blue" />
                          <MoneyCell value={row.owner.total_bank} tone="blue" />
                          <MoneyCell value={row.owner.bank_cost} tone="muted" />
                          <MoneyCell value={row.owner.cash_after_cost} tone="green" />
                          <MoneyCell value={row.owner.bank_after_cost} tone="blue" edge />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-20 bg-slate-100 dark:bg-slate-900">
                      <tr>
                        <td className="sticky left-0 z-30 whitespace-nowrap border-r border-t border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-800 shadow-[1px_0_0_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">Month Total</td>
                        {visibleStores.map((store) => {
                          const summaryBranch = sheet.summary.stores.find((item) => Number(item.store_id) === Number(store.id));
                          return <BranchCells key={`sum-${store.id}`} branch={summaryBranch || branchForStore([], store.id)} />;
                        })}
                        <MoneyCell value={sheet.summary.online.daily_sales} tone="sale" bold />
                        <MoneyCell value={sheet.summary.online.advance} tone="blue" bold />
                        <MoneyCell value={sheet.summary.online.online_payment} tone="muted" bold />
                        <MoneyCell value={sheet.summary.online.cod} tone="muted" bold edge />
                        <MoneyCell value={sheet.summary.disbursements.sslzc_received} tone="blue" bold />
                        <MoneyCell value={sheet.summary.disbursements.pathao_received} tone="blue" bold edge />
                        <MoneyCell value={sheet.summary.totals.sale} tone="sale" bold />
                        <MoneyCell value={sheet.summary.totals.cash} tone="cash" bold />
                        <MoneyCell value={sheet.summary.totals.bank} tone="bank" bold />
                        <MoneyCell value={sheet.summary.totals.final_bank} tone="blue" bold edge />
                        <MoneyCell value={sheet.summary.owner.cash_invest} tone="green" bold />
                        <MoneyCell value={sheet.summary.owner.total_cash} tone="green" bold />
                        <MoneyCell value={sheet.summary.owner.cash_cost} tone="muted" bold />
                        <MoneyCell value={sheet.summary.owner.bank_invest} tone="blue" bold />
                        <MoneyCell value={sheet.summary.owner.total_bank} tone="blue" bold />
                        <MoneyCell value={sheet.summary.owner.bank_cost} tone="muted" bold />
                        <MoneyCell value={sheet.summary.owner.cash_after_cost} tone="green" bold />
                        <MoneyCell value={sheet.summary.owner.bank_after_cost} tone="blue" bold edge />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
