'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Check, X } from 'lucide-react';
import cashSheetService, { CashSheetRow, CashSheetSummary } from '@/services/cashSheetService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n === 0 ? '—' : '৳' + Math.round(n).toLocaleString('en-BD');

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-BD', { month: 'long', year: 'numeric' });
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-BD', { day: '2-digit', weekday: 'short' });
}

// ─── read-only stat cell ──────────────────────────────────────────────────────

function StatCell({ value, highlight }: { value: number; highlight?: 'green' | 'blue' | 'amber' }) {
  const color =
    highlight === 'green' ? 'text-emerald-500 dark:text-emerald-400 font-semibold' :
    highlight === 'blue'  ? 'text-blue-500 dark:text-blue-400 font-semibold' :
    highlight === 'amber' ? 'text-amber-500 dark:text-amber-400 font-semibold' :
    value > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600';
  return (
    <td className={`px-2 py-1.5 text-right text-xs whitespace-nowrap tabular-nums ${color}`}>
      {value > 0 ? '৳' + Math.round(value).toLocaleString('en-BD') : '—'}
    </td>
  );
}

// Section header
function SectionHeader({ label, cols, color }: { label: string; cols: number; color: string }) {
  return (
    <th colSpan={cols} className={`px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider border-x border-gray-700 ${color}`}>
      {label}
    </th>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CashSheetPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, storeId: userStoreId, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CashSheetRow[]>([]);
  const [summary, setSummary] = useState<CashSheetSummary | null>(null);
  const [stores, setStores] = useState<{ id: number; name: string; is_warehouse?: boolean }[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const isAdmin    = role === 'admin' || role === 'super-admin';
  const isBranch   = role === 'branch-manager' || role === 'pos-salesman';
  const authorized = isAdmin || isBranch;

  useEffect(() => {
    if (!authLoading && !authorized) router.push('/dashboard');
  }, [authLoading, authorized]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cashSheetService.getSheet(month);
      setRows(res.data);
      setSummary(res.summary);
      setStores(res.stores);
    } catch {
      showToast('Failed to load cash sheet.', false);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!authLoading && authorized) load();
  }, [month, authLoading, authorized]);

  // Branch managers only see their own store
  const visibleStores = isBranch && userStoreId
    ? stores.filter(s => s.id === userStoreId)
    : stores;

  if (!authorized && !authLoading) return null;

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 p-4 md:p-6 overflow-auto">

          {/* top bar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Daily Cash Sheet</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isAdmin ? 'All branches + online channel' : `Branch: ${visibleStores.map(s => s.name).join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5">
                <button onClick={() => setMonth(prevMonth(month))} className="p-1 hover:text-blue-500">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[130px] text-center">
                  {monthLabel(month)}
                </span>
                <button
                  onClick={() => setMonth(nextMonth(month))}
                  disabled={month >= currentMonth()}
                  className="p-1 hover:text-blue-500 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 transition-colors"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* sheet */}
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Loading sheet…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <table className="text-xs border-collapse min-w-max bg-white dark:bg-gray-900">

                {/* ── header row 1: section labels ── */}
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th rowSpan={2} className="sticky left-0 z-10 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                      Date
                    </th>

                    {visibleStores.map(s => (
                      <SectionHeader
                        key={s.id}
                        label={s.name}
                        cols={7}
                        color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                      />
                    ))}

                    {isAdmin && (
                      <SectionHeader
                        label="Online / Ecommerce"
                        cols={4}
                        color="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                      />
                    )}

                    {isAdmin && (
                      <SectionHeader
                        label="Disbursements"
                        cols={2}
                        color="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                      />
                    )}

                    {isAdmin && (
                      <SectionHeader
                        label="Day Totals"
                        cols={4}
                        color="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                      />
                    )}

                    {isAdmin && (
                      <SectionHeader
                        label="Owner"
                        cols={8}
                        color="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      />
                    )}
                  </tr>

                  {/* ── header row 2: column names ── */}
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-600">
                    {visibleStores.map(s => (
                      <>
                        <th key={`${s.id}-sale`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Sale</th>
                        <th key={`${s.id}-cash`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash</th>
                        <th key={`${s.id}-bank`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank</th>
                        <th key={`${s.id}-exon`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Ex/On</th>
                        <th key={`${s.id}-sal`}  className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Salary</th>
                        <th key={`${s.id}-cost`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cost</th>
                        <th key={`${s.id}-c2b`}  className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">→Bank</th>
                      </>
                    ))}

                    {isAdmin && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Sales</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Advance</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">SSLZC</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">COD</th>
                    </>)}

                    {isAdmin && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">SSLZC Recv'd</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Pathao Recv'd</th>
                    </>)}

                    {isAdmin && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Sale</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Final Bank</th>
                    </>)}

                    {isAdmin && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">+Cash</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Cash</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash-Cost</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">+Bank</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Bank</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank-Cost</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash Remain</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank Remain</th>
                    </>)}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((row, idx) => {
                    const isToday = row.date === new Date().toISOString().split('T')[0];
                    const rowBg = isToday
                      ? 'bg-blue-50/60 dark:bg-blue-900/10'
                      : idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/40 dark:bg-gray-800/30';

                    return (
                      <tr key={row.date} className={`${rowBg} hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors`}>

                        {/* date */}
                        <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-gray-700 text-xs bg-inherit">
                          {dayLabel(row.date)}
                          {isToday && <span className="ml-1 text-[9px] bg-blue-500 text-white rounded px-1">Today</span>}
                        </td>

                        {/* branch columns — read-only, entry via dedicated panels */}
                        {visibleStores.map(s => {
                          const b = row.branches.find(b => b.store_id === s.id);
                          if (!b) return Array.from({ length: 7 }).map((_, i) => (
                            <td key={i} className="px-2 py-1.5 text-gray-300 dark:text-gray-600 text-center">—</td>
                          ));
                          return (
                            <>
                              <StatCell key="sale" value={b.daily_sale} />
                              <StatCell key="cash" value={b.cash} />
                              <StatCell key="bank" value={b.bank} />
                              <StatCell key="exon" value={b.ex_on} />
                              <StatCell key="sal"  value={b.salary} highlight="amber" />
                              <StatCell key="cost" value={b.daily_cost} />
                              <StatCell key="c2b"  value={b.cash_to_bank} />
                            </>
                          );
                        })}

                        {/* online */}
                        {isAdmin && (<>
                          <StatCell value={row.online.daily_sales} highlight="green" />
                          <StatCell value={row.online.advance} highlight="blue" />
                          <StatCell value={row.online.online_payment} />
                          <StatCell value={row.online.cod} />
                        </>)}

                        {/* disbursements */}
                        {isAdmin && (<>
                          <StatCell value={row.disbursements.sslzc_received} highlight="blue" />
                          <StatCell value={row.disbursements.pathao_received} highlight="blue" />
                        </>)}

                        {/* day totals */}
                        {isAdmin && (<>
                          <StatCell value={row.totals.total_sale} highlight="green" />
                          <StatCell value={row.totals.cash} />
                          <StatCell value={row.totals.bank} />
                          <StatCell value={row.totals.final_bank} highlight="blue" />
                        </>)}

                        {/* owner */}
                        {isAdmin && (<>
                          <StatCell value={row.owner.cash_invest} highlight="green" />
                          <StatCell value={row.owner.total_cash} highlight="green" />
                          <StatCell value={row.owner.cash_cost} />
                          <StatCell value={row.owner.bank_invest} highlight="blue" />
                          <StatCell value={row.owner.total_bank} highlight="blue" />
                          <StatCell value={row.owner.bank_cost} />
                          <StatCell value={row.owner.cash_after_cost} highlight="green" />
                          <StatCell value={row.owner.bank_after_cost} highlight="blue" />
                        </>)}
                      </tr>
                    );
                  })}
                </tbody>

                {/* monthly totals footer */}
                {summary && (
                  <tfoot>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                      <td className="sticky left-0 z-10 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600 whitespace-nowrap">
                        Monthly Total
                      </td>

                      {visibleStores.map(s => {
                        const b = summary.branches.find(b => b.store_id === s.id);
                        return (<>
                          <td key="sale" className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.daily_sale ?? 0)}</td>
                          <td key="cash" className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.cash ?? 0)}</td>
                          <td key="bank" className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.bank ?? 0)}</td>
                          <td key="exon" className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.ex_on ?? 0)}</td>
                          <td key="sal"  className="px-2 py-2 text-right text-xs tabular-nums text-amber-600 dark:text-amber-400">{fmt(b?.salary ?? 0)}</td>
                          <td key="cost" className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.daily_cost ?? 0)}</td>
                          <td key="c2b"  className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(b?.cash_to_bank ?? 0)}</td>
                        </>);
                      })}

                      {isAdmin && (<>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">{fmt(summary.online.daily_sales)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-600 dark:text-blue-400">{fmt(summary.online.advance)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(summary.online.online_payment)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(summary.online.cod)}</td>
                      </>)}

                      {isAdmin && (<>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-600 dark:text-blue-400">{fmt(summary.disbursements.sslzc_received)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-600 dark:text-blue-400">{fmt(summary.disbursements.pathao_received)}</td>
                      </>)}

                      {isAdmin && (<>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">{fmt(summary.totals.total_sale)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(summary.totals.cash)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-800 dark:text-gray-200">{fmt(summary.totals.bank)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-700 dark:text-blue-400 font-bold">{fmt(summary.totals.final_bank)}</td>
                      </>)}

                      {isAdmin && (<>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(summary.owner.cash_invest)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">{fmt(summary.owner.total_cash)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">{fmt(summary.owner.cash_cost)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-600 dark:text-blue-400">{fmt(summary.owner.bank_invest)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-700 dark:text-blue-400 font-bold">{fmt(summary.owner.total_bank)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-rose-600 dark:text-rose-400">{fmt(summary.owner.bank_cost)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">{fmt(summary.owner.cash_after_cost)}</td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums text-blue-700 dark:text-blue-400 font-bold">{fmt(summary.owner.bank_after_cost)}</td>
                      </>)}
                    </tr>

                    {/* 4-box summary */}
                    {isAdmin && (
                      <tr>
                        <td colSpan={999} className="px-4 py-4 bg-white dark:bg-gray-900">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                            {[
                              { label: 'Total Cash Collected', value: summary.owner.total_cash, color: 'emerald' },
                              { label: 'Total Bank Deposit',   value: summary.totals.final_bank, color: 'blue' },
                              { label: 'Cash After Costs',     value: summary.owner.cash_after_cost, color: 'green' },
                              { label: 'Bank After Costs',     value: summary.owner.bank_after_cost, color: 'indigo' },
                            ].map(box => (
                              <div key={box.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">{box.label}</div>
                                <div className={`text-base font-bold tabular-nums
                                  ${box.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
                                    box.color === 'blue'    ? 'text-blue-600 dark:text-blue-400' :
                                    box.color === 'green'   ? 'text-green-600 dark:text-green-400' :
                                    'text-indigo-600 dark:text-indigo-400'}`}>
                                  ৳{Math.round(box.value).toLocaleString('en-BD')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          )}

          <div className="mt-3 text-[10px] text-gray-400 dark:text-gray-500">
            Cash = branch cash only · Bank = branch bank + online advance · Use the Admin / Branch / Owner panels to add entries
          </div>

        </main>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? <Check size={14} className="inline mr-1.5" /> : <X size={14} className="inline mr-1.5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
