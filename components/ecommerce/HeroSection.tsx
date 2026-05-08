'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_HERO_IMAGE = '/e-commerce-hero.jpg';

interface HeroImage {
  url: string;
  path?: string;
}

export default function HeroSection({ 
  images: initialImages,
  title: initialTitle,
  showTitle = true 
}: { 
  images?: HeroImage[];
  title?: string;
  showTitle?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const images = useMemo(() => {
    if (!initialImages || initialImages.length === 0) {
      return [{ url: DEFAULT_HERO_IMAGE }];
    }
    return initialImages;
  }, [initialImages]);

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

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <section style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Background images slider */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {images.map((img, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: currentIndex === idx ? 1 : 0,
              transition: 'opacity 1s ease-in-out',
              zIndex: currentIndex === idx ? 1 : 0
            }}
          >
            <Image
              src={img.url}
              alt={`Hero background ${idx + 1}`}
              fill
              className="object-cover object-center"
              priority={idx === 0}
            />
            {/* Dark overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
          </div>
        ))}
      </div>

      {/* Slider Controls */}
      {images.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            style={{
              position: 'absolute',
              left: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={nextSlide}
            style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

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
          gap: '24px',
          width: '100%',
          marginTop: '60px' // Positioning it slightly higher
        }}>
          {/* Search bar - 80% width, centered, more transparent */}
          <form 
            onSubmit={onSubmit} 
            style={{ 
              width: '80%',
              maxWidth: '900px',
              transition: 'all 0.3s ease',
            }}
          >
            <div style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.7)', // More transparent
              backdropFilter: 'blur(12px)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              padding: '4px',
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              <SearchIcon style={{ position: 'absolute', left: '24px', width: '22px', height: '22px', color: '#444444', pointerEvents: 'none', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, collections..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  padding: '16px 140px 16px 64px',
                  fontSize: '18px',
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
                  style={{ position: 'absolute', right: '120px', padding: '8px', color: '#666666', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X style={{ width: '20px', height: '20px' }} />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim()}
                style={{
                  position: 'absolute',
                  right: '12px',
                  padding: '12px 28px',
                  background: '#111111',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  fontFamily: "'Poppins', sans-serif",
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  cursor: query.trim() ? 'pointer' : 'not-allowed',
                  opacity: query.trim() ? 1 : 0.6,
                  transition: 'background 0.2s',
                }}
              >
                Search
              </button>
            </div>
          </form>

          {/* CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <Link href="/e-commerce/products" style={{
              padding: '12px 32px',
              background: '#ffffff',
              color: '#111111',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Poppins', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = '#f0f0f0';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '#ffffff';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              Shop Now
            </Link>
            <Link
              href="/e-commerce/categories"
              style={{
                padding: '12px 32px',
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: "'Poppins', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                textDecoration: 'none',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.25)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
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
              {initialTitle && initialTitle.split('\n').map((line, i, arr) => (
                <React.Fragment key={i}>
                  {i === 1 ? <span style={{ fontStyle: 'italic', marginLeft: '40px', display: 'inline-block' }}>{line}</span> : line}
                  {i < arr.length - 1 && '\n'}
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

