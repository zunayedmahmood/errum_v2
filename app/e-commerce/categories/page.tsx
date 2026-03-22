'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import catalogService, { CatalogCategory } from '@/services/catalogService';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

const PALETTE = [
  ['#e8e4df','#b8b0a8'],['#dde4e8','#a0afc0'],['#ede8e0','#c4b89a'],
  ['#e0e8e4','#9abfb0'],['#e8e0e8','#b898b8'],['#e8e8de','#b8b89a'],
  ['#e0e4e8','#9aaab8'],['#ece8e0','#ccc0a0'],['#e4e8e4','#a0b8a0'],['#e8e4e0','#c0b8b0'],
];

/**
 * Build a usable image URL from whatever the API returns.
 * The API gives image_url as a relative path like /storage/categories/xxx.jpg
 * We route it through our own proxy to avoid backend CORS / domain issues.
 */
function buildImgUrl(raw: string | null | undefined): string {
  if (!raw) return '';

  // Determine the backend origin from env vars
  const backendBase = (
    (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api(\/v\d+)?$/i, '').replace(/\/$/, '') ||
    (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '') ||
    ''
  );

  let absolute = raw;

  if (/^https?:\/\//i.test(raw)) {
    // Already absolute — use as-is for proxying
    absolute = raw;
  } else {
    // Relative path — prepend backend origin
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    if (!backendBase) return ''; // can't build a valid URL without base
    absolute = `${backendBase}${path}`;
  }

  return `/api/proxy-image?url=${encodeURIComponent(absolute)}`;
}

/** Image card with graceful gradient fallback */
function CategoryImage({
  src,
  alt,
  gradientFrom,
  gradientTo,
}: {
  src: string;
  alt: string;
  gradientFrom: string;
  gradientTo: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = buildImgUrl(src);

  if (!url || failed) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, ${gradientFrom} 0%, ${gradientTo} 100%)` }}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      onError={() => setFailed(true)}
    />
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    catalogService.getCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load categories.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ec-root min-h-screen">
      <Navigation />

      {/* Header */}
      <section className="ec-page-section relative overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />
        <div className="ec-container relative">
          <div className="ec-dark-tag mb-6">All Collections</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 300, lineHeight: 0.95, letterSpacing: '-0.02em', color: 'white' }}>
            Shop by<br />
            <span style={{ fontWeight: 600, color: 'var(--gold)' }}>Category</span>
          </h1>
        </div>
      </section>

      {/* Categories */}
      <section className="ec-page-section">
        <div className="ec-container">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--gold)' }} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-2xl p-5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="h-5 w-5 text-red-400" />
              <p className="text-red-300 text-[14px]">{error}</p>
            </div>
          ) : (
            <div className="space-y-10">
              {categories.map((cat, ci) => {
                const [from, to] = PALETTE[ci % PALETTE.length];
                const imgSrc = cat.image_url || cat.image || '';
                const href = `/e-commerce/${encodeURIComponent(slugify(cat.name))}`;
                const children = cat.children || [];

                return (
                  <div key={cat.id}>
                    {/* Parent category header */}
                    <div className="flex items-center justify-between mb-4">
                      <Link href={href} className="group flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold" style={{ background: 'rgba(176,124,58,0.15)', border: '1px solid rgba(176,124,58,0.2)', color: 'var(--gold)', fontFamily: "'Cormorant Garamond', serif", fontSize: '18px' }}>
                          {cat.name.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-[18px] font-semibold text-white group-hover:text-[var(--gold-light)] transition-colors" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: '-0.01em' }}>
                            {cat.name}
                          </h2>
                          {Number(cat.product_count || 0) > 0 && (
                            <p style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>
                              {cat.product_count} ITEMS
                            </p>
                          )}
                        </div>
                      </Link>
                      <Link href={href} className="flex items-center gap-1 text-[11px] transition-colors"
                            style={{ color: 'var(--gold-light)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--gold-light)')}>
                        VIEW ALL <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    {/* Subcategory portrait grid */}
                    {children.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                        {children.map((child, cIdx) => {
                          const [cf, ct] = PALETTE[(ci * 3 + cIdx) % PALETTE.length];
                          const cImg = child.image_url || child.image || '';
                          return (
                            <Link
                              key={child.id}
                              href={`/e-commerce/${encodeURIComponent(slugify(child.name))}`}
                              className="group block"
                            >
                              <div className="relative overflow-hidden rounded-xl transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg" style={{ aspectRatio: '3/4' }}>
                                <CategoryImage src={cImg} alt={child.name} gradientFrom={cf} gradientTo={ct} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 p-2">
                                  <p className="text-white font-medium leading-tight text-[11px]" style={{ fontFamily: "'Jost', sans-serif" }}>{child.name}</p>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      /* Leaf category (no children) - bigger card */
                      <Link href={href} className="group block">
                        <div className="relative overflow-hidden rounded-2xl h-24 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg">
                          <CategoryImage src={imgSrc} alt={cat.name} gradientFrom={from} gradientTo={to} />
                          <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                          <div className="absolute inset-0 flex items-center px-5">
                            <p className="text-white text-lg font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{cat.name}</p>
                          </div>
                        </div>
                      </Link>
                    )}

                    {/* Divider */}
                    <div className="mt-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
