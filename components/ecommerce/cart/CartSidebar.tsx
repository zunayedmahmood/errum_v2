'use client';

import React from 'react';
import { X, Loader2, ShoppingCart } from 'lucide-react';
import { useCart } from '../../../app/e-commerce/CartContext';
import { useRouter } from 'next/navigation';
import CartItem from './CartItem';

const formatBDT = (value: number) => {
  return `৳${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { cart, getTotalPrice, isLoading } = useCart();
  const router = useRouter();
  
  const subtotal = getTotalPrice();
  const freeShippingThreshold = 5000;
  const remaining = Math.max(0, freeShippingThreshold - subtotal);
  const progress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  const handleCheckout = () => {
    router.push('/e-commerce/checkout');
    onClose();
  };

  const handleViewCart = () => {
    router.push('/e-commerce/cart');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md ec-anim-backdrop"
          onClick={onClose}
        />
      )}
      
      {/* Side Drawer */}
      <div
        className={`
          fixed right-0 top-0 bottom-0 z-[101] w-full sm:w-[400px] 
          bg-[#0d0d0d] shadow-[-20px_0_80px_rgba(0,0,0,0.8)]
          flex flex-col transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1)
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Shopping bag</h2>
            <span className="text-[11px] font-bold text-[var(--gold)]" style={{ fontFamily: "'DM Mono', monospace" }}>
              ({cart.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/40 hover:text-white bg-white/5 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto ec-scrollbar p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col justify-center items-center py-20 space-y-4">
              <Loader2 className="animate-spin text-[var(--gold)]" size={32} />
              <p className="text-[11px] font-bold tracking-widest text-white/20 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Syncing bag...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && cart.length === 0 && (
            <div className="text-center py-20 space-y-6">
              <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mx-auto opacity-20">
                <ShoppingCart className="h-8 w-8 text-white" />
              </div>
              <div>
                <p className="text-white/40 mb-2">Your collection is empty</p>
                <button
                  onClick={onClose}
                  className="text-sm font-semibold text-[var(--gold)] hover:text-[var(--gold-light)] transition-colors"
                >
                  DISCOVER NEW ARRIVALS →
                </button>
              </div>
            </div>
          )}

          {/* Cart Items */}
          {!isLoading && cart.length > 0 && (
            <div className="space-y-6">
              {cart.map((item, idx) => (
                <div key={item.id} className="ec-anim-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <CartItem item={item} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && cart.length > 0 && (
          <div className="border-t border-white/5 p-6 space-y-5 bg-white/[0.02]">
            {/* Free Shipping Progress */}
            {remaining > 0 ? (
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[11px] font-bold tracking-wide text-white/30 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                    Free Shipping
                  </p>
                  <p className="text-[11px] font-semibold text-white/60">
                    ৳{remaining.toFixed(2)} AWAY
                  </p>
                </div>
                <div className="w-full rounded-full h-1 bg-white/5 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-700 bg-[var(--gold)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)' }}>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[11px] font-bold text-green-500 uppercase tracking-wider" style={{ fontFamily: "'DM Mono', monospace" }}>
                  Complimentary Shipping Applied
                </p>
              </div>
            )}

            {/* Subtotal */}
            <div className="flex items-center justify-between py-2 border-y border-white/5">
              <span className="text-sm font-medium text-white/40">Estimated Total:</span>
              <span className="text-xl font-bold text-white">
                {formatBDT(subtotal)}
              </span>
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleCheckout}
                className="w-full py-4 rounded-2xl font-bold bg-[var(--gold)] text-white shadow-[0_10px_30px_rgba(176,124,58,0.2)] transition-all hover:bg-[#9a6b2e] active:scale-[0.98]"
                style={{ fontFamily: "'Jost', sans-serif" }}
              >
                PROCEED TO CHECKOUT
              </button>
              <button
                onClick={handleViewCart}
                className="w-full py-3 text-[11px] font-bold tracking-[0.2em] text-white/30 hover:text-white transition-colors uppercase"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                VIEW FULL BAG
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🔥 MOBILE: Slight page shift for better UX */}
      <style jsx>{`
        @media (max-width: 640px) {
          body {
            overflow: ${isOpen ? 'hidden' : 'auto'};
          }
        }
      `}</style>
    </>
  );
}