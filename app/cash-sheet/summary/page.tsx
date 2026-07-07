'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import cashSheetService, { CashSheetResponse } from '@/services/cashSheetService';
import { BarChart3, CalendarDays, Loader2, RefreshCcw, ArrowLeft, AlertCircle } from 'lucide-react';

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
  const rounded = Math.round(Number(value || 0));
  return `৳${rounded.toLocaleString('en-BD')}`;
}

function Card({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const negative = value < 0;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{money(value)}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  const negative = value < 0;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0 dark:border-gray-800">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</p>
        {note && <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      </div>
      <p className={`whitespace-nowrap text-sm font-semibold ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{money(value)}</p>
    </div>
  );
}

export default function CashSheetSummaryPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { scopedStoreId, isLoading: authLoading } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(dhakaMonthString());
  const [sheet, setSheet] = useState<CashSheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSheet = async () => {
    setLoading(true);
    setError(null);
    try {
      setSheet(await cashSheetService.getSheet(month));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, authLoading]);

  const stores = useMemo(() => {
    const list = sheet?.summary.stores || [];
    if (scopedStoreId) return list.filter((s) => Number(s.store_id) === Number(scopedStoreId));
    return list;
  }, [sheet?.summary.stores, scopedStoreId]);

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <BarChart3 size={22} className="text-emerald-600" />
                <h1 className="text-2xl font-bold">Cash Sheet Summary</h1>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Month-level totals generated from the same fresh live cash-sheet endpoint.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white">
                <CalendarDays size={16} className="text-gray-500" />
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-transparent outline-none" />
              </label>
              <button onClick={loadSheet} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                Refresh
              </button>
              <Link href="/cash-sheet" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                <ArrowLeft size={16} /> Monthly Sheet
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
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card label="Total Sale" value={sheet.summary.totals.sale} sub="Branch + online order value" />
                <Card label="Cash Remain" value={sheet.summary.totals.cash} sub="After salary, costs, cash-to-bank" />
                <Card label="Final Bank" value={sheet.summary.totals.final_bank} sub="Bank + SSLZC + Pathao received" />
                <Card label="Owner Bank After Cost" value={sheet.summary.owner.bank_after_cost} sub="Final bank + owner bank invest - owner bank cost" />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="mb-3 font-semibold text-gray-900 dark:text-white">Business Movement</h2>
                  <Row label="Branch Sale" value={sheet.summary.totals.branch_sale} />
                  <Row label="Online Sale" value={sheet.summary.online.daily_sales} />
                  <Row label="Branch Cash" value={sheet.summary.totals.cash} note="Negative means visible shortage" />
                  <Row label="Bank Before Disbursement" value={sheet.summary.totals.bank} />
                  <Row label="Final Bank" value={sheet.summary.totals.final_bank} />
                  <Row label="Daily Cost" value={sheet.summary.totals.daily_cost} />
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="mb-3 font-semibold text-gray-900 dark:text-white">Online / Courier / Gateway</h2>
                  <Row label="Online Advance" value={sheet.summary.online.advance} note="Social-commerce non-COD money received" />
                  <Row label="SSLZC Visible Payment" value={sheet.summary.online.online_payment} note="Receivable until settlement received" />
                  <Row label="COD / Due" value={sheet.summary.online.cod} note="COD due + collected - COD refunds" />
                  <Row label="COD Due" value={sheet.summary.online.cod_due} />
                  <Row label="COD Collected" value={sheet.summary.online.cod_collected} />
                  <Row label="Online Refunds" value={sheet.summary.online.refunds} />
                  <Row label="SSLZC Received" value={sheet.summary.disbursements.sslzc_received} />
                  <Row label="Pathao Received" value={sheet.summary.disbursements.pathao_received} />
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <h2 className="mb-3 font-semibold text-gray-900 dark:text-white">Owner Section</h2>
                  <Row label="Owner Cash Investment" value={sheet.summary.owner.cash_invest} />
                  <Row label="Owner Bank Investment" value={sheet.summary.owner.bank_invest} />
                  <Row label="Owner Cash Cost" value={sheet.summary.owner.cash_cost} />
                  <Row label="Owner Bank Cost" value={sheet.summary.owner.bank_cost} />
                  <Row label="Owner Cash After Cost" value={sheet.summary.owner.cash_after_cost} />
                  <Row label="Owner Bank After Cost" value={sheet.summary.owner.bank_after_cost} />
                </section>
              </div>

              <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">Branch Summary</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Branch</th>
                        <th className="px-3 py-2 text-right">Sale</th>
                        <th className="px-3 py-2 text-right">Raw Cash</th>
                        <th className="px-3 py-2 text-right">Cash</th>
                        <th className="px-3 py-2 text-right">Raw Bank</th>
                        <th className="px-3 py-2 text-right">Bank</th>
                        <th className="px-3 py-2 text-right">Ex/On</th>
                        <th className="px-3 py-2 text-right">Salary</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">→Bank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {stores.map((store) => (
                        <tr key={store.store_id}>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{store.store_name}</td>
                          <td className="px-3 py-2 text-right">{money(store.daily_sale)}</td>
                          <td className="px-3 py-2 text-right">{money(store.raw_cash)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${store.cash < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{money(store.cash)}</td>
                          <td className="px-3 py-2 text-right">{money(store.raw_bank)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{money(store.bank)}</td>
                          <td className="px-3 py-2 text-right">{money(store.ex_on)}</td>
                          <td className="px-3 py-2 text-right">{money(store.salary)}</td>
                          <td className="px-3 py-2 text-right">{money(store.daily_cost)}</td>
                          <td className="px-3 py-2 text-right">{money(store.cash_to_bank)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
