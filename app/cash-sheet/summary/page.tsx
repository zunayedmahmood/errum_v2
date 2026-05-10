'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, BarChart3, X } from 'lucide-react';
import cashSheetService, { CashSheetRow, CashSheetSummary, DayEntries } from '@/services/cashSheetService';

const fmt  = (n: number) => n === 0 ? '—' : '৳' + Math.round(n).toLocaleString('en-BD');
const fmtV = (n: number) => '৳' + Math.round(n).toLocaleString('en-BD');

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function prevMonth(m: string) {
  const [y,mo]=m.split('-').map(Number); const d=new Date(y,mo-2,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMonth(m: string) {
  const [y,mo]=m.split('-').map(Number); const d=new Date(y,mo,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthLabel(m: string) {
  const [y,mo]=m.split('-').map(Number);
  return new Date(y,mo-1,1).toLocaleDateString('en-BD',{month:'long',year:'numeric'});
}
function dayLabel(d: string) {
  return new Date(d).toLocaleDateString('en-BD',{day:'2-digit',month:'short',weekday:'short'});
}

const ADMIN_TYPE_LABELS: Record<string, string> = {
  salary_setaside: 'Salary/Rent Set-aside',
  cash_to_bank:    'Cash → Bank',
  sslzc:           'SSLZC Disbursement',
  pathao:          'Pathao Disbursement',
};
const OWNER_TYPE_LABELS: Record<string, string> = {
  cash_invest: 'Cash Investment',
  bank_invest: 'Bank Investment',
  cash_cost:   'Cash Spending',
  bank_cost:   'Bank Spending',
};

// Detail drawer for one day
function DayDetailDrawer({ date, onClose }: { date: string; onClose: () => void }) {
  const [data, setData]       = useState<DayEntries | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cashSheetService.getEntries(date).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [date]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full md:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{dayLabel(date)}</h2>
            <p className="text-xs text-gray-400 mt-0.5">All entries for this day</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading entries…
            </div>
          ) : (
            <>
              {/* Branch costs */}
              {data && data.branch_costs.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-2">Branch Costs</h3>
                  <ul className="space-y-2">
                    {data.branch_costs.map(e => (
                      <li key={e.id} className="flex items-start justify-between gap-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{fmtV(Number(e.amount))}</span>
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded px-1.5">{e.store?.name}</span>
                          </div>
                          {e.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{e.details}</p>}
                          <p className="text-[10px] text-gray-400 mt-0.5">{e.created_by?.name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Admin entries */}
              {data && data.admin_entries.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">Admin Entries</h3>
                  <ul className="space-y-2">
                    {data.admin_entries.map(e => (
                      <li key={e.id} className="flex items-start justify-between gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2.5">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{fmtV(Number(e.amount))}</span>
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded px-1.5">{ADMIN_TYPE_LABELS[e.type]}</span>
                            {e.store && <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 rounded px-1.5">{e.store.name}</span>}
                          </div>
                          {e.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{e.details}</p>}
                          <p className="text-[10px] text-gray-400 mt-0.5">{e.created_by?.name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Owner entries */}
              {data && data.owner_entries.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">Owner Entries</h3>
                  <ul className="space-y-2">
                    {data.owner_entries.map(e => (
                      <li key={e.id} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                        e.type.includes('invest') ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold ${e.type.includes('invest') ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                              {fmtV(Number(e.amount))}
                            </span>
                            <span className={`text-[10px] rounded px-1.5 ${
                              e.type.includes('invest')
                                ? 'bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-800 text-rose-600 dark:text-rose-300'
                            }`}>{OWNER_TYPE_LABELS[e.type]}</span>
                          </div>
                          {e.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{e.details}</p>}
                          <p className="text-[10px] text-gray-400 mt-0.5">{e.created_by?.name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data && data.branch_costs.length === 0 && data.admin_entries.length === 0 && data.owner_entries.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No manual entries for this day.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Summary row card
function SummaryRow({ row, stores, onClick }: { row: CashSheetRow; stores: {id:number;name:string;is_warehouse?:boolean}[]; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isToday = row.date === new Date().toISOString().split('T')[0];
  const branchCostTotal = row.branches.reduce((sum, branch) => sum + Number(branch.daily_cost || 0), 0);

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border ${isToday ? 'border-blue-300 dark:border-blue-600' : 'border-gray-200 dark:border-gray-700'} overflow-hidden`}>
      {/* main row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="text-center min-w-[44px]">
            <div className={`text-base font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
              {new Date(row.date).getDate()}
            </div>
            <div className="text-[10px] text-gray-400 uppercase">
              {new Date(row.date).toLocaleDateString('en-BD',{weekday:'short'})}
            </div>
          </div>
          <div className="h-10 w-px bg-gray-100 dark:bg-gray-700" />
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {row.totals.total_sale > 0 ? fmt(row.totals.total_sale) : <span className="text-gray-300 dark:text-gray-600 font-normal">No sales</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {row.totals.cash > 0    && <span className="text-[11px] text-gray-500 dark:text-gray-400">Cash {fmt(row.totals.cash)}</span>}
              {row.totals.bank > 0    && <span className="text-[11px] text-gray-500 dark:text-gray-400">Bank {fmt(row.totals.bank)}</span>}
              {row.totals.final_bank > row.totals.bank && (
                <span className="text-[11px] text-blue-500">Final Bank {fmt(row.totals.final_bank)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* flags */}
          <div className="flex flex-col items-end gap-1">
            {row.owner.cash_invest + row.owner.bank_invest > 0 && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                +{fmt(row.owner.cash_invest + row.owner.bank_invest)} invested
              </span>
            )}
            {row.owner.cash_cost + row.owner.bank_cost > 0 && (
              <span className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded">
                −{fmt(row.owner.cash_cost + row.owner.bank_cost)} spent
              </span>
            )}
            {branchCostTotal > 0 && (
              <span className="text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">
                −{fmt(branchCostTotal)} branch cost
              </span>
            )}
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* expanded branch detail */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
          {/* per-branch */}
          <div className="grid grid-cols-1 gap-2">
            {row.branches.filter(b => b.daily_sale > 0 || b.cash > 0 || b.bank > 0 || b.daily_cost > 0 || b.salary > 0 || b.cash_to_bank > 0).map(b => (
              <div key={b.store_id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-indigo-600 dark:text-indigo-400 w-28 flex-shrink-0">{b.store_name}</span>
                <div className="flex items-center gap-4 text-gray-600 dark:text-gray-400">
                  <span>Sale {fmt(b.daily_sale)}</span>
                  {b.cash > 0 && <span>Cash {fmt(b.cash)}</span>}
                  {b.bank > 0 && <span>Bank {fmt(b.bank)}</span>}
                  {b.salary > 0 && <span className="text-amber-600 dark:text-amber-400">Salary {fmt(b.salary)}</span>}
                  {b.daily_cost > 0 && <span className="text-rose-500">Cost {fmt(b.daily_cost)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* online */}
          {row.online.daily_sales > 0 && (
            <div className="flex items-center justify-between text-xs text-violet-600 dark:text-violet-400">
              <span className="font-medium w-28 flex-shrink-0">Online</span>
              <div className="flex items-center gap-4">
                <span>Sale {fmt(row.online.daily_sales)}</span>
                {row.online.advance > 0 && <span>Adv {fmt(row.online.advance)}</span>}
                {row.online.online_payment > 0 && <span>SSLZC {fmt(row.online.online_payment)}</span>}
                {row.online.cod > 0 && <span>COD {fmt(row.online.cod)}</span>}
              </div>
            </div>
          )}

          {/* disbursements */}
          {(row.disbursements.sslzc_received > 0 || row.disbursements.pathao_received > 0) && (
            <div className="flex items-center gap-4 text-xs text-teal-600 dark:text-teal-400">
              {row.disbursements.sslzc_received  > 0 && <span>SSLZC recv {fmt(row.disbursements.sslzc_received)}</span>}
              {row.disbursements.pathao_received > 0 && <span>Pathao recv {fmt(row.disbursements.pathao_received)}</span>}
            </div>
          )}

          {/* see full details button */}
          <button
            onClick={onClick}
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium mt-1"
          >
            See all manual entries →
          </button>
        </div>
      )}
    </div>
  );
}

export default function SummaryPanel() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = role === 'admin' || role === 'super-admin';
  useEffect(() => { if (!authLoading && !isAdmin) router.push('/dashboard'); }, [authLoading, isAdmin]);

  const [month, setMonth]     = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState<CashSheetRow[]>([]);
  const [summary, setSummary] = useState<CashSheetSummary | null>(null);
  const [stores, setStores]   = useState<{id:number;name:string}[]>([]);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cashSheetService.getSheet(month);
      setRows(res.data);
      setSummary(res.summary);
      setStores(res.stores);
    } catch {} finally { setLoading(false); }
  }, [month]);

  useEffect(() => { if (!authLoading && isAdmin) load(); }, [month, authLoading, isAdmin]);

  const activeRows = rows.filter(r =>
    r.totals.total_sale > 0 ||
    r.disbursements.sslzc_received > 0 ||
    r.disbursements.pathao_received > 0 ||
    r.owner.cash_invest > 0 ||
    r.owner.bank_invest > 0 ||
    r.owner.cash_cost > 0 ||
    r.owner.bank_cost > 0 ||
    r.branches.some(b => Number(b.daily_cost) > 0 || Number(b.salary) > 0 || Number(b.cash_to_bank) > 0)
  );

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col">
        <Header toggleSidebar={() => setSidebarOpen(true)} darkMode={darkMode} setDarkMode={setDarkMode} />
        <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">

          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 size={20} className="text-teal-500" /> Cash Summary
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Simplified daily overview. Click any day for full details.</p>
            </div>
            <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5">
              <button onClick={() => setMonth(prevMonth(month))} className="p-1 hover:text-blue-500"><ChevronLeft size={16} /></button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px] text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(nextMonth(month))} disabled={month >= currentMonth()} className="p-1 hover:text-blue-500 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>

          {/* monthly summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Sales',    value: summary.totals.total_sale, color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Total Cash',     value: summary.owner.total_cash,  color: 'text-gray-700 dark:text-gray-200' },
                { label: 'Total Bank',     value: summary.owner.total_bank,  color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Net After Costs',value: summary.owner.cash_after_cost + summary.owner.bank_after_cost, color: 'text-teal-600 dark:text-teal-400' },
              ].map(card => (
                <div key={card.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div className="text-[11px] text-gray-400 mb-1">{card.label}</div>
                  <div className={`text-base font-bold tabular-nums ${card.color}`}>{fmtV(card.value)}</div>
                </div>
              ))}
            </div>
          )}

          {/* day rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={22} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-2">
              {activeRows.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                  No activity yet for {monthLabel(month)}.
                </div>
              )}
              {activeRows.map(row => (
                <SummaryRow
                  key={row.date}
                  row={row}
                  stores={stores}
                  onClick={() => setDetailDate(row.date)}
                />
              ))}
            </div>
          )}

        </main>
      </div>

      {detailDate && <DayDetailDrawer date={detailDate} onClose={() => setDetailDate(null)} />}
    </div>
  );
}
