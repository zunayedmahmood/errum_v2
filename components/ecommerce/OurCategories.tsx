'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import { toAbsoluteAssetUrl } from '@/lib/assetUrl';
import SectionHeader from '@/components/ecommerce/ui/SectionHeader';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

/**
 * Home "Shop by Category" should show TOP-LEVEL categories (not subcategories).
 * If the API ever returns a flat list, we fall back gracefully.
 */
const getTopLevelCategories = (items: CatalogCategory[]): CatalogCategory[] => {
  const named = (Array.isArray(items) ? items : []).filter(c => c && c.name);

  // Prefer top-level categories if present
  const top = named.filter(c => (c.parent_id ?? null) === null);
  const base = top.length ? top : named;

  // Sort by product_count desc, then name for stability
  return [...base].sort((a, b) => {
    const da = Number(a.product_count || 0);
    const db = Number(b.product_count || 0);
    if (db !== da) return db - da;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
};

const PALETTE = [
  ['#e8e4df','#b8b0a8'],
  ['#dde4e8','#a0afc0'],
  ['#ede8e0','#c4b89a'],
  ['#e0e8e4','#9abfb0'],
  ['#e8e0e8','#b898b8'],
  ['#e8e8de','#b8b89a'],
  ['#e0e4e8','#9aaab8'],
  ['#ece8e0','#ccc0a0'],
  ['#e4e8e4','#a0b8a0'],
  ['#e8e4e0','#c0b8b0'],
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
    if (categoriesProp) { setCategories(categoriesProp); setIsFetching(false); }
  }, [categoriesProp]);

  React.useEffect(() => {
    if (categoriesProp) return;
    let active = true;
    setIsFetching(true);
    catalogService.getCategories()
      .then(data => { if (active) setCategories(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setCategories([]); })
      .finally(() => { if (active) setIsFetching(false); });
    return () => { active = false; };
  }, [categoriesProp]);

  const display = getTopLevelCategories(categories || []).slice(0, 10);

  if (loading || isFetching) {
    return (
      <section className="ec-section">
        <div className="ec-container">
          <div className="ec-surface p-5 sm:p-7">
            <div className="mb-6 space-y-2">
              <div className="h-2.5 w-28 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-9 w-52 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] rounded-2xl mb-2" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="h-3 rounded-full w-3/4 mx-auto" style={{ background: 'rgba(255,255,255,0.05)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (display.length === 0) return null;

  return (
    <section className="ec-section">
      <div className="ec-container">
        <div className="ec-surface p-5 sm:p-7 relative overflow-hidden">
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full opacity-40"
               style={{ background: 'radial-gradient(circle, rgba(176,124,58,0.09) 0%, transparent 70%)', filter: 'blur(24px)' }} />
          <SectionHeader
            eyebrow="Shop by Category"
            title="Explore Collections"
            subtitle="Discover our curated product categories"
            actionLabel="All Categories"
            onAction={() => router.push('/e-commerce/categories')}
          />

          <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-5 gap-3">
            {display.map((cat, i) => {
              const imgSrc = toAbsoluteAssetUrl(cat.image || cat.image_url || '');
              const [from, to] = PALETTE[i % PALETTE.length];

              return (
                <button
                  key={cat.id}
                  onClick={() => router.push(`/e-commerce/${encodeURIComponent(cat.slug || slugify(cat.name))}`)}
                  className="group text-left"
                  type="button"
                >
                  {/* Portrait image card */}
                  <div
                    className="relative overflow-hidden rounded-2xl transition-all duration-300 group-hover:shadow-lg group-hover:-translate-y-0.5"
                    style={{ aspectRatio: '3/4' }}
                  >
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
                        style={{ background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` }}
                      />
                    )}

                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                    {/* Category name on image */}
                    <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                      <p
                        className="text-white font-semibold leading-tight drop-shadow"
                        style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: 'clamp(12px, 2.5vw, 17px)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {cat.name}
                      </p>
                      {Number(cat.product_count || 0) > 0 && (
                        <p
                          className="mt-0.5 text-white/60"
                          style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.12em' }}
                        >
                          {cat.product_count} items
                        </p>
                      )}
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
