'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

const HERO_IMAGE_PATH = '/e-commerce-hero.jpg';

export default function HeroSection({ 
  bgUrl: initialBgUrl, 
  title: initialTitle,
  showTitle = true 
}: { 
  bgUrl?: string;
  title?: string;
  showTitle?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [bgUrl, setBgUrl] = useState<string>(initialBgUrl || HERO_IMAGE_PATH);

  useEffect(() => {
    if (initialBgUrl) {
      setBgUrl(initialBgUrl);
    } else {
      setBgUrl(HERO_IMAGE_PATH);
    }
  }, [initialBgUrl]);

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
      <div className="ec-container" style={{ 
        position: 'relative', 
        zIndex: 10, 
        height: '100vh',
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between',
        padding: '40px 20px 80px' 
      }}>
        {/* Top Controls: Search + Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          width: '100%',
          marginTop: '20px'
        }}>
          {/* Search bar */}
          <form 
            onSubmit={onSubmit} 
            style={{ 
              width: '90%',
              maxWidth: '700px',
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
                  padding: '13.5px 130px 13.5px 56px',
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

          {/* CTAs - 75% size (padding: 10.5px 24px) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <Link href="/e-commerce/products" style={{
              padding: '10.5px 24px',
              background: 'rgba(17,17,17,0.85)',
              color: '#ffffff',
              borderRadius: '4px',
              fontSize: '11px',
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
                padding: '10.5px 24px',
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: '4px',
                fontSize: '11px',
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

        {/* Bottom Left stylish title */}
        {showTitle && (
          <div style={{ textAlign: 'left', maxWidth: '600px', marginLeft: '20px' }}>
            <h1 style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 200,
              color: '#ffffff',
              lineHeight: 1.2,
              letterSpacing: '0.02em',
              textShadow: '0 2px 20px rgba(0,0,0,0.4)',
              whiteSpace: 'pre-line',
              textTransform: 'capitalize'
            }}>
              {initialTitle?.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {i === 1 ? <span style={{ fontStyle: 'italic', marginLeft: '40px', display: 'inline-block' }}>{line}</span> : line}
                  {i < initialTitle.split('\n').length - 1 && '\n'}
                </React.Fragment>
              ))}
              {!initialTitle && (
                <>
                  Refining the Art of<br />
                  <span style={{ fontStyle: 'italic', marginLeft: '40px' }}>Lifestyle</span>
                </>
              )}
            </h1>
          </div>
        )}
      </div>
    </section>
  );
}
