'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import catalogService, { SimpleProduct } from '@/services/catalogService';
import { groupedDisplayProducts } from '@/components/ecommerce/reference/storefrontUtils';

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const [collection, setCollection] = useState<any>(null);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const latestRequest = useRef(0);

  const load = useCallback(async (targetPage = 1, append = false) => {
    if (!slug) return;
    const requestNumber = ++latestRequest.current;
    setLoading(true);
    if (!append) {
      setProducts([]);
      setCollection(null);
      setError(false);
    }

    try {
      const response = await catalogService.getCollection(slug, { page: targetPage });
      if (requestNumber !== latestRequest.current) return;
      if (!response?.success) throw new Error('Collection not found');

      setCollection(response.collection);
      const payload = response.products || {};
      const next = Array.isArray(payload.data)
        ? payload.data
        : groupedDisplayProducts({ products: payload.products || [] });
      setProducts((current) => append
        ? [...current, ...next.filter((item: SimpleProduct) => !current.some((existing) => existing.id === item.id))]
        : next);
      setPage(Number(payload.current_page || targetPage));
      setLastPage(Number(payload.last_page || 1));
      setError(false);
    } catch (requestError) {
      if (requestNumber !== latestRequest.current) return;
      console.error('Unable to load collection:', requestError);
      setError(true);
    } finally {
      if (requestNumber === latestRequest.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setPage(1);
    load(1, false);
  }, [load, slug]);

  if (!slug) return <div className="ref-page-loader">LOADING COLLECTION...</div>;

  return (
    <main className="ref-storefront ref-catalog-page ref-collection-page">
      <Navigation />
      {error ? (
        <section className="ref-empty-commerce">
          <Package size={28} />
          <h1>COLLECTION NOT FOUND</h1>
          <p>This curated drop may have moved or is no longer available.</p>
          <button onClick={() => router.push('/e-commerce/products')}><ArrowLeft size={15} /> BACK TO SHOP</button>
        </section>
      ) : (
        <>
          <header className="ref-collection-header">
            {collection?.banner_url && <img src={collection.banner_url} alt="" />}
            <div>
              <span>CURATED COLLECTION</span>
              <h1>{collection?.name || (loading ? 'LOADING COLLECTION' : 'ERRUM COLLECTION')}</h1>
              <p>{collection?.description || 'A focused selection of premium ERRUM releases.'}</p>
            </div>
          </header>
          <section className="ref-collection-results">
            <div className="ref-product-grid">
              {loading && !products.length && Array.from({ length: 8 }).map((_, index) => (
                <div className="ref-product-skeleton" key={`collection-skeleton-${index}`}><div /><i /><b /></div>
              ))}
              {products.map((product, index) => (
                <PremiumProductCard
                  key={product.id}
                  product={product}
                  animDelay={(index % 12) * 35}
                  onOpen={(item) => router.push(`/e-commerce/product/${item.id}`)}
                  onAddToCart={() => undefined}
                />
              ))}
            </div>
            {loading && !!products.length && <div className="ref-loading-grid">LOADING DROPS...</div>}
            {!loading && !products.length && <div className="ref-empty-state"><h2>THIS COLLECTION IS BEING CURATED</h2><p>Check back soon for new releases.</p></div>}
            {!loading && page < lastPage && (
              <button className="ref-load-more" onClick={() => load(page + 1, true)}>LOAD MORE DROPS</button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
