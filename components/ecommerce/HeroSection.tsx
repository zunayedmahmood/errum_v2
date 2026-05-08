'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search as SearchIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface HeroImage {
  url: string;
  path?: string;
}

export default function HeroSection({
  images = [],
  title: initialTitle,
  showTitle = true,
  slideshowEnabled = true,
  autoplaySpeed = 5000
}: {
  images?: HeroImage[];
  title?: string;
  showTitle?: boolean;
  slideshowEnabled?: boolean;
  autoplaySpeed?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Slideshow Autoplay Logic
  useEffect(() => {
    if (!slideshowEnabled || images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, autoplaySpeed);

    return () => clearInterval(interval);
  }, [slideshowEnabled, autoplaySpeed, images.length, currentIndex]); // currentIndex dependency ensures reset on manual navigation

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) nextSlide();
    if (isRightSwipe) prevSlide();
  };

  // If no images are provided yet, we'll return a loading skeleton or null to prevent flashing hardcoded defaults
  if (!images || images.length === 0) {
    return (
      <section style={{ minHeight: '100vh', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-pulse flex flex-col items-center gap-8 w-full max-w-3xl px-6">
          <div className="h-16 bg-white/10 rounded-xl w-full" />
          <div className="flex gap-4">
            <div className="h-12 bg-white/10 rounded w-32" />
            <div className="h-12 bg-white/10 rounded w-32" />
          </div>
        </div>
      </section>
    );
  }

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
    <section
      style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Background images slider */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {images.map((img, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: currentIndex === idx ? 1 : 0,
              transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4))' }} />
          </div>
        ))}
      </div>

      {/* Slide Navigation Indicators (Dots/Dashes) */}
      {images.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: currentIndex === idx ? '40px' : '12px',
                height: '4px',
                borderRadius: '2px',
                background: currentIndex === idx ? '#ffffff' : 'rgba(255,255,255,0.4)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
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
          marginTop: '80px' // Positioning it slightly higher
        }}>
          {/* Search bar - Adaptive width, centered, focus-based opacity */}
          <form
            onSubmit={onSubmit}
            style={{
              minWidth: '300px',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: isFocused ? 0.95 : 0.3, // Slightly higher opacity for better visibility
            }}
            className="w-[90vw] md:w-[60vw] max-w-[1200px]"
          >
            <div style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              padding: '2px',
              border: `1px solid ${isFocused ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'}`,
              transition: 'all 0.3s ease'
            }}>
              <button
                type="submit"
                style={{
                  position: 'absolute',
                  left: '12px',
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#666666',
                  zIndex: 20
                }}
                aria-label="Search"
              >
                <SearchIcon style={{ width: '20px', height: '20px' }} />
              </button>
              <input
                ref={inputRef}
                value={query}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search premium lifestyle essentials..."
                className="w-full bg-transparent py-3.5 md:py-4 text-base text-[#111111] outline-none border-none placeholder:text-neutral-400 font-['Poppins',_sans-serif]"
                style={{
                  paddingLeft: '60px',
                  paddingRight: query ? '50px' : '20px',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={clear}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    padding: '8px',
                    color: '#666666',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    zIndex: 20
                  }}
                >
                  <X style={{ width: '18px', height: '18px' }} />
                </button>
              )}
            </div>
          </form>

          {/* CTAs */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            transition: 'all 0.4s ease',
            opacity: isFocused ? 0.3 : 1, // Dim buttons when focused
            transform: isFocused ? 'scale(0.98)' : 'scale(1)',
          }}>
            <Link href="/e-commerce/products" style={{
              padding: '12px 36px',
              background: '#ffffff',
              color: '#111111',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: "'Poppins', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = '#f8f8f8';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '#ffffff';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
              }}
            >
              Shop Now
            </Link>
            <Link
              href="/e-commerce/categories"
              style={{
                padding: '12px 36px',
                background: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                border: '1.5px solid rgba(255,255,255,0.5)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                fontFamily: "'Poppins', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                textDecoration: 'none',
                backdropFilter: 'blur(12px)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
                (e.currentTarget as HTMLElement).style.border = '1.5px solid rgba(255,255,255,1)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLElement).style.border = '1.5px solid rgba(255,255,255,0.5)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              Collections
            </Link>
          </div>
        </div>

        {/* Bottom Left stylish title */}
        {showTitle && (
          <div style={{ textAlign: 'left', maxWidth: '700px', marginLeft: '20px' }}>
            <h1 style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 'clamp(32px, 6vw, 64px)',
              fontWeight: 200,
              color: '#ffffff',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textShadow: '0 4px 32px rgba(0,0,0,0.5)',
              whiteSpace: 'pre-line',
              textTransform: 'capitalize',
              margin: 0
            }}>
              {initialTitle && initialTitle.split('\n').map((line, i, arr) => (
                <React.Fragment key={i}>
                  {i === 1 ? <span style={{ fontStyle: 'italic', marginLeft: '60px', display: 'inline-block', fontWeight: 300 }}>{line}</span> : line}
                  {i < arr.length - 1 && '\n'}
                </React.Fragment>
              ))}
            </h1>
          </div>
        )}
      </div>

    </section>
  );
}

