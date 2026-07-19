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

const HERO_FLOW_MS = 34_000;
const HERO_TEXT_HOLD_MS = 7_400;

const sleep = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration));
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return x * x * (3 - (2 * x));
};

/** The typing clock is intentionally independent from the category-card conveyor. */
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
        await sleep(48);
      }

      if (cancelled) return;
      await sleep(260);

      for (let index = 1; index <= text.length && !cancelled; index += 1) {
        commit(text.slice(0, index));
        await sleep(115);
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
      () => setTextIndex((value) => (value + 1) % HARDCODED_CATEGORY_ARTWORK.length),
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

    const renderTrack = (now: number) => {
      const mobile = window.innerWidth < 768;
      const duration = mobile ? HERO_FLOW_MS * 0.9 : HERO_FLOW_MS;
      const elapsed = reducedMotion ? 0 : now - startedAt;
      const globalProgress = (elapsed % duration) / duration;
      const count = HARDCODED_CATEGORY_ARTWORK.length;

      panelRefs.current.forEach((panel, index) => {
        if (!panel) return;

        // Every card shares the same uninterrupted conveyor timeline. The phase
        // offsets distribute cards evenly so there is always a continuous flow;
        // no card waits for another card, and there are no endpoint pauses.
        const progress = reducedMotion
          ? ((index + 1) / (count + 2))
          : (globalProgress + (index / count)) % 1;

        const x = mobile
          ? 111 - (151 * progress)
          : 112 - (146 * progress);
        const y = mobile
          ? -8 + (113 * progress)
          : -10 + (109 * progress);
        const scale = mobile
          ? 1.04 - (0.50 * progress)
          : 1.06 - (0.46 * progress);

        const fadeIn = smoothstep(0.005, 0.085, progress);
        const fadeOut = 1 - smoothstep(0.88, 0.995, progress);
        const opacity = clamp01(fadeIn * fadeOut);

        panel.style.transform = `translate3d(${x}vw, ${y}vh, 0) scale(${Math.max(0.52, scale)})`;
        panel.style.opacity = opacity.toFixed(3);
        panel.style.zIndex = String(Math.round(110 - (progress * 40)));
        panel.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none';
      });

      frame = window.requestAnimationFrame(renderTrack);
    };

    frame = window.requestAnimationFrame(renderTrack);

    const resumeWithoutJump = () => {
      if (document.visibilityState === 'visible') startedAt = performance.now();
    };
    document.addEventListener('visibilitychange', resumeWithoutJump);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resumeWithoutJump);
    };
  }, []);

  const typedSlug = `ERRUMBD/${HARDCODED_CATEGORY_ARTWORK[textIndex].slug.toUpperCase()}`;

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
              loading={index < 5 ? 'eager' : 'lazy'}
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
        <b>{formatProductPrice(product)}</b>
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
        selected.push({ category, image: product ? productImage(product) : (getHardcodedCategoryImage(category) || categoryImage(category)), label: keyword === 'sneaker' ? 'ICONIC SNEAKERS' : keyword === 'watch' ? 'WATCHES' : 'LUXURY SCENTS' });
      }
    });
    categories.forEach((category) => {
      if (selected.length >= 3 || selected.some((item) => item.category.id === category.id)) return;
      const product = products.find((item) => categoryName(item).toLowerCase().includes(category.name.toLowerCase()));
      selected.push({ category, image: product ? productImage(product) : (getHardcodedCategoryImage(category) || categoryImage(category)), label: category.name.toUpperCase() });
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
