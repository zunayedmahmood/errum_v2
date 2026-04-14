'use client';

import React from 'react';
import { X, Loader2, ShoppingCart, ShoppingBag } from 'lucide-react';
import { useCart } from '../../../app/e-commerce/CartContext';
import { useRouter } from 'next/navigation';
import CartItem from './CartItem';
import checkoutService from '../../../services/checkoutService';

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
  const deliveryCharge = checkoutService.calculateDeliveryCharge('Dhaka');
  const total = subtotal + deliveryCharge;

  const isAnyOverStock = cart.some(item => typeof item.maxQuantity === 'number' && item.quantity > item.maxQuantity);

  const handleCheckout = () => {
    if (isAnyOverStock) return;
    router.push('/e-commerce/checkout');
    onClose();
  };



  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(2px)',
          }}
          className="ec-anim-backdrop"
          onClick={onClose}
        />
      )}

      {/* Side Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 101,
          width: '100%',
          maxWidth: '380px',
          background: '#ffffff',
          borderLeft: '1px solid rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.10)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          height: '56px',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag style={{ width: '18px', height: '18px', color: '#111111' }} />
            <h2 style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#111111',
              margin: 0,
            }}>
              Shopping Cart
            </h2>
            <span style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              color: '#999999',
            }}>
              ({cart.length})
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              width: '32px',
              height: '32px',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.15)',
              color: '#999999',
              background: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#111111'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.15)'; (e.currentTarget as HTMLElement).style.color = '#999999'; }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {/* Loading State */}
          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
              <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#111111', width: '28px', height: '28px' }} />
              <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#999999', textTransform: 'uppercase', fontFamily: "'Jost', sans-serif" }}>
                Syncing bag...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && cart.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <ShoppingCart style={{ width: '32px', height: '32px', color: '#cccccc' }} />
              </div>
              <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: '16px', fontWeight: 700, color: '#111111', marginBottom: '8px' }}>Your cart is empty</h3>
              <p style={{ fontSize: '13px', color: '#999999', marginBottom: '24px', lineHeight: 1.5, fontFamily: "'Jost', sans-serif" }}>
                Add something to your collection to get started.
              </p>
              <button
                onClick={() => { onClose(); router.push('/e-commerce/categories'); }}
                style={{
                  padding: '12px 28px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: "'Jost', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                Start Shopping
              </button>
            </div>
          )}

          {/* Cart Items */}
          {!isLoading && cart.length > 0 && (
            <div style={{ paddingTop: '16px', paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {cart.map((item) => (
                <div key={`${item.id}-${item.sku}`} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <CartItem item={item} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && cart.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '16px 20px', background: '#ffffff' }}>
            {/* Subtotal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#555555', fontFamily: "'Jost', sans-serif" }}>Subtotal</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#111111', fontFamily: "'Jost', sans-serif" }}>
                {formatBDT(subtotal)}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#999999', marginBottom: '16px', fontFamily: "'Jost', sans-serif" }}>
              Includes standard delivery
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleCheckout}
                disabled={isAnyOverStock}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: "'Jost', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  cursor: isAnyOverStock ? 'not-allowed' : 'pointer',
                  opacity: isAnyOverStock ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => !isAnyOverStock && ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
                onMouseLeave={e => !isAnyOverStock && ((e.currentTarget as HTMLElement).style.opacity = '1')}
              >
                Checkout
              </button>

            </div>
          </div>
        )}
      </div>

      {/* Mobile scroll lock */}
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