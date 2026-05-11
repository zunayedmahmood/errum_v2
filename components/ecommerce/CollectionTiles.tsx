'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CatalogCategory } from '@/services/catalogService';

interface Collection {
  id: string | number;
  title: string;
  subtitle: string;
  image: string;
  href: string;
  show_text?: boolean;
}

interface CollectionTilesProps {
  collections?: Collection[];
}

export default function CollectionTiles({ collections }: CollectionTilesProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Use the pre-selected featured collections
  const displayCollections = collections || [];

  if (!displayCollections || displayCollections.length === 0) return null;

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    setMousePos({ x, y });
  };

  return (
    <section
      className="ec-section overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <div className="ec-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {displayCollections.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group relative overflow-hidden rounded-2xl aspect-[4/5] block bg-neutral-900"
            >
              {/* Background with Parallax */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out group-hover:scale-110"
                style={{
                  backgroundImage: `url(${item.image})`,
                  transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px) scale(1.1)`,
                }}
              />

              {/* Overlay - Only show if text is enabled to make it readable */}
              {item.show_text !== false && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity group-hover:opacity-90" />
              )}

              {/* Content */}
              {item.show_text !== false && (
                <div className="absolute inset-0 p-8 flex flex-col justify-end">
                  <p className="text-white/60 text-[10px]  tracking-widest uppercase mb-1 line-clamp-2">{item.subtitle}</p>
                  <h3 className="text-white text-2xl  mb-2 line-clamp-3">{item.title}</h3>

                  <div className="overflow-hidden h-6">
                    <div className="transition-transform duration-500 transform translate-y-6 group-hover:translate-y-0 flex items-center gap-2 text-white text-[10px] font-semibold uppercase tracking-wider">
                      Explore Collection <span className="text-sm">→</span>
                    </div>
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
