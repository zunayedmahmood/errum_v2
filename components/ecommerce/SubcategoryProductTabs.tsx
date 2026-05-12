'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import { useCart } from '@/app/e-commerce/CartContext';
import { fireToast } from '@/lib/globalToast';

/* ─── helpers ────────────────────────────────────────────────────────────── */

const normalizeKey = (v: unknown): string =>
  String(v || '').toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');

const catSlug = (c: CatalogCategory) =>
  c.slug || c.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

/** Flatten the full category tree into a flat array */
const flattenAll = (nodes: CatalogCategory[]): CatalogCategory[] => {
  const out: CatalogCategory[] = [];
  const walk = (list: CatalogCategory[]) =>
    list.forEach(n => { out.push(n); if (n.children?.length) walk(n.children); });
  walk(nodes);
  return out;
};

/* ─── component ─────────────────────────────────────────────────────────── */

interface TabData {
  category: CatalogCategory;
  products: SimpleProduct[];
  loading: boolean;
  loaded: boolean;
}

const GRADIENTS = [
  'linear-gradient(160deg,#e8e4df 0%,#d3cdc5 40%,#b8b0a5 100%)',
  'linear-gradient(160deg,#dde4e8 0%,#c5cdd3 40%,#a5b0b8 100%)',
  'linear-gradient(160deg,#e8e4df 0%,#c8c2ba 40%,#a59e95 100%)',
];

interface SubcategoryProductTabsProps {
  tabsCount?: number;
  productsPerTab?: number;
  /** Parent category matchers (slug or name). Example: ["sneakers"] */
  parentQueries?: string[];
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** If parent category isn't found, hide the whole section instead of falling back to random leaves. */
  hideIfNotFound?: boolean;
  /** Explicit exact parent category ID (bypasses parentQueries) */
  categoryId?: number;
  /** Explicit subcategory IDs in desired order (bypasses auto-finding leaves) */
  subcategoryIds?: number[];
}


