'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import SectionHeader from '@/components/ecommerce/ui/SectionHeader';
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
      const cutoff    = Date.now() - CUTOFF_MS;

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
    
      fireToast(`Added to cart: ${product?.name || 'Item'}`, 'success');} catch (error: any) {
      console.error('Error adding to cart:', error);
      fireToast(error?.message || 'Failed to add to cart', 'error');
    }
  };

  if (isLoading) {
    return (
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-4 sm:p-6 lg:p-7">
            <div className="h-3 w-32 rounded rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="mt-3 h-8 w-48 rounded rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: limit }).map((_, i) => (
                <div key={i} className="ec-card overflow-hidden rounded-2xl animate-pulse">
                  <div className="aspect-[4/5] rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="p-4 space-y-2">
                    <div className="h-3 rounded rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="h-4 rounded rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="h-4 w-1/2 rounded rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Section hides if there are no genuinely new products
  if (products.length === 0) return null;

  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface p-4 sm:p-6 lg:p-7 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full opacity-40"
               style={{ background: 'radial-gradient(circle, rgba(176,124,58,0.10) 0%, transparent 70%)', filter: 'blur(24px)' }} />
          <SectionHeader
            eyebrow="Fresh drop"
            title="New Arrivals"
            subtitle="Latest additions to the catalogue"
            actionLabel="View all products"
            onAction={() => router.push('/e-commerce/products')}
          />

          <div className="flex sm:grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 ec-horizontal-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
            {products.map((product) => (
              <div key={product.id} className="w-[85vw] sm:w-auto">
                <PremiumProductCard
                  product={product}
                  imageErrored={imageErrors.has(product.id)}
                  onImageError={handleImageError}
                  onOpen={handleProductClick}
                  onAddToCart={handleAddToCart}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NewArrivals;