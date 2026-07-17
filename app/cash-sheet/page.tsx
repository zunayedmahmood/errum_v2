'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import cashSheetService, {
  CashSheetBranchDay,
  CashSheetDay,
  CashSheetSummaryResponse,
  StoreLite,
} from '@/services/cashSheetService';
import { AlertCircle, CalendarDays, FileText, Loader2, RefreshCcw } from 'lucide-react';

const STORE_COLUMNS = [
  ['daily_sale', 'SALE'],
  ['cash', 'CASH'],
  ['bank', 'BANK'],
  ['ex_on', 'EX/ON'],
  ['salary', 'SALARY'],
  ['daily_cost', 'COST'],
  ['cash_to_bank', '->BANK'],
] as const;

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

function money(value: number) {
  const amount = Object.is(value, -0) ? 0 : Math.round(Number(value || 0));
  const sign = amount < 0 ? '-' : '';
  return `${sign}৳${Math.abs(amount).toLocaleString('en-BD')}`;
}

function dateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00+06:00`);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit' }).format(parsed);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', weekday: 'short' }).format(parsed);
  return `${day} ${weekday}`;
}

function todayDhaka() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function displayValue(value: number, outflow = false) {
  if (!outflow) return value;
  return value === 0 ? 0 : -Math.abs(value);
}

function AmountCell({ value, present, outflow = false }: { value: number; present?: boolean; outflow?: boolean }) {
  if (!present) {
    return <span className="text-gray-400 dark:text-gray-600">—</span>;
  }

  const shown = displayValue(value, outflow);
  const negative = shown < 0;

  return (
    <span className={`font-semibold ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-100'}`}>
      {money(shown)}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  const negative = value < 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-950 dark:text-white'}`}>
        {money(value)}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  );
}

function storeBadge(store: StoreLite) {
  if (store.is_warehouse) return 'WAREHOUSE';
  if (store.is_online) return 'ONLINE';
  return null;
}

function branchForStore(branches: CashSheetBranchDay[], storeId: number) {
  return branches.find((branch) => Number(branch.store_id) === Number(storeId));
}

function addOneDay(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return end.toISOString().slice(0, 10);
}

function emptyDay(date: string): CashSheetDay {
  return {
    date,
    branches: [],
    online: {
      daily_sales: 0,
      advance: 0,
      online_payment: 0,
      cod: 0,
      cod_due: 0,
      cod_collected: 0,
      cod_refunds: 0,
      refunds: 0,
      has_data: {
        daily_sales: false,
        advance: false,
        online_payment: false,
        cod: false,
        cod_due: false,
        cod_collected: false,
        cod_refunds: false,
        refunds: false,
      },
    },
    disbursements: {
      sslzc_received: 0,
      pathao_received: 0,
      has_data: {
        sslzc_received: false,
        pathao_received: false,
      },
    },
    totals: {
      sale: 0,
      branch_sale: 0,
      cash: 0,
      bank: 0,
      final_bank: 0,
      daily_cost: 0,
      ex_on: 0,
      salary: 0,
      cash_to_bank: 0,
      has_data: {
        sale: false,
        branch_sale: false,
        cash: false,
        bank: false,
        final_bank: false,
        daily_cost: false,
        ex_on: false,
        salary: false,
        cash_to_bank: false,
      },
    },
    owner: {
      cash_invest: 0,
      bank_invest: 0,
      cash_cost: 0,
      bank_cost: 0,
      total_cash: 0,
      total_bank: 0,
      cash_after_cost: 0,
      bank_after_cost: 0,
      has_data: {
        cash_invest: false,
        bank_invest: false,
        cash_cost: false,
        bank_cost: false,
        total_cash: false,
        total_bank: false,
        cash_after_cost: false,
        bank_after_cost: false,
      },
    },
  };
}

