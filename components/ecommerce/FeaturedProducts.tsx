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


const pickSharedImages = (items: SimpleProduct[]): SimpleProduct['images'] => {
  for (const p of items) {
    const imgs = (p as any)?.images;
    if (Array.isArray(imgs) && imgs.length > 0) return imgs;
  }
  return [];
};

const applySharedImages = (main: SimpleProduct, variants: SimpleProduct[]): { main: SimpleProduct; variants: SimpleProduct[] } => {
  const shared = pickSharedImages([main, ...variants]);
  if (shared.length === 0) return { main, variants };

  const fixedMain = (!Array.isArray(main.images) || main.images.length === 0) ? { ...main, images: shared } : main;
  const fixedVariants = variants.map(v => (Array.isArray(v.images) && v.images.length > 0) ? v : { ...v, images: shared });
  return { main: fixedMain, variants: fixedVariants };
};

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
    const mainRaw = pickMainVariant(variants);
    const { main, variants: fixedVariants } = applySharedImages(mainRaw, variants);
    cards.push({
      ...main,
      display_name: main.base_name || main.display_name || main.name,
      has_variants: variants.length > 1,
      total_variants: variants.length,
      variants: fixedVariants,
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
      <section style={{ background: '#f8f8f8', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <div className="ec-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
            <div style={{ height: '24px', width: '180px', background: '#f0f0f0', borderRadius: '4px' }} />
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div style={{ aspectRatio: '3/4', background: '#f0f0f0', borderRadius: '4px', marginBottom: '8px' }} />
                <div style={{ height: '14px', background: '#f0f0f0', borderRadius: '4px', width: '75%', marginBottom: '6px' }} />
                <div style={{ height: '14px', background: '#f0f0f0', borderRadius: '4px', width: '40%' }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section style={{ background: '#f8f8f8', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container">
        {/* Section header */}
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
              Featured Selection
            </h2>
            <div style={{ height: '1px', flex: 1, maxWidth: '40px', background: '#111111' }} />
          </div>
          <button
            onClick={() => router.push('/e-commerce/products')}
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
              cursor: 'pointer',
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

export default FeaturedProducts;