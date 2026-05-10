'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { Plus, Trash2, Loader2, CheckCircle, AlertCircle, Receipt } from 'lucide-react';
import cashSheetService, { BranchCostEntry } from '@/services/cashSheetService';
import storeService, { Store } from '@/services/storeService';

export default function BranchCostPanel() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, storeId: userStoreId, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin  = role === 'admin' || role === 'super-admin';
  const isBranch = role === 'branch-manager' || role === 'pos-salesman';
  const authorized = isAdmin || isBranch;

  const [stores, setStores]     = useState<Store[]>([]);
  const [entries, setEntries]   = useState<BranchCostEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]         = useState(today);
  const [storeId, setStoreId]   = useState<number | ''>('');
  const [amount, setAmount]     = useState('');
  const [details, setDetails]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => { if (!authLoading && !authorized) router.push('/dashboard'); }, [authLoading, authorized]);

  useEffect(() => {
    storeService.getAllStores().then((list: Store[]) => {
      setStores(list);
      if (!isAdmin && userStoreId) setStoreId(userStoreId);
      else if (list.length > 0) setStoreId(list[0].id);
    }).catch(() => {});
  }, [isAdmin, userStoreId]);

  useEffect(() => { if (date && storeId) loadEntries(); }, [date, storeId]);

  const loadEntries = async () => {
    if (!date || !storeId) return;
    setLoading(true);
    try {
      const res = await cashSheetService.getEntries(date);
      setEntries(res.branch_costs.filter(e => Number(e.store_id) === Number(storeId)));
    } catch { } finally { setLoading(false); }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAdd = async () => {
    if (!amount || !storeId || !date) return;
    setSaving(true);
    try {
      const created = await cashSheetService.addBranchCost({
        entry_date: date,
        store_id: Number(storeId),
        amount: parseFloat(amount),
        details: details || undefined,
      });
      setEntries(prev => [created, ...prev.filter(e => e.id !== created.id)]);
      await loadEntries();
      setAmount('');
      setDetails('');
      showToast('Cost entry added');
    } catch { showToast('Failed to add entry', false); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this entry?')) return;
    setDeleting(id);
    try {
      await cashSheetService.deleteBranchCost(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast('Entry removed');
    } catch { showToast('Failed to remove', false); }
    finally { setDeleting(null); }
  };

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  const fmt = (n: number) => '৳' + Math.round(n).toLocaleString('en-BD');

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full">

          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Receipt size={20} className="text-indigo-500" /> Branch Daily Cost
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Log operational expenses for your branch. Each entry is recorded separately with details.
            </p>
          </div>

          {/* filters */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
              <input
                type="date" value={date} max={today}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Branch</label>
              <select
                value={storeId}
                onChange={e => setStoreId(Number(e.target.value))}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
              >
                {stores.filter(s => isAdmin || s.id === userStoreId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* add form */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add Cost Entry</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (৳)</label>
                <input
                  type="number" min="0" step="any"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Details / Notes</label>
                <textarea
                  value={details} onChange={e => setDetails(e.target.value)}
                  rows={2} placeholder="What was this cost for? e.g. Electricity bill, cleaning supplies..."
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>
              <button
                onClick={handleAdd} disabled={saving || !amount || storeId === ''}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {saving ? 'Adding…' : 'Add Entry'}
              </button>
            </div>
          </div>

          {/* entries list */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Entries for {new Date(date).toLocaleDateString('en-BD', { day: 'numeric', month: 'short', year: 'numeric' })}
              </h2>
              {entries.length > 0 && (
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  Total: {fmt(total)}
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading…
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No cost entries yet for this date.</div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map(e => (
                  <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmt(Number(e.amount))}</span>
                        <span className="text-[10px] text-gray-400">
                          {e.created_by?.name ?? 'Unknown'} · {new Date(e.created_at).toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {e.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{e.details}</p>}
                    </div>
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                      className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                    >
                      {deleting === e.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
