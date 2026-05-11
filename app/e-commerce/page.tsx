'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import HeroSection from '@/components/ecommerce/HeroSection';
import dynamic from 'next/dynamic';
import AnnouncementTicker from '@/components/ecommerce/AnnouncementTicker';
import { 
  TickerSkeleton, 
  HeroSkeleton, 
  CollectionsSkeleton, 
  SectionSkeleton,
  ShowcaseSkeleton
} from '@/components/ecommerce/HomepageSkeletons';

const CollectionTiles = dynamic(() => import('@/components/ecommerce/CollectionTiles'), {
  loading: () => <CollectionsSkeleton />
});
const NewArrivals = dynamic(() => import('@/components/ecommerce/NewArrivals'), {
  loading: () => <SectionSkeleton height="600px" />
});
const SubcategoryProductTabs = dynamic(() => import('@/components/ecommerce/SubcategoryProductTabs'), {
  loading: () => <ShowcaseSkeleton />
});
const BanneredCollections = dynamic(() => import('@/components/ecommerce/BanneredCollections'), {
  loading: () => <SectionSkeleton height="400px" />
});

import SectionReveal from '@/components/ecommerce/SectionReveal';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import settingsService, { HomepageSettings } from '@/services/settingsService';
import { toAbsoluteAssetUrl } from '@/lib/urlUtils';

export default function HomePage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [heroData, setHeroData] = useState<{ ticker: any; hero: any } | null>(null);
  const [collections, setCollections] = useState<any[] | null>(null);
  const [newArrivals, setNewArrivals] = useState<any | null>(null);
  const [banneredCollections, setBanneredCollections] = useState<any[] | null>(null);
  const [sectionOrder, setSectionOrder] = useState<string[]>(['hero', 'featured_collections', 'new_arrivals', 'bannered_collections', 'showcase']);
  const [showcase, setShowcase] = useState<any[] | null>(null);
  
  // Track individual loading states for granular control
  const [loadingHero, setLoadingHero] = useState(true);

  useEffect(() => {
    // 1. Fetch Categories (For Fallback Showcase)
    catalogService.getCategories().then(catTree => {
      const top = catTree.filter(c => !c.parent_id);
      setCategories(top.sort((a, b) => (b.product_count || 0) - (a.product_count || 0)));
    }).catch(err => console.error('Failed to load categories:', err));

    // 2. Fetch Hero & Ticker (Priority 1)
    settingsService.getHomepageSettings('hero').then(data => {
      setHeroData({ ticker: data.ticker, hero: data.hero });
      if (data.section_order) setSectionOrder(data.section_order);
      setLoadingHero(false);
    }).catch(err => {
      console.error('Failed to load hero settings:', err);
      setLoadingHero(false);
    });

    // 3. Fetch Collections (Priority 2)
    settingsService.getHomepageSettings('collections').then(data => {
      setCollections(data.collections || []);
    }).catch(err => console.error('Failed to load collections:', err));

    // 4. Fetch New Arrivals (Priority 2)
    settingsService.getHomepageSettings('new_arrivals').then(data => {
      setNewArrivals(data.new_arrivals || { enabled: false, products: [] });
    }).catch(err => console.error('Failed to load new arrivals:', err));

    // 5. Fetch Bannered Collections (Priority 2)
    settingsService.getHomepageSettings('bannered_collections').then(data => {
      setBanneredCollections(data.bannered_collections || []);
    }).catch(err => console.error('Failed to load bannered collections:', err));

    // 6. Fetch Showcase (Priority 3)
    settingsService.getHomepageSettings('showcase').then(data => {
      setShowcase(data.showcase || []);
    }).catch(err => console.error('Failed to load showcase:', err));
  }, []);

  return (
    <div className="ec-root min-h-screen" style={{ background: '#ffffff' }}>
      {/* 0. Ticker */}
      {loadingHero ? (
        <TickerSkeleton />
      ) : (
        heroData?.ticker?.enabled && (
          <AnnouncementTicker 
            phrases={heroData.ticker.phrases} 
            mode={heroData.ticker.mode}
            backgroundColor={heroData.ticker.background_color}
            textColor={heroData.ticker.text_color}
            speed={heroData.ticker.speed}
          />
        )
      )}

      <Navigation />

      {/* Dynamic Sections based on order */}
      {sectionOrder.map((sectionKey) => {
        switch (sectionKey) {
          case 'hero':
            return (
              <React.Fragment key="hero">
                {loadingHero ? (
                  <HeroSkeleton />
                ) : (
                  <HeroSection 
                    images={heroData?.hero?.images ? heroData.hero.images.map((img: any) => ({ ...img, url: toAbsoluteAssetUrl(img.url) })) : []} 
                    title={heroData?.hero?.title}
                    showTitle={heroData?.hero?.show_title}
                    slideshowEnabled={heroData?.hero?.slideshow_enabled}
                    autoplaySpeed={heroData?.hero?.autoplay_speed}
                    textPosition={heroData?.hero?.text_position}
                    textColor={heroData?.hero?.text_color}
                    fontSize={heroData?.hero?.font_size}
                    transitionType={heroData?.hero?.transition_type}
                  />
                )}
              </React.Fragment>
            );

          case 'featured_collections':
            return (
              <React.Fragment key="featured_collections">
                {collections === null ? (
                  <CollectionsSkeleton />
                ) : (
                  collections.length > 0 && (
                    <SectionReveal>
                      <CollectionTiles collections={collections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any} />
                    </SectionReveal>
                  )
                )}
              </React.Fragment>
            );

          case 'new_arrivals':
            return (
              <React.Fragment key="new_arrivals">
                {newArrivals === null ? (
                  <SectionSkeleton height="600px" />
                ) : (
                  <SectionReveal>
                    <NewArrivals limit={12} customProducts={newArrivals.products} />
                  </SectionReveal>
                )}
              </React.Fragment>
            );

          case 'bannered_collections':
            return (
              <React.Fragment key="bannered_collections">
                {banneredCollections === null ? (
                  <SectionSkeleton height="400px" />
                ) : (
                  banneredCollections.length > 0 && (
                    <SectionReveal>
                      <BanneredCollections items={banneredCollections.map((c: any) => ({ ...c, image: toAbsoluteAssetUrl(c.image) })) as any} />
                    </SectionReveal>
                  )
                )}
              </React.Fragment>
            );

          case 'showcase':
            return (
              <React.Fragment key="showcase">
                {showcase === null ? (
                  <div className="flex flex-col gap-20 py-10">
                    <ShowcaseSkeleton />
                    <ShowcaseSkeleton />
                  </div>
                ) : (
                  showcase.length > 0 ? (
                    showcase.map((item: any, idx: number) => (
                      <SectionReveal key={`showcase-${item.category_id}-${idx}`} threshold={0.1}>
                        <SubcategoryProductTabs
                          categoryId={item.category_id}
                          subcategoryIds={item.subcategories}
                        />
                      </SectionReveal>
                    ))
                  ) : (
                    categories.length === 0 ? (
                      <div className="flex flex-col gap-20 py-10">
                        <ShowcaseSkeleton />
                        <ShowcaseSkeleton />
                        <ShowcaseSkeleton />
                      </div>
                    ) : categories.map((item: any) => (
                      <SectionReveal key={`cat-${item.id}`} threshold={0.1}>
                        <SubcategoryProductTabs
                          categoryId={item.id}
                          eyebrow={item.name}
                          subtitle={`Explore our curated selection of quality ${item.name} essentials.`}
                        />
                      </SectionReveal>
                    ))
                  )
                )}
              </React.Fragment>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
