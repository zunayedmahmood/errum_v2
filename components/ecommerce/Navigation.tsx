'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import { useCart } from '@/app/e-commerce/CartContext';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import cartService from '@/services/cartService';
import GlobalCategorySidebar from './category/GlobalCategorySidebar';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { customer, isAuthenticated, logout } = useCustomerAuth();
  const { isCartOpen, setIsCartOpen } = useCart();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { catalogService.getCategories().then(setCategories).catch(() => setCategories([])); }, []);
  useEffect(() => {
    const refresh = () => cartService.getCartSummary().then((s: any) => setCartCount(Number(s?.total_items || 0))).catch(() => setCartCount(0));
    refresh();
    window.addEventListener('cart-updated', refresh);
    window.addEventListener('customer-auth-changed', refresh);
    return () => { window.removeEventListener('cart-updated', refresh); window.removeEventListener('customer-auth-changed', refresh); };
  }, [isAuthenticated]);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 12); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);
  useEffect(() => { setMobileMenuOpen(false); setSearchOpen(false); }, [pathname]);
  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 80); }, [searchOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/e-commerce/search?q=${encodeURIComponent(q)}`);
  };

  const topCategories = categories.filter((c: any) => !c.parent_id).slice(0, 5);
  return (
    <>
      <header className={`errum-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="errum-nav__inner">
          <Link href="/e-commerce" className="errum-nav__brand" aria-label="ERRUM home">
            <img src="/logo.png" alt="ERRUM" />
            <span>ERRUM</span>
          </Link>

          <nav className="errum-nav__links" aria-label="Main navigation">
            <button onClick={() => setSidebarOpen(true)}><Menu size={14} /> CATEGORIES</button>
            <Link href="/e-commerce/products">SHOP</Link>
            {topCategories.map((cat: any) => (
              <Link key={cat.id} href={`/e-commerce/${slugify(cat.name)}`}>{cat.name}</Link>
            ))}
          </nav>

          <form className="errum-nav__search" onSubmit={submitSearch}>
            <Search size={14} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search drops..." />
          </form>

          <div className="errum-nav__actions">
            <Link href="/e-commerce/wishlist" aria-label="Wishlist"><Heart size={18} /></Link>
            <button onClick={() => setIsCartOpen(true)} aria-label="Cart" className="errum-cart-button"><ShoppingBag size={18} />{cartCount > 0 && <b>{cartCount > 99 ? '99+' : cartCount}</b>}</button>
            <Link href={isAuthenticated ? '/e-commerce/my-account' : '/e-commerce/login'} aria-label="Account"><User size={18} /></Link>
            <button className="errum-mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && <div className="errum-mobile-menu">
        <div className="errum-mobile-menu__top"><span>ERRUM</span><button onClick={() => setMobileMenuOpen(false)}><X /></button></div>
        <form onSubmit={submitSearch}><Search size={18}/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search drops..."/></form>
        <Link href="/e-commerce">HOME</Link><Link href="/e-commerce/products">SHOP ALL</Link><button onClick={() => {setMobileMenuOpen(false);setSidebarOpen(true)}}>CATEGORIES</button>
        {topCategories.map((cat:any)=><Link key={cat.id} href={`/e-commerce/${slugify(cat.name)}`}>{cat.name}</Link>)}
        <Link href="/e-commerce/order-tracking">TRACK ORDER</Link>
        <Link href={isAuthenticated ? '/e-commerce/my-account' : '/e-commerce/login'}>{isAuthenticated ? customer?.name || 'MY ACCOUNT' : 'LOGIN'}</Link>
        {isAuthenticated && <button onClick={async()=>{await logout();router.push('/e-commerce')}}>LOG OUT</button>}
      </div>}
      <GlobalCategorySidebar categories={categories} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
