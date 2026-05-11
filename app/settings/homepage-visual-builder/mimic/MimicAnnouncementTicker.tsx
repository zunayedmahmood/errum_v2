'use client';

import React from 'react';

interface AnnouncementTickerProps {
  phrases?: string[];
  speed?: number;
  mode?: 'static' | 'moving';
  background_color?: string;
  text_color?: string;
}

export default function MimicAnnouncementTicker({ 
  phrases = [],
  speed = 40,
  mode = 'moving',
  background_color = '#111111',
  text_color = '#ffffff'
}: AnnouncementTickerProps) {
  if (!phrases || phrases.length === 0) return null;
  const isMoving = mode === 'moving';
  const displayPhrases = isMoving ? [...phrases, ...phrases, ...phrases] : phrases;

  return (
    <div 
      style={{ 
        width: '100%',
        padding: '10px 0',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        position: 'relative',
        zIndex: 100,
        backgroundColor: background_color,
        color: text_color,
        borderBottom: `1px solid ${text_color}1A`
      }}
    >
      <div 
        style={{
          display: isMoving ? 'inline-flex' : 'flex',
          justifyContent: isMoving ? 'flex-start' : 'center',
          flexWrap: isMoving ? 'nowrap' : 'wrap',
          animation: isMoving ? `mimic-ticker-scroll ${speed}s linear infinite` : 'none',
        }}
      >
        {displayPhrases.map((phrase, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', padding: '0 48px', fontWeight: 'bold', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
              {phrase}
            </span>
            {isMoving && <div style={{ height: '4px', width: '4px', borderRadius: '50%', backgroundColor: `${text_color}4D` }} />}
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes mimic-ticker-scroll {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.333%, 0, 0); }
        }
      ` }} />
    </div>
  );
}
