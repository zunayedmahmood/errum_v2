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

export default function HomePage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [settings, setSettings] = useState<HomepageSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [catTree, homeSettings] = await Promise.all([
          catalogService.getCategories(),
          settingsService.getHomepageSettings()
        ]);

        const top = catTree.filter(c => !c.parent_id);
        setCategories(top.sort((a, b) => (b.product_count || 0) - (a.product_count || 0)));
        setSettings(homeSettings);
      } catch (err) {
        console.error('Failed to initialize homepage:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="ec-root min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-black/10 border-t-black animate-spin" />
          <p className="text-[10px] tracking-widest uppercase text-neutral-400 font-bold">Initializing Experience</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root min-h-screen" style={{ background: '#ffffff' }}>
      {settings?.ticker?.enabled && (
        <AnnouncementTicker 
          phrases={settings.ticker.phrases} 
          mode={settings.ticker.mode}
        />
      )}
      <Navigation />

      {/* 1. Hero section */}
      <HeroSection 
        images={settings?.hero?.images ? settings.hero.images.map(img => ({ ...img, url: toAbsoluteAssetUrl(img.url) })) : []} 
        title={settings?.hero?.title}
        showTitle={settings?.hero?.show_title}
      />

      {/* 2. Collection Tiles */}
      {settings?.collections && settings.collections.length > 0 && (
        <SectionReveal>
          <CollectionTiles collections={settings.collections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any} />
        </SectionReveal>
      )}

      {/* 4. New Arrivals */}
      <SectionReveal>
        <NewArrivals limit={12} />
      </SectionReveal>

      {/* 5. Showcase Categories (Configured via Settings) */}
      {settings?.showcase?.map((item: any, idx: number) => (
        <SectionReveal key={`showcase-${item.category_id}-${idx}`} threshold={0.1}>
          <SubcategoryProductTabs
            categoryId={item.category_id}
            subcategoryIds={item.subcategories}
          />
        </SectionReveal>
      ))}

      {/* Fallback loop: if no showcase is configured, show top categories as default behavior */}
      {(!settings?.showcase || settings.showcase.length === 0) && categories.map((item: any) => (
        <SectionReveal key={`cat-${item.id}`} threshold={0.1}>
          <SubcategoryProductTabs
            categoryId={item.id}
            eyebrow={item.name}
            subtitle={`Explore our curated selection of quality ${item.name} essentials.`}
          />
        </SectionReveal>
      ))}
    </div>
  );
}

