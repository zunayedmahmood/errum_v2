'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import cartService from '@/services/cartService';
import { useCart } from '../../../app/e-commerce/CartContext';
import { usePromotion } from '@/contexts/PromotionContext';

interface CartItemProps {
  item: {
    id: number;
    productId: number;
    categoryId?: number;
    name: string;
    image?: string;
    price: string | number;
    quantity: number;
    maxQuantity?: number;
    sku?: string;
    color?: string;
    size?: string;
  };
  onQuantityChange?: (itemId: number, newQuantity: number) => Promise<void>;
  onRemove?: (itemId: number) => Promise<void>;
  isUpdating?: boolean;
}

const formatBDT = (value: number) => {
  return `৳${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function CartItem({ item, onQuantityChange, onRemove, isUpdating: externalIsUpdating }: CartItemProps) {
  const { refreshCart } = useCart();
  const router = useRouter();
  const { getApplicablePromotion } = usePromotion();
  const [internalIsUpdating, setInternalIsUpdating] = useState(false);

  // Use external isUpdating if provided, otherwise use internal
  const isUpdating = externalIsUpdating !== undefined ? externalIsUpdating : internalIsUpdating;

  // Safely parse price
  const originalPrice = typeof item?.price === 'string'
    ? parseFloat(item.price)
    : typeof item?.price === 'number'
      ? item.price
      : 0;

  const promo = getApplicablePromotion(item.productId, item.categoryId ?? null);
  const discountPercent = promo?.discount_value ?? 0;
  const activePrice = discountPercent > 0 ? Math.max(0, originalPrice - (originalPrice * discountPercent / 100)) : originalPrice;

  const itemTotal = activePrice * (item?.quantity || 0);

  // ✅ Handle quantity update with backend
  const handleQuantityChange = async (delta: number) => {
    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) return;

    // If parent provides handler, use it
    if (onQuantityChange) {
      await onQuantityChange(item.id, newQuantity);
      return;
    }

    // Otherwise handle internally
    try {
      setInternalIsUpdating(true);
      await cartService.updateQuantity(item.id, { quantity: newQuantity });
      await refreshCart();
    } catch (error: any) {
      console.error('Error updating quantity:', error);
      alert(error.message || 'Failed to update quantity');
      await refreshCart();
    } finally {
      setInternalIsUpdating(false);
    }
  };

  // ✅ Handle direct input change
  const handleInputChange = async (newQuantity: number) => {
    if (newQuantity < 1 || isNaN(newQuantity)) return;

    // If parent provides handler, use it
    if (onQuantityChange) {
      await onQuantityChange(item.id, newQuantity);
      return;
    }

    // Otherwise handle internally
    try {
      setInternalIsUpdating(true);
      await cartService.updateQuantity(item.id, { quantity: newQuantity });
      await refreshCart();
    } catch (error: any) {
      console.error('Error updating quantity:', error);
      alert(error.message || 'Failed to update quantity');
      await refreshCart();
    } finally {
      setInternalIsUpdating(false);
    }
  };

  // ✅ Handle remove item with backend
  const handleRemove = async () => {
    if (!confirm('Remove this item from cart?')) return;

    // If parent provides handler, use it
    if (onRemove) {
      await onRemove(item.id);
      return;
    }

    // Otherwise handle internally
    try {
      setInternalIsUpdating(true);
      await cartService.removeFromCart(item.id);
      await refreshCart();
    } catch (error: any) {
      console.error('Error removing item:', error);
      alert(error.message || 'Failed to remove item');
      await refreshCart();
    } finally {
      setInternalIsUpdating(false);
    }
  };

  // ✅ Navigate to product detail
  const handleNavigateToProduct = () => {
    router.push(`/e-commerce/product/${item.productId}`);
  };

  // Safety check
  if (!item) {
    return null;
  }

  return (
    <div className="flex gap-4 p-4 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-default)] relative transition-all duration-300 hover:border-[var(--border-strong)]"
      style={{
        borderColor: typeof item.maxQuantity === 'number' && item.quantity > item.maxQuantity ? 'rgba(224, 82, 82, 0.4)' : undefined
      }}
    >
      {/* Loading Overlay */}
      {isUpdating && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 rounded-[var(--radius-md)] bg-[var(--bg-depth)]/80 backdrop-blur-[2px]"
        >
          <Loader2 className="animate-spin text-[var(--cyan)]" size={24} />
        </div>
      )}

      {/* Product Image */}
      <div
        className="relative w-20 h-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-default)]"
        onClick={handleNavigateToProduct}
      >
        <img
          src={item.image || '/placeholder-product.png'}
          alt={item.name}
          className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
        />
      </div>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 pr-2">
            <h3
              className="text-[14px] font-medium line-clamp-2 cursor-pointer transition-colors text-[var(--text-primary)] hover:text-[var(--cyan)]"
              style={{ fontFamily: "'Poppins', sans-serif" }}
              onClick={handleNavigateToProduct}
            >
              {item.name}
            </h3>

            {/* Variant Info */}
            {(item.color || item.size) && (
              <p className="text-[11px] mt-1 text-[var(--text-muted)] uppercase tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {item.color && <span>{item.color}</span>}
                {item.color && item.size && <span className="mx-1 opacity-30">|</span>}
                {item.size && <span>{item.size}</span>}
              </p>
            )}

            {item.sku && (
              <p className="text-[10px] mt-0.5 text-[var(--text-muted)] uppercase tracking-tight opacity-60" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.sku}</p>
            )}

            {/* Stock Warning (5.5) */}
            {typeof item.maxQuantity === 'number' && item.quantity > item.maxQuantity ? (
              <div className="mt-2">
                <p className="text-[12px] font-medium text-[var(--status-danger)]">
                  ⚠️ Only {item.maxQuantity} available in stock
                </p>
              </div>
            ) : typeof item.maxQuantity === 'number' && item.maxQuantity > 0 && item.maxQuantity < 5 ? (
              <div className="mt-2">
                <p className="text-[12px] font-medium text-[var(--gold-bright)]">
                  Only {item.maxQuantity} remaining
                </p>
              </div>
            ) : null}
          </div>
          <button
            onClick={handleRemove}
            disabled={isUpdating}
            className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger)]/10 transition-all flex-shrink-0 disabled:opacity-50"
            title="Remove from cart"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quantity and Price */}
        <div className="flex items-center justify-between">
          {/* Quantity Controls (5.2) */}
          {/* Quantity Controls (5.2) */}
          <div className="flex items-center rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-lifted)] border border-[var(--border-strong)]">
            <button
              onClick={() => handleQuantityChange(-1)}
              disabled={isUpdating || item.quantity <= 1}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-all disabled:opacity-30"
            >
              <Minus size={12} />
            </button>
            <div className="w-8 text-center text-[13px] font-semibold text-[var(--text-primary)]">
              {item.quantity}
            </div>
            <button
              onClick={() => handleQuantityChange(1)}
              disabled={isUpdating || (typeof item.maxQuantity === 'number' && item.quantity >= item.maxQuantity)}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-all disabled:opacity-30"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Price */}
          <div className="text-right flex flex-col items-end">
            <p className="text-[14px] font-bold text-[var(--gold)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {formatBDT(activePrice * item.quantity)}
            </p>
            {discountPercent > 0 && originalPrice > 0 && (
              <p className="text-[12px] line-through text-[var(--text-muted)] opacity-60" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {formatBDT(originalPrice * item.quantity)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}