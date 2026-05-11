'use client';

import React, { useEffect, useState } from 'react';
import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import MimicPremiumProductCard from './MimicPremiumProductCard';

interface MimicSubcategoryProductTabsProps {
  categoryId?: number;
  subcategoryIds?: number[];
  title?: string;
  productsPerTab?: number;
}

const flattenAll = (nodes: CatalogCategory[]): CatalogCategory[] => {
  const out: CatalogCategory[] = [];
  const walk = (list: CatalogCategory[]) =>
    list.forEach(n => { out.push(n); if (n.children?.length) walk(n.children); });
  walk(nodes);
  return out;
};

const MimicSubcategoryProductTabs: React.FC<MimicSubcategoryProductTabsProps> = ({
  categoryId,
  subcategoryIds,
  title,
  productsPerTab = 8,
}) => {
  const [tabs, setTabs] = useState<CatalogCategory[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCats, setLoadingCats] = useState(true);
  const [parentLabel, setParentLabel] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const tree = await catalogService.getCategories();
        const flat = flattenAll(tree);
        const parent = flat.find(c => Number(c.id) === Number(categoryId));
        
        if (parent) {
          setParentLabel(parent.name);
          if (subcategoryIds && subcategoryIds.length > 0) {
            const selected = subcategoryIds
              .map(id => flat.find(c => Number(c.id) === Number(id)))
              .filter(Boolean) as CatalogCategory[];
            setTabs(selected);
            if (selected.length > 0) setActiveId(selected[0].id);
          } else if (parent.children?.length) {
             const descendants = flattenAll(parent.children);
             const leaves = descendants.filter(c => c.name && !c.children?.length);
             setTabs(leaves.slice(0, 6));
             if (leaves.length > 0) setActiveId(leaves[0].id);
          }
        }
      } catch (e) {
        console.error('MimicSubcategoryTabs: failed', e);
      } finally {
        setLoadingCats(false);
      }
    })();
  }, [categoryId, subcategoryIds]);

  useEffect(() => {
    if (!activeId) return;
    (async () => {
      setLoading(true);
      try {
        const response = await catalogService.getProducts({
          page: 1,
          per_page: productsPerTab,
          category_id: activeId,
          sort_by: 'newest',
          group_by_sku: true as any,
        } as any);

        const rawProducts = response.grouped_products?.length
          ? response.grouped_products.map(gp => gp.main_variant)
          : response.products;

        setProducts(buildCardProductsFromResponse({ ...response, products: rawProducts }));
      } catch (e) {
        console.error('MimicSubcategoryTabs: fetch failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeId, productsPerTab]);

  if (loadingCats) return null;
  if (!tabs.length) return null;

  return (
    <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
          <h2 style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: '18px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: '#111111',
            margin: 0,
          }}>
            {title || parentLabel.toUpperCase()}
          </h2>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
        </div>

        <div style={{ marginBottom: '24px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
            {tabs.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveId(cat.id)}
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: activeId === cat.id ? '1.5px solid #111111' : '1.5px solid rgba(0,0,0,0.15)',
                  background: activeId === cat.id ? '#111111' : '#ffffff',
                  color: activeId === cat.id ? '#ffffff' : '#555555',
                  cursor: 'default',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ minHeight: '300px' }}>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div style={{ aspectRatio: '2/3', background: '#f5f5f5', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '75%' }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
              {products.map((p, index) => (
                <MimicPremiumProductCard
                  key={p.id}
                  product={p}
                  animDelay={index * 50}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default MimicSubcategoryProductTabs;
