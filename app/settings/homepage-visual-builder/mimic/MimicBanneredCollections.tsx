"use client";

import React from "react";

interface BanneredItem {
  id: number;
  type: 'category' | 'collection';
  title: string;
  subtitle?: string;
  image: string;
  show_text?: boolean;
}

interface MimicBanneredCollectionsProps {
  items: BanneredItem[];
}

export default function MimicBanneredCollections({ items }: MimicBanneredCollectionsProps) {
  if (!items || items.length === 0) return null;

  const renderItem = (item: BanneredItem, isLarge: boolean = false) => (
    <div
      style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', minHeight: isLarge ? '400px' : '200px', cursor: 'default' }}
      className="group"
    >
      <img
        src={item.image}
        alt={item.title}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectCover: 'cover', transition: 'transform 0.7s' }}
        className="group-hover:scale-110"
      />
      
      {item.show_text && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.2) 50%, transparent)', opacity: 0.6, transition: 'opacity 0.3s' }} className="group-hover:opacity-80" />
          <div style={{ position: 'absolute', inset: 0, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: '#ffffff' }}>
            {item.subtitle && (
              <span style={{ fontSize: '12px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', opacity: 0, transform: 'translateY(16px)', transition: 'all 0.5s' }} className="group-hover:opacity-100 group-hover:translate-y-0">
                {item.subtitle}
              </span>
            )}
            <h3 style={{ fontWeight: 'bold', fontSize: isLarge ? '32px' : '20px', marginBottom: '12px' }}>
              {item.title}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', transition: 'all 0.3s' }} className="group-hover:gap-16">
              <span>Explore</span>
              <div style={{ width: '32px', height: '1px', background: '#ffffff' }} />
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <section style={{ padding: '48px 0' }}>
      <div className="ec-container">
        <div style={{
          display: 'grid',
          gap: '24px',
          gridTemplateColumns: items.length === 1 ? '1fr' : (items.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)'),
        }}>
          {items.length === 1 && (
            <div style={{ gridColumn: 'span 1' }}>
              {renderItem(items[0], true)}
            </div>
          )}
          
          {items.length === 2 && (
            <>
              <div style={{ gridColumn: 'span 1' }}>
                {renderItem(items[0], true)}
              </div>
              <div style={{ gridColumn: 'span 1' }}>
                {renderItem(items[1], true)}
              </div>
            </>
          )}
          
          {items.length === 3 && (
            <>
              <div style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
                {renderItem(items[0], true)}
              </div>
              <div style={{ gridColumn: 'span 1', gridRow: 'span 1' }}>
                {renderItem(items[1], false)}
              </div>
              <div style={{ gridColumn: 'span 1', gridRow: 'span 1' }}>
                {renderItem(items[2], false)}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
