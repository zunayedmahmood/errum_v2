'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Package,
  MapPin,
  CreditCard,
  Printer,
  Home,
  Loader2,
  ChevronRight,
  ShoppingBag,
  ArrowRight,
  Clock,
  CheckCircle
} from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import checkoutService, { Order } from '@/services/checkoutService';
import Link from 'next/link';
import { toAbsoluteAssetUrl } from '@/lib/urlUtils';

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = params?.orderNumber as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber) {
        setError('Invalid order number');
        setLoading(false);
        return;
      }

      try {
        const orderData = await checkoutService.getOrderByNumber(orderNumber);
        setOrder(orderData);
      } catch (err: any) {
        console.error('Failed to fetch order:', err);
        // Try to check if we have a last order preview in localStorage (for immediate UX)
        try {
          const lastOrder = localStorage.getItem('ec_last_order');
          if (lastOrder) {
            const parsed = JSON.parse(lastOrder);
            if (parsed.order_number === orderNumber) {
              setOrder(parsed);
              setLoading(false);
              return;
            }
          }
        } catch (storageErr) {
          console.warn('Storage check failed', storageErr);
        }
        setError('Failed to load order details. Please check My Account > Orders.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderNumber]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="ec-root bg-[var(--bg-root)] min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-[var(--gold)] mx-auto mb-6" />
            <h2 className="text-[11px] font-bold text-[var(--text-muted)] tracking-[0.25em] uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Confirming Order
            </h2>
            <p className="text-[var(--text-secondary)] mt-4 font-light">Connecting to our secure server...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="ec-root bg-[var(--bg-root)] min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center max-w-md mx-auto bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-12 shadow-sm">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="text-red-500" size={32} />
            </div>
            <h1 className="text-3xl font-medium text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Not Found</h1>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed font-light">{error}</p>
            <button
              onClick={() => router.push('/e-commerce')}
              className="w-full ec-btn-primary justify-center py-4 text-xs font-bold tracking-widest uppercase"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Return to Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root bg-[var(--bg-root)] min-h-screen pb-20">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">

        {/* Success Header Section */}
        <div className="text-center mb-12 ec-anim-fade-up">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-[var(--gold)]/10 blur-3xl rounded-full scale-150"></div>
              <div className="relative w-24 h-24 bg-[var(--gold)] rounded-full flex items-center justify-center shadow-xl">
                <CheckCircle2 className="text-white" size={52} strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-medium text-[var(--text-primary)] mb-4 tracking-tight leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Order Confirmed
          </h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed font-light">
            Thank you for shopping with <span className="text-[var(--gold)] font-medium">Errum</span>.
            We&apos;ve received your order and started the fulfillment process.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10 px-6 sm:px-10 py-6 sm:py-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-sm">
            <div className="text-center sm:text-left sm:border-r sm:border-[var(--border-default)] sm:pr-10 w-full sm:w-auto">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Reference</p>
              <p className="text-2xl font-bold text-[var(--text-primary)] tracking-wider">#{order?.order_number}</p>
            </div>
            <div className="text-center sm:text-left w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-[var(--border-default)]">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Date</p>
              <p className="text-xl font-medium text-[var(--text-secondary)]">
                {order && new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Order Content */}
          <div className="lg:col-span-8 space-y-6">

            {/* Action Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden ec-anim-fade-up ec-delay-1 shadow-sm">
              <div className="p-6 md:p-8 flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--bg-surface-2)]/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--bg-root)] flex items-center justify-center border border-[var(--border-default)]">
                    <Package className="text-[var(--gold)]" size={24} />
                  </div>
                  <div>
                    <h3 className="text-[var(--text-primary)] font-semibold">Track Delivery</h3>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-tight font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>Real-time status updates</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    onClick={() => router.push(`/e-commerce/order-tracking/${order?.order_number}`)}
                    className="flex-1 md:flex-none ec-btn-primary px-8 py-3.5 rounded-xl text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5"
                  >
                    Track Status
                  </button>
                  <button
                    onClick={handlePrint}
                    className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-depth)] transition-all print:hidden"
                    title="Print Receipt"
                  >
                    <Printer size={20} />
                  </button>
                </div>
              </div>
            </div>

            {/* Order Items List */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-sm ec-anim-fade-up ec-delay-2">
              <div className="px-6 py-5 border-b border-[var(--border-default)] flex items-center justify-between">
                <h3 className="text-lg font-medium text-[var(--text-primary)] tracking-wide" style={{ fontFamily: "'Poppins', sans-serif" }}>Ordered Items</h3>
                <span className="text-[10px] text-[var(--text-muted)] font-bold tracking-[0.2em] px-3 py-1 bg-[var(--bg-depth)] rounded-full border border-[var(--border-default)] uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {order?.items.length} Product{order?.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="p-6 md:p-8 space-y-6">
                {order?.items.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-4 sm:gap-6 pb-8 sm:pb-6 border-b border-[var(--border-default)] last:border-b-0 last:pb-0 group">
                    <div className="flex gap-4 sm:gap-6 flex-1">
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-[var(--bg-surface-2)] rounded-xl overflow-hidden border border-[var(--border-default)] group-hover:border-[var(--gold)]/30 transition-colors">
                        {(() => {
                          const imgUrl = toAbsoluteAssetUrl(
                            item.product_image || item.image_url ||
                            (item.product?.images?.find((img: any) => img.is_primary)?.image_url ||
                              item.product?.images?.find((img: any) => img.is_primary)?.url ||
                              item.product?.images?.[0]?.image_url ||
                              item.product?.images?.[0]?.url)
                          );

                          return imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={item.product_name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="text-[var(--text-muted)]" size={32} />
                            </div>
                          );
                        })()}
                        <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold text-white border border-white/10">
                          ×{item.quantity}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-[var(--text-primary)] font-medium text-base sm:text-lg leading-tight mb-1 line-clamp-2 hover:text-[var(--gold)] transition-colors cursor-pointer">
                          {item.product_name}
                        </h4>
                        <div className="flex flex-wrap gap-y-1 gap-x-3 mt-2">
                          {(item.sku || item.product_sku) && (
                            <p className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>
                              SKU: <span className="text-[var(--text-secondary)]">{item.sku || item.product_sku}</span>
                            </p>
                          )}
                        </div>
                        {(item.color || item.size) && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {item.color && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-depth)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                                {item.color}
                              </span>
                            )}
                            {item.size && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-depth)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                                {item.size}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col justify-between items-center sm:items-end mt-2 sm:mt-0 border-t border-[var(--border-default)] pt-3 sm:border-0 sm:pt-0">
                      <p className="text-lg font-bold text-[var(--text-primary)] tracking-wide">
                        ৳{(item.total_amount ?? item.total ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">
                        ৳{(item.unit_price ?? item.price ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })} ea
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Logistics Info Section */}
            <div className="grid md:grid-cols-2 gap-6 ec-anim-fade-up ec-delay-3">
              {/* Shipping Address */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-sm p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-depth)] border border-[var(--border-default)]">
                    <MapPin className="text-[var(--gold)]" size={20} />
                  </div>
                  <h3 className="font-bold text-[var(--text-primary)] tracking-[0.1em] uppercase text-xs" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Shipping Destination
                  </h3>
                </div>
                <div className="text-[var(--text-secondary)] space-y-2.5 leading-relaxed">
                  <p className="font-bold text-[var(--text-primary)] text-lg">{order?.shipping_address.name}</p>
                  <p className="flex items-center gap-2 text-[var(--text-muted)] font-bold uppercase text-[10px]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    <span>PHONE</span>
                    <span className="text-[var(--text-secondary)] font-medium text-xs">{order?.shipping_address.phone}</span>
                  </p>
                  <p className="text-[var(--text-secondary)] pt-1 font-light">
                    {order?.shipping_address.address_line_1}
                    {order?.shipping_address.address_line_2 && <span className="block">{order?.shipping_address.address_line_2}</span>}
                  </p>
                  <p className="text-[var(--gold)] font-medium">
                    {order?.shipping_address.city}, {order?.shipping_address.state} {order?.shipping_address.postal_code}
                  </p>
                </div>
              </div>

              {/* Payment Info */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-sm p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-depth)] border border-[var(--border-default)]">
                    <CreditCard className="text-[var(--gold)]" size={20} />
                  </div>
                  <h3 className="font-bold text-[var(--text-primary)] tracking-[0.1em] uppercase text-xs" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Payment Summary
                  </h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>Method</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-primary)] font-bold tracking-wide capitalize bg-[var(--bg-depth)] px-3 py-1 rounded-lg border border-[var(--border-default)]">
                        {order?.payment_method.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>Gateway Status</p>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-[0.1em] uppercase border ${order?.payment_status === 'paid'
                        ? 'bg-green-50 text-green-700 border-green-100'
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${order?.payment_status === 'paid' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></div>
                        {order?.payment_status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Area - Order Total & Support */}
          <div className="lg:col-span-4 space-y-6">

            {/* Amount Summary Sidebar */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] sticky top-24 ec-anim-fade-up ec-delay-4 overflow-hidden shadow-xl border-t-[var(--gold)] border-t-[3px]">
              <div className="bg-[var(--bg-depth)] border-b border-[var(--border-default)] px-6 py-4">
                <h3 className="text-center font-bold text-[var(--text-primary)] tracking-[0.2em] uppercase text-[10px]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Billing Breakdown
                </h3>
              </div>
              <div className="p-6 md:p-8 space-y-5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-light text-[var(--text-secondary)]">Basket Subtotal</span>
                  <span className="font-bold text-[var(--text-primary)]">৳{order?.subtotal.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-light text-[var(--text-secondary)]">Fulfillment & Shipping</span>
                  <span className="font-bold text-[var(--text-primary)]">৳{order?.shipping_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
                {order && order.discount_amount > 0 && (
                  <div className="flex justify-between items-center text-green-600 bg-green-50 px-4 py-3 rounded-xl border border-green-100">
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>Voucher Savings</span>
                    <span className="font-bold ">-৳{order.discount_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="pt-6 mt-4 border-t border-[var(--border-default)]">
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-bold text-center" style={{ fontFamily: "'Poppins', sans-serif" }}>Total Amount Payable</p>
                    <div className="text-center">
                      <span className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">
                        ৳{order?.total_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    href="/e-commerce"
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-depth)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all font-bold tracking-[0.1em] text-[11px] uppercase"
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    Continue Shopping <ArrowRight size={14} className="text-[var(--gold)]" />
                  </Link>
                </div>
              </div>

              {/* Receipt Visual Decor */}
              <div className="bg-[var(--bg-depth)] px-6 py-4 border-t border-[var(--border-default)] flex items-center justify-center gap-2">
                <span className="text-[9px] text-[var(--text-muted)] font-bold tracking-[0.2em] uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>Digital Receipt</span>
              </div>
            </div>



          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center text-[var(--text-muted)] text-[9px] font-bold tracking-[0.4em] uppercase ec-anim-fade-up ec-delay-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Errum Store &copy; 2026 • Order Confirmation Page
        </div>
      </div>
    </div>
  );
}