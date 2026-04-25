'use client';

import React from 'react';
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

  const allDisplay = getTopLevelCategories(categories || []);

  if (loading || isFetching) {
    return (
      <section style={{ background: '#ffffff', padding: '48px 0' }}>
        <div className="ec-container">
          {/* Header skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
            <div style={{ height: '24px', width: '180px', background: '#f0f0f0', borderRadius: '4px' }} />
            <div style={{ height: '1px', width: '48px', background: '#e0e0e0' }} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
        {/* Section header — reference style */}
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

        {/* 4-col grid matching reference */}
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
                  <img
                    src={imgSrc}
                    alt={cat.name}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
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

                {/* Dark gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.10) 50%, transparent 100%)' }} />

                {/* Category label at bottom */}
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
};

export default OurCategories;
