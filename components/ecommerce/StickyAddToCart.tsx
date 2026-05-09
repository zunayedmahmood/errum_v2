'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface StickyAddToCartProps {
  isVisible: boolean;
  productName: string;
  priceText: string;
  isAdding: boolean;
  disabled: boolean;
  onAddToCart: () => void;
}

const StickyAddToCart: React.FC<StickyAddToCartProps> = ({
  isVisible,
  productName,
  priceText,
  isAdding,
  disabled,
  onAddToCart,
}) => {
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[60] bg-white border-b border-gray-100 p-4 transition-all duration-500 pt-[calc(1rem+env(safe-area-inset-top))] ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        } sm:hidden shadow-lg`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-[12px] font-bold text-gray-900 line-clamp-1 uppercase tracking-tight leading-tight mb-0.5">
            {productName}
          </h4>
          <p className="text-[14px] font-bold text-gray-900">
            {priceText}
          </p>
        </div>
        <button
          onClick={onAddToCart}
          disabled={disabled || isAdding}
          className="h-11 px-5 rounded-lg bg-black text-white text-[14px] font-bold uppercase tracking-wider flex items-center gap-2 active:scale-95 disabled:bg-gray-100 disabled:text-gray-400 transition-all shadow-md"
        >
          {isAdding ? (
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ShoppingCart size={18} />
          )}
          {isAdding ? 'ADDING...' : 'ADD TO CART'}
        </button>
      </div>
    </div>
  );
};

export default StickyAddToCart;
