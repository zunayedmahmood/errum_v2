'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import { buildCardProductsFromResponse } from '@/lib/ecommerceCardUtils';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import { useCart } from '@/app/e-commerce/CartContext';

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

const SubcategoryProductTabs: React.FC<{ tabsCount?: number; productsPerTab?: number }> = ({
  tabsCount = 6,
  productsPerTab = 8,
}) => {
  const router = useRouter();
  const { addToCart } = useCart();

  const [allCats,     setAllCats]     = useState<CatalogCategory[]>([]);
  const [tabs,        setTabs]        = useState<CatalogCategory[]>([]);
  const [activeId,    setActiveId]    = useState<number | null>(null);
  const [tabData,     setTabData]     = useState<Record<number, TabData>>({});
  const [loadingCats, setLoadingCats] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  /* ── load category tree ─────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tree = await catalogService.getCategories();
        const flat = flattenAll(tree);

        // Prefer leaf categories (no children) as they are the most specific
        let leaves = flat.filter(c => c.name && !c.children?.length);
        leaves.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
        let selected = leaves.slice(0, tabsCount);

        // Fallback: if not enough leaves, use all categories sorted by product_count
        if (selected.length < 2) {
          const allNamed = [...flat].filter(c => c.name);
          allNamed.sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0));
          selected = allNamed.slice(0, tabsCount);
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
    try { await addToCart(p.id, 1); } catch {}
  };

  /* ── skeleton ── */
  if (loadingCats) {
    return (
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-4 sm:p-6 lg:p-8">
            <div className="mb-6 space-y-2">
              <div className="h-3 w-32 rounded-full bg-neutral-200 animate-pulse" />
              <div className="h-8 w-56 rounded-lg   bg-neutral-200 animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
              {[1,2,3].map(i => <div key={i} className="aspect-[3/4] rounded-2xl bg-neutral-100 animate-pulse" />)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!tabs.length) return null;

  /* ── main ── */
  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-6 pb-5 sm:px-6 lg:px-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="ec-eyebrow">Collections</p>
              <h2 className="ec-heading mt-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                Shop by Subcategory
              </h2>
              <p className="mt-1 text-sm text-neutral-500">Select a collection to explore the latest styles</p>
            </div>
            {activeTab?.category && (
              <button
                onClick={() => router.push(`/e-commerce/${encodeURIComponent(catSlug(activeTab.category))}`)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm transition hover:border-neutral-400 self-start sm:self-auto whitespace-nowrap"
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
                const imgUrl = cat.image_url || (cat as any).image || null;

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
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-200">
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
                        <div className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md">
                          <svg className="h-4 w-4 text-neutral-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                    className={`ec-pill ${cat.id === activeId ? 'ec-pill-active' : ''} px-4 py-1.5 text-xs`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mx-4 sm:mx-6 lg:mx-8 border-t border-neutral-100" />

          {/* Product grid */}
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab?.loading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: productsPerTab }).map((_, i) => (
                  <div key={i} className="ec-card overflow-hidden rounded-2xl animate-pulse">
                    <div className="aspect-[4/5] bg-neutral-100" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 rounded bg-neutral-100" />
                      <div className="h-4 rounded bg-neutral-100" />
                      <div className="h-4 w-1/2 rounded bg-neutral-100" />
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
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 py-14 text-center">
                <p className="ec-heading text-lg font-medium text-neutral-400">No products in this category yet</p>
                <p className="mt-1 text-sm text-neutral-400">Check back soon for new arrivals</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};

export default SubcategoryProductTabs;
