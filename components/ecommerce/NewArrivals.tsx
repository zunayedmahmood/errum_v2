'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import { fireToast } from '@/lib/globalToast';

interface NewArrivalsProps {
  categoryId?: number;
  limit?: number;
}

/* Parse a date string → ms timestamp, returns 0 if unparseable */
const toMs = (v: unknown): number => {
  if (!v) return 0;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Get the CREATION timestamp for a card product.
 * We deliberately ignore updated_at — an old product that was recently edited
 * should NOT reappear as a "new arrival".
 */
const getCreatedMs = (product: SimpleProduct): number => {
  // The card product itself (spread from main_variant) has created_at
  const own = toMs((product as any)?.created_at);
  if (own > 0) return own;

  // Check variants as fallback
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let best = 0;
  for (const v of variants) {
    const t = toMs((v as any)?.created_at);
    if (t > best) best = t;
  }
  return best;
};

const NewArrivals: React.FC<NewArrivalsProps> = ({ categoryId, limit = 8 }) => {
  const router = useRouter();
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const { addToCart } = useCart();

  useEffect(() => {
    fetchNewArrivals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, limit]);

  const fetchNewArrivals = async () => {
    setIsLoading(true);
    try {
      const response = await catalogService.getProducts({
        page: 1,
        per_page: Math.max(limit * 8, 80),
        category_id: categoryId,
        sort_by: 'newest',
        sort: 'created_at',
        order: 'desc',
        sort_order: 'desc',
        new_arrivals: true,
      });

      const rawCards = buildCardProductsFromResponse(response);

      // Sort by created_at ONLY — not updated_at
      const sorted = [...rawCards].sort((a, b) => getCreatedMs(b) - getCreatedMs(a));

      // Keep only products created within the last 180 days.
      // No fallback — if nothing qualifies, the section hides itself.
      // This prevents old/test products from ever appearing as "new arrivals".
      const CUTOFF_MS = 180 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - CUTOFF_MS;

      const recent = sorted.filter(p => {
        const created = getCreatedMs(p);
        // If we couldn't extract a created_at date, exclude (safer than showing stale items)
        if (created === 0) return false;
        return created >= cutoff;
      });

      setProducts(recent.slice(0, limit));
    } catch (error) {
      console.error('Error fetching new arrivals:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = (productId: number) => {
    setImageErrors(prev => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  };

  const handleProductClick = (product: SimpleProduct) => {
    router.push(`/e-commerce/product/${product.id}`);
  };

  const handleAddToCart = async (product: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.has_variants) {
      router.push(`/e-commerce/product/${product.id}`);
      return;
    }
    try {
      await addToCart(product.id, 1);

      fireToast(`Added to cart: ${product?.name || 'Item'}`, 'success');
    } catch (error: any) {
      console.error('Error adding to cart:', error);
      fireToast(error?.message || 'Failed to add to cart', 'error');
    }
  };

  if (isLoading) {
    return (
      <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <div className="ec-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
            <div style={{ height: '24px', width: '180px', background: '#f5f5f5', borderRadius: '4px' }} />
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div style={{ aspectRatio: '2/3', background: '#f5f5f5', borderRadius: '4px', marginBottom: '12px' }} />
                <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '70%', marginBottom: '6px' }} />
                <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '40%' }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Section hides if there are no genuinely new products
  if (products.length === 0) return null;

  return (
    <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container">
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ height: '1px', flex: 1, maxWidth: '40px', background: '#111111' }} />
            <h2 style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: '18px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#111111',
              margin: 0,
            }}>
              New Arrivals
            </h2>
            <div style={{ height: '1px', flex: 1, maxWidth: '40px', background: '#111111' }} />
          </div>
          <button
            onClick={() => router.push('/e-commerce/products')}
            style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#111111',
              background: 'none',
              border: '1.5px solid #111111',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
          {products.map((product) => (
            <PremiumProductCard
              key={product.id}
              product={product}
              imageErrored={imageErrors.has(product.id)}
              onImageError={handleImageError}
              onOpen={handleProductClick}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default NewArrivals;