'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X, Facebook, Instagram, Youtube, MessageCircle } from 'lucide-react';

import catalogService, { type CatalogCategory } from '@/services/catalogService';
import {
  CLIENT_FACEBOOK,
  CLIENT_INSTAGRAM,
  CLIENT_YOUTUBE,
  CLIENT_PHONE,
} from '@/lib/constants';

/* ──────────────────────────────────────────────────────────────────────────
   Hero (background image + search + socials)
   - No navigation/menu link required (home uses it directly)
   - Search routes to /e-commerce/search?q=
────────────────────────────────────────────────────────────────────────── */

const toWaMeLink = (phone: string) => {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}`;
};

const getCoverImageFromCategories = (cats: CatalogCategory[]) =>
  cats.find(c => c.image || c.image_url)?.image || cats.find(c => c.image_url)?.image_url || '';

export default function HeroSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [bgUrl, setBgUrl] = useState<string>('');
  const [topCategories, setTopCategories] = useState<CatalogCategory[]>([]);

  // Background image: try newest product image, fallback to category image, else just keep gradients.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await catalogService.getProducts({
          per_page: 1,
          page: 1,
          sort_by: 'newest',
          _suppressErrorLog: true,
        });

        const first = res?.products?.[0];
        const img = first?.images?.[0]?.url;
        if (alive && img) setBgUrl(img);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Fetch top-level categories for “quick chips”.
  useEffect(() => {
    let alive = true;

    catalogService
      .getCategories()
      .then((tree) => {
        const flat: CatalogCategory[] = [];
        const walk = (list: CatalogCategory[]) =>
          list.forEach((c) => {
            flat.push(c);
            if (c.children?.length) walk(c.children);
          });
        walk(tree);

        const parents = flat
          .filter((c) => (c.parent_id === null || c.parent_id === undefined) && c.name)
          .sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0))
          .slice(0, 8);

        if (!alive) return;
        setTopCategories(parents);

        // If we still don't have a background, attempt a category hero image.
        const catImg = getCoverImageFromCategories(parents);
        if (catImg) setBgUrl((prev) => prev || catImg);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const socials = useMemo(() => {
    const items = [
      { label: 'Facebook', href: CLIENT_FACEBOOK, Icon: Facebook },
      { label: 'Instagram', href: CLIENT_INSTAGRAM, Icon: Instagram },
      { label: 'YouTube', href: CLIENT_YOUTUBE, Icon: Youtube },
      { label: 'WhatsApp', href: toWaMeLink(CLIENT_PHONE), Icon: MessageCircle },
    ];
    return items.filter((s) => Boolean(s.href));
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/e-commerce/search?q=${encodeURIComponent(q)}`);
  };

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <section className="ec-root relative overflow-hidden" style={{ minHeight: 'min(92vh, 720px)' }}>
      {/* Background image */}
      <div className="absolute inset-0">
        {bgUrl ? (
          <img
            src={bgUrl}
            alt="Hero background"
            className="h-full w-full object-cover"
            onError={() => setBgUrl('')}
          />
        ) : null}

        {/* Premium overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-[#0d0d0d]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(900px 600px at 18% 12%, rgba(176,124,58,0.20), transparent 55%), radial-gradient(700px 520px at 82% 68%, rgba(120,160,220,0.14), transparent 60%)',
          }}
        />
      </div>

      {/* Socials (hidden on small) */}
      {socials.length > 0 && (
        <div className="pointer-events-none absolute left-5 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
          {socials.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto group flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              }}
              aria-label={label}
              title={label}
            >
              <Icon className="h-4 w-4 text-white/75 transition group-hover:text-white" />
            </a>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="ec-container relative z-10 flex flex-col justify-center" style={{ minHeight: 'inherit', paddingTop: '5.5rem', paddingBottom: '5rem' }}>
        <div className="mx-auto w-full max-w-3xl text-center ec-anim-fade-up">
          <p className="ec-eyebrow justify-center">Search the catalogue</p>

          <h1
            className="mt-4 text-white"
            style={{
              fontSize: 'clamp(36px, 8vw, 72px)',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
              fontFamily: "'Cormorant Garamond', serif"
            }}
          >
            Find your next <span style={{ color: 'var(--gold-light)' }}>favorite</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.62)' }}>
            Search by product name, SKU, or category — then explore variants, sizes, and colors in one place.
          </p>

          {/* Search bar */}
          <form onSubmit={onSubmit} className="mx-auto mt-8 w-full max-w-2xl">
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 22px 70px rgba(0,0,0,0.45)',
              }}
            >
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/55" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, SKUs..."
                className="w-full bg-transparent py-4 pl-12 pr-28 text-[14px] text-white outline-none placeholder:text-white/40"
                autoComplete="off"
              />

              {query && (
                <button
                  type="button"
                  onClick={clear}
                  className="absolute right-[7.25rem] top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/55 transition hover:text-white"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button
                type="submit"
                disabled={!query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'var(--gold)',
                  color: 'white',
                  boxShadow: '0 10px 26px rgba(176,124,58,0.35)',
                }}
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick category chips */}
          {topCategories.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {topCategories.map((c) => (
                <Link
                  key={c.id}
                  href={`/e-commerce/${encodeURIComponent(c.slug || c.name)}`}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium transition"
                  style={{
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(255,255,255,0.70)',
                    background: 'rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.borderColor = 'var(--gold-light)';
                    el.style.color = 'var(--gold-light)';
                    el.style.background = 'rgba(176,124,58,0.10)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLAnchorElement;
                    el.style.borderColor = 'rgba(255,255,255,0.14)';
                    el.style.color = 'rgba(255,255,255,0.70)';
                    el.style.background = 'rgba(255,255,255,0.04)';
                  }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {/* Socials (mobile) */}
          {socials.length > 0 && (
            <div className="mt-6 flex items-center justify-center gap-2 lg:hidden">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={`m-${label}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(10px)',
                  }}
                  aria-label={label}
                  title={label}
                >
                  <Icon className="h-4 w-4 text-white/75" />
                </a>
              ))}
            </div>
          )}

          {/* Secondary CTA */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/e-commerce/products" className="ec-btn ec-btn-gold">
              Browse Products
            </Link>
            <Link
              href="/e-commerce/categories"
              className="ec-btn"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.82)',
                border: '1px solid rgba(255,255,255,0.14)',
              }}
            >
              Browse Categories
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
