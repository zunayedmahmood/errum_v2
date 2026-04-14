'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

import catalogService, { type CatalogCategory } from '@/services/catalogService';

const HERO_IMAGE_PATH = '/e-commerce-hero.jpg';

export default function HeroSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [bgUrl, setBgUrl] = useState<string>(HERO_IMAGE_PATH);
  const [topCategories, setTopCategories] = useState<CatalogCategory[]>([]);

  useEffect(() => {
    setBgUrl(HERO_IMAGE_PATH);
  }, []);

  useEffect(() => {
    let alive = true;
    catalogService.getCategories().then((tree) => {
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
    }).catch(() => { });
    return () => { alive = false; };
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
    <section style={{ position: 'relative', overflow: 'hidden', minHeight: '90vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {bgUrl && (
          <img
            src={bgUrl}
            alt="Hero background"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
            onError={() => setBgUrl('')}
          />
        )}
        {/* Dark overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)' }} />
      </div>

      {/* Content */}
      <div className="ec-container" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 20px 60px' }}>
        <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', textAlign: 'center' }}>

          {/* Search bar — prominent at top like reference */}
          <form onSubmit={onSubmit} style={{ marginBottom: '32px' }}>
            <div style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.95)',
              borderRadius: '4px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.20)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
            }}>
              <SearchIcon style={{ position: 'absolute', left: '16px', width: '18px', height: '18px', color: '#999999', pointerEvents: 'none', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, collections..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  padding: '16px 120px 16px 48px',
                  fontSize: '15px',
                  color: '#111111',
                  fontFamily: "'Jost', sans-serif",
                  outline: 'none',
                  border: 'none',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={clear}
                  style={{ position: 'absolute', right: '100px', padding: '8px', color: '#999999', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X style={{ width: '16px', height: '16px' }} />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim()}
                style={{
                  position: 'absolute',
                  right: '8px',
                  padding: '8px 20px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: "'Jost', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  cursor: query.trim() ? 'pointer' : 'not-allowed',
                  opacity: query.trim() ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick category chips */}
          {topCategories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '40px' }}>
              {topCategories.map((c) => (
                <Link
                  key={c.id}
                  href={`/e-commerce/${encodeURIComponent(c.slug || c.name)}`}
                  style={{
                    borderRadius: '4px',
                    padding: '6px 16px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    border: '1px solid rgba(255,255,255,0.6)',
                    color: '#ffffff',
                    background: 'rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(4px)',
                    textDecoration: 'none',
                    transition: 'background 0.15s, border-color 0.15s',
                    fontFamily: "'Jost', sans-serif",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.borderColor = '#ffffff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.6)'; }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {/* Hero text */}
          <h1 style={{
            fontFamily: "'Jost', sans-serif",
            fontSize: 'clamp(32px, 6vw, 64px)',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: '16px',
            textShadow: '0 2px 16px rgba(0,0,0,0.3)',
          }}>
            Refining the Art of <em style={{ fontStyle: 'italic', fontWeight: 400 }}>Lifestyle</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 36px', fontFamily: "'Jost', sans-serif" }}>

          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <Link href="/e-commerce/products" style={{
              padding: '14px 32px',
              background: '#111111',
              color: '#ffffff',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Jost', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              Shop Now
            </Link>
            <Link
              href="/e-commerce/categories"
              style={{
                padding: '14px 32px',
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: "'Jost', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                textDecoration: 'none',
                backdropFilter: 'blur(4px)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.25)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'}
            >
              Collections
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
