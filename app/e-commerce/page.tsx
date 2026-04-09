'use client';

import React from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import HeroSection from '@/components/ecommerce/HeroSection';
import OurCategories from '@/components/ecommerce/OurCategories';
import FeaturedProducts from '@/components/ecommerce/FeaturedProducts';
import NewArrivals from '@/components/ecommerce/NewArrivals';
import SubcategoryProductTabs from '@/components/ecommerce/SubcategoryProductTabs';
import SectionReveal from '@/components/ecommerce/SectionReveal';
import NewArrivalsTicker from '@/components/ecommerce/NewArrivalsTicker';
import CollectionTiles from '@/components/ecommerce/CollectionTiles';

export default function HomePage() {
  return (
    <div className="ec-root min-h-screen">
      <Navigation />
      
      {/* 7.1 — Hero section (Full height) */}
      <HeroSection />

      {/* 7.3 — New Arrivals Ticker (Infinite auto-scroll beneath hero) */}
      <NewArrivalsTicker />

      <div className="space-y-4">
        <SectionReveal>
          <OurCategories />
        </SectionReveal>

        {/* 7.4 — Parallax Collection Tiles */}
        <SectionReveal threshold={0.05}>
          <CollectionTiles />
        </SectionReveal>

        <SectionReveal>
          <FeaturedProducts />
        </SectionReveal>

        <SectionReveal>
          <NewArrivals />
        </SectionReveal>

        {/* Shop by Subcategory sections (stacked with staggered reveals) */}
        <SectionReveal threshold={0.1}>
          <SubcategoryProductTabs
            parentQueries={['sneakers', 'sneaker']}
            eyebrow="Sneakers"
            subtitle="Explore sneaker collections—highs, lows, and everything in between."
          />
        </SectionReveal>

        <SectionReveal threshold={0.1}>
          <SubcategoryProductTabs
            parentQueries={['clothing', 'apparel']}
            eyebrow="Clothing"
            subtitle="Browse tees, hoodies, jackets and more."
          />
        </SectionReveal>

        <SectionReveal threshold={0.1}>
          <SubcategoryProductTabs
            parentQueries={['backpack', 'backpacks', 'bagpack', 'bagpacks']}
            eyebrow="Backpacks"
            subtitle="From daily carry to travel-ready packs."
          />
        </SectionReveal>

        <SectionReveal threshold={0.1}>
          <SubcategoryProductTabs
            parentQueries={['fashion accessories', 'fashion accessory', 'fashion-accessories']}
            eyebrow="Fashion Accessories"
            subtitle="Caps, socks, belts, and the finishing touches."
          />
        </SectionReveal>
      </div>
    </div>
  );
}
