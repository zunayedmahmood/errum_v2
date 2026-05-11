'use client';

import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

export interface HeroImage {
  url: string;
  path?: string;
}

export default function MimicHeroSection({
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!slideshowEnabled || images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, autoplaySpeed);
    return () => clearInterval(interval);
  }, [slideshowEnabled, autoplaySpeed, images.length, currentIndex]);

  if (!images || images.length === 0) {
    return (
      <section style={{ height: '600px', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  return (
    <section style={{ position: 'relative', overflow: 'hidden', height: '600px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4))' }} />
          </div>
        ))}
      </div>

      <div className="ec-container" style={{
        position: 'relative',
        zIndex: 10,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '0 20px'
      }}>
        <div style={{
          marginTop: '80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          width: '100%',
          zIndex: 20,
        }}>
          <div style={{
            minWidth: '300px',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isFocused ? 1 : 0.8,
          }} className="w-[90vw] md:w-[60vw] max-w-[800px]">
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
              <div style={{
                position: 'absolute',
                left: '12px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isFocused ? '#111111' : '#ffffff',
                zIndex: 20,
              }}>
                <SearchIcon style={{ width: '18px', height: '18px' }} />
              </div>
              <input
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                readOnly
                placeholder="Search preview..."
                className={`w-full bg-transparent py-2.5 text-sm outline-none border-none font-poppins transition-colors duration-300 ${isFocused ? 'text-neutral-900 placeholder:text-neutral-500' : 'text-white placeholder:text-neutral-300'}`}
                style={{ paddingLeft: '52px', paddingRight: '16px' }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            opacity: isFocused ? 0.3 : 1,
            transform: isFocused ? 'scale(0.98)' : 'scale(1)',
          }}>
            <div style={{
              padding: '12px 36px',
              background: '#ffffff',
              color: '#111111',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              cursor: 'default'
            }}>
              Shop Now (Preview)
            </div>
            <div style={{
              padding: '12px 36px',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              border: '1px solid rgba(255,255,255,0.3)',
              cursor: 'default'
            }}>
              Collections (Preview)
            </div>
          </div>
        </div>

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
          paddingBottom: !isMobile ? '40px' : '0',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          {showTitle && (
            <div style={{ maxWidth: '900px' }}>
              <h1 style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: `clamp(32px, 8vw, ${fontSize}px)`,
                fontWeight: 500,
                color: hexToRgba(textColor || '#ffffff', 0.9),
                lineHeight: 1.0,
                letterSpacing: '-0.04em',
                textShadow: '0 8px 48px rgba(0,0,0,0.5)',
                whiteSpace: 'pre-line',
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
