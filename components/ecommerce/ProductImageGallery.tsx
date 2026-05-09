'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductImage {
  id: number;
  url: string;
  is_primary: boolean;
  alt_text?: string;
}

interface ProductImageGalleryProps {
  images: ProductImage[];
  productName: string;
  discountPercent?: number;
  inStock?: boolean;
}


const PixelScaffold = () => {
  return (
    <div className="absolute inset-0 bg-gray-50 flex flex-wrap overflow-hidden z-[5]">
      {Array.from({ length: 64 }).map((_, i) => (
        <div 
          key={i} 
          className="w-[12.5%] h-[12.5%] bg-gray-100 border-[0.5px] border-white/40 animate-pulse" 
          style={{ animationDelay: `${(i % 8) * 40 + Math.floor(i / 8) * 40}ms` }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin opacity-20" />
      </div>
    </div>
  );
};

const ImageWithScaffold = ({ src, alt, fill, sizes, className, priority, objectFit = 'contain' }: any) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {!isLoaded && <PixelScaffold />}
      <Image
        src={src}
        alt={alt}
        fill={fill}
        sizes={sizes}
        className={`${className} transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        priority={priority}
        onLoad={() => setIsLoaded(true)}
        style={{ objectFit }}
      />
    </div>
  );
};

const ProductImageGallery: React.FC<ProductImageGalleryProps> = memo(({
  images,
  productName,
  discountPercent = 0,
  inStock = true
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Reset gallery when images change
  useEffect(() => {
    setActiveIndex(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
  }, [images]);

  const safeImages = images.length > 0
    ? images
    : [{ id: 0, url: '/placeholder-product.png', is_primary: true }];

  // Sync scroll position for mobile carousel
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, offsetWidth } = scrollContainerRef.current;
    if (offsetWidth === 0) return;
    const index = Math.round(scrollLeft / offsetWidth);
    if (index !== activeIndex && index < safeImages.length) {
      setActiveIndex(index);
    }
  };

  const scrollToImage = (index: number) => {
    setActiveIndex(index);
    if (!scrollContainerRef.current) return;
    const { offsetWidth } = scrollContainerRef.current;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    scrollContainerRef.current.scrollTo({
      left: index * offsetWidth,
      behavior: isMobile ? 'smooth' : 'instant' as any
    });
  };

  const prevImage = () => {
    const nextIdx = activeIndex === 0 ? safeImages.length - 1 : activeIndex - 1;
    scrollToImage(nextIdx);
  };

  const nextImage = () => {
    const nextIdx = activeIndex === safeImages.length - 1 ? 0 : activeIndex + 1;
    scrollToImage(nextIdx);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Vertical Thumbnails (Desktop) */}
      {safeImages.length > 1 && (
        <div className="hidden md:flex md:flex-col gap-3 w-16 lg:w-20 flex-shrink-0">
          {safeImages.map((img, index) => (
            <button
              key={img.id || index}
              onMouseEnter={() => scrollToImage(index)}
              onClick={() => scrollToImage(index)}
              className={`relative overflow-hidden rounded-md bg-transparent border transition-all duration-200 ${
                activeIndex === index ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-400'
              }`}
              style={{ aspectRatio: '1/1' }}
            >
              <ImageWithScaffold 
                src={img.url} 
                alt={`${productName} thumbnail ${index + 1}`}
                fill
                sizes="80px"
                className="object-cover" 
                objectFit="cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 relative group">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="relative overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar md:overflow-hidden rounded-lg md:rounded-2xl border-none bg-transparent"
          style={{ aspectRatio: '4/5', maxWidth: '100%' }}
        >
          <div className="flex h-full md:block">
            {safeImages.map((img, index) => (
              <div
                key={img.id || index}
                className={`snap-start flex-shrink-0 w-full h-full md:absolute md:inset-0 transition-opacity duration-500 ${
                  index === activeIndex ? 'md:opacity-100 z-10' : 'md:opacity-0 z-0'
                }`}
              >
                <ImageWithScaffold
                  src={img.url}
                  alt={`${productName} view ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain bg-white"
                  priority={index === 0}
                  objectFit="contain"
                />
              </div>
            ))}
          </div>

          {/* Status Badges */}
          <div className="absolute top-0 left-0 flex flex-col gap-2 z-20">
            {!inStock && (
              <span className="bg-black text-white px-2 py-1 rounded-sm text-[12px] font-bold tracking-widest uppercase shadow-sm">
                Out of Stock
              </span>
            )}
            {discountPercent > 0 && (
              <span className="bg-[#b83228] text-white px-2 py-1 rounded-sm text-[12px] font-bold tracking-widest uppercase">
                {discountPercent}% OFF
              </span>
            )}
          </div>

          {/* Navigation Arrows */}
          {safeImages.length > 1 && (
            <div className="absolute inset-y-0 left-0 right-0 hidden md:flex items-center justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="pointer-events-auto h-10 w-10 flex items-center justify-center rounded-full bg-white/80 border border-gray-100 shadow-sm text-gray-900 hover:bg-white transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="pointer-events-auto h-10 w-10 flex items-center justify-center rounded-full bg-white/80 border border-gray-100 shadow-sm text-gray-900 hover:bg-white transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Thumbnail Strip */}
        {safeImages.length > 1 && (
          <div className="flex md:hidden flex-wrap gap-2 py-4 z-30 justify-start">
            {safeImages.map((img, index) => (
              <button
                key={img.id || index}
                onClick={() => scrollToImage(index)}
                className={`w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 relative rounded-md overflow-hidden border-2 transition-all ${
                  activeIndex === index ? 'border-gray-900' : 'border-gray-200'
                }`}
              >
                <ImageWithScaffold src={img.url} fill sizes="64px" className="object-cover" alt="" objectFit="cover" />
              </button>
            ))}
          </div>
        )}

        {/* Desktop Progress Bars */}
        {safeImages.length > 1 && (
          <div className="hidden md:flex justify-center gap-2 mt-4">
            {safeImages.map((_, i) => (
              <div 
                key={i} 
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-8 bg-gray-900' : 'w-2 bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default ProductImageGallery;
