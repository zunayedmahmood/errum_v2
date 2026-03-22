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
      <div className="ec-root ec-bg-texture min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-[var(--gold)] mx-auto mb-6" />
            <h2 className="text-2xl font-light text-white/50 tracking-wide uppercase" style={{ fontFamily: "'DM Mono', monospace", fontSize: '14px', letterSpacing: '0.2em' }}>
              Confirming Order
            </h2>
            <p className="text-white/40 mt-2">Connecting to our secure server...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="ec-root ec-bg-texture min-h-screen">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center max-w-md mx-auto ec-dark-card p-12">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="text-rose-500" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Order Not Found</h1>
            <p className="text-white/60 mb-8 leading-relaxed">{error}</p>
            <button
              onClick={() => router.push('/e-commerce')}
              className="w-full ec-btn ec-btn-gold justify-center py-4"
            >
              Return to Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root ec-bg-texture min-h-screen pb-20">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16">
        
        {/* Success Header Section */}
        <div className="text-center mb-12 ec-anim-fade-up">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-[var(--gold)]/20 blur-2xl rounded-full scale-150"></div>
              <div className="relative w-24 h-24 bg-[var(--gold)] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(176,124,58,0.4)]">
                <CheckCircle2 className="text-white" size={52} strokeWidth={1.5} />
              </div>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-tight">
            Order Confirmed
          </h1>
          <p className="text-lg text-white/60 max-w-lg mx-auto leading-relaxed">
            Thank you for shopping with <span className="text-[var(--gold-light)] font-medium">Errum</span>. 
            We've received your order and started the fulfillment process.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10 px-6 sm:px-10 py-6 sm:py-8 ec-dark-card bg-white/5 border-white/10 backdrop-blur-md">
            <div className="text-center sm:text-left sm:border-r sm:border-white/10 sm:pr-10 w-full sm:w-auto">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-mono">Order Reference</p>
              <p className="text-2xl font-bold text-white tracking-wider">#{order.order_number}</p>
            </div>
            <div className="text-center sm:text-left w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1.5 font-mono">Order Date</p>
              <p className="text-xl font-medium text-white/90">
                {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Order Content */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Action Card */}
            <div className="ec-dark-card overflow-hidden ec-anim-fade-up ec-delay-1">
              <div className="p-6 md:p-8 flex flex-col md:flex-row gap-4 items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                    <Package className="text-[var(--gold)]" size={24} />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Track Delivery</h3>
                    <p className="text-sm text-white/40">Real-time status updates</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={() => router.push(`/e-commerce/order-tracking/${order.order_number}`)}
                        className="flex-1 md:flex-none ec-btn ec-btn-gold px-8 py-3.5 rounded-xl text-sm font-bold tracking-wide"
                    >
                        Track Status
                    </button>
                    <button
                        onClick={handlePrint}
                        className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all print:hidden"
                        title="Print Receipt"
                    >
                        <Printer size={20} />
                    </button>
                </div>
              </div>
            </div>

            {/* Order Items List */}
            <div className="ec-dark-card ec-anim-fade-up ec-delay-2">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-wide">Ordered Items</h3>
                <span className="text-[12px] text-white/40 font-mono tracking-widest px-3 py-1 bg-white/5 rounded-full border border-white/5 uppercase">
                  {order.items.length} Product{order.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="p-6 md:p-8 space-y-6">
                {order.items.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-4 sm:gap-6 pb-8 sm:pb-6 border-b border-white/10 last:border-b-0 last:pb-0 group">
                    <div className="flex gap-4 sm:gap-6 flex-1">
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 bg-[#151515] rounded-xl overflow-hidden border border-white/5 group-hover:border-[var(--gold)]/30 transition-colors">
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
                              <Package className="text-white/10" size={32} />
                            </div>
                          );
                        })()}
                        <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold text-white border border-white/10">
                          ×{item.quantity}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-medium text-base sm:text-lg leading-tight mb-1 line-clamp-3 hover:text-[var(--gold-light)] transition-colors cursor-pointer">
                          {item.product_name}
                        </h4>
                        <div className="flex flex-wrap gap-y-1 gap-x-3 mt-2">
                          {(item.sku || item.product_sku) && (
                            <p className="text-[11px] text-white/40 font-mono tracking-wider">
                              SKU: <span className="text-white/60">{item.sku || item.product_sku}</span>
                            </p>
                          )}
                        </div>
                        {(item.color || item.size) && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                             {item.color && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
                                    {item.color}
                                </span>
                             )}
                             {item.size && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
                                    {item.size}
                                </span>
                             )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex sm:flex-col justify-between items-center sm:items-end mt-2 sm:mt-0 border-t border-white/5 pt-3 sm:border-0 sm:pt-0">
                      <p className="text-lg font-bold text-white tracking-wide">
                        ৳{(item.total_amount ?? item.total ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] text-white/30 font-medium">
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
              <div className="ec-dark-card p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                    <MapPin className="text-[var(--gold)]" size={20} />
                  </div>
                  <h3 className="font-bold text-white tracking-wide uppercase text-sm" style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em' }}>
                    Shipping Destination
                  </h3>
                </div>
                <div className="text-white/70 space-y-2.5 leading-relaxed">
                  <p className="font-bold text-white text-lg">{order.shipping_address.name}</p>
                  <p className="flex items-center gap-2 text-white/50">
                    <span className="font-mono text-xs opacity-70 tracking-widest">PHONE</span>
                    {order.shipping_address.phone}
                  </p>
                  <p className="text-white/90 pt-1">
                    {order.shipping_address.address_line_1}
                    {order.shipping_address.address_line_2 && <span className="block">{order.shipping_address.address_line_2}</span>}
                  </p>
                  <p className="text-[var(--gold-light)] font-medium">
                    {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
                  </p>
                </div>
              </div>

              {/* Payment Info */}
              <div className="ec-dark-card p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                    <CreditCard className="text-[var(--gold)]" size={20} />
                  </div>
                  <h3 className="font-bold text-white tracking-wide uppercase text-sm" style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em' }}>
                    Payment Summary
                  </h3>
                </div>
                <div className="space-y-5">
                   <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-mono">Method</p>
                        <div className="flex items-center gap-2">
                             <span className="text-white font-bold tracking-wide capitalize">
                                {order.payment_method.replace(/_/g, ' ')}
                             </span>
                        </div>
                   </div>
                   <div>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1 font-mono">Gateway Status</p>
                        <div className="flex items-center gap-2">
                            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${
                                order.payment_status === 'paid' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${order.payment_status === 'paid' ? 'bg-green-400 animate-pulse' : 'bg-amber-500'}`}></div>
                                {order.payment_status}
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
            <div className="ec-dark-card sticky top-24 ec-anim-fade-up ec-delay-4 overflow-hidden border-[var(--gold)]/20 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <div className="bg-[var(--gold)]/5 border-b border-white/5 px-6 py-4">
                 <h3 className="text-center font-bold text-white tracking-widest uppercase text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>
                    Billing Breakdown
                 </h3>
              </div>
              <div className="p-6 md:p-8 space-y-4">
                <div className="flex justify-between items-center text-white/50">
                  <span className="text-sm font-medium tracking-wide">Basket Subtotal</span>
                  <span className="font-bold text-white/90">৳{order.subtotal.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-white/50">
                  <span className="text-sm font-medium tracking-wide">Fulfillment & Shipping</span>
                  <span className="font-bold text-white/90">৳{order.shipping_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
                {order.discount_amount > 0 && (
                  <div className="flex justify-between items-center text-green-400 bg-green-400/5 px-3 py-2 -mx-3 rounded-lg border border-green-400/10">
                    <span className="text-sm font-bold tracking-wide uppercase font-mono text-[10px]">Promotional Discount</span>
                    <span className="font-bold">-৳{order.discount_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                
                <div className="pt-6 mt-2 border-t border-white/10">
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.25em] font-mono text-center">Total Amount Payable</p>
                    <div className="text-center">
                        <span className="text-4xl font-bold text-white tracking-tight">
                            ৳{order.total_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                     <Link 
                        href="/e-commerce"
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all font-bold tracking-widest text-[11px] uppercase"
                     >
                        Continue Shopping <ArrowRight size={14} />
                     </Link>
                </div>
              </div>
              
              {/* Receipt Visual Decor */}
              <div className="bg-[#111] px-6 py-4 border-t border-white/5 flex items-center justify-center gap-2">
                 <CheckCircle className="text-[var(--gold)]" size={12} />
                 <span className="text-[10px] text-white/30 font-mono tracking-widest uppercase">Verified Digital Receipt</span>
              </div>
            </div>



          </div>
        </div>
        
        {/* Footer Info */}
        <div className="mt-16 text-center text-white/20 text-[10px] font-mono tracking-[0.3em] uppercase ec-anim-fade-up ec-delay-6">
            Errum Store &copy; 2026 • Secure Order Fulfillment
        </div>
      </div>
    </div>
  );
}