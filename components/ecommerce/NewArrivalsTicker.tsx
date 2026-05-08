'use client';

import React, { useEffect, useState, memo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';

/**
 * 7.3 — "New Arrivals" Strip: Auto-Scroll Ticker
 * A horizontal auto-scrolling strip of new arrival cards.
 * Infinite loop using CSS @keyframes ticker.
 */
const NewArrivalsTicker = memo(function NewArrivalsTicker() {
  const router = useRouter();
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const fetchNewArrivals = async () => {
      try {
        const response = await catalogService.getProducts({
          page: 1,
          per_page: 12, // Enough for a smooth loop
          sort_by: 'newest',
          new_arrivals: true,
        });
        const cards = buildCardProductsFromResponse(response);
        setProducts(cards);
      } catch (error) {
        console.error('Error fetching arrivals for ticker:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNewArrivals();
  }, []);

  if (isLoading || products.length === 0) return null;

  // Duplicate products to create seamless loop
  const displayProducts = [...products, ...products, ...products];

  return (
    <div 
      className="ec-ticker-wrapper border-y border-[var(--border-default)] bg-[var(--bg-surface)] py-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Top Banner */}
      <div className="flex justify-center mb-6">
        <div className="px-4 py-1.5 rounded-full bg-[var(--cyan-pale)] border border-[var(--cyan-border)] flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--cyan)]" style={{ fontFamily: "var(--font-poppins), sans-serif" }}>New Arrival</span>
        </div>
      </div>

      {/* Ticker Track */}
      <div className="ec-ticker-container overflow-hidden">
        <div className={`ec-ticker-track flex items-center ${isPaused ? 'paused' : ''}`}>
          {displayProducts.map((product, idx) => {
            const primaryImage = product.images?.[0]?.url || '';
            const imageUrl = primaryImage || '/images/placeholder-product.jpg';
            
            return (
              <button
                key={`${product.id}-${idx}`}
                onClick={() => router.push(`/e-commerce/product/${product.id}`)}
                className="flex-shrink-0 group mx-4"
              >
                <div className="flex flex-col items-center gap-3 p-4 min-w-[180px] bg-[var(--bg-root)] border border-[var(--border-default)] rounded-[var(--radius-xl)] transition-all duration-500 group-hover:border-[var(--cyan-border)] group-hover:shadow-xl group-hover:bg-[var(--bg-lifted)]">
                  {/* Thumbnail */}
                  <div className="relative h-20 w-16 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-depth)]">
                    <Image 
                      src={imageUrl} 
                      alt={product.name}
                      fill
                      sizes="64px"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[rgba(28,24,18,0.1)] to-transparent" />
                  </div>
                  
                  {/* Product Name */}
                  <p 
                    className="text-center text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-tight group-hover:text-[var(--cyan)] transition-colors line-clamp-1" 
                    style={{ fontFamily: "var(--font-poppins), sans-serif" }}
                  >
                    {(product as any).base_name || product.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default NewArrivalsTicker;

