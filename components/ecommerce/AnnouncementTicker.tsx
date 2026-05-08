'use client';

import React from 'react';

interface AnnouncementTickerProps {
  phrases?: string[];
  speed?: number;
  mode?: 'static' | 'moving';
}

export default function AnnouncementTicker({ 
  phrases = [
    "FREE SHIPPING ON ORDERS OVER ৳2000",
    "NEW SEASON ARRIVALS NOW LIVE",
    "SAME DAY DELIVERY IN DHAKA CITY",
    "PREMIUM QUALITY GUARANTEED",
    "SHOP THE LATEST COLLECTIONS"
  ],
  speed = 40,
  mode = 'moving'
}: AnnouncementTickerProps) {
  // Triple the phrases to ensure no gaps during the animation loop for moving mode
  // For static mode, we just use the original phrases
  const isMoving = mode === 'moving';
  const displayPhrases = isMoving ? [...phrases, ...phrases, ...phrases] : phrases;

  return (
    <div 
      className="w-full bg-[#111111] text-white py-2.5 overflow-hidden whitespace-nowrap relative z-[100]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div 
        className={`${isMoving ? 'inline-flex animate-ticker-scroll' : 'flex justify-center flex-wrap'}`}
        style={{
          animation: isMoving ? `ticker-scroll ${speed}s linear infinite` : 'none',
        }}
      >
        {displayPhrases.map((phrase, i) => (
          <div key={i} className="flex items-center">
            <span className="inline-block px-12 font-bold text-[10px] tracking-[0.25em] uppercase font-[Poppins]">
              {phrase}
            </span>
            {isMoving && <div className="h-1 w-1 rounded-full bg-white/30" />}
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes ticker-scroll {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-33.333%, 0, 0);
          }
        }
        .animate-ticker-scroll {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
