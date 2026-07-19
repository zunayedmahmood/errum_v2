'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgePercent,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import paymentCommissionService, {
  CommissionPaymentMethod,
  CommissionRateHistory,
  CommissionRefundPolicy,
  CommissionReportEntry,
  CommissionReportResponse,
} from '@/services/paymentCommissionService';

const money = (value: number) => `৳${Number(value || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value: number) => `${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 4 })}%`;

function dhakaDate(offsetMonths = 0, end = false) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const date = new Date(Number(parts.year), Number(parts.month) - 1 + offsetMonths, end ? 0 : 1);
  if (end) date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const todayDhaka = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const policyLabel = (policy: CommissionRefundPolicy) =>
  policy === 'reverse_proportionally' ? 'Reverse proportionally' : 'Keep original commission';

function methodOf(entry: CommissionReportEntry) {
  return entry.payment_method ?? entry.paymentMethod ?? null;
}

export default function PaymentCommissionsPage() {
  const router = useRouter();
  const { darkMode, setDarkMode } = useTheme();
  const auth = useAuth() as any;
  const role = String(auth?.role || auth?.user?.role?.slug || '').replace('_', '-').toLowerCase();
  const authorized = ['admin', 'super-admin', 'superadmin'].includes(role);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'settings' | 'report'>('settings');
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [methods, setMethods] = useState<CommissionPaymentMethod[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [editingMethod, setEditingMethod] = useState<CommissionPaymentMethod | null>(null);
  const [editingRate, setEditingRate] = useState<CommissionRateHistory | null>(null);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const [report, setReport] = useState<CommissionReportResponse | null>(null);
  const [filters, setFilters] = useState({
    date_from: dhakaDate(),
    date_to: todayDhaka(),
    store_id: '',
    payment_method_id: '',
    channel_code: '',
    status: 'active',
    search: '',
    page: 1,
    per_page: 50,
  });
  const [form, setForm] = useState({
    channel_code: 'default',
    percentage_rate: '0',
    effective_from: todayDhaka(),
    is_active: true,
    refund_policy: 'keep_original' as CommissionRefundPolicy,
    notes: '',
  });

  useEffect(() => {
    if (!auth?.isLoading && !authorized) router.replace('/dashboard');
  }, [auth?.isLoading, authorized, router]);

  const notify = (message: string, ok = true) => {
    setToast({ message, ok });
    window.setTimeout(() => setToast(null), 3000);
  };

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const response = await paymentCommissionService.getSettings();
      setMethods(response.payment_methods || []);
    } catch (error: any) {
      notify(error?.response?.data?.message || 'Could not load payment commission settings.', false);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadReport = useCallback(async (page = filters.page) => {
    setLoadingReport(true);
    try {
      const response = await paymentCommissionService.getReport({ ...filters, page });
      setReport(response);
      if (page !== filters.page) setFilters((current) => ({ ...current, page }));
    } catch (error: any) {
      notify(error?.response?.data?.message || 'Could not load payment commission report.', false);
    } finally {
      setLoadingReport(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!auth?.isLoading && authorized) loadSettings();
  }, [auth?.isLoading, authorized, loadSettings]);

  useEffect(() => {
    if (tab === 'report' && authorized && !report) loadReport(1);
  }, [tab, authorized, report, loadReport]);

  const openCreate = (method: CommissionPaymentMethod) => {
    setEditingMethod(method);
    setEditingRate(null);
    setForm({
      channel_code: 'default',
      percentage_rate: String(method.is_commissionable ? (method.current_rate || 0) : 0),
      effective_from: todayDhaka(),
      is_active: true,
      refund_policy: method.current_refund_policy || 'keep_original',
      notes: '',
    });
  };

  const openEdit = (method: CommissionPaymentMethod, rate: CommissionRateHistory) => {
    setEditingMethod(method);
    setEditingRate(rate);
    setForm({
      channel_code: rate.channel_code || 'default',
      percentage_rate: String(rate.percentage_rate),
      effective_from: rate.effective_from,
      is_active: rate.is_active,
      refund_policy: rate.refund_policy,
      notes: rate.notes || '',
    });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditingMethod(null);
    setEditingRate(null);
  };

  const saveSetting = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMethod) return;
    const rate = Number(form.percentage_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      notify('Commission rate must be between 0 and 100.', false);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        channel_code: form.channel_code || 'default',
        percentage_rate: editingMethod.is_commissionable ? rate : 0,
        effective_from: form.effective_from,
        is_active: form.is_active,
        refund_policy: form.refund_policy,
        notes: form.notes.trim(),
      };
      if (editingRate) {
        await paymentCommissionService.updateSetting(editingRate.id, payload);
      } else {
        await paymentCommissionService.createSetting({ payment_method_id: editingMethod.id, ...payload });
      }
      notify(editingRate ? 'Commission setting updated.' : 'New effective-dated commission rate created.');
      closeEditor();
      await loadSettings();
      if (report) await loadReport(1);
    } catch (error: any) {
      const errors = error?.response?.data?.errors;
      const firstError = errors ? Object.values(errors).flat()[0] : null;
      notify(String(firstError || error?.response?.data?.message || 'Could not save commission setting.'), false);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (rate: CommissionRateHistory) => {
    if (!window.confirm(`Deactivate the rate effective ${rate.effective_from}? Historical payment snapshots will remain unchanged.`)) return;
    try {
      await paymentCommissionService.deactivateSetting(rate.id);
      notify('Commission setting deactivated.');
      await loadSettings();
    } catch (error: any) {
      notify(error?.response?.data?.message || 'Could not deactivate setting.', false);
    }
  };

  const currentTotal = useMemo(() => methods.filter((method) => method.channel_profiles?.some((profile) => profile.current_rate > 0) || method.current_rate > 0).length, [methods]);

  if (!authorized && !auth?.isLoading) return null;

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-400">
                  <BadgePercent size={15} /> Accounting control
                </div>
                <h1 className="text-2xl font-bold text-gray-950 dark:text-white">Payment Commissions</h1>
                <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                  Configure effective-dated processor rates. Orders remain at gross sale value; Monthly Sheet and accounting record the net bank receipt and processing expense separately.
                </p>
              </div>
              <button
                onClick={() => tab === 'settings' ? loadSettings() : loadReport(filters.page)}
                disabled={loadingSettings || loadingReport}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:border-cyan-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <RefreshCw size={15} className={loadingSettings || loadingReport ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <button
                onClick={() => setTab('settings')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'settings' ? 'bg-gray-950 text-white dark:bg-cyan-400 dark:text-gray-950' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
              >
                <Settings2 size={15} /> Rate Settings
              </button>
              <button
                onClick={() => setTab('report')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'report' ? 'bg-gray-950 text-white dark:bg-cyan-400 dark:text-gray-950' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
              >
                <FileBarChart2 size={15} /> Commission Report
              </button>
            </div>

            {tab === 'settings' ? (
              <section>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <SummaryCard label="Payment methods" value={String(methods.length)} detail="All configured ERP methods" />
                  <SummaryCard label="Charging commission" value={String(currentTotal)} detail="Methods with a current rate above 0%" />
                  <SummaryCard label="Snapshot rule" value="Locked" detail="Rate changes never rewrite old payments" />
                </div>

                {loadingSettings && methods.length === 0 ? (
                  <LoadingBlock label="Loading commission settings…" />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800/70">
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <th className="px-4 py-3">Payment method</th>
                            <th className="px-4 py-3 text-right">Current rate</th>
                            <th className="px-4 py-3">Effective from</th>
                            <th className="px-4 py-3">Refund policy</th>
                            <th className="px-4 py-3 text-center">History</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {methods.map((method) => (
                            <MethodRows
                              key={method.id}
                              method={method}
                              expanded={Boolean(expanded[method.id])}
                              onToggle={() => setExpanded((current) => ({ ...current, [method.id]: !current[method.id] }))}
                              onCreate={() => openCreate(method)}
                              onEdit={(rate) => openEdit(method, rate)}
                              onDeactivate={deactivate}
                            />
                          ))}
                          {!methods.length && (
                            <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No payment methods found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section>
                <form
                  onSubmit={(event) => { event.preventDefault(); loadReport(1); }}
                  className="mb-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-8 dark:border-gray-700 dark:bg-gray-900"
                >
                  <Field label="From"><input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value, page: 1 })} className="input" /></Field>
                  <Field label="To"><input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value, page: 1 })} className="input" /></Field>
                  <Field label="Store">
                    <select value={filters.store_id} onChange={(e) => setFilters({ ...filters, store_id: e.target.value, page: 1 })} className="input">
                      <option value="">All stores</option>
                      {(report?.stores || []).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Method">
                    <select value={filters.payment_method_id} onChange={(e) => setFilters({ ...filters, payment_method_id: e.target.value, page: 1 })} className="input">
                      <option value="">All methods</option>
                      {(report?.payment_methods || []).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Provider">
                    <select value={filters.channel_code} onChange={(e) => setFilters({ ...filters, channel_code: e.target.value, page: 1 })} className="input">
                      <option value="">All providers</option><option value="default">Default</option><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} className="input">
                      <option value="all">All statuses</option><option value="active">Active</option><option value="reversed">Reversed</option><option value="cancelled">Cancelled</option>
                    </select>
                  </Field>
                  <Field label="Invoice / method">
                    <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-gray-400" /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} placeholder="Search…" className="input pl-9" /></div>
                  </Field>
                  <div className="flex items-end"><button type="submit" disabled={loadingReport} className="h-[38px] w-full rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50 dark:bg-cyan-400 dark:text-gray-950">Apply</button></div>
                </form>

                {loadingReport && !report ? <LoadingBlock label="Loading commission report…" /> : report && (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      <SummaryCard label="Gross collected" value={money(report.summary.gross_amount)} detail="Before processor fees" />
                      <SummaryCard label="Original commission" value={money(report.summary.commission_amount)} detail="Gross processor expense" />
                      <SummaryCard label="Commission reversed" value={money(report.summary.reversed_commission_amount)} detail="Returned under refund policy" />
                      <SummaryCard label="Net commission" value={money(report.summary.net_commission_amount)} detail="Expense retained" />
                      <SummaryCard label="Net received" value={money(report.summary.net_amount)} detail="Cash-sheet bank value" />
                      <SummaryCard label="Effective rate" value={percent(report.summary.effective_rate)} detail={`${report.summary.entries_count} instrument entries`} />
                    </div>

                    {report.by_method.length > 0 && (
                      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {report.by_method.map((row) => {
                          const method = row.payment_method ?? row.paymentMethod;
                          return <div key={`${row.payment_method_id}-${row.channel_code}`} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{method?.name || `Method #${row.payment_method_id}`}<span className="ml-2 text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400">{row.channel_code === 'default' ? 'Default' : row.channel_code}</span></div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div><div className="text-gray-400">Gross</div><div className="font-semibold text-gray-800 dark:text-gray-200">{money(row.gross_amount)}</div></div>
                              <div><div className="text-gray-400">Commission</div><div className="font-semibold text-rose-600 dark:text-rose-400">{money(row.commission_amount)}</div></div>
                              <div className="col-span-2"><div className="text-gray-400">Net received</div><div className="font-semibold text-emerald-600 dark:text-emerald-400">{money(row.net_amount)}</div></div>
                            </div>
                          </div>;
                        })}
                      </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                      <div className="overflow-x-auto">
                        <table className="min-w-[1180px] w-full divide-y divide-gray-200 text-xs dark:divide-gray-700">
                          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                            <tr><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-left">Invoice</th><th className="px-3 py-3 text-left">Store</th><th className="px-3 py-3 text-left">Method</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">Rate</th><th className="px-3 py-3 text-right">Commission</th><th className="px-3 py-3 text-right">Reversed</th><th className="px-3 py-3 text-right">Net fee</th><th className="px-3 py-3 text-right">Net received</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Journal</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {report.entries.data.map((entry) => {
                              const method = methodOf(entry);
                              const journal = entry.accounting_transaction ?? entry.accountingTransaction;
                              return <tr key={entry.id} className="hover:bg-cyan-50/40 dark:hover:bg-cyan-900/10">
                                <td className="px-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{String(entry.business_date).slice(0, 10)}</td>
                                <td className="px-3 py-3 font-semibold text-gray-900 dark:text-white">{entry.order?.order_number || `#${entry.order?.id || entry.id}`}</td>
                                <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{entry.store?.name || '—'}</td>
                                <td className="px-3 py-3"><span className="rounded bg-gray-100 px-2 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{method?.name || 'Unknown'}{entry.channel_code && entry.channel_code !== 'default' ? ` · ${entry.channel_code}` : ''}</span></td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(entry.gross_amount)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{percent(entry.commission_rate)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400">{money(entry.commission_amount)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-blue-600 dark:text-blue-400">{money(entry.reversed_commission_amount)}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-semibold">{money(entry.net_commission_amount)}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{money(entry.net_amount)}</td>
                                <td className="px-3 py-3"><StatusBadge status={entry.status} /></td>
                                <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{journal?.transaction_number || '—'}</td>
                              </tr>;
                            })}
                            {!report.entries.data.length && <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">No commission entries match these filters.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                        <span className="text-gray-500 dark:text-gray-400">Showing {report.entries.from || 0}–{report.entries.to || 0} of {report.entries.total}</span>
                        <div className="flex items-center gap-2">
                          <button disabled={report.entries.current_page <= 1 || loadingReport} onClick={() => loadReport(report.entries.current_page - 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-30 dark:border-gray-700"><ChevronLeft size={15} /></button>
                          <span className="text-xs text-gray-600 dark:text-gray-300">Page {report.entries.current_page} of {report.entries.last_page}</span>
                          <button disabled={report.entries.current_page >= report.entries.last_page || loadingReport} onClick={() => loadReport(report.entries.current_page + 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-30 dark:border-gray-700"><ChevronRight size={15} /></button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      {editingMethod && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}>
          <form onSubmit={saveSetting} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><div className="text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">{editingRate ? 'Edit historical setting' : 'Create effective rate'}</div><h2 className="mt-1 text-xl font-bold text-gray-950 dark:text-white">{editingMethod.name}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">New rates affect new or subsequently edited payments only.</p></div>
              <button type="button" onClick={closeEditor} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider / channel">
                <select value={form.channel_code} onChange={(e) => setForm({ ...form, channel_code: e.target.value })} className="input" disabled={Boolean(editingRate)}>
                  {(editingMethod.channel_profiles?.length ? editingMethod.channel_profiles : [{ channel_code: 'default', channel_label: 'Default / all providers' } as any]).map((profile: any) => <option key={profile.channel_code} value={profile.channel_code}>{profile.channel_label}</option>)}
                </select>
              </Field>
              <Field label="Commission percentage"><div className="relative"><input type="number" min="0" max="100" step="0.0001" disabled={!editingMethod.is_commissionable} value={!editingMethod.is_commissionable ? '0' : form.percentage_rate} onChange={(e) => setForm({ ...form, percentage_rate: e.target.value })} required className="input pr-10" /><span className="absolute right-3 top-2 text-sm text-gray-400">%</span></div></Field>
              <Field label="Effective from"><input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} required className="input" /></Field>
              <Field label="Refund policy"><select value={form.refund_policy} onChange={(e) => setForm({ ...form, refund_policy: e.target.value as CommissionRefundPolicy })} className="input"><option value="keep_original">Keep original commission</option><option value="reverse_proportionally">Reverse proportionally</option></select></Field>
              <Field label="Status"><select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })} className="input"><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
              <div className="sm:col-span-2"><Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Reason, provider agreement, or settlement note…" className="input h-auto resize-y" /></Field></div>
            </div>
            {!editingMethod.is_commissionable && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Cash, store credit, gift credit and exchange-balance methods remain at 0% because no external processor deducts money from them.</div>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeEditor} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-cyan-400 dark:text-gray-950">{saving && <Loader2 size={14} className="animate-spin" />}{editingRate ? 'Save changes' : 'Create rate'}</button></div>
          </form>
        </div>
      )}

      {toast && <div className={`fixed bottom-5 right-5 z-[120] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>{toast.ok ? <Check size={16} /> : <X size={16} />}{toast.message}</div>}
      <style jsx global>{`.input{width:100%;border-radius:.5rem;border:1px solid rgb(229 231 235);background:white;padding:.5rem .75rem;font-size:.875rem;color:rgb(17 24 39);outline:none}.input:focus{border-color:rgb(6 182 212);box-shadow:0 0 0 2px rgb(6 182 212 / .12)}.dark .input{border-color:rgb(55 65 81);background:rgb(17 24 39);color:rgb(243 244 246)}`}</style>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div><div className="mt-1 text-xl font-bold text-gray-950 dark:text-white">{value}</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</div></div>;
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="flex h-56 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900"><Loader2 size={20} className="mr-2 animate-spin" />{label}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>{children}</label>;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : status === 'reversed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}

function MethodRows({ method, expanded, onToggle, onCreate, onEdit, onDeactivate }: {
  method: CommissionPaymentMethod;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  onEdit: (rate: CommissionRateHistory) => void;
  onDeactivate: (rate: CommissionRateHistory) => void;
}) {
  return <>
    <tr className="hover:bg-cyan-50/30 dark:hover:bg-cyan-900/10">
      <td className="px-4 py-4"><div className="font-semibold text-gray-950 dark:text-white">{method.name}</div><div className="mt-0.5 text-xs text-gray-400">{method.code} · {method.type}{!method.is_commissionable ? ' · no processor fee' : ''}</div>{method.channel_profiles?.some((profile) => profile.channel_code !== 'default') && <div className="mt-2 flex flex-wrap gap-1">{method.channel_profiles.filter((profile) => profile.channel_code !== 'default').map((profile) => <span key={profile.channel_code} className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300">{profile.channel_label}: {percent(profile.current_rate)}{profile.uses_default_fallback ? ' *' : ''}</span>)}</div>}</td>
      <td className="px-4 py-4 text-right"><span className={`rounded-lg px-2.5 py-1 text-sm font-bold ${method.current_rate > 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>{percent(method.current_rate)}</span></td>
      <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{method.current_effective_from || 'Fallback / not dated'}</td>
      <td className="px-4 py-4 text-xs text-gray-600 dark:text-gray-300">{policyLabel(method.current_refund_policy)}</td>
      <td className="px-4 py-4 text-center"><button onClick={onToggle} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"><History size={13} />{method.rates.length}<ChevronDown size={13} className={`transition ${expanded ? 'rotate-180' : ''}`} /></button></td>
      <td className="px-4 py-4 text-right"><button onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-600 dark:bg-cyan-400 dark:text-gray-950"><Plus size={13} />New rate</button></td>
    </tr>
    {expanded && <tr><td colSpan={6} className="bg-gray-50 px-4 py-4 dark:bg-gray-950/40"><div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"><table className="w-full text-xs"><thead className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-800"><tr><th className="px-3 py-2 text-left">Provider</th><th className="px-3 py-2 text-left">Effective</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-left">Refund policy</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Changed by</th><th className="px-3 py-2 text-left">Notes</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">{method.rates.map((rate) => <tr key={rate.id}><td className="px-3 py-2.5 font-semibold uppercase text-cyan-700 dark:text-cyan-300">{rate.channel_code === 'default' ? 'Default' : rate.channel_code}</td><td className="px-3 py-2.5"><CalendarDays size={12} className="mr-1 inline text-gray-400" />{rate.effective_from}</td><td className="px-3 py-2.5 text-right font-semibold">{percent(rate.percentage_rate)}</td><td className="px-3 py-2.5">{policyLabel(rate.refund_policy)}</td><td className="px-3 py-2.5"><StatusBadge status={rate.is_active ? 'active' : 'cancelled'} /></td><td className="px-3 py-2.5 text-gray-500">{rate.updated_by || rate.created_by || 'System'}</td><td className="max-w-xs truncate px-3 py-2.5 text-gray-500" title={rate.notes || ''}>{rate.notes || '—'}</td><td className="px-3 py-2.5 text-right"><button onClick={() => onEdit(rate)} className="mr-1 rounded p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Edit"><Pencil size={13} /></button>{rate.is_active && <button onClick={() => onDeactivate(rate)} className="rounded p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Deactivate"><X size={13} /></button>}</td></tr>)}{!method.rates.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No rate history yet.</td></tr>}</tbody></table></div></td></tr>}
  </>;
}
