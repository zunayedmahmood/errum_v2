'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { useCart } from '@/app/e-commerce/CartContext';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import GlobalCategorySidebar from './category/GlobalCategorySidebar';
import { slugify } from './reference/storefrontUtils';

export default function Navigation({ transparent = false }: { transparent?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isCartOpen, setIsCartOpen, cart } = useCart();
  const { isAuthenticated } = useCustomerAuth();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Category artwork is resolved locally by the drawer. Do not issue one
    // product request per category merely to discover a fallback image.
    catalogService.getCategories()
      .then((tree) => { if (!cancelled) setCategories(tree); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 20); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll); }, []);
  useEffect(() => setCategoryOpen(false), [pathname]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/e-commerce/search?q=${encodeURIComponent(value)}`);
  };

  const top = categories.filter((category) => !category.parent_id).slice(0, 5);
  return <>
    <header className={`ref-nav ${transparent ? 'ref-nav--hero' : ''} ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="ref-nav__pill">
        <Link href="/e-commerce" className="ref-nav__brand"><span><img src="/logo.png" alt="ERRUM" /></span><b>ERRUM</b></Link>
        <nav>
          <button onClick={() => setCategoryOpen(true)}><Menu size={14} /> CATEGORIES</button>
          <Link className={pathname === '/e-commerce/products' ? 'is-active' : ''} href="/e-commerce/products">SHOP</Link>
          {top.map((category) => <Link key={category.id} href={`/e-commerce/${category.slug || slugify(category.name)}`}>{category.name}</Link>)}
        </nav>
        <form onSubmit={submit}><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search drops..." /></form>
        <div className="ref-nav__actions">
          <Link href="/e-commerce/wishlist" aria-label="Wishlist"><Heart size={18} /></Link>
          <button onClick={() => setIsCartOpen(!isCartOpen)} aria-label="Cart"><ShoppingBag size={18} />{cart.length > 0 && <i>{cart.reduce((sum, item) => sum + item.quantity, 0)}</i>}</button>
          <Link className="ref-nav__account" href={isAuthenticated ? '/e-commerce/my-account' : '/e-commerce/login'} aria-label="Account"><User size={18} /></Link>
          <button className="ref-nav__menu" onClick={() => setCategoryOpen(true)} aria-label="Open categories"><Menu size={20} /></button>
        </div>
      </div>
    </header>
    <GlobalCategorySidebar categories={categories} isOpen={categoryOpen} onClose={() => setCategoryOpen(false)} />
  </>;
}
