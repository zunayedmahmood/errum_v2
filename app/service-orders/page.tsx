'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import serviceOrdersService, { ServiceOrderStatus, ServiceOrderPaymentStatus } from '@/services/serviceOrdersService';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const fmtMoney = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : '0.00';
};

export default function ServiceOrdersPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);

  const [status, setStatus] = useState<ServiceOrderStatus | 'all'>('all');
  const [paymentStatus, setPaymentStatus] = useState<ServiceOrderPaymentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { per_page: 50 };
      if (status !== 'all') params.status = status;
      if (paymentStatus !== 'all') params.payment_status = paymentStatus;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await serviceOrdersService.list(params);
      // API returns {success:true,data:{data:[...]}} (paginated). Normalize.
      const list = serviceOrdersService.normalizeList(res?.data || res);
      setOrders(list);
    } catch (e: any) {
      console.error(e);
      showToast(e?.response?.data?.message || e?.message || 'Failed to load service orders', 'error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const paid = orders.reduce((s, o) => s + Number(o.paid_amount || 0), 0);
    const outstanding = orders.reduce((s, o) => s + Number(o.outstanding_amount || 0), 0);
    return { total, paid, outstanding, count: orders.length };
  }, [orders]);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-auto p-6">
            {/* Toasts */}
            <div className="fixed top-4 right-4 z-50 space-y-2">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`px-4 py-3 rounded-lg shadow border text-sm font-medium ${
                    t.type === 'success'
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
                      : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                  }`}
                >
                  {t.message}
                </div>
              ))}
            </div>

            <div className="max-w-7xl mx-auto">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Service Orders</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Tailoring / Alteration / Cleaning / Repair bookings
                  </p>
                </div>
                <button
                  onClick={load}
                  className="px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Orders</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.count}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">৳{fmtMoney(stats.total)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">৳{fmtMoney(stats.paid)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Outstanding</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">৳{fmtMoney(stats.outstanding)}</div>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Payment</label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="partially_paid">Partially paid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Search</label>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Order no, customer name, phone…"
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={load}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    disabled={loading}
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Order</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Customer</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Payment</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Total</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Paid</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Due</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Scheduled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {orders.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-gray-500 dark:text-gray-400" colSpan={8}>
                            {loading ? 'Loading…' : 'No service orders found'}
                          </td>
                        </tr>
                      ) : (
                        orders.map((o) => (
                          <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{o.service_order_number}</td>
                            <td className="px-4 py-3">
                              <div className="text-gray-900 dark:text-white">{o.customer_name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{o.customer_phone}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs border border-gray-200 dark:border-gray-700">
                                {String(o.status).replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs border border-gray-200 dark:border-gray-700">
                                {String(o.payment_status).replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">৳{fmtMoney(o.total_amount)}</td>
                            <td className="px-4 py-3 text-right">৳{fmtMoney(o.paid_amount)}</td>
                            <td className="px-4 py-3 text-right">৳{fmtMoney(o.outstanding_amount)}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                              {o.scheduled_date ? String(o.scheduled_date).slice(0, 10) : '-'}
                              {o.scheduled_time ? ` ${o.scheduled_time}` : ''}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
