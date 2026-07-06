'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, AlertTriangle, Check, X } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import cashSheetService, {
  type BranchDay,
  type CashSheetRow,
  type CashSheetStore,
  type CashSheetSummary,
} from '@/services/cashSheetService';

const BUSINESS_TIMEZONE = 'Asia/Dhaka';

// ─── date and money helpers ──────────────────────────────────────────────────

function money(value: number) {
  const rounded = Math.round(Number(value || 0));
  if (rounded === 0) return '0';
  const sign = rounded < 0 ? '-' : '';
  return `${sign}৳${Math.abs(rounded).toLocaleString('en-BD')}`;
}

function dhakaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentDhakaMonth() {
  return dhakaDateString().slice(0, 7);
}

function addMonths(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const absolute = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: BUSINESS_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00+06:00`));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
  }).format(new Date(`${date}T00:00:00+06:00`));
}

function monthRangeLabel(rows: CashSheetRow[]) {
  if (!rows.length) return 'No dates loaded';
  return `${rows[0].date} → ${rows[rows.length - 1].date}`;
}

function getBranch(branches: BranchDay[], storeId: number): BranchDay | null {
  return branches.find((branch) => Number(branch.store_id) === Number(storeId)) ?? null;
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

function ValueCell({ value, strong = false }: { value: number; strong?: boolean }) {
  const numeric = Number(value || 0);
  const color = numeric < 0
    ? 'text-rose-600 dark:text-rose-400 font-semibold'
    : strong
      ? 'text-slate-900 dark:text-white font-semibold'
      : numeric > 0
        ? 'text-slate-700 dark:text-slate-200'
        : 'text-slate-300 dark:text-slate-600';

  return (
    <td className={`px-2 py-2 text-right text-[11px] tabular-nums whitespace-nowrap border-r border-slate-100 dark:border-slate-800 ${color}`}>
      {money(numeric)}
    </td>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap border-r border-slate-200 dark:border-slate-700">
      {children}
    </th>
  );
}

function SectionHeader({ label, cols, className }: { label: string; cols: number; className: string }) {
  return (
    <th colSpan={cols} className={`px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider border-r border-slate-300 dark:border-slate-700 ${className}`}>
      {label}
    </th>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  const negative = Number(value || 0) < 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-2 text-xl font-bold tabular-nums ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
        {money(value)}
      </div>
      <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{note}</div>
    </div>
  );
}

function MonthlyTotalCell({ value, strong = false }: { value: number; strong?: boolean }) {
  const numeric = Number(value || 0);
  const color = numeric < 0
    ? 'text-rose-600 dark:text-rose-400'
    : strong
      ? 'text-slate-900 dark:text-white'
      : 'text-slate-700 dark:text-slate-200';

  return (
    <td className={`px-2 py-2 text-right text-[11px] font-semibold tabular-nums whitespace-nowrap border-r border-slate-200 dark:border-slate-700 ${color}`}>
      {money(numeric)}
    </td>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function CashSheetPage() {
  const router = useRouter();
  const { darkMode, setDarkMode } = useTheme();
  const { role, storeId: userStoreId, isLoading: authLoading } = useAuth() as any;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(currentDhakaMonth());
  const [rows, setRows] = useState<CashSheetRow[]>([]);
  const [stores, setStores] = useState<CashSheetStore[]>([]);
  const [summary, setSummary] = useState<CashSheetSummary | null>(null);
  const [timezone, setTimezone] = useState(BUSINESS_TIMEZONE);
  const [utcOffset, setUtcOffset] = useState(6);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  const isAdmin = role === 'admin' || role === 'super-admin';
  const isBranch = role === 'branch-manager' || role === 'pos-salesman';
  const authorized = isAdmin || isBranch;
  const today = dhakaDateString();
  const currentMonth = currentDhakaMonth();

  useEffect(() => {
    if (!authLoading && !authorized) router.push('/dashboard');
  }, [authLoading, authorized, router]);

  const showToast = useCallback((message: string, ok = true) => {
    setToast({ message, ok });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await cashSheetService.getSheet(month);
      setRows(response.data);
      setStores(response.stores);
      setSummary(response.summary);
      setTimezone(response.timezone || BUSINESS_TIMEZONE);
      setUtcOffset(response.utc_offset_hours ?? 6);
    } catch (error) {
      console.error('Failed to load cash sheet', error);
      showToast('Failed to load monthly cash sheet.', false);
    } finally {
      setLoading(false);
    }
  }, [month, showToast]);

  useEffect(() => {
    if (!authLoading && authorized) load();
  }, [authLoading, authorized, load]);

  const visibleStores = useMemo(() => {
    if (!isBranch || !userStoreId) return stores;
    return stores.filter((store) => Number(store.id) === Number(userStoreId));
  }, [isBranch, stores, userStoreId]);

  const totalColumns = 1 + (visibleStores.length * 7) + (isAdmin ? 6 + 2 + 4 + 8 : 0);

  if (!authorized && !authLoading) return null;

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                Canonical /cash-sheet · Backend formula owned · {timezone}
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">Monthly Cash Sheet</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                One live monthly sheet rebuilt from orders, payments, splits, refunds, costs, admin entries, online receivables, disbursements, and owner entries.
                Sales show valid order value; cash/bank show actual money movement.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <button
                  onClick={() => setMonth(addMonths(month, -1))}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={17} />
                </button>
                <div className="min-w-[150px] text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {monthLabel(month)}
                </div>
                <button
                  onClick={() => setMonth(addMonths(month, 1))}
                  disabled={month >= currentMonth}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Next month"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Reloading' : 'Refresh'}
              </button>
            </div>
          </div>

          {summary && isAdmin && (
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Total Sale" value={summary.totals.total_sale} note="Branch sales + online sales" />
              <SummaryCard label="Cash" value={summary.totals.cash} note="After salary, cost, cash→bank" />
              <SummaryCard label="Bank" value={summary.totals.bank} note="Branch bank + online advance" />
              <SummaryCard label="Final Bank" value={summary.totals.final_bank} note="Bank + SSLZC + Pathao received" />
              <SummaryCard label="Owner Bank Remain" value={summary.owner.bank_after_cost} note="After owner bank cost" />
            </div>
          )}

          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                Business dates are aligned to <b>Asia/Dhaka</b>. Order sales use order date; payments prefer <b>payment_received_date</b> before completion/processing timestamps. Backend UTC offset is currently <b>{utcOffset}</b> hour(s), so frontend labels and backend buckets stay on the same business calendar.
              </div>
            </div>
          </div>

          {loading && rows.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              <Loader2 size={24} className="mr-2 animate-spin" /> Loading monthly sheet…
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{monthLabel(month)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{monthRangeLabel(rows)} · {isAdmin ? `${visibleStores.length} branch column(s)` : visibleStores.map((s) => s.name).join(', ') || 'Your branch'}</div>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  Negative cash stays visible in red; it is never clamped to zero.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-max border-collapse text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-30 min-w-[96px] border-r border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Date
                      </th>
                      {visibleStores.map((store) => (
                        <SectionHeader
                          key={`branch-section-${store.id}`}
                          label={store.name}
                          cols={7}
                          className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
                        />
                      ))}
                      {isAdmin && (
                        <>
                          <SectionHeader label="Online / Ecommerce" cols={6} className="bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200" />
                          <SectionHeader label="Disbursement" cols={2} className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200" />
                          <SectionHeader label="Day Totals" cols={4} className="bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-200" />
                          <SectionHeader label="Owner" cols={8} className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200" />
                        </>
                      )}
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      {visibleStores.map((store) => (
                        <FragmentBranchHeader key={`branch-header-${store.id}`} />
                      ))}
                      {isAdmin && (
                        <>
                          <HeaderCell>Sales</HeaderCell>
                          <HeaderCell>Advance</HeaderCell>
                          <HeaderCell>SSLZC</HeaderCell>
                          <HeaderCell>COD/Due</HeaderCell>
                          <HeaderCell>COD Collected</HeaderCell>
                          <HeaderCell>Refunds</HeaderCell>
                          <HeaderCell>SSLZC Rec.</HeaderCell>
                          <HeaderCell>Pathao Rec.</HeaderCell>
                          <HeaderCell>Total Sale</HeaderCell>
                          <HeaderCell>Cash</HeaderCell>
                          <HeaderCell>Bank</HeaderCell>
                          <HeaderCell>Final Bank</HeaderCell>
                          <HeaderCell>+Cash</HeaderCell>
                          <HeaderCell>Total Cash</HeaderCell>
                          <HeaderCell>Cash Cost</HeaderCell>
                          <HeaderCell>+Bank</HeaderCell>
                          <HeaderCell>Total Bank</HeaderCell>
                          <HeaderCell>Bank Cost</HeaderCell>
                          <HeaderCell>Cash Remain</HeaderCell>
                          <HeaderCell>Bank Remain</HeaderCell>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={totalColumns} className="px-4 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                          No cash sheet data returned for this month.
                        </td>
                      </tr>
                    )}

                    {rows.map((row) => {
                      const isToday = row.date === today;
                      return (
                        <tr key={row.date} className={`${isToday ? 'bg-blue-50/70 dark:bg-blue-950/20' : 'odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-900/70'} border-b border-slate-100 dark:border-slate-800`}>
                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                            <div>{dayLabel(row.date)}</div>
                            <div className="text-[10px] font-normal text-slate-400">{row.date}</div>
                          </td>

                          {visibleStores.map((store) => {
                            const branch = getBranch(row.branches, store.id);
                            return (
                              <FragmentBranchValues key={`branch-${row.date}-${store.id}`} branch={branch} />
                            );
                          })}

                          {isAdmin && (
                            <>
                              <ValueCell value={row.online.daily_sales} strong />
                              <ValueCell value={row.online.advance} />
                              <ValueCell value={row.online.online_payment} />
                              <ValueCell value={row.online.cod} />
                              <ValueCell value={row.online.cod_collected} />
                              <ValueCell value={row.online.refunds} />
                              <ValueCell value={row.disbursements.sslzc_received} />
                              <ValueCell value={row.disbursements.pathao_received} />
                              <ValueCell value={row.totals.total_sale} strong />
                              <ValueCell value={row.totals.cash} />
                              <ValueCell value={row.totals.bank} />
                              <ValueCell value={row.totals.final_bank} strong />
                              <ValueCell value={row.owner.cash_invest} />
                              <ValueCell value={row.owner.total_cash} strong />
                              <ValueCell value={row.owner.cash_cost} />
                              <ValueCell value={row.owner.bank_invest} />
                              <ValueCell value={row.owner.total_bank} strong />
                              <ValueCell value={row.owner.bank_cost} />
                              <ValueCell value={row.owner.cash_after_cost} strong />
                              <ValueCell value={row.owner.bank_after_cost} strong />
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>

                  {summary && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                        <td className="sticky left-0 z-10 border-r border-slate-300 bg-slate-100 px-3 py-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                          Monthly Total
                        </td>

                        {visibleStores.map((store) => {
                          const branch = getBranch(summary.branches, store.id);
                          return (
                            <FragmentBranchTotals key={`branch-total-${store.id}`} branch={branch} />
                          );
                        })}

                        {isAdmin && (
                          <>
                            <MonthlyTotalCell value={summary.online.daily_sales} strong />
                            <MonthlyTotalCell value={summary.online.advance} />
                            <MonthlyTotalCell value={summary.online.online_payment} />
                            <MonthlyTotalCell value={summary.online.cod} />
                            <MonthlyTotalCell value={summary.online.cod_collected} />
                            <MonthlyTotalCell value={summary.online.refunds} />
                            <MonthlyTotalCell value={summary.disbursements.sslzc_received} />
                            <MonthlyTotalCell value={summary.disbursements.pathao_received} />
                            <MonthlyTotalCell value={summary.totals.total_sale} strong />
                            <MonthlyTotalCell value={summary.totals.cash} />
                            <MonthlyTotalCell value={summary.totals.bank} />
                            <MonthlyTotalCell value={summary.totals.final_bank} strong />
                            <MonthlyTotalCell value={summary.owner.cash_invest} />
                            <MonthlyTotalCell value={summary.owner.total_cash} strong />
                            <MonthlyTotalCell value={summary.owner.cash_cost} />
                            <MonthlyTotalCell value={summary.owner.bank_invest} />
                            <MonthlyTotalCell value={summary.owner.total_bank} strong />
                            <MonthlyTotalCell value={summary.owner.bank_cost} />
                            <MonthlyTotalCell value={summary.owner.cash_after_cost} strong />
                            <MonthlyTotalCell value={summary.owner.bank_after_cost} strong />
                          </>
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 text-[11px] text-slate-500 dark:text-slate-400 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <b>Branch cash:</b> raw cash − salary − cash costs − cash→bank.
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <b>Branch bank:</b> raw non-cash − bank costs + cash→bank.
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <b>Final bank:</b> day bank + SSLZC received + Pathao received.
            </div>
          </div>
        </main>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {toast.ok ? <Check size={14} className="mr-1.5 inline" /> : <X size={14} className="mr-1.5 inline" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function FragmentBranchHeader() {
  return (
    <>
      <HeaderCell>Sale</HeaderCell>
      <HeaderCell>Cash</HeaderCell>
      <HeaderCell>Bank</HeaderCell>
      <HeaderCell>Ex/On</HeaderCell>
      <HeaderCell>Salary</HeaderCell>
      <HeaderCell>Cost</HeaderCell>
      <HeaderCell>→Bank</HeaderCell>
    </>
  );
}

function FragmentBranchValues({ branch }: { branch: BranchDay | null }) {
  return (
    <>
      <ValueCell value={branch?.daily_sale ?? 0} strong />
      <ValueCell value={branch?.cash ?? 0} />
      <ValueCell value={branch?.bank ?? 0} />
      <ValueCell value={branch?.ex_on ?? 0} />
      <ValueCell value={branch?.salary ?? 0} />
      <ValueCell value={branch?.daily_cost ?? 0} />
      <ValueCell value={branch?.cash_to_bank ?? 0} />
    </>
  );
}

function FragmentBranchTotals({ branch }: { branch: BranchDay | null }) {
  return (
    <>
      <MonthlyTotalCell value={branch?.daily_sale ?? 0} strong />
      <MonthlyTotalCell value={branch?.cash ?? 0} />
      <MonthlyTotalCell value={branch?.bank ?? 0} />
      <MonthlyTotalCell value={branch?.ex_on ?? 0} />
      <MonthlyTotalCell value={branch?.salary ?? 0} />
      <MonthlyTotalCell value={branch?.daily_cost ?? 0} />
      <MonthlyTotalCell value={branch?.cash_to_bank ?? 0} />
    </>
  );
}
