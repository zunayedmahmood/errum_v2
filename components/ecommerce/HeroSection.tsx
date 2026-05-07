'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

const HERO_IMAGE_PATH = '/e-commerce-hero.jpg';

export default function HeroSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [bgUrl, setBgUrl] = useState<string>(HERO_IMAGE_PATH);

  useEffect(() => {
    setBgUrl(HERO_IMAGE_PATH);
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
    <section style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {bgUrl && (
          <Image
            src={bgUrl}
            alt="Hero background"
            fill
            className="object-cover object-center"
            priority
            onError={() => setBgUrl('')}
          />
        )}
        {/* Dark overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.30)' }} />
      </div>

      {/* Content */}
      <div className="ec-container" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 20px 60px' }}>
        <div style={{ maxWidth: '700px', width: '100%', margin: '0 auto', textAlign: 'center' }}>

          {/* Search bar — moved to top of hero section (15% from top / 85% from bottom) */}
          <form 
            onSubmit={onSubmit} 
            style={{ 
              position: 'absolute',
              top: '15%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: '700px',
              zIndex: 30,
              opacity: 0.85,
              transition: 'opacity 0.3s ease',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
          >
            <div style={{
              position: 'relative',
              background: 'rgba(255,255,255,1)',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              padding: '2px',
            }}>
              <SearchIcon style={{ position: 'absolute', left: '20px', width: '20px', height: '20px', color: '#999999', pointerEvents: 'none', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, collections..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  padding: '18px 130px 18px 56px',
                  fontSize: '16px',
                  color: '#111111',
                  fontFamily: "'Poppins', sans-serif",
                  outline: 'none',
                  border: 'none',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={clear}
                  style={{ position: 'absolute', right: '110px', padding: '8px', color: '#999999', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X style={{ width: '18px', height: '18px' }} />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim()}
                style={{
                  position: 'absolute',
                  right: '10px',
                  padding: '10px 24px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: "'Poppins', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  cursor: query.trim() ? 'pointer' : 'not-allowed',
                  opacity: query.trim() ? 1 : 0.5,
                  transition: 'background 0.2s',
                }}
              >
                Search
              </button>
            </div>
          </form>



          {/* Hero text */}
          <h1 style={{
            fontFamily: "'Poppins', sans-serif",
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
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '15px', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto 36px', fontFamily: "'Poppins', sans-serif" }}>

          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <Link href="/e-commerce/products" style={{
              padding: '14px 32px',
              background: 'rgba(17,17,17,0.85)', // Slightly opaque
              color: '#ffffff',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Poppins', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = '#000000';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(17,17,17,0.85)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
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
                fontFamily: "'Poppins', sans-serif",
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
