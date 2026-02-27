'use client';

import React from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import HeroSection from '@/components/ecommerce/HeroSection';
import OurCategories from '@/components/ecommerce/OurCategories';
import FeaturedProducts from '@/components/ecommerce/FeaturedProducts';
import NewArrivals from '@/components/ecommerce/NewArrivals';
import SubcategoryProductTabs from '@/components/ecommerce/SubcategoryProductTabs';

export default function HomePage() {
  return (
    <div className="ec-root min-h-screen">
      <Navigation />
      <HeroSection />
      <div style={{ paddingBottom: '3rem' }}>
        <OurCategories />
        <FeaturedProducts />
        <NewArrivals />

        {/* Shop by Subcategory sections (stacked) */}
        <SubcategoryProductTabs
          parentQueries={['sneakers', 'sneaker']}
          eyebrow="Sneakers"
          subtitle="Explore sneaker collections—highs, lows, and everything in between."
        />
        <SubcategoryProductTabs
          parentQueries={['clothing', 'apparel']}
          eyebrow="Clothing"
          subtitle="Browse tees, hoodies, jackets and more."
        />
        <SubcategoryProductTabs
          parentQueries={['backpack', 'backpacks', 'bagpack', 'bagpacks']}
          eyebrow="Backpacks"
          subtitle="From daily carry to travel-ready packs."
        />
        <SubcategoryProductTabs
          parentQueries={['fashion accessories', 'fashion accessory', 'fashion-accessories']}
          eyebrow="Fashion Accessories"
          subtitle="Caps, socks, belts, and the finishing touches."
        />
      </div>
    </div>
  );
}
