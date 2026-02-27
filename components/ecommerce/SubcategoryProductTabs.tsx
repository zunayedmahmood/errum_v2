'use client';

import React, { useEffect, useState } from 'react';
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

/**
 * Build the set of IDs and name-keys that this category (and all its descendants) own.
 * A product matches if its category id or name/slug is in this set.
 */
const buildAllowedSet = (cat: CatalogCategory) => {
  const ids  = new Set<number>();
  const keys = new Set<string>();
  const walk = (node: CatalogCategory) => {
    if (node.id)   ids.add(Number(node.id));
    if (node.name) keys.add(normalizeKey(node.name));
    if (node.slug) keys.add(normalizeKey(node.slug));
    node.children?.forEach(walk);
  };
  walk(cat);
  return { ids, keys };
};

/**
 * Does this product's attached category match the allowed set?
 * Checks category.id, category.name, category.slug, and legacy flat fields.
 */
const productMatchesCat = (
  product: SimpleProduct,
  allowed: { ids: Set<number>; keys: Set<string> }
): boolean => {
  if (allowed.ids.size === 0 && allowed.keys.size === 0) return true;

  const cat: any = (product as any)?.category;

  // id match
  const catId = Number(cat?.id || 0);
  if (catId > 0 && allowed.ids.has(catId)) return true;

  // name / slug match
  const checkKeys = [
    cat?.name,
    cat?.slug,
    (product as any)?.category_name,
    (product as any)?.category_slug,
  ]
    .map(v => normalizeKey(v))
    .filter(Boolean);

  return checkKeys.some(k => allowed.keys.has(k));
};

/**
 * Does the product's base_name / name / display_name contain this category's name?
 * Used as a heuristic when products are tagged with a parent category only.
 * e.g. product named "Jordan 1 High Union LA" contains "jordan 1 high"
 */
const productNameContainsCat = (product: SimpleProduct, catName: string): boolean => {
  const needle = normalizeKey(catName);
  if (!needle) return false;
  const haystack = normalizeKey(
    [product.display_name, product.base_name, product.name].filter(Boolean).join(' ')
  );
  return haystack.includes(needle);
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
}


