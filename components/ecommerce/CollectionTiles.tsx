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
}

const FEATURED_COLLECTIONS: Collection[] = [
  {
    id: 'sneakers',
    title: 'Premium Sneakers',
    subtitle: 'Step into the future',
    image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?q=80&w=2070&auto=format&fit=crop',
    href: '/e-commerce/sneakers',
  },
  {
    id: 't-shirts',
    title: 'Graphic Tees',
    subtitle: 'Wear your story',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=2080&auto=format&fit=crop',
    href: '/e-commerce/t-shirts',
  },
  {
    id: 'hoodies',
    title: 'Cozy Hoodies',
    subtitle: 'Comfort meets style',
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=1974&auto=format&fit=crop',
    href: '/e-commerce/hoodies',
  },
  {
    id: 'backpacks',
    title: 'Urban Backpacks',
    subtitle: 'Carry your world',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=1974&auto=format&fit=crop',
    href: '/e-commerce/backpacks',
  },
  {
    id: 'caps',
    title: 'Street Caps',
    subtitle: 'Top off your look',
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?q=80&w=2070&auto=format&fit=crop',
    href: '/e-commerce/caps',
  },
  {
    id: 'jackets',
    title: 'Outerwear',
    subtitle: 'Stay warm, stay sharp',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=1935&auto=format&fit=crop',
    href: '/e-commerce/jackets',
  },
  {
    id: 'socks',
    title: 'Premium Socks',
    subtitle: 'Details that matter',
    image: 'https://images.unsplash.com/photo-1582966298431-99c6a1e8d44c?q=80&w=2070&auto=format&fit=crop',
    href: '/e-commerce/socks',
  },
  {
    id: 'sunglasses',
    title: 'Fashion Shades',
    subtitle: 'Shadow your style',
    image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=2080&auto=format&fit=crop',
    href: '/e-commerce/sunglasses',
  },
];

interface CollectionTilesProps {
  categories?: CatalogCategory[];
}

export default function CollectionTiles({ categories }: CollectionTilesProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Use the pre-selected featured collections
  const displayCollections = FEATURED_COLLECTIONS;

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

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity group-hover:opacity-90" />

              {/* Content */}
              <div className="absolute inset-0 p-8 flex flex-col justify-end">
                <p className="text-white/60 text-[10px]  tracking-widest uppercase mb-1 line-clamp-2">{item.subtitle}</p>
                <h3 className="text-white text-2xl  mb-2 line-clamp-1">{item.title}</h3>

                <div className="overflow-hidden h-6">
                  <div className="transition-transform duration-500 transform translate-y-6 group-hover:translate-y-0 flex items-center gap-2 text-white text-[10px] font-semibold uppercase tracking-wider">
                    Explore Collection <span className="text-sm">→</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