export default function MonthlyCashSheetPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { scopedStoreId, isLoading: authLoading } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(dhakaMonthString());
  const [sheet, setSheet] = useState<CashSheetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSheet = async () => {
    setLoading(true);
    setError(null);
    try {
      setSheet(await cashSheetService.getSummary(month, scopedStoreId ? Number(scopedStoreId) : null));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load monthly cash sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, scopedStoreId, authLoading]);

  const stores = useMemo(() => sheet?.stores || [], [sheet?.stores]);
  const storeTotals = useMemo(() => {
    const map = new Map<number, CashSheetBranchDay>();
    for (const row of sheet?.summary.stores || []) {
      map.set(Number(row.store_id), row as CashSheetBranchDay);
    }
    return map;
  }, [sheet?.summary.stores]);
  const visibleDays = useMemo(() => {
    if (!sheet) return [];

    const daysByDate = new Map((sheet.days || []).map((day) => [day.date, day]));
    const start = sheet.date_from || `${month}-01`;
    const end = sheet.date_to || monthEnd(month);
    const days: CashSheetDay[] = [];

    for (let date = start; date <= end; date = addOneDay(date)) {
      days.push(daysByDate.get(date) || emptyDay(date));
    }

    return days;
  }, [sheet, month]);

  const today = todayDhaka();
  const dailyCost = sheet?.summary.totals.daily_cost ? -Math.abs(sheet.summary.totals.daily_cost) : 0;

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex min-w-0 flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-gray-950 dark:text-white">
                <FileText size={22} className="text-blue-600" />
                <h1 className="text-2xl font-bold">Monthly Cash Sheet</h1>
              </div>
              <p className="mt-1 max-w-4xl text-sm text-gray-500 dark:text-gray-400">
                Fresh live aggregation of commercial sales and real cash/bank movement. Sales stay on order date; payments, refunds, costs, settlements, and owner entries stay on their own business dates.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white">
                <CalendarDays size={16} className="text-gray-500" />
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="bg-transparent outline-none" />
              </label>
              <button onClick={loadSheet} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                Refresh
              </button>
              <Link href="/cash-sheet/summary" className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800">
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
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <MetricCard label="TOTAL SALE" value={sheet.summary.totals.sale} sub="Store/warehouse + online order value" />
                <MetricCard label="BRANCH CASH" value={sheet.summary.totals.cash} sub="Can be negative" />
                <MetricCard label="BANK" value={sheet.summary.totals.bank} sub="Branch bank + online advance" />
                <MetricCard label="FINAL BANK" value={sheet.summary.totals.final_bank} sub="Bank + SSLZC + Pathao" />
                <MetricCard label="COD/DUE" value={sheet.summary.online.cod} sub="COD receivable tracker" />
                <MetricCard label="DAILY COST" value={dailyCost} sub="Manual + accounting costs" />
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Timezone: {sheet.timezone}</span>
                <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-900">Range: {sheet.date_from} - {sheet.date_to}</span>
                <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-900">UTC offset env: {sheet.utc_offset_hours}</span>
              </div>

              <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="max-h-[68vh] overflow-auto">
                  <table className="min-w-max border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20 bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                      <tr>
                        <th rowSpan={2} className="sticky left-0 z-30 min-w-[96px] border-b border-r border-gray-200 bg-gray-100 px-3 py-3 text-left font-bold dark:border-gray-800 dark:bg-gray-900">
                          DATE
                        </th>
                        {stores.map((store) => (
                          <th key={store.id} colSpan={7} className="border-b border-r border-gray-200 px-3 py-2 text-center font-bold dark:border-gray-800">
                            <span>{store.name}</span>
                            {storeBadge(store) && <span className="ml-2 text-[10px] font-black text-blue-600 dark:text-blue-300">{storeBadge(store)}</span>}
                          </th>
                        ))}
                        <th colSpan={4} className="border-b border-r border-gray-200 px-3 py-2 text-center font-bold dark:border-gray-800">ONLINE / ECOMMERCE</th>
                        <th colSpan={2} className="border-b border-r border-gray-200 px-3 py-2 text-center font-bold dark:border-gray-800">DISBURSEMENT</th>
                        <th colSpan={4} className="border-b border-gray-200 px-3 py-2 text-center font-bold dark:border-gray-800">DAY TOTALS</th>
                      </tr>
                      <tr>
                        {stores.map((store) => (
                          STORE_COLUMNS.map(([, label]) => (
                            <th key={`${store.id}-${label}`} className="border-b border-r border-gray-200 px-3 py-2 text-right font-bold dark:border-gray-800">{label}</th>
                          ))
                        ))}
                        {['SALES', 'ADVANCE', 'SSLZC', 'COD/DUE', 'SSLZC RCV', 'PATHAO RCV', 'SALE', 'CASH', 'BANK', 'FINAL BANK'].map((label) => (
                          <th key={label} className="border-b border-r border-gray-200 px-3 py-2 text-right font-bold last:border-r-0 dark:border-gray-800">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDays.map((day) => (
                        <tr key={day.date} className={day.date === today ? 'bg-blue-50/70 dark:bg-blue-950/20' : 'odd:bg-white even:bg-gray-50/70 dark:odd:bg-gray-900 dark:even:bg-gray-950/40'}>
                          <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-inherit px-3 py-2 font-bold text-gray-800 dark:border-gray-800 dark:text-gray-100">
                            <div className="flex items-center gap-2">
                              <span>{dateLabel(day.date)}</span>
                              {day.date === today && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">Today</span>}
                            </div>
                            <div className="text-[10px] font-medium text-gray-400">{day.date}</div>
                          </td>

                          {stores.map((store) => {
                            const branch = branchForStore(day.branches, store.id);
                            return STORE_COLUMNS.map(([key]) => (
                              <td key={`${day.date}-${store.id}-${key}`} className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800">
                                <AmountCell
                                  value={Number(branch?.[key] ?? 0)}
                                  present={Boolean(branch?.has_data?.[key])}
                                  outflow={key === 'daily_cost'}
                                />
                              </td>
                            ));
                          })}

                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.online.daily_sales} present={day.online.has_data.daily_sales} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.online.advance} present={day.online.has_data.advance} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.online.online_payment} present={day.online.has_data.online_payment} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.online.cod} present={day.online.has_data.cod} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.disbursements.sslzc_received} present={day.disbursements.has_data.sslzc_received} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.disbursements.pathao_received} present={day.disbursements.has_data.pathao_received} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.totals.sale} present={day.totals.has_data.sale} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.totals.cash} present={day.totals.has_data.cash} /></td>
                          <td className="border-b border-r border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.totals.bank} present={day.totals.has_data.bank} /></td>
                          <td className="border-b border-gray-200 px-3 py-2 text-right dark:border-gray-800"><AmountCell value={day.totals.final_bank} present={day.totals.has_data.final_bank} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-20 bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
                      <tr>
                        <td className="sticky left-0 z-30 border-r border-t border-gray-200 bg-gray-100 px-3 py-3 font-black dark:border-gray-800 dark:bg-gray-900">Month Total</td>
                        {stores.map((store) => {
                          const total = storeTotals.get(Number(store.id));
                          return STORE_COLUMNS.map(([key]) => (
                            <td key={`total-${store.id}-${key}`} className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800">
                              <AmountCell value={Number(total?.[key] ?? 0)} present={Boolean(total?.has_data?.[key])} outflow={key === 'daily_cost'} />
                            </td>
                          ));
                        })}
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.online.daily_sales} present={sheet.summary.online.has_data.daily_sales} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.online.advance} present={sheet.summary.online.has_data.advance} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.online.online_payment} present={sheet.summary.online.has_data.online_payment} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.online.cod} present={sheet.summary.online.has_data.cod} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.disbursements.sslzc_received} present={sheet.summary.disbursements.has_data.sslzc_received} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.disbursements.pathao_received} present={sheet.summary.disbursements.has_data.pathao_received} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.totals.sale} present={sheet.summary.totals.has_data.sale} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.totals.cash} present={sheet.summary.totals.has_data.cash} /></td>
                        <td className="border-r border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.totals.bank} present={sheet.summary.totals.has_data.bank} /></td>
                        <td className="border-t border-gray-200 px-3 py-3 text-right dark:border-gray-800"><AmountCell value={sheet.summary.totals.final_bank} present={sheet.summary.totals.has_data.final_bank} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}

          {!sheet && loading && (
            <div className="flex min-h-[320px] items-center justify-center text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading monthly cash sheet...
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
