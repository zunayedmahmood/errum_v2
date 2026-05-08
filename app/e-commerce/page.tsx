'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import HeroSection from '@/components/ecommerce/HeroSection';
import dynamic from 'next/dynamic';
import AnnouncementTicker from '@/components/ecommerce/AnnouncementTicker';

const CollectionTiles = dynamic(() => import('@/components/ecommerce/CollectionTiles'), {
  loading: () => <div style={{ minHeight: '400px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const NewArrivals = dynamic(() => import('@/components/ecommerce/NewArrivals'), {
  loading: () => <div style={{ minHeight: '600px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
const SubcategoryProductTabs = dynamic(() => import('@/components/ecommerce/SubcategoryProductTabs'), {
  loading: () => <div style={{ minHeight: '800px', margin: '40px 0' }} className="w-full bg-[var(--bg-surface-2)] animate-pulse rounded-2xl" />
});
import SectionReveal from '@/components/ecommerce/SectionReveal';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import settingsService, { HomepageSettings } from '@/services/settingsService';
import { toAbsoluteAssetUrl } from '@/lib/urlUtils';

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
  const [settings, setSettings] = useState<HomepageSettings | null>(null);

  useEffect(() => {
    catalogService.getCategories()
      .then(tree => {
        const top = tree.filter(c => !c.parent_id);
        setCategories(top.sort((a, b) => (b.product_count || 0) - (a.product_count || 0)));
      })
      .catch(console.error);
      
    settingsService.getHomepageSettings()
      .then(setSettings)
      .catch(console.error);
  }, []);

  return (
    <div className="ec-root min-h-screen" style={{ background: '#ffffff' }}>
      {(!settings || settings.ticker.enabled) && (
        <AnnouncementTicker 
          phrases={settings?.ticker?.phrases?.length ? settings.ticker.phrases : undefined} 
          mode={settings?.ticker?.mode}
        />
      )}
      <Navigation />

      {/* 1. Hero section */}
      <HeroSection 
        images={settings?.hero?.images ? settings.hero.images.map(img => ({ ...img, url: toAbsoluteAssetUrl(img.url) })) : undefined} 
        title={settings?.hero?.title}
        showTitle={settings?.hero?.show_title}
      />

      {/* 2. Collection Tiles */}
      {(!settings || (settings.collections && settings.collections.length > 0)) && (
        <SectionReveal>
          <CollectionTiles collections={settings?.collections ? settings.collections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any : undefined} />
        </SectionReveal>
      )}

      {/* 4. New Arrivals */}
      <SectionReveal>
        <NewArrivals limit={12} />
      </SectionReveal>

      {/* 5. Dynamic Shop by Subcategory sections (categories wise) */}
      {(settings?.showcase?.length ? settings.showcase : categories).map((item: any, idx: number) => {
        const isShowcase = 'category_id' in item;
        const catId = isShowcase ? item.category_id : item.id;
        const subIds = isShowcase ? item.subcategories : undefined;

        if (isShowcase) {
          return (
            <SectionReveal key={`showcase-${catId}-${idx}`} threshold={0.1}>
              <SubcategoryProductTabs
                categoryId={catId}
                subcategoryIds={subIds}
              />
            </SectionReveal>
          );
        }

        // Legacy / fallback behavior when showcase is not yet configured
        const slug = (item.slug || item.name).toLowerCase();
        const custom = CUSTOM_SECTIONS[slug] ||
          Object.values(CUSTOM_SECTIONS).find(s => s.queries.includes(slug));

        return (
          <SectionReveal key={`cat-${item.id}`} threshold={0.1}>
            <SubcategoryProductTabs
              parentQueries={custom ? custom.queries : [slug]}
              eyebrow={custom ? custom.eyebrow : item.name}
              subtitle={custom ? custom.subtitle : `Explore our curated selection of quality ${item.name} essentials.`}
            />
          </SectionReveal>
        );
      })}
    </div>
  );
}
