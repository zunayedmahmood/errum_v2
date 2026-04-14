'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface Collection {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  href: string;
  video?: string;
}

const collections: Collection[] = [
  {
    id: '1',
    title: 'Sneaker Head',
    subtitle: 'Limited editions and rare finds',
    image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?q=80&w=2070&auto=format&fit=crop',
    href: '/e-commerce/sneakers',
  },
  {
    id: '2',
    title: 'Streetwear Essentials',
    subtitle: 'Daily drops for the urban explorer',
    image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=2070&auto=format&fit=crop',
    href: '/e-commerce/clothing',
  },
  {
    id: '3',
    title: 'Accessories',
    subtitle: 'The finishing touches to your fit',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=1999&auto=format&fit=crop',
    href: '/e-commerce/accessories',
  }
];

export default function CollectionTiles() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    // We want to calculate relative movement from the center of each tile,
    // but for simplicity, global relative movement in the viewport works too.
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
          {collections.map((item) => (
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
                <p className="text-white/60 text-xs font-mono tracking-widest uppercase mb-2">{item.subtitle}</p>
                <h3 className="text-white text-3xl font-serif mb-4">{item.title}</h3>

                <div className="overflow-hidden h-10">
                  <div className="transition-transform duration-500 transform translate-y-10 group-hover:translate-y-0 flex items-center gap-2 text-white text-sm font-semibold uppercase tracking-wider">
                    Explore Collection <span className="text-xl">→</span>
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
