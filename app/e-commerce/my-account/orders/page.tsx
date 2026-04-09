'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import MyAccountShell from '@/components/ecommerce/my-account/MyAccountShell';
import checkoutService, { Order } from '@/services/checkoutService';

export default function MyAccountOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await checkoutService.getOrders({
        per_page: 15,
        status: status || undefined,
        search: search || undefined,
      } as any);

      // backend returns { orders, pagination }
      setOrders((data as any).orders || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MyAccountShell
      title="Orders"
      subtitle="View your recent orders and track delivery status."
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number..."
            className="border rounded-md px-3 py-2 text-sm w-64"
          />
          <button
            onClick={load}
            className="bg-neutral-900 text-white px-4 py-2 rounded-md text-sm hover:bg-neutral-800"
          >
            Search
          </button>
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-52"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <button
        onClick={load}
        className="mb-6 text-sm text-gray-700 underline"
      >
        Apply filters
      </button>

      {error ? (
        <div className="border border-rose-200 bg-rose-50 text-neutral-900 rounded-md p-3 text-sm mb-4">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 w-full bg-neutral-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const status = (o.status || 'pending').toLowerCase();
            const statusColors: Record<string, string> = {
              pending: 'bg-neutral-500',
              processing: 'bg-amber-500',
              shipped: 'bg-blue-500',
              delivered: 'bg-green-500',
              cancelled: 'bg-rose-500',
            };
            
            const steps = ['pending', 'processing', 'shipped', 'delivered'];
            const currentStepIdx = steps.indexOf(status);

            return (
              <div key={o.order_number} className="ec-surface overflow-hidden transition-all hover:bg-white/[0.02]">
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-xs font-mono text-white/40 mb-1">#{o.order_number}</p>
                      <p className="text-sm font-medium text-white/80">{new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${statusColors[status] || 'bg-neutral-500'}`}>
                        {o.status}
                      </span>
                      <Link
                        href={`/e-commerce/my-account/orders/${o.order_number}`}
                        className="text-xs font-semibold text-white/50 hover:text-white transition-colors flex items-center gap-1"
                      >
                        Details →
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-4 border-t border-white/5">
                    <div className="space-y-1">
                      <p className="text-xs text-white/40 uppercase tracking-widest">Total Amount</p>
                      <p className="text-xl font-serif text-white">{Number(o.total_amount).toLocaleString()}৳</p>
                    </div>
                    {o.items_count && (
                      <div className="text-right">
                        <p className="text-xs text-white/40 uppercase tracking-widest">Items</p>
                        <p className="text-lg text-white/80">{o.items_count}</p>
                      </div>
                    )}
                  </div>

                  {/* 8.1 — Simplified Timeline Bar for Shipped Order */}
                  {(status === 'shipped' || status === 'processing' || status === 'delivered') && (
                    <div className="pt-4 border-t border-white/5">
                      <div className="ec-order-timeline">
                        {steps.map((step, idx) => (
                          <div key={step} className="ec-timeline-step">
                            <div className={`ec-timeline-dot ${idx <= currentStepIdx ? 'ec-timeline-dot-active' : ''}`} />
                            <div className="ec-timeline-bar" />
                            <span className="ec-timeline-label">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!orders.length ? (
            <div className="text-center py-12 bg-neutral-100/5 rounded-2xl border border-white/5">
              <ShoppingBag className="mx-auto mb-4 text-white/20" size={48} />
              <p className="text-white/60">No orders found.</p>
              <Link href="/e-commerce/" className="mt-4 ec-btn ec-btn-gold">
                Start Shopping
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </MyAccountShell>
  );
}
