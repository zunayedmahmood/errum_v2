'use client';

import React from 'react';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { SimpleProduct } from '@/services/catalogService';
import { getAdditionalVariantCount, getCardStockLabel, getVariantListForCard } from '@/lib/ecommerceCardUtils';
import { usePromotion } from '@/contexts/PromotionContext';

interface PremiumProductCardProps {
  product: SimpleProduct;
  imageErrored?: boolean;
  onImageError?: (id: number) => void;
  onOpen: (product: SimpleProduct) => void;
  onAddToCart: (product: SimpleProduct, e: React.MouseEvent) => void | Promise<void>;
  compact?: boolean;
  animDelay?: number;
}

const PremiumProductCard: React.FC<PremiumProductCardProps> = ({
  product, imageErrored = false, onImageError, onOpen, onAddToCart, compact = false, animDelay = 0,
}) => {
  const { getApplicablePromotion } = usePromotion();
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  // 2.3 — Urgency Signals
  const stock = Number(product.stock_quantity || 0);
  const isLowStock = stock > 0 && stock <= 5;

  // New arrival check (within 14 days)
  const isNew = React.useMemo(() => {
    const createdAt = (product as any).created_at;
    if (!createdAt) return false;
    const createdDate = new Date(createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 14;
  }, [product]);

  const primaryImage = product.images?.[0]?.url || '';
  const secondaryImage = product.images?.[1]?.url || '';
  const shouldFallback = imageErrored || !primaryImage;
  const imageUrl = shouldFallback ? '/images/placeholder-product.jpg' : primaryImage;

  const stockLabel = getCardStockLabel(product);
  const hasStock = stockLabel !== 'Out of Stock';
  const categoryName = typeof product.category === 'object' && product.category ? product.category.name : '';

  // Promotion / SALE badge
  const categoryId = typeof product.category === 'object' && product.category ? (product.category as { id?: number }).id ?? null : null;
  const salePromo = getApplicablePromotion(product.id, categoryId);
  const salePercent = salePromo?.discount_value ?? 0;
  const originalPrice = Number(product.selling_price ?? 0);
  const salePrice = salePromo ? Math.max(0, originalPrice - (originalPrice * salePercent) / 100) : null;

  // Price Range Display
  const variants = React.useMemo(() => getVariantListForCard(product), [product]);
  const prices = variants.map(v => Number(v.selling_price || 0)).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : originalPrice;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : minPrice;
  const hasPriceRange = minPrice !== maxPrice;

  return (
    <article
      onClick={() => onOpen(product)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        background: '#ffffff',
        animationDelay: `${animDelay}ms`,
        animationFillMode: 'both',
      }}
      className="ec-anim-fade-up"
    >
      {/* Image Container */}
      <div style={{ position: 'relative', aspectRatio: '2/3', background: '#f5f5f5', overflow: 'hidden' }}>
        {/* Loading shimmer */}
        {!isLoaded && !imageErrored && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #f5f5f5 25%, #ebebeb 50%, #f5f5f5 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
        )}

        <Image
          src={imageUrl}
          alt={product.display_name || product.base_name || product.name}
          fill
          className={`object-cover object-top transition-all duration-500`}
          style={{ transform: isHovered && secondaryImage ? 'opacity: 0' : 'opacity: 1' }}
          onLoad={() => setIsLoaded(true)}
          onError={shouldFallback || !onImageError ? undefined : () => onImageError(product.id)}
        />

        {/* Secondary image hover swap — if available */}
        {secondaryImage && isHovered && (
          <Image
            src={secondaryImage}
            alt={`${product.name} - alternate view`}
            fill
            className="object-cover object-top"
            style={{ position: 'absolute', inset: 0 }}
          />
        )}

        {/* Badges */}
        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10 }}>
          {isNew && (
            <span style={{ background: '#111111', color: '#ffffff', fontSize: '10px', fontWeight: 700, padding: '3px 8px', letterSpacing: '0.05em', fontFamily: "'Jost', sans-serif" }}>
              NEW
            </span>
          )}
          {salePromo && salePercent > 0 && (
            <span style={{ background: '#e02020', color: '#ffffff', fontSize: '10px', fontWeight: 700, padding: '3px 8px', fontFamily: "'Jost', sans-serif" }}>
              -{salePercent}%
            </span>
          )}
          {!hasStock && (
            <span style={{ background: '#f0f0f0', color: '#555555', fontSize: '10px', fontWeight: 700, padding: '3px 8px', fontFamily: "'Jost', sans-serif" }}>
              SOLD OUT
            </span>
          )}
        </div>

        {/* Quick Add button — appears on hover */}
        {hasStock && (
          <button
            onClick={e => { e.stopPropagation(); onOpen(product); }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#111111',
              color: '#ffffff',
              border: 'none',
              padding: '12px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: "'Jost', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transform: isHovered ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.25s ease',
              zIndex: 10,
            }}
          >
            Choose Options
          </button>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {categoryName && (
          <p style={{ fontSize: '10px', color: '#999999', fontFamily: "'Jost', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            {categoryName}
          </p>
        )}
        <h3 style={{
          fontSize: compact ? '14px' : '16px',
          fontFamily: "'Jost', sans-serif",
          color: '#111111',
          lineHeight: 1.3,
          fontWeight: 600,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          letterSpacing: '-0.01em',
        }}>
          {product.display_name || product.base_name || product.name}
        </h3>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          {salePromo && salePrice !== null ? (
            <>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#e02020', fontFamily: "'Jost', sans-serif" }}>
                ৳{salePrice.toFixed(0)}
              </span>
              <span style={{ fontSize: '12px', color: '#999999', textDecoration: 'line-through', fontFamily: "'Jost', sans-serif" }}>
                ৳{originalPrice.toFixed(0)}
              </span>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#111111', fontFamily: "'Jost', sans-serif" }}>
                ৳{minPrice.toLocaleString()}
              </span>
              {hasPriceRange && (
                <span style={{ fontSize: '12px', color: '#555555', fontFamily: "'Jost', sans-serif" }}>
                  – ৳{maxPrice.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default PremiumProductCard;
