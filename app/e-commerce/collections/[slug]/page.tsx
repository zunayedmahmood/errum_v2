"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, {
  SimpleProduct,
} from '@/services/catalogService';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import { X, Package, Search } from 'lucide-react';

export default function CollectionPage() {
  const params = useParams() as any;
  const router = useRouter();
  const { addToCart, setIsCartOpen } = useCart();
  const slug = params.slug || '';

  const [collection, setCollection] = useState<any>(null);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const fetchCollection = async (page = 1) => {
    try {
      setLoading(true);
      const response = await catalogService.getCollection(slug, { page });
      
      if (response.success) {
        setCollection(response.collection);
        setProducts(response.products.data || []);
        setCurrentPage(response.products.current_page);
        setTotalPages(response.products.last_page);
        setTotalResults(response.products.total);
        setError(null);
      } else {
        setError('Collection not found');
      }
    } catch (err: any) {
      console.error('Error fetching collection:', err);
      setError(err.response?.status === 404 ? 'Collection not found' : 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      fetchCollection(1);
    }
  }, [slug]);

  const handleAddToCart = async (product: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (product.has_variants) {
        router.push(`/e-commerce/product/${product.id}`);
        return;
      }
      await addToCart(product.id, 1);
      setIsCartOpen(true);
    } catch (err) {
      console.error('Error adding to cart:', err);
    }
  };

  const handleProductClick = (product: SimpleProduct) => {
    router.push(`/e-commerce/product/${product.id}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchCollection(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading && !collection) {
    return (
      <>
        <Navigation />
        <div className="ec-root bg-[var(--bg-root)] min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-40 md:h-64 rounded-3xl mb-8 bg-gray-100" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-2xl bg-gray-100" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navigation />
        <div className="ec-root bg-[var(--bg-root)] min-h-screen flex items-center justify-center">
          <div className="text-center p-10 max-w-md">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-10 h-10 text-rose-500" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">{error}</h1>
            <p className="text-[var(--text-secondary)] mb-8">The collection you're looking for might have been moved or archived.</p>
            <button 
              onClick={() => router.push('/e-commerce/products')}
              className="px-8 py-3 bg-[var(--text-primary)] text-[var(--bg-root)] rounded-xl font-bold"
            >
              Back to Catalog
            </button>
          </div>
        </div>
      </>
    );
  }

  const bannerUrl = collection?.banner_url;

  return (
    <>
      <Navigation />
      <div className="ec-root bg-[var(--bg-root)] min-h-screen">
        {/* Collection Hero */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
          {(() => {
            const bannerUrl = collection?.banner_url;
            return (
              <>
                {bannerUrl && (
                  <div className="relative h-[300px] md:h-[450px] overflow-hidden rounded-[30px] md:rounded-[60px] mb-12 shadow-sm border border-[var(--border-default)]">
                    <img src={bannerUrl} alt={collection?.name} className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className="mb-16 text-left ec-anim-fade-up">
                  <span className="text-[var(--cyan)] font-bold tracking-[0.3em] uppercase text-[10px] md:text-xs mb-4 block">
                    Curated Collection
                  </span>
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-light text-[var(--text-primary)] mb-6 tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {collection?.name}
                  </h1>
                  {collection?.description && (
                    <p className="text-[var(--text-secondary)] max-w-2xl text-sm md:text-base font-light leading-relaxed mb-8">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="h-px w-12 bg-[var(--cyan)]" />
                    <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold">{totalResults} Pieces Available</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          {products.length === 0 ? (
            <div className="text-center py-24 bg-[var(--bg-surface)] rounded-[40px] border border-dashed border-[var(--border-default)]">
              <Package className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-6 opacity-20" />
              <h3 className="text-xl font-light text-[var(--text-primary)]">Collection is being curated</h3>
              <p className="text-[var(--text-secondary)] text-sm mt-2">We're currently adding items to this collection. Check back soon!</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-12 gap-x-4 md:gap-8">
                {products.map((product, index) => (
                  <PremiumProductCard
                    key={product.id}
                    product={product}
                    animDelay={Math.min(index, 12) * 50}
                    onOpen={handleProductClick}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center mt-16 gap-3">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-6 py-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-all text-sm font-medium"
                  >
                    Previous
                  </button>
                  <div className="flex gap-2">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => handlePageChange(i + 1)}
                        className={`w-11 h-11 rounded-2xl text-sm font-medium transition-all ${currentPage === i + 1 
                          ? 'bg-[var(--cyan)] text-white shadow-xl shadow-cyan/20' 
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-6 py-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-all text-sm font-medium"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
