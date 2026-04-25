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
            
            const getStatusStyles = (s: string) => {
              switch(s) {
                case 'processing':
                  return {
                    bg: 'rgba(230, 168, 23, 0.12)',
                    text: 'var(--status-warning)',
                    border: '1px solid rgba(230,168,23,0.28)'
                  };
                case 'shipped':
                  return {
                    bg: 'var(--cyan-pale)',
                    text: 'var(--cyan)',
                    border: '1px solid var(--cyan-glow)'
                  };
                case 'delivered':
                  return {
                    bg: 'rgba(46, 204, 138, 0.12)',
                    text: 'var(--status-success)',
                    border: '1px solid rgba(46,204,138,0.28)'
                  };
                case 'cancelled':
                  return {
                    bg: 'rgba(224, 82, 82, 0.12)',
                    text: 'var(--status-danger)',
                    border: '1px solid rgba(224,82,82,0.28)'
                  };
                default:
                  return {
                    bg: 'var(--bg-lifted)',
                    text: 'var(--text-muted)',
                    border: '1px solid var(--border-default)'
                  };
              }
            };

            const sStyles = getStatusStyles(status);
            const steps = ['pending', 'processing', 'shipped', 'delivered'];
            const currentStepIdx = steps.indexOf(status);

            return (
              <div key={o.order_number} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden transition-all hover:bg-[var(--bg-surface-2)]">
                <div className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>Order #{o.order_number}</p>
                      <p className="text-[14px] font-medium text-[var(--text-primary)]">{new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span 
                        className="px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
                        style={{ background: sStyles.bg, color: sStyles.text, border: sStyles.border, fontFamily: "'Poppins', sans-serif" }}
                      >
                        {o.status}
                      </span>
                      <Link
                        href={`/e-commerce/my-account/orders/${o.order_number}`}
                        className="text-[11px] font-bold uppercase tracking-widest text-[var(--cyan)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                        style={{ fontFamily: "'Poppins', sans-serif" }}
                      >
                        Details <span>→</span>
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-6 border-t border-[var(--border-default)]">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]" style={{ fontFamily: "'Poppins', sans-serif" }}>Total Investment</p>
                      <p className="text-2xl font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>{Number(o.total_amount).toLocaleString()} ৳</p>
                    </div>
                    {o.items_count && (
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]" style={{ fontFamily: "'Poppins', sans-serif" }}>Item Count</p>
                        <p className="text-lg font-medium text-[var(--text-primary)]">{o.items_count}</p>
                      </div>
                    )}
                  </div>

                  {/* 8.1 — Refined Timeline Bar */}
                  {(status === 'shipped' || status === 'processing' || status === 'delivered' || status === 'pending') && (
                    <div className="pt-8 border-t border-[var(--border-default)]">
                      <div className="flex justify-between relative">
                        <div className="absolute top-[5px] left-0 right-0 h-[2px] bg-[var(--bg-lifted)] rounded-full -z-0" />
                        
                        {steps.map((step, idx) => {
                          const isCompleted = idx < currentStepIdx || status === 'delivered';
                          const isActive = idx === currentStepIdx && status !== 'delivered';
                          
                          return (
                            <div key={step} className="flex flex-col items-center gap-3 relative z-10 flex-1">
                              <div 
                                className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${
                                  isCompleted 
                                    ? 'bg-[var(--status-success)] border-[var(--status-success)]' 
                                    : isActive 
                                      ? 'bg-[var(--cyan)] border-[var(--cyan)] shadow-[0_0_12px_var(--cyan-glow)]' 
                                      : 'bg-[var(--bg-lifted)] border-[var(--border-strong)]'
                                }`} 
                              />
                              <span 
                                className={`text-[9px] font-bold uppercase tracking-widest transition-colors duration-300 ${
                                  isActive ? 'text-[var(--cyan)]' : 'text-[var(--text-muted)]'
                                }`}
                                style={{ fontFamily: "'Poppins', sans-serif" }}
                              >
                                {step}
                              </span>
                            </div>
                          );
                        })}
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
