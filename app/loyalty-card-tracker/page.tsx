'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import loyaltyCardService, {
  LoyaltyCustomer,
  LoyaltySettings,
  LoyaltyTransaction,
} from '@/services/loyaltyCardService';

const getError = (error: any) =>
  error?.response?.data?.message ||
  (error?.response?.data?.errors ? Object.values(error.response.data.errors).flat().join(', ') : '') ||
  error?.message ||
  'Something went wrong';

const money = (value: any) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('en-BD') : '—';

function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-900 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function LoyaltyCardTrackerPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { isRole } = useAuth() as any;
  const isAdmin = isRole?.(['super-admin', 'admin']) ?? false;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [pagination, setPagination] = useState<any>({ current_page: 1, last_page: 1, total: 0 });
  const [summary, setSummary] = useState<any>({ active_cardholders: 0, total_points_balance: 0, points_earned: 0, points_redeemed: 0, points_reversed: 0 });
  const [settings, setSettings] = useState<LoyaltySettings>({ points_per_thousand: 10, points_per_taka_discount: 10 });
  const [settingsDraft, setSettingsDraft] = useState<LoyaltySettings>({ points_per_thousand: 10, points_per_taka_discount: 10 });
  const [addOpen, setAddOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<LoyaltyCustomer | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState({
    phone: '', name: '', email: '', address: '', city: '', state: '', postal_code: '', country: 'Bangladesh', customer_type: 'counter' as 'counter' | 'social_commerce' | 'ecommerce',
  });

  const flash = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, setting] = await Promise.all([
        loyaltyCardService.listCustomers({ search: search || undefined, status, page, per_page: 20 }),
        loyaltyCardService.getSettings(),
      ]);
      const paginator = result?.customers || {};
      setCustomers(Array.isArray(paginator?.data) ? paginator.data : []);
      setPagination(paginator);
      setSummary(result?.summary || {});
      setSettings(setting);
      setSettingsDraft(setting);
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const enroll = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      await loyaltyCardService.activate(form);
      flash('success', 'Loyalty card activated successfully.');
      setAddOpen(false);
      setForm({ phone: '', name: '', email: '', address: '', city: '', state: '', postal_code: '', country: 'Bangladesh', customer_type: 'counter' });
      setPage(1);
      await load();
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setWorking(false);
    }
  };

  const deactivate = async (customer: LoyaltyCustomer) => {
    if (!window.confirm(`Deactivate the loyalty card for ${customer.name}? Existing points will remain saved.`)) return;
    setWorking(true);
    try {
      await loyaltyCardService.deactivate(customer.id);
      flash('success', 'Loyalty card deactivated. Points were preserved.');
      await load();
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setWorking(false);
    }
  };

  const openHistory = async (customer: LoyaltyCustomer) => {
    setHistoryCustomer(customer);
    setTransactions([]);
    setHistoryLoading(true);
    try {
      const result = await loyaltyCardService.transactions(customer.id, 1, 100);
      setTransactions(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveSettings = async () => {
    setWorking(true);
    try {
      const updated = await loyaltyCardService.updateSettings({
        points_per_thousand: Math.max(0, Number(settingsDraft.points_per_thousand) || 0),
        points_per_taka_discount: Math.max(1, Math.floor(Number(settingsDraft.points_per_taka_discount) || 1)),
      });
      setSettings(updated);
      setSettingsDraft(updated);
      flash('success', 'Loyalty settings updated. Previous orders keep their original earning-rate snapshots.');
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setWorking(false);
    }
  };

  const example = useMemo(() => {
    const earned = Math.floor((1000 * Number(settingsDraft.points_per_thousand || 0)) / 1000);
    const taka = Math.floor(earned / Math.max(1, Number(settingsDraft.points_per_taka_discount || 1)));
    return { earned, taka };
  }, [settingsDraft]);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="min-w-0 flex-1">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400"><Sparkles className="h-4 w-4" /> Sales & Campaign</div>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Loyalty Card Tracker</h1>
              <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Attach loyalty cards to customer phone numbers, view the full point ledger, and control future earning/redemption rates.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
              <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><UserPlus className="h-4 w-4" /> Add Loyalty Card</button>
            </div>
          </div>

          {notice && <div className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'}`}>{notice.text}</div>}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: Users, label: 'Active cardholders', value: Number(summary.active_cardholders || 0).toLocaleString() },
              { icon: CreditCard, label: 'Points currently held', value: Number(summary.total_points_balance || 0).toLocaleString() },
              { icon: Plus, label: 'Lifetime points earned', value: Number(summary.points_earned || 0).toLocaleString() },
              { icon: Sparkles, label: 'Lifetime points redeemed', value: Number(summary.points_redeemed || 0).toLocaleString() },
              { icon: RefreshCw, label: 'Earned points reversed', value: Number(summary.points_reversed || 0).toLocaleString() },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between"><span className="text-sm text-gray-500 dark:text-gray-400">{label}</span><Icon className="h-5 w-5 text-violet-500" /></div>
                <div className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-violet-500" /><h2 className="font-semibold text-gray-900 dark:text-white">Point controls</h2></div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Earning always rounds down. Discount conversion also uses whole taka only.</p>
              </div>
              {!isAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"><LockKeyhole className="h-3.5 w-3.5" /> Admin-controlled</span>}
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Points per ৳1,000
                <input disabled={!isAdmin} type="number" min="0" step="0.0001" value={settingsDraft.points_per_thousand} onChange={(e) => setSettingsDraft((v) => ({ ...v, points_per_thousand: Number(e.target.value) }))} className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:disabled:bg-gray-800" />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Points equal to ৳1 discount
                <input disabled={!isAdmin} type="number" min="1" step="1" value={settingsDraft.points_per_taka_discount} onChange={(e) => setSettingsDraft((v) => ({ ...v, points_per_taka_discount: Number(e.target.value) }))} className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:disabled:bg-gray-800" />
              </label>
              <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">At the current draft rate, a qualifying ৳1,000 purchase earns <strong>{example.earned}</strong> points, worth <strong>{money(example.taka)}</strong>.</div>
              {isAdmin && <button disabled={working} onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-gray-900"><Save className="h-4 w-4" /> Save</button>}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Current live setting: {settings.points_per_thousand} points per ৳1,000 · {settings.points_per_taka_discount} points per ৳1 discount.</p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, phone, email, or customer code" className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></div>
              <select value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"><option value="active">Active cards</option><option value="inactive">Deactivated with points</option><option value="all">All loyalty records</option></select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950/60"><tr>{['Customer', 'Contact', 'Card status', 'Point balance', 'Activated', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? <tr><td colSpan={6} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-500" /></td></tr> : customers.length === 0 ? <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-gray-500">No loyalty-card customers found.</td></tr> : customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-white">{customer.name}</div><div className="text-xs text-gray-500">{customer.customer_code || `#${customer.id}`} · {customer.customer_type.replace('_', ' ')}</div></td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300"><div>{customer.phone}</div><div className="text-xs text-gray-500">{customer.email || 'No email'}</div></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${customer.has_loyalty_card ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}><BadgeCheck className="h-3.5 w-3.5" /> {customer.has_loyalty_card ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-4 py-3 text-lg font-bold text-gray-900 dark:text-white">{Number(customer.loyalty_points_balance || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400"><div>{dateTime(customer.loyalty_card_activated_at)}</div><div className="text-xs">{customer.loyalty_card_activated_by?.name || '—'}</div></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button onClick={() => openHistory(customer)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200"><History className="h-3.5 w-3.5" /> Ledger</button>{customer.has_loyalty_card && <button disabled={working} onClick={() => deactivate(customer)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900">Deactivate</button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800"><span className="text-gray-500">{Number(pagination.total || 0).toLocaleString()} records</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} className="rounded-lg border border-gray-200 p-2 disabled:opacity-40 dark:border-gray-700"><ChevronLeft className="h-4 w-4" /></button><span className="text-gray-700 dark:text-gray-300">Page {pagination.current_page || page} of {pagination.last_page || 1}</span><button disabled={page >= Number(pagination.last_page || 1)} onClick={() => setPage((v) => v + 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-40 dark:border-gray-700"><ChevronRight className="h-4 w-4" /></button></div></div>
          </section>
        </main>
      </div>

      <Modal open={addOpen} title="Add or activate loyalty card" onClose={() => setAddOpen(false)}>
        <form onSubmit={enroll} className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">Phone is the identity key. An existing customer is updated; otherwise a new customer record is created with the optional details below.</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone *<input required value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer type<select value={form.customer_type} onChange={(e) => setForm((v) => ({ ...v, customer_type: e.target.value as any }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white"><option value="counter">Counter / POS</option><option value="social_commerce">Social commerce</option><option value="ecommerce">E-commerce</option></select></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Name<input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email<input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 md:col-span-2">Address<input value={form.address} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">City<input value={form.city} onChange={(e) => setForm((v) => ({ ...v, city: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">State / area<input value={form.state} onChange={(e) => setForm((v) => ({ ...v, state: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700">Cancel</button><button disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Activate card</button></div>
        </form>
      </Modal>

      <Modal open={!!historyCustomer} title={`Point ledger · ${historyCustomer?.name || ''}`} onClose={() => setHistoryCustomer(null)} wide>
        {historyLoading ? <div className="py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-500" /></div> : <div className="space-y-3">
          <div className="rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800"><strong>{historyCustomer?.phone}</strong> · Current balance: <strong>{Number(historyCustomer?.loyalty_points_balance || 0).toLocaleString()} points</strong></div>
          {transactions.length === 0 ? <div className="py-12 text-center text-sm text-gray-500">No point transactions yet.</div> : <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"><thead className="bg-gray-50 dark:bg-gray-800"><tr>{['Date', 'Type', 'Points', 'Balance', 'Order / basis', 'Details'].map((h) => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{transactions.map((tx) => <tr key={tx.id}><td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600 dark:text-gray-400">{dateTime(tx.created_at)}</td><td className="px-3 py-3 text-sm capitalize">{tx.type}</td><td className={`px-3 py-3 font-bold ${Number(tx.points_delta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(tx.points_delta) > 0 ? '+' : ''}{Number(tx.points_delta).toLocaleString()}</td><td className="px-3 py-3 font-medium">{Number(tx.balance_after).toLocaleString()}</td><td className="px-3 py-3 text-sm"><div>{tx.order?.order_number || '—'}</div><div className="text-xs text-gray-500">Basis {money(tx.eligible_amount)}{Number(tx.taka_discount) > 0 ? ` · Discount ${money(tx.taka_discount)}` : ''}</div></td><td className="max-w-md px-3 py-3 text-sm text-gray-600 dark:text-gray-400">{tx.description || '—'}</td></tr>)}</tbody></table></div>}
        </div>}
      </Modal>
    </div>
  );
}
