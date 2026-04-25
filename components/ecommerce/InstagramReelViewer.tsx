'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Instagram } from 'lucide-react';
import InstagramEmbed from './InstagramEmbed';

const REEL_URLS = [
  'https://www.instagram.com/reel/DW6uSbkERA9/',
  'https://www.instagram.com/p/DW6DQUGk-ho/',
  'https://www.instagram.com/reel/DW323H0EboK/',
  'https://www.instagram.com/reel/DWtnHXJkSSA/',
  'https://www.instagram.com/reel/DWmUzxuE5OZ/'
];

export default function InstagramReelViewer() {
  const [activeIndex, setActiveIndex] = useState(2); // Start with middle
  const [carouselHeight, setCarouselHeight] = useState<number>(700);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const prev = () => setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
  const next = () => setActiveIndex((prev) => (prev < REEL_URLS.length - 1 ? prev + 1 : prev));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  // Recalculate the carousel container height based on ALL rendered items.
  // We measure every visible item and take the maximum so the container never
  // shrinks/grows when switching between reels of different heights.
  const recalcHeight = useCallback(() => {
    let max = 0;
    itemRefs.current.forEach((el) => {
      if (!el) return;
      // Temporarily make it visible enough to measure its natural height
      const scrollH = el.scrollHeight;
      if (scrollH > max) max = scrollH;
    });
    if (max > 0) {
      // Add a small buffer (24px) to avoid tight clipping on some embeds
      setCarouselHeight(max + 24);
    }
  }, []);

  // Re-process Instagram embeds and remeasure when active index changes
  useEffect(() => {
    if ((window as any).instgrm) {
      (window as any).instgrm.Embeds.process();
    }
    // Give the embed a moment to settle before remeasuring
    const t = setTimeout(recalcHeight, 800);
    return () => clearTimeout(t);
  }, [activeIndex, recalcHeight]);

  // Set up a ResizeObserver on all items so we always track the tallest one
  useEffect(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(recalcHeight);
    itemRefs.current.forEach((el) => {
      if (el) resizeObserverRef.current!.observe(el);
    });
    return () => resizeObserverRef.current?.disconnect();
  }, [recalcHeight]);

  // Initial measurement after mount
  useEffect(() => {
    const t = setTimeout(recalcHeight, 1200);
    return () => clearTimeout(t);
  }, [recalcHeight]);

  return (
    <section style={{ background: '#ffffff', padding: '64px 0', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="ec-container mb-12">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
          <h2 style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: '18px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: '#111111',
            margin: 0,
          }}>
            Culture in Motion
          </h2>
          <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 40px' }}>
          <p style={{ color: '#666666', fontSize: '14px', lineHeight: 1.6, fontFamily: "'Poppins', sans-serif", margin: 0 }}>
            Explore our latest drops, community styling, and behind-the-scenes highlights straight from our studio.
          </p>
          <a
            href="https://www.instagram.com/errum_bd/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '16px',
              color: '#111111',
              fontFamily: "'Poppins', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              textDecoration: 'none',
              borderBottom: '1.5px solid #111111',
              paddingBottom: '2px',
            }}
          >
            <Instagram size={14} />
            <span>Follow @errum_bd</span>
          </a>
        </div>
      </div>

      {/*
        KEY FIX: The carousel wrapper has an explicit height derived from the tallest embed.
        `overflow: hidden` on the wrapper prevents layout bleed from absolutely-positioned items.
        We do NOT use min-h anymore — height is always exactly what the tallest reel needs.
      */}
      <div
        className="relative flex items-center justify-center select-none w-full overflow-hidden"
        style={{ height: carouselHeight }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        ref={containerRef}
      >
        {/* Navigation Arrows */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-between px-4 md:px-12 pointer-events-none">
          <button
            onClick={prev}
            disabled={activeIndex === 0}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #111111',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              cursor: 'pointer',
              opacity: activeIndex === 0 ? 0 : 1,
              pointerEvents: activeIndex === 0 ? 'none' : 'auto',
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={next}
            disabled={activeIndex === REEL_URLS.length - 1}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #111111',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              cursor: 'pointer',
              opacity: activeIndex === REEL_URLS.length - 1 ? 0 : 1,
              pointerEvents: activeIndex === REEL_URLS.length - 1 ? 'none' : 'auto',
            }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Carousel Items */}
        <div className="relative w-full max-w-5xl mx-auto h-full flex items-center justify-center perspective-1000">
          {REEL_URLS.map((url, index) => {
            const diff = index - activeIndex;
            const isActive = diff === 0;
            const isPrev = diff === -1;
            const isNext = diff === 1;

            let transform = 'scale(0.7) translateX(0)';
            let opacity = '0';
            let zIndex = 0;

            if (isActive) {
              transform = 'scale(1) translateX(0)';
              opacity = '1';
              zIndex = 20;
            } else if (isPrev) {
              transform = 'scale(0.85) translateX(-60%) rotateY(15deg)';
              opacity = '0.4';
              zIndex = 10;
            } else if (isNext) {
              transform = 'scale(0.85) translateX(60%) rotateY(-15deg)';
              opacity = '0.4';
              zIndex = 10;
            } else if (diff < -1) {
              transform = 'scale(0.7) translateX(-120%)';
              opacity = '0';
              zIndex = 0;
            } else {
              transform = 'scale(0.7) translateX(120%)';
              opacity = '0';
              zIndex = 0;
            }

            return (
              <div
                key={url}
                ref={(el) => { itemRefs.current[index] = el; }}
                className="absolute transition-all duration-700 ease-out w-full max-w-[340px] md:max-w-[400px]"
                style={{
                  transform,
                  opacity,
                  zIndex,
                  // Only the active slide receives pointer events
                  pointerEvents: isActive ? 'auto' : 'none',
                  filter: isActive ? 'none' : 'grayscale(30%) blur(1px)',
                  // Clamp side cards so they never push the page height
                  overflow: isActive ? 'visible' : 'hidden',
                  // Align to the top of the carousel container so all cards
                  // anchor from the same Y origin — prevents vertical jumping
                  top: 0,
                  bottom: 'auto',
                  // Remove any implicit margin-auto centering that could shift Y
                  margin: 0,
                }}
              >
                <div className="relative group">
                  {/* Center Focus Reflection Effect */}
                  {isActive && (
                    <div style={{ position: 'absolute', inset: '-32px', background: 'rgba(0,0,0,0.05)', filter: 'blur(60px)', borderRadius: '50%', zIndex: -1 }} />
                  )}
                  {/*
                    Wrapper that prevents internal scrollbars on the embed.
                    Instagram iframes sometimes get overflow:scroll — we
                    override that here without hiding the content itself.
                  */}
                  <div
                    style={{
                      // Allow the embed to be its full natural height
                      overflow: 'visible',
                    }}
                    className="instagram-embed-no-scroll"
                  >
                    <InstagramEmbed url={url} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-3 mt-12 pb-4">
        {REEL_URLS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            style={{
              height: '6px',
              width: i === activeIndex ? '32px' : '6px',
              transition: 'all 0.5s ease',
              borderRadius: '3px',
              background: i === activeIndex ? '#111111' : '#e0e0e0',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </section>
  );
}