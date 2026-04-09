'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';

/**
 * 7.3 — "New Arrivals" Strip: Auto-Scroll Ticker
 * A horizontal auto-scrolling strip of new arrival cards.
 * Infinite loop using CSS @keyframes ticker.
 */
export default function NewArrivalsTicker() {
  const router = useRouter();
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  const displayProducts = [...products, ...products];

  return (
    <div className="ec-ticker-container bg-[#0a0a0a] border-y border-white/5 py-8">
      <div className="ec-ticker-track">
        {displayProducts.map((product, idx) => (
          <div key={`${product.id}-${idx}`} className="w-[280px] px-3 flex-shrink-0">
            <PremiumProductCard
              product={product}
              onOpen={() => router.push(`/e-commerce/product/${product.id}`)}
              onAddToCart={() => router.push(`/e-commerce/product/${product.id}`)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
