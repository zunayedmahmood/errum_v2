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
  autoplaySpeed = 5000,
  textPosition = 'center',
  textColor = '#ffffff',
  fontSize = 84,
  transitionType = 'fade'
}: {
  images?: HeroImage[];
  title?: string;
  showTitle?: boolean;
  slideshowEnabled?: boolean;
  autoplaySpeed?: number;
  textPosition?: string;
  textColor?: string;
  fontSize?: number;
  transitionType?: 'fade' | 'slide';
}) {
  const hexToRgba = (hex: string, alpha: number) => {
    if (!hex || !hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
              opacity: transitionType === 'fade' ? (currentIndex === idx ? 1 : 0) : 1,
              transform: transitionType === 'slide' 
                ? `translateX(${(idx - currentIndex) * 100}%)`
                : 'none',
              transition: transitionType === 'fade'
                ? 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                : 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: transitionType === 'fade' ? (currentIndex === idx ? 1 : 0) : 1
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
        alignItems: 'center',
        textAlign: 'center',
        padding: '0 20px'
      }}>

        {/* TOP SECTION: Search + Buttons */}
        <div style={{
          marginTop: '120px', // A little below the top
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          width: '100%',
          zIndex: 20,
        }}>
          {/* Search bar - Adaptive width, centered, focus-based opacity */}
          <form
            onSubmit={onSubmit}
            style={{
              minWidth: '300px',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: isFocused ? 1 : 0.8,
            }}
            className="w-[90vw] md:w-[60vw] max-w-[1200px]"
          >
            <div style={{
              position: 'relative',
              background: isFocused ? '#ffffff' : 'rgba(255,255,255,0.12)',
              backdropFilter: isFocused ? 'none' : 'blur(24px)',
              borderRadius: '12px',
              boxShadow: isFocused ? '0 12px 48px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              padding: '1px',
              border: `1px solid ${isFocused ? '#ffffff' : 'rgba(255,255,255,0.4)'}`,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              <button
                type="submit"
                style={{
                  position: 'absolute',
                  left: '12px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: isFocused ? '#111111' : '#ffffff',
                  zIndex: 20,
                  transition: 'color 0.3s ease'
                }}
                aria-label="Search"
              >
                <SearchIcon style={{ width: '18px', height: '18px' }} />
              </button>
              <input
                ref={inputRef}
                value={query}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search premium lifestyle essentials..."
                className={`w-full bg-transparent py-2.5 text-sm outline-none border-none font-poppins transition-colors duration-300 ${isFocused ? 'text-neutral-900 placeholder:text-neutral-500' : 'text-white placeholder:text-neutral-300'}`}
                style={{
                  paddingLeft: '52px',
                  paddingRight: query ? '44px' : '16px',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={clear}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    padding: '6px',
                    color: isFocused ? '#111111' : '#ffffff',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    zIndex: 20,
                    transition: 'color 0.3s ease'
                  }}
                >
                  <X style={{ width: '16px', height: '16px' }} />
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
              fontFamily: "var(--font-poppins), sans-serif",
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
            <Link href="/e-commerce/products?category=all" style={{
              padding: '12px 36px',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: "var(--font-poppins), sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.3)',
              transition: 'all 0.3s ease'
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              Collections
            </Link>
          </div>
        </div>

        {/* CENTER SECTION: Hero Text */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: (!isMobile && textPosition.includes('left')) ? 'flex-start' : 
                      (!isMobile && textPosition.includes('right')) ? 'flex-end' : 'center',
          justifyContent: (!isMobile && textPosition.includes('top')) ? 'flex-start' : 
                          (!isMobile && textPosition.includes('bottom')) ? 'flex-end' : 'center',
          textAlign: (!isMobile && textPosition.includes('left')) ? 'left' : 
                     (!isMobile && textPosition.includes('right')) ? 'right' : 'center',
          width: '100%',
          marginTop: 0, // Remove negative margin to prevent overlap with buttons
          paddingTop: !isMobile && textPosition.includes('top') ? '60px' : '0',
          paddingBottom: !isMobile ? '90px' : '0',
          paddingLeft: !isMobile ? '32.5px' : '20px',
          paddingRight: !isMobile ? '32.5px' : '20px',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          {showTitle && (
            <div style={{ maxWidth: '900px', pointerEvents: 'auto' }}>
              <h1 style={{
                fontFamily: "var(--font-poppins), sans-serif",
                fontSize: `clamp(48px, 10vw, ${fontSize}px)`,
                fontWeight: 500,
                color: hexToRgba(textColor || '#ffffff', 0.9),
                lineHeight: 1.0,
                letterSpacing: '-0.04em',
                textShadow: '0 8px 48px rgba(0,0,0,0.5)',
                whiteSpace: 'pre-line',
                textTransform: 'none',
                margin: 0
              }}>
                {initialTitle}
              </h1>
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
