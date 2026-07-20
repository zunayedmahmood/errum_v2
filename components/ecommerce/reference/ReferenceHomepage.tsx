'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import Navigation from '@/components/ecommerce/Navigation';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import {
  categoryImage,
  categoryName,
  formatProductPrice,
  groupedDisplayProducts,
  productImage,
  productName,
  slugify,
} from './storefrontUtils';
import {
  HARDCODED_CATEGORY_ARTWORK,
  getHardcodedCategoryImage,
} from './categoryArtwork';

const HERO_ENDPOINT_HOLD_MS = 950;
const HERO_DESKTOP_PEAK_SPEED_VW_PER_SECOND = 6.8;
const HERO_MOBILE_PEAK_SPEED_VW_PER_SECOND = 8.4;
const HERO_TEXT_HOLD_MS = 7_200;
const FEATURED_DROP_HOLD_MS = 5_200;
const FEATURED_DROP_TRANSITION_MS = 920;

const HERO_TYPED_ITEMS = [
  'ERRUMBD',
  'SNEAKERS',
  'PERFUME',
  'WATCH',
  'CLOTHING',
  'FASHION',
  'ACCESSORIES',
  'SLIDES',
  'SHOE-CARE',
  'THOBE',
];

const preferredCollectionKeywords = ['sneaker', 'watch', 'perfume'];
const sectionDefinitions = [
  { eyebrow: 'SNEAKERS', title: 'LATEST SNEAKER DROPS', keywords: ['sneaker', 'shoe', 'nike', 'jordan'] },
  { eyebrow: 'T-SHIRT', title: 'CLASSY CLOTHING ESSENTIALS', keywords: ['clothing', 'shirt', 't-shirt', 'polo', 'panjabi', 'pants'] },
  { eyebrow: 'PERFUME FRAGRANCE', title: 'LUXURY SCENTS & PERFUMES', keywords: ['perfume', 'fragrance', 'scent'] },
  { eyebrow: 'FASHION ACCESSORIES', title: 'PREMIUM TIMEPIECES & WATCHES', keywords: ['watch', 'accessories', 'cap', 'shemagh'] },
];

const sleep = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getCategoryMatch = (product: SimpleProduct, keywords: string[]): boolean => {
  const raw = product as any;
  const searchable = [
    categoryName(product),
    productName(product),
    raw?.category?.slug,
    raw?.category_slug,
    raw?.subcategory?.name,
    raw?.brand?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return keywords.some((keyword) => searchable.includes(keyword.toLowerCase()));
};

/**
 * Shared hero displacement.
 *
 * Position follows a cosine ease so velocity follows a sine curve: every card
 * starts together, accelerates together, slows together, stops at the far end,
 * then reverses through the exact same path. Cards never take turns and never
 * run on independent timers.
 */
const heroSeeSawPosition = (elapsed: number, travelDurationMs: number): number => {
  const safeTravelDuration = Math.max(1, travelDurationMs);
  const cycle = HERO_ENDPOINT_HOLD_MS
    + safeTravelDuration
    + HERO_ENDPOINT_HOLD_MS
    + safeTravelDuration;
  const local = ((elapsed % cycle) + cycle) % cycle;

  if (local < HERO_ENDPOINT_HOLD_MS) return 0;

  const forwardEnd = HERO_ENDPOINT_HOLD_MS + safeTravelDuration;
  if (local < forwardEnd) {
    const progress = (local - HERO_ENDPOINT_HOLD_MS) / safeTravelDuration;
    return 0.5 - (0.5 * Math.cos(Math.PI * progress));
  }

  const farHoldEnd = forwardEnd + HERO_ENDPOINT_HOLD_MS;
  if (local < farHoldEnd) return 1;

  const reverseProgress = (local - farHoldEnd) / safeTravelDuration;
  return 0.5 + (0.5 * Math.cos(Math.PI * reverseProgress));
};

/** The typing clock is intentionally independent from the category-card motion. */
function TypewriterTitle({ text }: { text: string }) {
  const [visible, setVisible] = useState('');
  const visibleRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    const commit = (value: string) => {
      visibleRef.current = value;
      if (!cancelled) setVisible(value);
    };

    const animate = async () => {
      let current = visibleRef.current;

      while (!cancelled && current.length > 0) {
        current = current.slice(0, -1);
        commit(current);
        await sleep(58);
      }

      if (cancelled) return;
      await sleep(380);

      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        commit(text.slice(0, index));
        await sleep(110);
      }
    };

    animate();
    return () => { cancelled = true; };
  }, [text]);

  return <>{visible}<span className="ref-hero__cursor" aria-hidden="true" /></>;
}

