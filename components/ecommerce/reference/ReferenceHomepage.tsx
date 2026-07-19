'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import catalogService, { CatalogCategory, SimpleProduct } from '@/services/catalogService';
import Navigation from '@/components/ecommerce/Navigation';
import PremiumProductCard from '@/components/ecommerce/ui/PremiumProductCard';
import {
  categoryImage,
  categoryName,
  formatPrice,
  groupedDisplayProducts,
  productImage,
  productName,
  slugify,
} from './storefrontUtils';

interface HeroCategory {
  id: number;
  name: string;
  image: string;
  slug: string;
}

/**
 * The opening sequence is intentionally editorial and fixed. It must not
 * inherit category imagery, timings, or ordering from the old homepage
 * builder. These URLs and slugs are the approved hero art direction.
 */
const HARD_CODED_HERO_CATEGORIES: HeroCategory[] = [
  {
    id: 1,
    name: 'Sneakers',
    slug: 'sneakers',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1QwUTHfvg8DHT06M7iyIpbKpTRV4s8KbJ&w=1920&q=85&output=webp',
  },
  {
    id: 2,
    name: 'Perfume Fragrance',
    slug: 'perfume-fragrance',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1GohK21mbp8ZEnD-YW2ZLHeGxA2Jn_UAL&w=1920&q=85&output=webp',
  },
  {
    id: 3,
    name: 'Watch',
    slug: 'watch',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1OarJLZNpu59uYs080pXPa9txdgPcNIFq&w=1920&q=85&output=webp',
  },
  {
    id: 4,
    name: 'Clothing',
    slug: 'clothing',
    image: 'https://www.errumbd.com/bento_streetwear.png',
  },
  {
    id: 5,
    name: 'Fashion Accessories',
    slug: 'fashion-accessories',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1rp4wszr3H0GXsBEeBywfVi60BEqgv3x-&w=1920&q=85&output=webp',
  },
  {
    id: 6,
    name: 'Imported Slides',
    slug: 'imported-slides',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1ebQIb1sbsK8zQqT3NcsT9WtkxfmHVDDD&w=1920&q=85&output=webp',
  },
  {
    id: 7,
    name: 'Shoe Care',
    slug: 'shoe-care',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1U5uCqP4aGHoW6vOvvtJ-tWhjBMvkxRbo&w=1920&q=85&output=webp',
  },
  {
    id: 8,
    name: 'Thobe',
    slug: 'thobe',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1DyluZChLDjNY0nLISKlVMvlCy2BwlOjW&w=1920&q=85&output=webp',
  },
  {
    id: 9,
    name: 'Winter Collection',
    slug: 'winter-collection',
    image: 'https://wsrv.nl/?url=https%3A%2F%2Flh3.googleusercontent.com%2Fd%2F1rGQ6djeFKQR9jDBX708AeAlX3VEc4aw1&w=1920&q=85&output=webp',
  },
];

const HERO_FORWARD_MS = 18_500;
const HERO_END_PAUSE_MS = 1_650;
const HERO_TEXT_HOLD_MS = 6_200;

const sleep = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

