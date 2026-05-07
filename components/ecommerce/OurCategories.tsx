'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import { toAbsoluteAssetUrl } from '@/lib/assetUrl';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

const getTopLevelCategories = (items: CatalogCategory[]): CatalogCategory[] => {
  const named = (Array.isArray(items) ? items : []).filter(c => c && c.name);
  const top = named.filter(c => (c.parent_id ?? null) === null);
  const base = top.length ? top : named;
  return [...base].sort((a, b) => {
    const da = Number(a.product_count || 0);
    const db = Number(b.product_count || 0);
    if (db !== da) return db - da;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
};

interface OurCategoriesProps {
  categories?: CatalogCategory[];
  loading?: boolean;
}

const OurCategories: React.FC<OurCategoriesProps> = memo(({ categories: categoriesProp, loading = false }) => {
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

  // Helper to flatten categories for selection
  const flatten = (items: CatalogCategory[]): CatalogCategory[] => {
    let result: CatalogCategory[] = [];
    items.forEach(cat => {
      result.push(cat);
      if (cat.children && cat.children.length > 0) {
        result = [...result, ...flatten(cat.children)];
      }
    });
    return result;
  };

  // Hardcoded IDs for the 8 featured categories/subcategories
  // This can be updated to include specific subcategory IDs
  const FEATURED_IDS = [1, 2, 3, 4, 5, 6, 7, 8]; 

  const allCategories = flatten(categories || []);
  
  // Try to find the specific featured IDs, or fallback to first 8 with images
  let allDisplay = allCategories.filter(c => FEATURED_IDS.includes(c.id));
  
  if (allDisplay.length < 8) {
    const others = allCategories.filter(c => !FEATURED_IDS.includes(c.id) && (c.image_url || c.image));
    allDisplay = [...allDisplay, ...others].slice(0, 8);
  }

  // Final fallback if still less than 8
  if (allDisplay.length < 8) {
    const anyOthers = allCategories.filter(c => !allDisplay.find(d => d.id === c.id));
    allDisplay = [...allDisplay, ...anyOthers].slice(0, 8);
  }

  if (loading || isFetching) {
    return (
      <section style={{ background: '#ffffff', padding: '48px 0' }}>
        <div className="ec-container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
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
              FEATURED CATEGORIES
            </h2>
            <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ aspectRatio: '3/4', background: '#f5f5f5', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (allDisplay.length === 0) return null;

  return (
    <section style={{ background: '#ffffff', padding: '48px 0' }}>
      <div className="ec-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
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
            FEATURED CATEGORIES
          </h2>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-3">
          {allDisplay.map((cat, i) => {
            const imgSrc = toAbsoluteAssetUrl(cat.image || cat.image_url || '');

            return (
              <button
                key={cat.id}
                onClick={() => router.push(`/e-commerce/${encodeURIComponent(cat.slug || slugify(cat.name))}`)}
                type="button"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  aspectRatio: '3/4',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: '#e8e8e8',
                  display: 'block',
                  width: '100%',
                }}
                onMouseEnter={e => {
                  const img = (e.currentTarget as HTMLElement).querySelector('img');
                  if (img) img.style.transform = 'scale(1.06)';
                }}
                onMouseLeave={e => {
                  const img = (e.currentTarget as HTMLElement).querySelector('img');
                  if (img) img.style.transform = 'scale(1)';
                }}
              >
                {imgSrc ? (
                  <Image
                    src={imgSrc}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 25vw"
                    style={{
                      objectFit: 'cover',
                      objectPosition: 'top',
                      transition: 'transform 0.6s ease',
                    }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: `hsl(${(i * 40) % 360}, 12%, 88%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: '48px', fontWeight: 700, color: 'rgba(0,0,0,0.15)' }}>{cat.name.charAt(0)}</span>
                  </div>
                )}

                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.10) 50%, transparent 100%)' }} />

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 12px', textAlign: 'left' }}>
                  <h3 style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: '14px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#ffffff',
                    margin: 0,
                    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}>
                    {cat.name}
                  </h3>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
});

export default OurCategories;
