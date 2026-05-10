'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { Plus, Trash2, Loader2, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import cashSheetService, { AdminEntry, AdminEntryType } from '@/services/cashSheetService';
import storeService, { Store } from '@/services/storeService';

const ENTRY_TYPES: { value: AdminEntryType; label: string; color: string; needsStore: boolean; desc: string }[] = [
  { value: 'salary_setaside', label: 'Salary / Rent Set-aside', color: 'amber',  needsStore: true,  desc: 'Amount kept aside from branch cash for monthly salary & rent' },
  { value: 'cash_to_bank',    label: 'Cash → Bank Transfer',    color: 'blue',   needsStore: true,  desc: 'Cash physically moved from branch to bank account' },
  { value: 'sslzc',           label: 'SSLZC Disbursement',      color: 'violet', needsStore: false, desc: 'SSLCommerz payment received into bank account' },
  { value: 'pathao',          label: 'Pathao Disbursement',      color: 'orange', needsStore: false, desc: 'Pathao courier payment received into bank account' },
];

const colorMap: Record<string, string> = {
  amber:  'bg-amber-50  dark:bg-amber-900/20  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-700',
  blue:   'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-700',
  violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
};

const typeMeta = Object.fromEntries(ENTRY_TYPES.map(t => [t.value, t]));

export default function AdminPanel() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = role === 'admin' || role === 'super-admin';
  useEffect(() => { if (!authLoading && !isAdmin) router.push('/dashboard'); }, [authLoading, isAdmin]);

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [type, setType]       = useState<AdminEntryType>('salary_setaside');
  const [storeId, setStoreId] = useState<number | ''>('');
  const [amount, setAmount]   = useState('');
  const [details, setDetails] = useState('');
  const [stores, setStores]   = useState<Store[]>([]);
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    storeService.getAllStores().then((list: Store[]) => {
      setStores(list);
      if (list.length) setStoreId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => { if (date) loadEntries(); }, [date]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await cashSheetService.getEntries(date);
      setEntries(res.admin_entries);
    } catch {} finally { setLoading(false); }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const needsStore = typeMeta[type]?.needsStore;

  const handleAdd = async () => {
    if (!amount || (needsStore && !storeId)) return;
    setSaving(true);
    try {
      await cashSheetService.addAdminEntry({
        entry_date: date,
        type,
        store_id: needsStore ? Number(storeId) : null,
        amount: parseFloat(amount),
        details: details || undefined,
      });
      await loadEntries();
      setAmount('');
      setDetails('');
      showToast('Entry added');
    } catch { showToast('Failed to add', false); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this entry?')) return;
    setDeleting(id);
    try {
      await cashSheetService.deleteAdminEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast('Removed');
    } catch { showToast('Failed', false); }
    finally { setDeleting(null); }
  };

  const fmt = (n: number) => '৳' + Math.round(n).toLocaleString('en-BD');

  // Group entries by type for display
  const grouped = ENTRY_TYPES.map(t => ({
    ...t,
    items: entries.filter(e => e.type === t.value),
    total: entries.filter(e => e.type === t.value).reduce((s, e) => s + Number(e.amount), 0),
  }));

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">

          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={20} className="text-blue-500" /> Admin Cash Panel
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Record salary set-asides, cash-to-bank transfers, and disbursement receipts.
            </p>
          </div>

          {/* date */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
            <input
              type="date" value={date} max={today}
              onChange={e => setDate(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* add form */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Add Entry</h2>

            {/* type selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {ENTRY_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all
                    ${type === t.value ? colorMap[t.color] + ' border-current' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div className={`text-[10px] mt-0.5 ${type === t.value ? 'opacity-75' : 'text-gray-400'}`}>{t.desc}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {/* store selector — only for branch-scoped types */}
              {needsStore && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Branch</label>
                  <select
                    value={storeId}
                    onChange={e => setStoreId(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (৳)</label>
                <input
                  type="number" min="0" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Details / Notes</label>
                <textarea
                  value={details} onChange={e => setDetails(e.target.value)}
                  rows={2} placeholder="Add any relevant notes..."
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              <button
                onClick={handleAdd} disabled={saving || !amount || (needsStore && storeId === '')}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {saving ? 'Adding…' : 'Add Entry'}
              </button>
            </div>
          </div>

          {/* entries grouped by type */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(g => g.items.length > 0 && (
                <div key={g.value} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800`}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorMap[g.color]}`}>{g.label}</span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(g.total)}</span>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {g.items.map(e => (
                      <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmt(Number(e.amount))}</span>
                            {e.store && <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">{e.store.name}</span>}
                            <span className="text-[10px] text-gray-400">{e.created_by?.name} · {new Date(e.created_at).toLocaleTimeString('en-BD',{hour:'2-digit',minute:'2-digit'})}</span>
                          </div>
                          {e.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{e.details}</p>}
                        </div>
                        <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 flex-shrink-0 mt-0.5">
                          {deleting === e.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-sm bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                  No admin entries yet for this date.
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />} {toast.msg}
        </div>
      )}
    </div>
  );
}