const SubcategoryProductTabs: React.FC<SubcategoryProductTabsProps> = ({
  tabsCount = 6,
  productsPerTab = 8,
  parentQueries = ['sneakers', 'sneaker'],
  eyebrow,
  title,
  subtitle,
  hideIfNotFound = true,
  categoryId,
  subcategoryIds,
}) => {
  const router = useRouter();
  const { addToCart } = useCart();

  const [allCats, setAllCats] = useState<CatalogCategory[]>([]);
  const [tabs, setTabs] = useState<CatalogCategory[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null); // null means "All Products"
  const [tabData, setTabData] = useState<Record<string, TabData>>({}); // use string key to handle 'all'
  const [loadingCats, setLoadingCats] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [parentLabel, setParentLabel] = useState<string>('');
  const [parentNode, setParentNode] = useState<CatalogCategory | null>(null);
  const [heroImgByCat, setHeroImgByCat] = useState<Record<number, string>>({});
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string | number, HTMLButtonElement | null>>({});


  const findParentNode = (flat: CatalogCategory[], queries: string[]): CatalogCategory | null => {
    const q = (queries || []).map(normalizeKey).filter(Boolean);
    if (!q.length) return null;

    // Exact match by slug or name
    for (const needle of q) {
      const exact =
        flat.find(c => normalizeKey(c?.slug) === needle || normalizeKey(c?.name) === needle) || null;
      if (exact) return exact;
    }

    // Contains match (e.g. "Sneakers Collection", "Fashion Accessories")
    for (const needle of q) {
      const relaxed =
        flat.find(
          c => normalizeKey(c?.slug).includes(needle) || normalizeKey(c?.name).includes(needle)
        ) || null;
      if (relaxed) return relaxed;
    }

    return null;
  };

  const uniqById = (list: CatalogCategory[]): CatalogCategory[] => {
    const seen = new Set<number>();
    const out: CatalogCategory[] = [];
    list.forEach(c => {
      const id = Number(c?.id || 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(c);
    });
    return out;
  };

  /* ── load category tree ─────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tree = await catalogService.getCategories();
        const flat = flattenAll(tree);


        /**
         * "Shop by Subcategory" section:
         * - If categoryId is provided, use it. Otherwise, find by parentQueries.
         * - If subcategoryIds are provided, strictly use them in that order.
         * - Otherwise, auto-find leaves and sort by product_count.
         */
        const parent = categoryId ? flat.find(c => Number(c.id) === Number(categoryId)) || null : findParentNode(flat, parentQueries);
        
        if (alive) {
          setParentLabel(parent?.name || '');
          setParentNode(parent);
        }
        
        let selected: CatalogCategory[] = [];

        if (parent) {
          if (subcategoryIds && subcategoryIds.length > 0) {
            // Strictly use provided subcategory IDs in the exact order they were provided
            selected = subcategoryIds
              .map(id => flat.find(c => Number(c.id) === Number(id)))
              .filter(Boolean) as CatalogCategory[];
          } else if (parent.children?.length) {
            const descendants = flattenAll(parent.children);
            let leaves = descendants.filter(c => c.name && !c.children?.length);
            if (!leaves.length) leaves = descendants.filter(c => c.name);
            selected = uniqById(leaves);
            selected.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
          } else {
            selected = [parent];
          }
        }

        if (!selected.length && !hideIfNotFound) {
          let leaves = flat.filter(c => c.name && !c.children?.length);
          leaves.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
          selected = leaves.slice(0, tabsCount);

          if (selected.length < 2) {
            const allNamed = [...flat].filter(c => c.name);
            allNamed.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
            selected = allNamed.slice(0, tabsCount);
          }
        }

        if (!alive) return;
        setAllCats(flat);
        setTabs(selected);
        // Default to first tab instead of "All Products"
        if (selected.length > 0) {
          setActiveId(selected[0].id);
        }
      } catch (e) {
        console.error('SubcategoryTabs: failed to load categories', e);
      }
      if (alive) setLoadingCats(false);
    })();
    return () => { alive = false; };
  }, [tabsCount]);

  /**
   * Ensure top 3 banner cards have an image.
   * If category image is missing, use the first product image from that subcategory.
   */
  useEffect(() => {
    let alive = true;
    const top3 = tabs.slice(0, 3);
    if (!top3.length) return;

    (async () => {
      for (const cat of top3) {
        const existing = heroImgByCat[cat.id];
        const direct = cat.image_url || (cat as any).image || '';
        if (existing || direct) continue;

        try {
          const response = await catalogService.getProducts({
            page: 1,
            per_page: 4,
            category_id: cat.id,
            sort_by: 'newest',
          });
          const cards = buildCardProductsFromResponse(response);
          const img = (cards?.[0]?.images?.[0] as any)?.url || '';
          if (alive && img) {
            setHeroImgByCat(prev => ({ ...prev, [cat.id]: img }));
          }
        } catch {
          /* ignore fetch errors for images */
        }
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map(t => t.id).join('|')]);

  /* ── fetch products for active tab ──────────────────────────────── */
  useEffect(() => {
    // If activeId is null, we are in "All Products" for the parentNode
    // If we have categories but no explicit selection yet, wait for logic above.
    if (activeId === undefined) return;

    const key = activeId === null ? 'all' : String(activeId);
    if (tabData[key]?.loaded || tabData[key]?.loading) return;

    const cat = activeId === null ? (parentNode || null) : tabs.find(c => c.id === activeId);
    if (!cat && activeId !== null) return;

    let alive = true;
    setTabData(p => ({ ...p, [key]: { category: cat!, products: [], loading: true, loaded: false } }));

    (async () => {
      let products: SimpleProduct[] = [];
      try {
        const targetId = activeId;
        if (!targetId) return;

        const response = await catalogService.getProducts({
          page: 1,
          per_page: productsPerTab,
          category_id: targetId,
          sort_by: 'newest',
          group_by_sku: true as any,
        } as any);

        // Standard logic from products/page.tsx: use grouped_products if available
        const rawProducts = response.grouped_products?.length
          ? response.grouped_products.map(gp => gp.main_variant)
          : response.products;

        products = buildCardProductsFromResponse({ ...response, products: rawProducts });
      } catch (e) {
        console.error('SubcategoryTabs: fetch failed', e);
      }

      if (alive) {
        setTabData(p => ({ ...p, [key]: { category: cat!, products, loading: false, loaded: true } }));
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs.length, parentNode?.id]);

  const activeKey = activeId === null ? 'all' : String(activeId);
  const activeTab = tabData[activeKey];
  const onImgError = (id: number) => setImageErrors(prev => { const s = new Set(prev); s.add(id); return s; });

  const onProductClick = (p: SimpleProduct) => router.push(`/e-commerce/product/${p.id}`);
  const onAddToCart = async (p: SimpleProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (p.has_variants) { router.push(`/e-commerce/product/${p.id}`); return; }
    try {
      await addToCart(p.id, 1);
      fireToast(`Added to cart: ${p?.name || 'Item'}`, 'success');
    } catch (error: any) {
      fireToast(error?.message || 'Failed to add to cart', 'error');
    }
  };

  /* ── skeleton ── */
  if (loadingCats) {
    return (
      <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <div className="ec-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
            <div style={{ height: '24px', width: '180px', background: '#f0f0f0', borderRadius: '4px' }} />
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto' }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: '36px', width: '80px', background: '#f0f0f0', borderRadius: '4px', flexShrink: 0 }} />)}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div style={{ aspectRatio: '3/4', background: '#f5f5f5', borderRadius: '4px', marginBottom: '8px' }} />
                <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '75%' }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!tabs.length && hideIfNotFound && !parentNode) return null;

  /* ── main ── */
  return (
    <section style={{ background: '#ffffff', padding: '48px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container">

        {/* Section header — reference style */}
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
            {title ?? (parentLabel ? parentLabel.toUpperCase() : eyebrow?.toUpperCase() ?? 'NEW AND POPULAR')}
          </h2>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
        </div>

        {/* Scrollable pill tabs — reference style */}
        <div style={{ marginBottom: '24px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div
            ref={tabsContainerRef}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px', flexWrap: 'nowrap' }}
          >
            {tabs.map((cat) => (
              <button
                key={cat.id}
                ref={el => { tabRefs.current[cat.id] = el; }}
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
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div style={{ minHeight: '400px' }}>
          {activeTab?.loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <div style={{ aspectRatio: '3/4', background: '#f5f5f5', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '75%', marginBottom: '6px' }} />
                  <div style={{ height: '14px', background: '#f5f5f5', borderRadius: '4px', width: '40%' }} />
                </div>
              ))}
            </div>
          ) : activeTab?.products.length ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 md:gap-6">
              {activeTab.products.map((p, index) => (
                <PremiumProductCard
                  key={`${activeKey}-${p.id}`}
                  product={p}
                  animDelay={Math.min(index, 9) * 60}
                  imageErrored={imageErrors.has(p.id)}
                  onImageError={onImgError}
                  onOpen={onProductClick}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', textAlign: 'center', background: '#f8f8f8', borderRadius: '8px', border: '1px dashed rgba(0,0,0,0.15)' }}>
              <p style={{ color: '#999999', fontSize: '14px' }}>No products found in this collection</p>
            </div>
          )}
        </div>

        {/* View All Button */}
        {activeTab?.category && activeTab.products.length > 0 && (
          <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => router.push(`/e-commerce/${encodeURIComponent(catSlug(activeTab.category))}`)}
              style={{
                padding: '12px 32px',
                background: '#ffffff',
                color: '#111111',
                border: '1.5px solid #111111',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: "'Poppins', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.10em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#111111'; (e.currentTarget as HTMLElement).style.color = '#ffffff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
            >
              View All {activeTab.category.name}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default SubcategoryProductTabs;