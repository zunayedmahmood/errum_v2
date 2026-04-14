'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import HeroSection from '@/components/ecommerce/HeroSection';
import dynamic from 'next/dynamic';

const OurCategories = dynamic(() => import('@/components/ecommerce/OurCategories'), {
  loading: () => <div style={{ minHeight: '400px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const FeaturedProducts = dynamic(() => import('@/components/ecommerce/FeaturedProducts'), {
  loading: () => <div style={{ minHeight: '600px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const NewArrivals = dynamic(() => import('@/components/ecommerce/NewArrivals'), {
  loading: () => <div style={{ minHeight: '600px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const SubcategoryProductTabs = dynamic(() => import('@/components/ecommerce/SubcategoryProductTabs'), {
  loading: () => <div style={{ minHeight: '800px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const InstagramReelViewer = dynamic(() => import('@/components/ecommerce/InstagramReelViewer'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '760px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
import SectionReveal from '@/components/ecommerce/SectionReveal';
import catalogService, { CatalogCategory } from '@/services/catalogService';

const CUSTOM_SECTIONS: Record<string, { eyebrow: string; subtitle: string; queries: string[] }> = {
  'sneakers': {
    eyebrow: "Sneakers",
    subtitle: "Explore sneaker collections—highs, lows, and everything in between.",
    queries: ['sneakers', 'sneaker']
  },
  'clothing': {
    eyebrow: "Clothing",
    subtitle: "Browse tees, hoodies, jackets and more.",
    queries: ['clothing', 'apparel']
  },
  'backpacks': {
    eyebrow: "Backpacks",
    subtitle: "From daily carry to travel-ready packs.",
    queries: ['backpack', 'backpacks', 'bagpack', 'bagpacks']
  },
  'fashion-accessories': {
    eyebrow: "Fashion Accessories",
    subtitle: "Caps, socks, belts, and the finishing touches.",
    queries: ['fashion accessories', 'fashion accessory', 'fashion-accessories']
  }
};

export default function HomePage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);

  useEffect(() => {
    catalogService.getCategories()
      .then(tree => {
        const top = tree.filter(c => !c.parent_id);
        setCategories(top.sort((a, b) => (b.product_count || 0) - (a.product_count || 0)));
      })
      .catch(console.error);
  }, []);

  return (
    <div className="ec-root min-h-screen" style={{ background: '#ffffff' }}>
      <Navigation />

      {/* Hero section */}
      <HeroSection />

      {/* Instagram Reels Feed */}
      <SectionReveal threshold={0.05}>
        <InstagramReelViewer />
      </SectionReveal>

      {/* New Arrivals */}
      <SectionReveal>
        <NewArrivals limit={40} />
      </SectionReveal>

      {/* Featured Categories */}
      <SectionReveal>
        <OurCategories categories={categories} />
      </SectionReveal>

      {/* Featured Products */}
      <SectionReveal>
        <FeaturedProducts />
      </SectionReveal>

      {/* Dynamic Shop by Subcategory sections */}
      {categories.map((cat) => {
        const slug = (cat.slug || cat.name).toLowerCase();
        const custom = CUSTOM_SECTIONS[slug] ||
          Object.values(CUSTOM_SECTIONS).find(s => s.queries.includes(slug));

        return (
          <SectionReveal key={cat.id} threshold={0.1}>
            <SubcategoryProductTabs
              parentQueries={custom ? custom.queries : [slug]}
              eyebrow={custom ? custom.eyebrow : cat.name}
              subtitle={custom ? custom.subtitle : `Explore our curated selection of quality ${cat.name} essentials.`}
            />
          </SectionReveal>
        );
      })}


    </div>
  );
}
