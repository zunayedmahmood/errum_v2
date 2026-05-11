'use client';

import React, { useState } from 'react';

interface Collection {
  id: string | number;
  title: string;
  subtitle: string;
  image: string;
  show_text?: boolean;
}

interface MimicCollectionTilesProps {
  collections?: Collection[];
}

export default function MimicCollectionTiles({ collections }: MimicCollectionTilesProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const displayCollections = collections || [];

  if (!displayCollections || displayCollections.length === 0) return null;

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    setMousePos({ x, y });
  };

  return (
    <section
      style={{ padding: '48px 0', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      <div className="ec-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {displayCollections.map((item) => (
            <div
              key={item.id}
              style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', aspectRatio: '4/5', background: '#171717', cursor: 'default' }}
              className="group"
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url(${item.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  transition: 'transform 0.5s ease-out',
                  transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px) scale(1.1)`,
                }}
                className="group-hover:scale-125"
              />

              {item.show_text !== false && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.2) 50%, transparent)', transition: 'opacity 0.3s' }} className="group-hover:opacity-90" />
              )}

              {item.show_text !== false && (
                <div style={{ position: 'absolute', inset: 0, padding: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>{item.subtitle}</p>
                  <h3 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>{item.title}</h3>
                  <div style={{ overflow: 'hidden', height: '24px' }}>
                    <div style={{ transition: 'transform 0.5s', transform: 'translateY(24px)', display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }} className="group-hover:translate-y-0">
                      Explore Collection <span>→</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
