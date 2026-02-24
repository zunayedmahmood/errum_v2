'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import SectionHeader from '@/components/ecommerce/ui/SectionHeader';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

/**
 * Prefer child categories (leaves), fall back to root categories.
 * Sorted by product_count descending so the most active ones appear first.
 */
const getDisplayCategories = (items: CatalogCategory[], max: number): CatalogCategory[] => {
  const out: CatalogCategory[] = [];
  const seen = new Set<number>();

  // First pass: collect children / leaves
  items.forEach(cat => {
    const children = Array.isArray(cat.children) ? cat.children : [];
    if (children.length > 0) {
      children.forEach(child => {
        if (!seen.has(child.id)) { seen.add(child.id); out.push(child); }
      });
    } else if (!seen.has(cat.id)) {
      seen.add(cat.id); out.push(cat);
    }
  });

  // Second pass: add any roots not yet included
  items.forEach(cat => {
    if (!seen.has(cat.id)) { seen.add(cat.id); out.push(cat); }
  });

  return out
    .filter(c => Boolean(c?.name))
    .sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0))
    .slice(0, max);
};

// Elegant gradient placeholders — one per index so each card looks distinct
const GRADIENTS = [
  'linear-gradient(150deg,#e8e2db 0%,#c8bfb4 100%)',
  'linear-gradient(150deg,#dce3e8 0%,#b4c0c8 100%)',
  'linear-gradient(150deg,#e8e3db 0%,#cbbf9e 100%)',
  'linear-gradient(150deg,#dce8e0 0%,#a8c4b0 100%)',
  'linear-gradient(150deg,#e8dce3 0%,#c4a8b8 100%)',
  'linear-gradient(150deg,#e3e8dc 0%,#b8c4a8 100%)',
  'linear-gradient(150deg,#e8e0dc 0%,#c4b8a8 100%)',
  'linear-gradient(150deg,#dce8e8 0%,#a8c4c4 100%)',
  'linear-gradient(150deg,#e8dce8 0%,#c4a8c4 100%)',
  'linear-gradient(150deg,#e8e8dc 0%,#c4c4a8 100%)',
];

interface OurCategoriesProps {
  categories?: CatalogCategory[];
  loading?: boolean;
}

const OurCategories: React.FC<OurCategoriesProps> = ({ categories: categoriesProp, loading = false }) => {
  const router = useRouter();
  const [categories, setCategories] = React.useState<CatalogCategory[]>(categoriesProp || []);
  const [isFetching, setIsFetching] = React.useState<boolean>(!categoriesProp);

  React.useEffect(() => {
    if (categoriesProp && Array.isArray(categoriesProp)) {
      setCategories(categoriesProp);
      setIsFetching(false);
    }
  }, [categoriesProp]);

  React.useEffect(() => {
    if (categoriesProp && Array.isArray(categoriesProp)) return;
    let active = true;
    (async () => {
      try {
        setIsFetching(true);
        const data = await catalogService.getCategories();
        if (active) setCategories(Array.isArray(data) ? data : []);
      } catch {
        if (active) setCategories([]);
      } finally {
        if (active) setIsFetching(false);
      }
    })();
    return () => { active = false; };
  }, [categoriesProp]);

  const displayCategories = getDisplayCategories(categories || [], 10);

  // ── skeleton ──────────────────────────────────────────────────────────────
  if (loading || isFetching) {
    return (
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-4 sm:p-6 lg:p-7">
            <div className="h-3 w-32 rounded-full bg-neutral-200 animate-pulse mb-2" />
            <div className="h-8 w-56 rounded-lg   bg-neutral-200 animate-pulse mb-5" />
            {/* 5-col banner skeleton */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-neutral-100 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (displayCategories.length === 0) return null;

  // ── main render ───────────────────────────────────────────────────────────
  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface p-4 sm:p-6 lg:p-7">
          <SectionHeader
            eyebrow="Discover categories"
            title="Shop by Category"
            subtitle="Explore our curated collections"
            actionLabel="View all"
            onAction={() => router.push('/e-commerce/categories')}
          />

          {/*
            Portrait banner grid — matches the reference image:
            tall cards with product photo filling the card,
            dark gradient at bottom, category name as large serif text overlay.
            5 columns on desktop, 3 on tablet, 2 on mobile.
          */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {displayCategories.map((cat, idx) => {
              const imgSrc = cat.image_url || (cat as any).image || null;
              const href   = `/e-commerce/${encodeURIComponent(cat.slug || slugify(cat.name))}`;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => router.push(href)}
                  className="group relative overflow-hidden rounded-2xl text-left shadow-sm ring-1 ring-neutral-200 transition-all duration-300 hover:ring-neutral-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                  {/* ── Image / gradient placeholder ── */}
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={cat.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: GRADIENTS[idx % GRADIENTS.length] }}
                      />
                    )}

                    {/* Strong gradient for text legibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/18 to-transparent" />

                    {/* ── Text overlay (bottom-left, like reference image) ── */}
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      {/* Eyebrow line */}
                      <div className="mb-1 flex items-center gap-1.5">
                        <div className="h-px w-5 bg-white/50" />
                        <span className="text-[9px] uppercase tracking-[0.22em] text-white/60">Collection</span>
                      </div>

                      {/* Category name — large serif, matches Panjabi/Polo/Perfume reference */}
                      <p
                        className="text-base font-semibold leading-tight text-white drop-shadow sm:text-lg lg:text-xl"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em' }}
                      >
                        {cat.name}
                      </p>

                      {/* Item count + explore cta */}
                      <p className="mt-1 text-[10px] font-medium text-white/60 transition-colors group-hover:text-white/90">
                        {Number(cat.product_count || 0) > 0
                          ? `${cat.product_count} items · Explore →`
                          : 'Explore →'}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
};

export default OurCategories;