function CategoryMotionHero() {
  const panelRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setTextIndex((value) => (value + 1) % HERO_TYPED_ITEMS.length),
      HERO_TEXT_HOLD_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    HARDCODED_CATEGORY_ARTWORK.forEach((item) => {
      const image = new window.Image();
      image.src = item.image;
    });
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let startedAt = performance.now();
    let hiddenAt: number | null = null;

    const renderTrack = (now: number) => {
      const mobile = window.innerWidth < 768;
      const viewportWidth = Math.max(1, window.innerWidth);
      const firstPanel = panelRefs.current.find((panel): panel is HTMLAnchorElement => Boolean(panel));
      const panelWidthVw = firstPanel
        ? (firstPanel.offsetWidth / viewportWidth) * 100
        : (mobile ? 68 : 25.8);

      // Every card is placed exactly one measured card-width after the previous
      // card, so the train has no gaps or overlaps. The travel range is derived
      // from the complete train width; consequently the last image must enter
      // the viewport before the track is allowed to stop and reverse.
      const startX = 0;
      const stepX = panelWidthVw;
      const totalTrainWidthVw = panelWidthVw * HARDCODED_CATEGORY_ARTWORK.length;
      const travelX = Math.max(0, totalTrainWidthVw - 100);
      const targetPeakSpeed = mobile
        ? HERO_MOBILE_PEAK_SPEED_VW_PER_SECOND
        : HERO_DESKTOP_PEAK_SPEED_VW_PER_SECOND;
      const travelDurationMs = Math.max(18_000, (travelX * Math.PI * 1000) / (2 * targetPeakSpeed));
      const elapsed = reducedMotion ? HERO_ENDPOINT_HOLD_MS + (travelDurationMs * 0.5) : now - startedAt;
      const displacement = heroSeeSawPosition(elapsed, travelDurationMs);

      const travelY = mobile ? 13 : 16;
      const baseYPattern = mobile
        ? [42, 31, 20, 9, -2, -9, -3, 8, 19]
        : [52, 40, 28, 16, 4, -8, -3, 10, 22];

      panelRefs.current.forEach((panel, index) => {
        if (!panel) return;

        const x = startX + (index * stepX) - (travelX * displacement);
        const y = (baseYPattern[index] ?? 0) + (travelY * displacement);
        panel.style.transform = `translate3d(${x}vw, ${y}vh, 0)`;
        panel.style.zIndex = String(20 + index);
        panel.style.pointerEvents = x > -panelWidthVw && x < 100 ? 'auto' : 'none';
      });

      frame = window.requestAnimationFrame(renderTrack);
    };

    frame = window.requestAnimationFrame(renderTrack);

    const preserveTimelineAcrossTabChanges = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = performance.now();
      } else if (hiddenAt !== null) {
        startedAt += performance.now() - hiddenAt;
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', preserveTimelineAcrossTabChanges);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', preserveTimelineAcrossTabChanges);
    };
  }, []);

  return (
    <section className="ref-hero">
      <Navigation transparent />
      <div className="ref-hero__copy">
        <h1 className="font-display text-[10vw] md:text-[12vw] lg:text-[9vw] font-black leading-[0.82] tracking-tighter text-accent uppercase select-none ref-hero__title">
          <TypewriterTitle text={HERO_TYPED_ITEMS[textIndex]} />
        </h1>
        <p>ERRUM — PREMIUM STREETWEAR CATALOG,<br />CURATING CULTURE FOR SNEAKERHEADS.</p>
        <strong>AUTHENTIC. LIMITED. HIGH-END.</strong>
      </div>

      <div className="ref-hero__panels" aria-label="Shop categories">
        {HARDCODED_CATEGORY_ARTWORK.map((item, index) => (
          <Link
            href={`/e-commerce/${item.slug}`}
            key={item.slug}
            ref={(element) => { panelRefs.current[index] = element; }}
            className="ref-hero-panel ref-hero-panel--motion"
            aria-label={`Shop ${item.name}`}
            prefetch
          >
            <img
              src={item.image}
              alt={item.name}
              loading={index < 6 ? 'eager' : 'lazy'}
              decoding="async"
            />
            <span>
              <small>CAT. {String(index + 1).padStart(2, '0')}</small>
              {item.name}
            </span>
          </Link>
        ))}
      </div>
      <div className="ref-hero__scroll"><span /></div>
    </section>
  );
}

