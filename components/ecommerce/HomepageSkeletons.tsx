'use client';

import React from 'react';

export const TickerSkeleton = () => (
  <div className="w-full h-[40px] bg-neutral-900 animate-pulse relative z-[100]" />
);

export const HeroSkeleton = () => (
  <section className="relative min-h-screen bg-[#111111] flex items-center justify-center overflow-hidden">
    <div className="ec-container relative z-10 flex flex-col items-center gap-12 w-full px-6">
      <div className="w-full max-w-2xl h-16 bg-white/5 rounded-2xl animate-pulse" />
      <div className="flex gap-6">
        <div className="w-40 h-14 bg-white/10 rounded-lg animate-pulse" />
        <div className="w-40 h-14 bg-white/5 rounded-lg animate-pulse" />
      </div>
    </div>
  </section>
);

export const SectionSkeleton = ({ height = '400px', className = '' }: { height?: string, className?: string }) => (
  <div 
    style={{ minHeight: height }} 
    className={`w-full bg-[var(--bg-surface-2)] animate-pulse rounded-3xl my-12 ${className}`} 
  />
);

export const CollectionsSkeleton = () => (
  <div className="ec-container my-20">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[1, 2, 3].map(i => (
        <div key={i} className="aspect-[4/5] bg-neutral-100 animate-pulse rounded-2xl" />
      ))}
    </div>
  </div>
);

export const ProductGridSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
    {[...Array(count)].map((_, i) => (
      <div key={i} className="flex flex-col gap-4">
        <div className="aspect-[3/4] bg-neutral-100 animate-pulse rounded-xl" />
        <div className="h-4 bg-neutral-100 animate-pulse w-3/4 rounded" />
        <div className="h-4 bg-neutral-100 animate-pulse w-1/2 rounded" />
      </div>
    ))}
  </div>
);

export const ShowcaseSkeleton = () => (
  <div className="ec-container my-20 flex flex-col gap-10">
    <div className="h-10 bg-neutral-100 animate-pulse w-1/4 rounded-lg" />
    <ProductGridSkeleton count={4} />
  </div>
);
