'use client';

import React from 'react';

interface AnnouncementTickerProps {
  phrases?: string[];
  speed?: number;
  mode?: 'static' | 'moving';
  backgroundColor?: string;
  textColor?: string;
}

export default function AnnouncementTicker({ 
  phrases = [],
  speed = 40,
  mode = 'moving',
  backgroundColor = '#111111',
  textColor = '#ffffff'
}: AnnouncementTickerProps) {
  if (!phrases || phrases.length === 0) return null;
  // Triple the phrases to ensure no gaps during the animation loop for moving mode
  // For static mode, we just use the original phrases
  const isMoving = mode === 'moving';
  const displayPhrases = isMoving ? [...phrases, ...phrases, ...phrases] : phrases;

  return (
    <div 
      className="w-full py-2.5 overflow-hidden whitespace-nowrap relative z-[100]"
      style={{ 
        backgroundColor: backgroundColor,
        color: textColor,
        borderBottom: `1px solid ${textColor}1A` // 10% opacity border
      }}
    >
      <div 
        className={`${isMoving ? 'inline-flex animate-ticker-scroll' : 'flex justify-center flex-wrap'}`}
        style={{
          animation: isMoving ? `ticker-scroll ${speed}s linear infinite` : 'none',
        }}
      >
        {displayPhrases.map((phrase, i) => (
          <div key={i} className="flex items-center">
            <span className="inline-block px-12 font-bold text-[10px] tracking-[0.25em] uppercase font-poppins">
              {phrase}
            </span>
            {isMoving && <div className="h-1 w-1 rounded-full" style={{ backgroundColor: `${textColor}4D` }} />}
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