type FeaturedDirection = 'forward' | 'backward';

function FeaturedDrop({ products }: { products: SimpleProduct[] }) {
  const [active, setActive] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [direction, setDirection] = useState<FeaturedDirection>('forward');
  const [transitionSerial, setTransitionSerial] = useState(0);
  const cleanupTimer = useRef<number | null>(null);
  const productSignature = products.map((item) => item.id).join(':');

  useEffect(() => {
    setActive(0);
    setOutgoing(null);
    setTransitionSerial(0);
  }, [productSignature]);

  useEffect(() => () => {
    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
  }, []);

  const transitionTo = useCallback((nextIndex: number, forcedDirection?: FeaturedDirection) => {
    if (products.length < 2 || nextIndex === active) return;

    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
    setOutgoing(active);
    setDirection(forcedDirection || (nextIndex > active ? 'forward' : 'backward'));
    setActive(nextIndex);
    setTransitionSerial((value) => value + 1);
    cleanupTimer.current = window.setTimeout(() => {
      setOutgoing(null);
      cleanupTimer.current = null;
    }, FEATURED_DROP_TRANSITION_MS);
  }, [active, products.length]);

  useEffect(() => {
    if (products.length < 2) return;
    const timer = window.setInterval(() => {
      const next = (active + 1) % products.length;
      transitionTo(next, 'forward');
    }, FEATURED_DROP_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [active, products.length, transitionTo]);

  if (!products.length) return null;
  const activeProduct = products[active];
  const outgoingProduct = outgoing === null ? null : products[outgoing];

  const renderScene = (
    product: SimpleProduct,
    state: 'entering' | 'leaving',
    sceneKey: string,
  ) => (
    <div
      key={sceneKey}
      className={`ref-featured-drop__scene is-${state} direction-${direction}`}
      aria-hidden={state === 'leaving'}
    >
      <div className="ref-featured-drop__watermark">{(product.base_name || product.name).split(' ')[0]}</div>
      <Link href={`/e-commerce/product/${product.id}`} className="ref-featured-drop__image">
        <img src={productImage(product)} alt={productName(product)} />
      </Link>
      <div className="ref-featured-drop__copy">
        <span>FEATURED DROP</span>
        <h2>{productName(product)}</h2>
        <b>{formatProductPrice(product)}</b>
      </div>
      <Link href={`/e-commerce/product/${product.id}`} className="ref-featured-drop__shop">
        SHOP NOW <ArrowUpRight size={15} />
      </Link>
    </div>
  );

  return (
    <section className="ref-featured-drop" aria-live="polite">
      {outgoingProduct && renderScene(
        outgoingProduct,
        'leaving',
        `outgoing-${outgoingProduct.id}-${transitionSerial}`,
      )}
      {renderScene(
        activeProduct,
        'entering',
        `active-${activeProduct.id}-${transitionSerial}`,
      )}
      <div className="ref-featured-drop__dots">
        {products.map((item, index) => (
          <button
            key={item.id}
            className={index === active ? 'is-active' : ''}
            onClick={() => transitionTo(index, index < active ? 'backward' : 'forward')}
            aria-label={`Show ${productName(item)}`}
          />
        ))}
      </div>
    </section>
  );
}

function ProductSection({ eyebrow, title, products }: { eyebrow: string; title: string; products: SimpleProduct[] }) {
  if (!products.length) return null;
  return (
    <section className="ref-product-section">
      <div className="ref-section-heading">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <Link href="/e-commerce/products">VIEW ALL <ArrowUpRight size={12} /></Link>
      </div>
      <div className="ref-home-products">
        {products.slice(0, 4).map((product, index) => (
          <PremiumProductCard
            key={product.id}
            product={product}
            onOpen={(item) => { window.location.href = `/e-commerce/product/${item.id}`; }}
            onAddToCart={() => undefined}
            animDelay={index * 50}
          />
        ))}
      </div>
    </section>
  );
}

export default function ReferenceHomepage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [categoryTree, productResponse] = await Promise.all([
          catalogService.getCategories(),
          catalogService.getProducts({ per_page: 36, sort_by: 'newest', in_stock: 'all' }),
        ]);
        if (cancelled) return;
        const topCategories = categoryTree.filter((category) => !category.parent_id && category.is_active !== false);
        const displayProducts = groupedDisplayProducts(productResponse);
        setCategories(topCategories);
        setProducts(displayProducts);
      } catch (error) {
        console.error('Failed to load ERRUM storefront', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const curated = useMemo(() => {
    const selected: { category: CatalogCategory; image: string; label: string }[] = [];
    preferredCollectionKeywords.forEach((keyword) => {
      const category = categories.find((item) => item.name.toLowerCase().includes(keyword));
      if (category) {
        const product = products.find((item) => getCategoryMatch(item, [keyword]));
        selected.push({
          category,
          image: product ? productImage(product) : (getHardcodedCategoryImage(category) || categoryImage(category)),
          label: keyword === 'sneaker' ? 'ICONIC SNEAKERS' : keyword === 'watch' ? 'WATCHES' : 'LUXURY SCENTS',
        });
      }
    });
    categories.forEach((category) => {
      if (selected.length >= 3 || selected.some((item) => item.category.id === category.id)) return;
      const product = products.find((item) => categoryName(item).toLowerCase().includes(category.name.toLowerCase()));
      selected.push({
        category,
        image: product ? productImage(product) : (getHardcodedCategoryImage(category) || categoryImage(category)),
        label: category.name.toUpperCase(),
      });
    });
    return selected.slice(0, 3);
  }, [categories, products]);

  const sectionProducts = useMemo(() => sectionDefinitions.map((definition, sectionIndex) => {
    const matches = products.filter((product) => getCategoryMatch(product, definition.keywords));
    const fallback = products.slice(sectionIndex * 4, sectionIndex * 4 + 4);
    return { ...definition, products: (matches.length >= 2 ? matches : fallback).slice(0, 4) };
  }), [products]);

  return (
    <main className="ref-storefront">
      <CategoryMotionHero />
      <div className="ref-ticker"><div>✦ 100% AUTHENTIC ✦ PREMIUM STREETWEAR ✦ FREE SECURE SHIPPING ✦ LATEST DROPS ✦ ENGINEERED TO MOVE ✦ 100% AUTHENTIC ✦ PREMIUM STREETWEAR ✦ FREE SECURE SHIPPING ✦</div></div>

      <section className="ref-essentials">
        <div className="ref-section-heading ref-section-heading--compact"><h2>FIND YOUR ESSENTIALS</h2></div>
        <div className="ref-essentials__scroll">
          <Link className="is-active" href="/e-commerce/products">ALL</Link>
          {categories.map((category) => <Link key={category.id} href={`/e-commerce/${category.slug || slugify(category.name)}`}>{category.name}</Link>)}
        </div>
      </section>

      {loading ? <div className="ref-featured-drop ref-featured-drop--loading" /> : <FeaturedDrop products={products.slice(0, 5)} />}

      <section className="ref-curated">
        <div className="ref-curated__intro"><span>COLLECTIONS</span><h2>CURATED COLLECTIONS</h2><p>Explore our hand-picked selections of iconic streetwear, luxury fragrances, and everyday premium essentials.</p></div>
        <div className="ref-curated__grid">
          {curated.map((item, index) => (
            <Link key={item.category.id} href={`/e-commerce/${item.category.slug || slugify(item.category.name)}`} className={`ref-curated-card ref-curated-card--${index}`}>
              <img src={item.image} alt={item.category.name} /><div><small>{index === 0 ? 'FOOTWEAR' : index === 1 ? 'TIMEPIECES' : 'FRAGRANCE'}</small><strong>{item.label}</strong></div>{index === 0 && <i><ArrowUpRight size={16} /></i>}
            </Link>
          ))}
        </div>
      </section>

      {sectionProducts.map((section) => <ProductSection key={section.title} {...section} />)}

      <section className="ref-manifesto"><h2>Engineered for the streets.<br />Curated for the culture.</h2><b>©26</b></section>
    </main>
  );
}
