'use client';

import React, { useEffect, useState } from 'react';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import MimicPremiumProductCard from './MimicPremiumProductCard';

interface MimicNewArrivalsProps {
  categoryId?: number;
  limit?: number;
  customProducts?: SimpleProduct[];
}

const toMs = (v: unknown): number => {
  if (!v) return 0;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : 0;
};

const getCreatedMs = (product: SimpleProduct): number => {
  const own = toMs((product as any)?.created_at);
  if (own > 0) return own;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let best = 0;
  for (const v of variants) {
    const t = toMs((v as any)?.created_at);
    if (t > best) best = t;
  }
  return best;
};

const MimicNewArrivals: React.FC<MimicNewArrivalsProps> = ({ categoryId, limit = 8, customProducts }) => {
  const [products, setProducts] = useState<SimpleProduct[]>(customProducts || []);
  const [isLoading, setIsLoading] = useState(!customProducts);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (customProducts && customProducts.length > 0) {
      setProducts(customProducts);
      setIsLoading(false);
      return;
    }
    fetchNewArrivals();
  }, [categoryId, limit, customProducts]);

  const fetchNewArrivals = async () => {
    setIsLoading(true);
    try {
      const response = await catalogService.getProducts({
        page: 1,
        per_page: limit,
        category_id: categoryId,
        sort_by: 'newest',
        sort: 'created_at',
        order: 'desc',
        sort_order: 'desc',
        new_arrivals: true,
      });

      const rawCards = buildCardProductsFromResponse(response);
      const sorted = [...rawCards].sort((a, b) => getCreatedMs(b) - getCreatedMs(a));
      setProducts(sorted.slice(0, limit));
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

  if (products.length === 0) return null;

  return (
    <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ height: '1px', flex: 1, maxWidth: '40px', background: '#111111' }} />
            <h2 style={{
              fontFamily: "'Poppins', sans-serif",
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
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#111111',
              background: 'none',
              border: '1.5px solid #111111',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'default',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            View All (Preview)
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
          {products.map((product) => (
            <MimicPremiumProductCard
              key={product.id}
              product={product}
              imageErrored={imageErrors.has(product.id)}
              onImageError={handleImageError}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MimicNewArrivals;
