'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { Plus, Trash2, Loader2, CheckCircle, AlertCircle, Crown, TrendingUp, TrendingDown } from 'lucide-react';
import cashSheetService, { OwnerEntry, OwnerEntryType } from '@/services/cashSheetService';

const ENTRY_TYPES: { value: OwnerEntryType; label: string; icon: 'in' | 'out'; medium: 'cash' | 'bank'; color: string; desc: string }[] = [
  { value: 'cash_invest', label: 'Cash Investment',  icon: 'in',  medium: 'cash', color: 'emerald', desc: 'Cash added into the business by owner / receivables collected' },
  { value: 'bank_invest', label: 'Bank Investment',  icon: 'in',  medium: 'bank', color: 'blue',    desc: 'Bank transfer added to business by owner' },
  { value: 'cash_cost',   label: 'Cash Spending',    icon: 'out', medium: 'cash', color: 'rose',    desc: 'Owner cash expenditure — vendor, staff, other payments' },
  { value: 'bank_cost',   label: 'Bank Spending',    icon: 'out', medium: 'bank', color: 'red',     desc: 'Owner bank transfer expenditure' },
];

const colorMap: Record<string, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  blue:    'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-700',
  rose:    'bg-rose-50   dark:bg-rose-900/20   text-rose-700   dark:text-rose-300   border-rose-200   dark:border-rose-700',
  red:     'bg-red-50    dark:bg-red-900/20    text-red-700    dark:text-red-300    border-red-200    dark:border-red-700',
};

const typeMeta = Object.fromEntries(ENTRY_TYPES.map(t => [t.value, t]));

export default function OwnerPanel() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = role === 'admin' || role === 'super-admin';
  useEffect(() => { if (!authLoading && !isAdmin) router.push('/dashboard'); }, [authLoading, isAdmin]);

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [type, setType]       = useState<OwnerEntryType>('cash_invest');
  const [amount, setAmount]   = useState('');
  const [details, setDetails] = useState('');
  const [entries, setEntries] = useState<OwnerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { if (date) loadEntries(); }, [date]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await cashSheetService.getEntries(date);
      setEntries(res.owner_entries);
    } catch {} finally { setLoading(false); }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAdd = async () => {
    if (!amount) return;
    setSaving(true);
    try {
      await cashSheetService.addOwnerEntry({
        entry_date: date, type,
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
      await cashSheetService.deleteOwnerEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast('Removed');
    } catch { showToast('Failed', false); }
    finally { setDeleting(null); }
  };

  const fmt = (n: number) => '৳' + Math.round(n).toLocaleString('en-BD');

  const totalIn  = entries.filter(e => typeMeta[e.type]?.icon === 'in').reduce((s,e)=>s+Number(e.amount),0);
  const totalOut = entries.filter(e => typeMeta[e.type]?.icon === 'out').reduce((s,e)=>s+Number(e.amount),0);

  const grouped = ENTRY_TYPES.map(t => ({
    ...t,
    items: entries.filter(e => e.type === t.value),
    total: entries.filter(e => e.type === t.value).reduce((s,e)=>s+Number(e.amount),0),
  }));

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">

          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Crown size={20} className="text-amber-500" /> Owner Panel
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Record personal investments into the business and owner expenditures.
            </p>
          </div>

          {/* date */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
            <input
              type="date" value={date} max={today}
              onChange={e => setDate(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* summary cards */}
          {entries.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-700">
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                  <TrendingUp size={13} /> Total In
                </div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{fmt(totalIn)}</div>
              </div>
              <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3 border border-rose-200 dark:border-rose-700">
                <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 mb-1">
                  <TrendingDown size={13} /> Total Out
                </div>
                <div className="text-lg font-bold text-rose-700 dark:text-rose-300">{fmt(totalOut)}</div>
              </div>
            </div>
          )}

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
                    ${type === t.value ? colorMap[t.color] + ' border-current' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-1 font-semibold">
                    {t.icon === 'in' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {t.label}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${type === t.value ? 'opacity-75' : 'text-gray-400'}`}>{t.desc}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (৳)</label>
                <input
                  type="number" min="0" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 100000"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Details / Notes <span className="text-gray-400">(required for spending)</span></label>
                <textarea
                  value={details} onChange={e => setDetails(e.target.value)}
                  rows={2} placeholder="e.g. Paid Perfume vendor — ৳50,000 / Received from Mumin vai"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <button
                onClick={handleAdd} disabled={saving || !amount}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {saving ? 'Adding…' : 'Add Entry'}
              </button>
            </div>
          </div>

          {/* entries */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(g => g.items.length > 0 && (
                <div key={g.value} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorMap[g.color]}`}>{g.label}</span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(g.total)}</span>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {g.items.map(e => (
                      <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmt(Number(e.amount))}</span>
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
                  No owner entries yet for this date.
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
