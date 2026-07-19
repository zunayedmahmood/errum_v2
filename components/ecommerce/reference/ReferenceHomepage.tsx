'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

const preferredCollectionKeywords = ['sneaker', 'watch', 'perfume'];
const sectionDefinitions = [
  { eyebrow: 'SNEAKERS', title: 'LATEST SNEAKER DROPS', keywords: ['sneaker', 'shoe', 'jordan', 'nike'] },
  { eyebrow: 'T-SHIRT', title: 'CLASSY CLOTHING ESSENTIALS', keywords: ['clothing', 'shirt', 't-shirt', 'panjabi', 'pant'] },
  { eyebrow: 'PERFUME FRAGRANCE', title: 'LUXURY SCENTS & PERFUMES', keywords: ['perfume', 'fragrance', 'scent'] },
  { eyebrow: 'FASHION ACCESSORIES', title: 'PREMIUM TIMEPIECES & WATCHES', keywords: ['watch', 'accessories', 'cap', 'shawl'] },
];

const getCategoryMatch = (product: SimpleProduct, keywords: string[]) => {
  const haystack = `${categoryName(product)} ${productName(product)}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
};

function TypewriterTitle({ text }: { text: string }) {
  const [visible, setVisible] = useState('');
  useEffect(() => {
    setVisible('');
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisible(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 48);
    return () => window.clearInterval(timer);
  }, [text]);
  return <>{visible}<span className="ref-hero__cursor" aria-hidden="true" /></>;
}

function CategoryMotionHero({ items }: { items: HeroCategory[] }) {
  const [active, setActive] = useState(0);
  const usable = items.length ? items : [{ id: 0, name: 'ERRUM', image: '/images/placeholder-product.jpg', slug: 'products' }];
  useEffect(() => {
    if (usable.length < 2) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % usable.length), 2700);
    return () => window.clearInterval(timer);
  }, [usable.length]);

  const visible = Array.from({ length: Math.min(5, Math.max(usable.length, 4)) }, (_, offset) => usable[(active + offset) % usable.length]);
  return (
    <section className="ref-hero">
      <Navigation transparent />
      <div className="ref-hero__copy">
        <h1><TypewriterTitle text={usable[active]?.name.toUpperCase() || 'ERRUM'} /></h1>
        <p>ERRUM — PREMIUM STREETWEAR CATALOG,<br />CURATING CULTURE FOR SNEAKERHEADS.</p>
        <strong>AUTHENTIC. LIMITED. HIGH-END.</strong>
      </div>
      <div className="ref-hero__panels" aria-label="Shop categories">
        {visible.map((item, index) => (
          <Link
            href={`/e-commerce/${item.slug}`}
            key={`${item.id}-${active}-${index}`}
            className={`ref-hero-panel ref-hero-panel--${index}`}
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <img src={item.image} alt={item.name} />
            <span><small>CAT. {String(((active + index) % usable.length) + 1).padStart(2, '0')}</small>{item.name}</span>
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
  const [heroItems, setHeroItems] = useState<HeroCategory[]>([]);
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

        const heroCategories = await Promise.all(topCategories.slice(0, 12).map(async (category) => {
          let image = categoryImage(category);
          if (image.includes('placeholder-product')) {
            try {
              const response = await catalogService.getProducts({ category_id: category.id, per_page: 1, sort_by: 'newest' });
              const first = groupedDisplayProducts(response)[0];
              if (first) image = productImage(first);
            } catch { /* keep fallback */ }
          }
          return { id: category.id, name: category.name, image, slug: category.slug || slugify(category.name) };
        }));
        if (!cancelled) setHeroItems(heroCategories.filter((item) => item.image));
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
      <CategoryMotionHero items={heroItems} />
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
