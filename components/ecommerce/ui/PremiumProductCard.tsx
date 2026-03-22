'use client';

import React from 'react';
import Image from 'next/image';
import { Heart, ArrowRight } from 'lucide-react';
import { SimpleProduct } from '@/services/catalogService';
import { getAdditionalVariantCount, getCardPriceText, getCardStockLabel } from '@/lib/ecommerceCardUtils';
import { wishlistUtils } from '@/lib/wishlistUtils';

interface PremiumProductCardProps {
  product: SimpleProduct;
  imageErrored?: boolean;
  onImageError?: (id: number) => void;
  onOpen: (product: SimpleProduct) => void;
  onAddToCart: (product: SimpleProduct, e: React.MouseEvent) => void | Promise<void>;
  compact?: boolean;
}

const PremiumProductCard: React.FC<PremiumProductCardProps> = ({
  product, imageErrored = false, onImageError, onOpen, onAddToCart, compact = false,
}) => {
  const [isInWishlist, setIsInWishlist] = React.useState(false);

  React.useEffect(() => {
    const updateWishlistStatus = () => {
      setIsInWishlist(wishlistUtils.isInWishlist(product.id));
    };
    updateWishlistStatus();
    window.addEventListener('wishlist-updated', updateWishlistStatus);
    return () => window.removeEventListener('wishlist-updated', updateWishlistStatus);
  }, [product.id]);

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInWishlist) {
      wishlistUtils.remove(product.id);
    } else {
      wishlistUtils.add({
        id: product.id,
        name: product.name,
        image: product.images?.[0]?.url || '/placeholder-product.png',
        price: Number(product.selling_price ?? 0),
        sku: product.sku || '',
      });
    }
  };

  const primaryImage   = product.images?.[0]?.url || '';
  const shouldFallback = imageErrored || !primaryImage;
  const imageUrl       = shouldFallback ? '/images/placeholder-product.jpg' : primaryImage;
  const extraVariants  = getAdditionalVariantCount(product);
  const stockLabel     = getCardStockLabel(product);
  const hasStock       = stockLabel !== 'Out of Stock';
  const categoryName   = typeof product.category === 'object' && product.category ? product.category.name : '';

  return (
    <article
      onClick={() => onOpen(product)}
      className="ec-card ec-card-hover group cursor-pointer overflow-hidden"
      style={{ borderRadius: '16px' }}
    >
      {/* Image */}
      <div className="relative overflow-hidden aspect-[3/4]" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <Image
          src={imageUrl}
          alt={product.display_name || product.base_name || product.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          onError={shouldFallback || !onImageError ? undefined : () => onImageError(product.id)}
        />

        {/* Wishlist toggle - always visible on mobile for quick access */}
        <div className="absolute right-2.5 top-2.5 z-10 sm:opacity-0 sm:scale-90 sm:group-hover:opacity-100 sm:group-hover:scale-100 transition-all duration-300">
          <button
            onClick={handleToggleWishlist}
            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-colors border ${
              isInWishlist 
                ? 'bg-[var(--gold)] border-[var(--gold)] text-black' 
                : 'bg-black/40 border-white/10 text-white/70'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isInWishlist ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Variant count */}
        {extraVariants > 0 && (
          <div className="absolute left-2.5 bottom-2.5 z-10 transition-transform sm:group-hover:-translate-y-12">
            <span className="rounded-full px-2.5 py-1 text-[9px] font-semibold text-white"
                  style={{ background: 'rgba(13,13,13,0.65)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em' }}>
              {extraVariants + 1} options
            </span>
          </div>
        )}

        {/* Slide-up action bar (Desktop hover / Mobile tap indicator) */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-y-0 hidden sm:block">
          <div className="flex items-center gap-1.5 p-2.5">
            <button
              onClick={e => onAddToCart(product, e)}
              className="flex-1 rounded-xl py-3 text-[11px] font-bold text-white transition-all shadow-xl active:scale-[0.97]"
              style={{ background: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Jost', sans-serif" }}
            >
              {product.has_variants ? 'Choose Options' : 'Add to Bag'}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className={compact ? 'p-3' : 'p-3.5 sm:p-4'}>
        <div className="flex justify-between items-start gap-2 mb-1">
          {categoryName ? (
            <p className="truncate text-[9px] font-bold tracking-[0.2em] uppercase text-white/20"
               style={{ fontFamily: "'DM Mono', monospace" }}>
              {categoryName}
            </p>
          ) : <div />}
          {hasStock && (
            <span className="flex items-center gap-1 text-[8px] font-bold text-green-500/60 uppercase tracking-widest" style={{ fontFamily: "'DM Mono', monospace" }}>
              ● <span className="hidden xs:inline">In Stock</span>
            </span>
          )}
        </div>
        
        <h3 className="line-clamp-2 font-medium leading-snug group-hover:text-[var(--gold-light)] transition-colors"
            style={{ 
              fontFamily: "'Jost', sans-serif", 
              fontSize: compact ? '13px' : '15px', 
              color: 'rgba(255,255,255,0.9)', 
              minHeight: compact ? '2.5rem' : '2.75rem' 
            }}>
          {product.display_name || product.base_name || product.name}
        </h3>
        
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/5 pt-2.5">
          <span className="text-[15px] font-bold text-[var(--gold)]" style={{ fontFamily: "'Jost', sans-serif" }}>
            {getCardPriceText(product)}
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/20 group-hover:bg-[var(--gold)] group-hover:text-white transition-all duration-300">
            <ArrowRight size={14} />
          </div>
        </div>
      </div>
    </article>
  );
};

export default PremiumProductCard;
