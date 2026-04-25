'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import catalogService, { CatalogCategory } from '@/services/catalogService';

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

const PALETTE = [
  ['#e8e4df', '#b8b0a8'], ['#dde4e8', '#a0afc0'], ['#ede8e0', '#c4b89a'],
  ['#e0e8e4', '#9abfb0'], ['#e8e0e8', '#b898b8'], ['#e8e8de', '#b8b89a'],
  ['#e0e4e8', '#9aaab8'], ['#ece8e0', '#ccc0a0'], ['#e4e8e4', '#a0b8a0'], ['#e8e4e0', '#c0b8b0'],
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    catalogService.getCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load categories.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ec-root min-h-screen bg-[var(--bg-root)]">
      <Navigation />

      {/* Header */}
      <section className="ec-page-section border-b border-[var(--border-default)]">
        <div className="ec-container py-8 sm:py-12">
          <div className="ec-dark-tag mb-6">All Collections</div>
          <h1 className="text-[var(--text-primary)]"
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 'clamp(44px, 8vw, 92px)',
              fontWeight: 300,
              lineHeight: 0.9,
              letterSpacing: '-0.02em'
            }}>
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
              <Loader2 className="h-8 w-8 animate-spin text-[var(--cyan)]" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-2xl p-6 bg-[var(--status-danger)]/5 border border-[var(--status-danger)]/20">
              <AlertCircle className="h-5 w-5 text-[var(--status-danger)]" />
              <p className="text-[var(--status-danger)] text-sm">{error}</p>
            </div>
          ) : (
            <div className="space-y-16">
              {categories.map((cat, ci) => {
                const [from, to] = PALETTE[ci % PALETTE.length];
                const imgSrc = cat.image_url || cat.image || '';
                const href = `/e-commerce/${encodeURIComponent(slugify(cat.name))}`;
                const children = cat.children || [];

                return (
                  <div key={cat.id} className="ec-anim-fade-up" style={{ animationDelay: `${ci * 0.1}s` }}>
                    {/* Parent category header */}
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-default)]">
                      <Link href={href} className="group flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold bg-[var(--cyan-pale)] border border-[var(--cyan-border)] text-[var(--cyan)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          {cat.name.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-medium text-[var(--text-primary)] group-hover:text-[var(--cyan)] transition-colors"
                            style={{ fontFamily: "'Poppins', sans-serif", letterSpacing: '-0.01em' }}>
                            {cat.name}
                          </h2>
                          {Number(cat.product_count || 0) > 0 && (
                            <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-[var(--text-muted)]"
                              style={{ fontFamily: "'Poppins', sans-serif" }}>
                              {cat.product_count} ITEMS
                            </p>
                          )}
                        </div>
                      </Link>
                      <Link href={href} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--cyan)] transition-all"
                        style={{ fontFamily: "'Poppins', sans-serif" }}>
                        VIEW ALL <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    {/* Subcategory portrait grid */}
                    {children.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 sm:gap-8">
                        {children.map((child, cIdx) => {
                          const [cf, ct] = PALETTE[(ci * 3 + cIdx) % PALETTE.length];
                          const cImg = child.image_url || child.image || '';
                          return (
                            <Link
                              key={child.id}
                              href={`/e-commerce/${encodeURIComponent(slugify(child.name))}`}
                              className="group block"
                            >
                              <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)] border border-[var(--border-default)] transition-all duration-500 group-hover:shadow-xl group-hover:border-[var(--border-strong)]"
                                style={{ aspectRatio: '340/500' }}>
                                <CategoryImage src={cImg} alt={child.name} gradientFrom={cf} gradientTo={ct} />
                                {/* Bottom Fade — only show if image exists to maintain readability on gradients */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(28,24,18,0.7)] via-transparent to-transparent opacity-60 transition-opacity" />
                                <div className="absolute inset-x-0 bottom-0 p-5">
                                  <p className="text-white font-medium text-[15px] leading-tight"
                                    style={{ fontFamily: "'Poppins', sans-serif" }}>
                                    {child.name}
                                  </p>
                                </div>
                                {/* Hover Indicator */}
                                <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-white/20 backdrop-blur-md opacity-0 -translate-y-2 transition-all group-hover:opacity-100 group-hover:translate-y-0 flex items-center justify-center">
                                  <ChevronRight size={14} className="text-white" />
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      /* Leaf category (no children) - banner card */
                      <Link href={href} className="group block">
                        <div className="relative overflow-hidden rounded-[var(--radius-xl)] h-40 bg-[var(--bg-surface)] border border-[var(--border-default)] transition-all duration-500 group-hover:shadow-xl group-hover:border-[var(--border-strong)]">
                          <CategoryImage src={imgSrc} alt={cat.name} gradientFrom={from} gradientTo={to} />
                          <div className="absolute inset-0 bg-gradient-to-r from-[rgba(28,24,18,0.6)] to-transparent" />
                          <div className="absolute inset-0 flex items-center px-10">
                            <div>
                              <h3 className="text-3xl font-medium text-white tracking-tight"
                                style={{ fontFamily: "'Poppins', sans-serif" }}>
                                {cat.name}
                              </h3>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )}
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