/** Fixed-speed typewriter. Its clock is deliberately separate from the card motion. */
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

      // Erasing remains quicker than typing, but is not tied to hero travel.
      while (!cancelled && current.length > 0) {
        current = current.slice(0, -1);
        commit(current);
        await sleep(42);
      }

      if (cancelled) return;
      await sleep(180);

      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        commit(text.slice(0, index));
        await sleep(92);
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

  // Text changes on its own clock. It does not derive from the oscillator.
  useEffect(() => {
    const timer = window.setInterval(
      () => setTextIndex((value) => (value + 1) % HARD_CODED_HERO_CATEGORIES.length),
      HERO_TEXT_HOLD_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Preload the approved hero art before each card reaches the visible track.
  useEffect(() => {
    HARD_CODED_HERO_CATEGORIES.forEach((item) => {
      const image = new window.Image();
      image.src = item.image;
    });
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const totalCycle = (HERO_FORWARD_MS * 2) + (HERO_END_PAUSE_MS * 2);
    let frame = 0;
    let startedAt = performance.now();

    const renderTrack = (now: number) => {
      const mobile = window.innerWidth < 768;
      const spacing = mobile ? 0.34 : 0.255;
      const startingTravel = mobile ? 0.72 : 0.86;
      const visibleSlots = mobile ? 3 : 4;
      const maxShift = Math.max(0, HARD_CODED_HERO_CATEGORIES.length - visibleSlots);

      let shift = 0;
      if (!reducedMotion) {
        const elapsed = (now - startedAt) % totalCycle;
        if (elapsed < HERO_FORWARD_MS) {
          const progress = elapsed / HERO_FORWARD_MS;
          // Cosine displacement produces a sinusoidal velocity curve: accelerate,
          // decelerate to zero, pause, and perform the exact reverse journey.
          shift = (0.5 - (0.5 * Math.cos(Math.PI * progress))) * maxShift;
        } else if (elapsed < HERO_FORWARD_MS + HERO_END_PAUSE_MS) {
          shift = maxShift;
        } else if (elapsed < (HERO_FORWARD_MS * 2) + HERO_END_PAUSE_MS) {
          const progress = (elapsed - HERO_FORWARD_MS - HERO_END_PAUSE_MS) / HERO_FORWARD_MS;
          shift = (0.5 + (0.5 * Math.cos(Math.PI * progress))) * maxShift;
        } else {
          shift = 0;
        }
      }

      panelRefs.current.forEach((panel, index) => {
        if (!panel) return;
        const travel = startingTravel + (shift * spacing) - (index * spacing);
        const x = mobile ? 80 - (118 * travel) : 80 - (108 * travel);
        const y = mobile ? 5 + (65 * travel) : 1 + (67 * travel);
        const scale = mobile ? 1.01 - (0.35 * travel) : 1.02 - (0.32 * travel);
        const fadeIn = smoothstep(-0.27, 0.015, travel);
        const fadeOut = 1 - smoothstep(0.91, 1.16, travel);
        const opacity = clamp01(fadeIn * fadeOut);

        panel.style.transform = `translate3d(${x}vw, ${y}vh, 0) scale(${Math.max(0.56, scale)})`;
        panel.style.opacity = opacity.toFixed(3);
        panel.style.zIndex = String(Math.round(90 - (travel * 24)));
        panel.style.pointerEvents = opacity > 0.18 ? 'auto' : 'none';
      });

      frame = window.requestAnimationFrame(renderTrack);
    };

    frame = window.requestAnimationFrame(renderTrack);
    const restartAfterVisibility = () => {
      if (document.visibilityState === 'visible') startedAt = performance.now();
    };
    document.addEventListener('visibilitychange', restartAfterVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', restartAfterVisibility);
    };
  }, []);

  const typedSlug = `ERRUMBD/${HARD_CODED_HERO_CATEGORIES[textIndex].slug.toUpperCase()}`;

  return (
    <section className="ref-hero">
      <Navigation transparent />
      <div className="ref-hero__copy">
        <h1 className="font-display text-[10vw] md:text-[12vw] lg:text-[9vw] font-black leading-[0.82] tracking-tighter text-accent uppercase select-none ref-hero__title">
          <TypewriterTitle text={typedSlug} />
        </h1>
        <p>ERRUM — PREMIUM STREETWEAR CATALOG,<br />CURATING CULTURE FOR SNEAKERHEADS.</p>
        <strong>AUTHENTIC. LIMITED. HIGH-END.</strong>
      </div>

      <div className="ref-hero__panels" aria-label="Shop categories">
        {HARD_CODED_HERO_CATEGORIES.map((item, index) => (
          <Link
            href={`/e-commerce/${item.slug}`}
            key={item.slug}
            ref={(element) => { panelRefs.current[index] = element; }}
            className="ref-hero-panel ref-hero-panel--motion"
            aria-label={`Shop ${item.name}`}
          >
            <img
              src={item.image}
              alt={item.name}
              loading={index < 4 ? 'eager' : 'lazy'}
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

function FeaturedDrop({ products }: { products: SimpleProduct[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (products.length < 2) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % products.length), 4200);
    return () => window.clearInterval(timer);
  }, [products.length]);
  if (!products.length) return null;
  const product = products[active];
  return (
    <section className="ref-featured-drop">
      <div className="ref-featured-drop__watermark">{(product.base_name || product.name).split(' ')[0]}</div>
      <Link href={`/e-commerce/product/${product.id}`} className="ref-featured-drop__image">
        <img key={product.id} src={productImage(product)} alt={productName(product)} />
      </Link>
      <div className="ref-featured-drop__copy">
        <span>FEATURED DROP</span>
        <h2>{productName(product)}</h2>
        <b>{formatPrice(product.selling_price)}</b>
      </div>
      <Link href={`/e-commerce/product/${product.id}`} className="ref-featured-drop__shop">SHOP NOW <ArrowUpRight size={15} /></Link>
      <div className="ref-featured-drop__dots">
        {products.map((item, index) => <button key={item.id} className={index === active ? 'is-active' : ''} onClick={() => setActive(index)} aria-label={`Show ${productName(item)}`} />)}
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
          catalogService.getProducts({ per_page: 60, sort_by: 'newest' }),
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
        selected.push({ category, image: product ? productImage(product) : categoryImage(category), label: keyword === 'sneaker' ? 'ICONIC SNEAKERS' : keyword === 'watch' ? 'WATCHES' : 'LUXURY SCENTS' });
      }
    });
    categories.forEach((category) => {
      if (selected.length >= 3 || selected.some((item) => item.category.id === category.id)) return;
      const product = products.find((item) => categoryName(item).toLowerCase().includes(category.name.toLowerCase()));
      selected.push({ category, image: product ? productImage(product) : categoryImage(category), label: category.name.toUpperCase() });
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
