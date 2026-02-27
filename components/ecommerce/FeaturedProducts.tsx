'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { getCardNewestSortKey } from '@/lib/ecommerceCardUtils';
import { getBaseProductName } from '@/lib/productNameUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import SectionHeader from '@/components/ecommerce/ui/SectionHeader';
import { fireToast } from '@/lib/globalToast';

interface FeaturedProductsProps {
  categoryId?: number;
  limit?: number;
}

const pickMainVariant = (variants: SimpleProduct[]): SimpleProduct => {
  const sorted = [...variants].sort((a, b) => {
    const aStock = Number(a.stock_quantity || 0) > 0 ? 1 : 0;
    const bStock = Number(b.stock_quantity || 0) > 0 ? 1 : 0;
    if (bStock !== aStock) return bStock - aStock;
    const aPrice = Number(a.selling_price || 0);
    const bPrice = Number(b.selling_price || 0);
    if (aPrice !== bPrice) return aPrice - bPrice;
    return a.id - b.id;
  });
  return sorted[0];
};

const groupFeaturedVariants = (items: SimpleProduct[]): SimpleProduct[] => {
  const buckets = new Map<string, SimpleProduct[]>();
  items.forEach((product) => {
    const baseName = (product.base_name || getBaseProductName(product.name) || product.name || '').trim();
    const categoryKey = typeof product.category === 'object' && product.category ? product.category.id || product.category.name : String(product.category || '');
    const key = `${baseName.toLowerCase()}|${String(categoryKey).toLowerCase()}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push({ ...product, base_name: baseName });
  });

  const cards: SimpleProduct[] = [];
  buckets.forEach((variants) => {
    if (!variants.length) return;
    const main = pickMainVariant(variants);
    cards.push({
      ...main,
      display_name: main.base_name || main.display_name || main.name,
      has_variants: variants.length > 1,
      total_variants: variants.length,
      variants,
    });
  });
  return cards;
};

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({ categoryId, limit = 8 }) => {
  const router = useRouter();
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const { addToCart } = useCart();

  useEffect(() => {
    fetchFeaturedProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, limit]);

  const fetchFeaturedProducts = async () => {
    setIsLoading(true);
    try {
      const featuredRawUnsorted = await catalogService.getFeaturedProducts(Math.max(limit * 5, 30));
      const featuredRaw = [...featuredRawUnsorted].sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));

      const filteredByCategory = categoryId
        ? featuredRaw.filter((p) => (typeof p.category === 'object' && p.category ? Number(p.category.id) === Number(categoryId) : false))
        : featuredRaw;

      const groupedCardsRaw = groupFeaturedVariants(filteredByCategory);
      const groupedCards = [...groupedCardsRaw].sort((a, b) => getCardNewestSortKey(b) - getCardNewestSortKey(a));
      setProducts(groupedCards.slice(0, limit));
    } catch (error) {
      console.error('Error fetching featured products:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = (productId: number) => {
    setImageErrors((prev) => {
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
      router.push('/e-commerce/checkout');
    } catch (error: any) {
      console.error('Error adding to cart:', error);
      fireToast(error?.message || 'Failed to add to cart', 'error');
    }
  };

  if (isLoading) {
    return (
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-4 sm:p-6 lg:p-7">
            <div className="h-3 w-36 rounded rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="mt-3 h-8 w-56 rounded rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
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

  if (products.length === 0) return null;

  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface p-4 sm:p-6 lg:p-7 relative overflow-hidden">
          {/* Section gold accent glow */}
          <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-40"
               style={{ background: 'radial-gradient(circle, rgba(176,124,58,0.12) 0%, transparent 70%)', filter: 'blur(24px)' }} />
          <SectionHeader
            eyebrow="Curated edit"
            title="Featured Products"
            subtitle="Highlighted items and best storefront picks"
            actionLabel="View all products"
            onAction={() => router.push('/e-commerce/products')}
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
      </div>
    </section>
  );
};

export default FeaturedProducts;