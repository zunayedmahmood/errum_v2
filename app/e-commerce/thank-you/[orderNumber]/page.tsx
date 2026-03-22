'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  CheckCircle2, 
  ShoppingBag, 
  ArrowRight, 
  Package, 
  ChevronRight,
  Heart,
  Share2,
  Calendar
} from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import Link from 'next/link';
import { toAbsoluteAssetUrl } from '@/lib/urlUtils';

export default function ThankYouPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = params?.orderNumber as string;
  
  const [lastOrder, setLastOrder] = useState<any>(null);

  useEffect(() => {
    // Try to get order preview from localStorage
    try {
      const stored = localStorage.getItem('ec_last_order');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.order_number === orderNumber) {
          setLastOrder(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse last order', e);
    }
  }, [orderNumber]);

  return (
    <div className="ec-root ec-bg-texture min-h-screen pb-20 overflow-hidden">
      <Navigation />
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-[var(--gold)]/10 blur-[100px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-[var(--gold)]/5 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-24 relative z-10">
        
        {/* Success Splash */}
        <div className="text-center mb-16 ec-anim-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-green-500/20 bg-green-500/5 text-green-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8">
            <CheckCircle2 size={14} className="animate-pulse" />
            Order Successful
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Thank You <br className="hidden md:block" /> for Your Order
          </h1>
          
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
            Your support means everything to us. We've received your order 
            <span className="text-white font-medium px-2">#{orderNumber}</span> 
            and our team is already preparing it for you.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
             <Link 
                href={`/e-commerce/order-confirmation/${orderNumber}`}
                className="w-full sm:w-auto ec-btn ec-btn-gold px-10 py-4 rounded-xl text-sm font-bold tracking-widest shadow-[0_15px_30px_rgba(176,124,58,0.3)] transition-all hover:scale-105"
             >
                View Order Summary
             </Link>
             <Link 
                href="/e-commerce"
                className="w-full sm:w-auto px-10 py-4 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all font-bold tracking-widest text-sm"
             >
                Continue Shopping
             </Link>
          </div>
        </div>

        {/* What's Next Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16 ec-anim-fade-up ec-delay-2">
           {[
             { 
               icon: Calendar, 
               title: 'Fast Fulfillment', 
               desc: 'Orders are processed within 24-48 hours of placement.' 
             },
             { 
               icon: Package, 
               title: 'Real-time Tracking', 
               desc: 'You will receive an SMS and Email with your tracking link.' 
             },
             { 
               icon: Heart, 
               title: 'Customer Care', 
               desc: 'Our dedicated team is always here if you need assistance.' 
             }
           ].map((item, i) => (
             <div key={i} className="ec-dark-card p-8 bg-white/[0.02] border-white/10 hover:border-white/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 mb-6 group-hover:bg-[var(--gold)]/10 group-hover:border-[var(--gold)]/20 transition-all">
                   <item.icon className="text-[var(--gold-light)]" size={24} />
                </div>
                <h3 className="text-white font-bold mb-2 tracking-wide text-lg">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed font-light">{item.desc}</p>
             </div>
           ))}
        </div>

        {/* Minimal Order Preview if data exists */}
        {lastOrder && (
          <div className="ec-dark-card overflow-hidden ec-anim-fade-up ec-delay-3 border-dashed border-white/10">
            <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/10">
               <span className="text-[10px] text-white/30 font-mono tracking-widest uppercase">Order Preview</span>
               <Link href={`/e-commerce/order-confirmation/${orderNumber}`} className="text-[10px] text-[var(--gold-light)] hover:text-[var(--gold)] flex items-center gap-1 font-bold tracking-widest uppercase">
                  Details <ChevronRight size={12} />
               </Link>
            </div>
            <div className="p-6">
                <div className="flex flex-wrap gap-4">
                    {lastOrder.items?.slice(0, 4).map((it: any, i: number) => (
                        <div key={i} className="w-14 h-14 rounded-lg bg-[#111] overflow-hidden border border-white/10">
                            <img src={toAbsoluteAssetUrl(it.product_image || it.image_url) || '/placeholder-product.png'} className="w-full h-full object-cover" alt="" />
                        </div>
                    ))}
                    {lastOrder.items?.length > 4 && (
                        <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-[11px] font-bold text-white/40">
                            +{lastOrder.items.length - 4}
                        </div>
                    )}
                </div>
            </div>
          </div>
        )}

        {/* Newsletter/Social CTA */}
        <div className="mt-20 p-10 ec-dark-card bg-gradient-to-br from-white/[0.05] to-transparent border-white/10 text-center ec-anim-fade-up ec-delay-4">
           <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Stay in touch!</h3>
           <p className="text-white/40 mb-8 max-w-md mx-auto leading-relaxed">
              Join our community and be the first to know about new collection drops and exclusive offers.
           </p>
           <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[var(--gold)]/50 transition-all font-light text-sm"
              />
              <button className="bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-[var(--gold-pale)] transition-all text-xs tracking-widest uppercase">
                Join Now
              </button>
           </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center text-white/20 text-[10px] font-mono tracking-[0.4em] uppercase">
            Errum Collection &bull; Est. 2026
        </div>
      </div>
    </div>
  );
}