const SubcategoryProductTabs: React.FC<SubcategoryProductTabsProps> = ({
  tabsCount = 6,
  productsPerTab = 8,
  parentQueries = ['sneakers', 'sneaker'],
  eyebrow,
  title,
  subtitle,
  hideIfNotFound = true,
}) => {
  const router = useRouter();
  const { addToCart } = useCart();

  const [allCats,     setAllCats]     = useState<CatalogCategory[]>([]);
  const [tabs,        setTabs]        = useState<CatalogCategory[]>([]);
  const [activeId,    setActiveId]    = useState<number | null>(null);
  const [tabData,     setTabData]     = useState<Record<number, TabData>>({});
  const [loadingCats, setLoadingCats] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [heroImgByCat, setHeroImgByCat] = useState<Record<number, string>>({});
  const [parentLabel, setParentLabel] = useState<string>('');
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
 * - Find a parent category by slug/name (parentQueries)
 * - Show ALL subcategories under that parent
 * - Top 3 (by product_count) appear as image banner cards
 * - The rest appear as pill/capsule tabs
 */
const parent = findParentNode(flat, parentQueries);
if (alive) setParentLabel(parent?.name || '');
let selected: CatalogCategory[] = [];

if (parent) {
  if (parent.children?.length) {
    const descendants = flattenAll(parent.children);
    let leaves = descendants.filter(c => c.name && !c.children?.length);
    if (!leaves.length) leaves = descendants.filter(c => c.name);
    selected = uniqById(leaves);
  } else {
    selected = [parent];
  }

  selected.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
}

if (!selected.length) {
  if (hideIfNotFound) {
    if (alive) {
      setAllCats(flat);
      setTabs([]);
      setActiveId(null);
      setLoadingCats(false);
    }
    return;
  }
          
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
        if (selected.length) setActiveId(selected[0].id);
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
            per_page: 6,
            category_id: cat.id,
            sort_by: 'newest',
            sort_order: 'desc',
          } as any);
          const cards = buildCardProductsFromResponse(response);
          const img = (cards?.[0]?.images?.[0] as any)?.url || '';
          if (alive && img) {
            setHeroImgByCat(prev => ({ ...prev, [cat.id]: img }));
          }
        } catch {
          // ignore
        }
      }
    })();

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map(t => t.id).join('|')]);

  /* ── fetch products for active tab ──────────────────────────────── */
  useEffect(() => {
    if (!activeId) return;
    const cat = tabs.find(c => c.id === activeId);
    if (!cat) return;
    if (tabData[activeId]?.loaded || tabData[activeId]?.loading) return;

    let alive = true;
    setTabData(p => ({ ...p, [activeId]: { category: cat, products: [], loading: true, loaded: false } }));

    (async () => {
      const allowed = buildAllowedSet(cat);

      // Find parent category (products may be tagged with parent instead of child)
      const parent = allCats.find(c => c.id === cat.parent_id) || null;

      /**
       * Fetch strategy — try most specific first, broaden on each miss:
       * 1. Direct API filter by child category id/name
       * 2. Direct API filter by parent category id (products tagged with parent)
       * 3. No filter — fetch all, rely purely on client-side matching
       *
       * In ALL cases, apply a two-pass client-side filter:
       *   Pass 1 (strict): product.category matches child category exactly
       *   Pass 2 (heuristic): product name contains the child category name
       *   (handles case where products are tagged with parent but named after the child)
       */
      const fetchAttempts: Record<string, any>[] = [
        { category_id: cat.id,                                    sort_by: 'newest', sort_order: 'desc' },
        { category_id: cat.id, category: cat.name,                sort_by: 'newest', sort_order: 'desc' },
        { category: cat.name,  category_slug: cat.slug,           sort_by: 'newest', sort_order: 'desc' },
        ...(parent ? [
          { category_id: parent.id,                               sort_by: 'newest', sort_order: 'desc' },
          { category_id: parent.id, category: parent.name,        sort_by: 'newest', sort_order: 'desc' },
        ] : []),
        { sort_by: 'newest', sort_order: 'desc', per_page: 120 }, // last resort: no filter
      ];

      let products: SimpleProduct[] = [];

      for (const params of fetchAttempts) {
        try {
          const response = await catalogService.getProducts({
            page: 1,
            per_page: Math.max(productsPerTab * 8, 80),
            ...(params as any),
          });

          const cards = buildCardProductsFromResponse(response);

          // Pass 1: strict category match (category id or name equals this child category)
          const strict = cards.filter(p => productMatchesCat(p, allowed));

          if (strict.length > 0) {
            products = strict.slice(0, productsPerTab);
            break;
          }

          // Pass 2: heuristic — product name contains child category name
          // (e.g. product named "Jordan 1 High Union LA" under "Sneakers" category
          //  should appear in the "Jordan 1 High" tab)
          const byName = cards.filter(p => productNameContainsCat(p, cat.name));

          if (byName.length > 0) {
            products = byName.slice(0, productsPerTab);
            break;
          }

          // This attempt yielded nothing — try next
        } catch { /* try next attempt */ }
      }

      if (alive) {
        setTabData(p => ({ ...p, [activeId]: { category: cat, products, loading: false, loaded: true } }));
      }
    })();

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs.length, allCats.length]);

  const activeTab  = activeId ? tabData[activeId] : null;
  const onImgError = (id: number) => setImageErrors(prev => { const s = new Set(prev); s.add(id); return s; });

  const onProductClick = (p: SimpleProduct) => router.push(`/e-commerce/product/${p.id}`);
  const onAddToCart    = async (p: SimpleProduct, e: React.MouseEvent) => {
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
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-4 sm:p-6 lg:p-8">
            <div className="mb-6 space-y-2">
              <div className="h-3 w-32 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-8 w-56 rounded-lg   animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
              {[1,2,3].map(i => <div key={i} className="aspect-[3/4] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!tabs.length) return null;

  if (!tabs.length) return null;

  /* ── main ── */
  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-6 pb-5 sm:px-6 lg:px-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="ec-eyebrow">{eyebrow ?? (parentLabel || 'Collections')}</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(22px,4vw,36px)', fontWeight: 500, color: 'white', letterSpacing: '-0.01em' }}>
                {title ?? 'Shop by Subcategory'}
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{subtitle ?? (parentLabel ? `Select a ${parentLabel} collection to explore the latest styles` : 'Select a collection to explore the latest styles')}</p>
            </div>
            {activeTab?.category && (
              <button
  onClick={() =>
    router.push(`/e-commerce/${encodeURIComponent(catSlug(activeTab.category))}`)
  }
  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition self-start sm:self-auto whitespace-nowrap"
  style={{
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = 'var(--gold)';
    e.currentTarget.style.color = 'var(--gold-light)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
  }}
>
  View all in {activeTab.category.name} →
</button>
            )}
          </div>

          {/* Banner cards — top 3 tabs as tall portrait images */}
          <div className="px-4 sm:px-6 lg:px-8 pb-5">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(tabs.length, 3)}, 1fr)` }}
            >
              {tabs.slice(0, 3).map((cat, idx) => {
                const active = cat.id === activeId;
                const imgUrl = cat.image_url || (cat as any).image || heroImgByCat[cat.id] || null;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveId(cat.id)}
                    className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-300 focus-visible:outline-none ${
                      active
                        ? 'ring-2 ring-offset-2 ring-neutral-900 shadow-2xl'
                        : 'shadow-md hover:shadow-xl'
                    }`}
                  >
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={cat.name}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="absolute inset-0" style={{ background: GRADIENTS[idx % 3] }} />
                      )}

                      {/* Gradient overlay for text legibility */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Active checkmark */}
                      {active && (
                        <div className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full " style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
                          <svg className="h-4 w-4" style={{ color: 'var(--gold)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      {/* Text overlay */}
                      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                        <div className="mb-1.5 flex items-center gap-2">
                          <div className="h-px w-6 bg-white/50" />
                          <span className="text-[9px] uppercase tracking-[0.22em] font-medium text-white/60">Collection</span>
                        </div>
                        <p
                          className="text-xl font-semibold leading-tight text-white drop-shadow sm:text-2xl lg:text-[1.65rem]"
                          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                        >
                          {cat.name}
                        </p>
                        <p className={`mt-1.5 text-xs tracking-wide transition-opacity ${active ? 'text-white' : 'text-white/55 group-hover:text-white/85'}`}>
                          {active ? '✦ Currently viewing' : 'Tap to explore →'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Extra tabs beyond first 3 as slim pill buttons */}
            {tabs.length > 3 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {tabs.slice(3).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveId(cat.id)}
                    className='px-4 py-1.5 text-xs rounded-full transition-all' style={{ border: `1px solid ${cat.id === activeId ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`, background: cat.id === activeId ? 'rgba(176,124,58,0.15)' : 'rgba(255,255,255,0.04)', color: cat.id === activeId ? 'var(--gold-light)' : 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em', fontSize: '11px' }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mx-4 sm:mx-6 lg:mx-8" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

          {/* Product grid */}
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab?.loading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: productsPerTab }).map((_, i) => (
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
            ) : activeTab?.products.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {activeTab.products.map(product => (
                  <PremiumProductCard
                    key={`${activeTab.category.id}-${product.id}`}
                    product={product}
                    compact
                    imageErrored={imageErrors.has(product.id)}
                    onImageError={onImgError}
                    onOpen={onProductClick}
                    onAddToCart={onAddToCart}
                  />
                ))}
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 text-center"
                style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}
              >
                <p className="ec-heading text-lg font-medium " style={{ color: 'rgba(255,255,255,0.35)' }}>No products in this category yet</p>
                <p className="mt-1 text-sm " style={{ color: 'rgba(255,255,255,0.25)' }}>Check back soon for new arrivals</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default SubcategoryProductTabs;