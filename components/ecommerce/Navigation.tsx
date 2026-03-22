'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingCart, Search, User, ChevronDown, LogOut, Heart, Package, Menu, X, Grid3X3 } from 'lucide-react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import cartService from '@/services/cartService';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const catSlug = (c: { name: string; slug?: string }) =>
  slugify(c.name);

const Navbar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { customer, isAuthenticated, logout } = useCustomerAuth();

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [mobileActiveCat, setMobileActiveCat] = useState<number | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [scrolled, setScrolled] = useState(false);

  const userRef = useRef<HTMLDivElement>(null);
  const catsRef = useRef<HTMLDivElement>(null);

  /* Scroll shadow */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Categories */
  useEffect(() => {
    catalogService.getCategories().then(setCategories).catch(() => { });
  }, []);

  /* Cart */
  const refreshCartCount = () =>
    cartService
      .getCartSummary()
      .then((s) => setCartCount(Number((s as any)?.total_items || 0)))
      .catch(() => setCartCount(0));

  useEffect(() => {
    refreshCartCount();
  }, [isAuthenticated]);

  useEffect(() => {
    const h = () => refreshCartCount();
    window.addEventListener('cart-updated', h);
    window.addEventListener('customer-auth-changed', h);
    return () => {
      window.removeEventListener('cart-updated', h);
      window.removeEventListener('customer-auth-changed', h);
    };
  }, [isAuthenticated]);

  /* Click outside */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
      if (catsRef.current && !catsRef.current.contains(e.target as Node)) setShowCats(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* Close mobile on route change */
  useEffect(() => {
    setMobileOpen(false);
    setIsClosing(false);
    setShowCats(false);
    setShowUser(false);
  }, [pathname]);

  const closeMobileMenu = () => {
    setIsClosing(true);
    setTimeout(() => {
      setMobileOpen(false);
      setIsClosing(false);
    }, 450);
  };

  const handleLogout = async () => {
    setShowUser(false);
    try { await logout(); router.push('/e-commerce'); } catch { }
  };

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* ── Top announcement bar ─────────────────────────────────────── */}
      <div className="ec-root hidden sm:block bg-[var(--gold)] text-white text-center py-2 text-[11px] font-medium tracking-widest uppercase">
        Free delivery on orders above ৳1,000 · Bangladesh-wide shipping
      </div>

      {/* ── Main navbar ─────────────────────────────────────────────── */}
      <nav
        className={`ec-nav sticky top-0 z-50 transition-shadow duration-300 ${scrolled ? 'shadow-[0_4px_24px_rgba(0,0,0,0.35)]' : ''}`}

      >
        <div className="ec-container">
          <div className="flex h-16 items-center justify-between gap-6 sm:h-[68px]">

            {/* ── Logo ── */}
            <Link href="/e-commerce" className="flex-shrink-0 flex items-center">
              <img
                src="/logo.png"
                alt="Errum"
                className="h-9 w-auto object-contain"
                onError={e => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const fb = img.nextElementSibling as HTMLElement;
                  if (fb) fb.style.display = 'flex';
                }}
              />
              <div
                className="items-center gap-1 text-white"
                style={{ display: 'none', fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: 600, letterSpacing: '0.08em' }}
              >
                ERRUM
                <span style={{ fontSize: '9px', fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em', opacity: 0.5, marginLeft: '4px', alignSelf: 'flex-end', marginBottom: '4px' }}>
                  STORE
                </span>
              </div>
            </Link>

            {/* ── Desktop nav links ── */}
            <div className="hidden lg:flex items-center gap-8">
              <Link href="/e-commerce" className={`ec-nav-link ${isActive('/e-commerce') ? 'ec-nav-link-active' : ''}`}>
                Home
              </Link>

              {/* Categories mega-dropdown */}
              <div className="relative" ref={catsRef}>
                <button
                  onClick={() => setShowCats(v => !v)}
                  className={`ec-nav-link flex items-center gap-1 ${showCats ? 'ec-nav-link-active' : ''}`}
                >
                  Categories
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showCats ? 'rotate-180' : ''}`} />
                </button>

                {showCats && categories.length > 0 && (
                  <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 w-[520px] rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden">
                    {/* Dropdown header */}
                    <div className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>
                        ALL CATEGORIES
                      </span>
                      <Link
                        href="/e-commerce/categories"
                        className="text-[11px] text-[var(--gold-light)] hover:text-[var(--gold)] transition-colors"
                        onClick={() => setShowCats(false)}
                      >
                        View all →
                      </Link>
                    </div>

                    {/* Category grid */}
                    <div className="p-4 grid grid-cols-2 gap-1 max-h-[400px] overflow-y-auto">
                      {categories.map(cat => (
                        <div key={cat.id}>
                          <Link
                            href={`/e-commerce/${encodeURIComponent(catSlug(cat))}`}
                            onClick={() => setShowCats(false)}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-white/80 hover:bg-white/8 hover:text-white transition-all group"
                            style={{ background: 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-[var(--gold)] border border-white/10"
                              style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                              {cat.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-white/90 truncate">{cat.name}</p>
                              {cat.children && cat.children.length > 0 && (
                                <p className="text-[10px] text-white/35 mt-0.5">{cat.children.length} subcategories</p>
                              )}
                            </div>
                          </Link>

                          {/* Sub-category pills under each parent - all shown with toggle */}
                          {cat.children && cat.children.length > 0 && (
                            <div className="pl-[46px] pb-2 flex flex-col gap-0.5">
                              {(expandedCats.has(cat.id) ? cat.children : cat.children.slice(0, 3)).map(child => (
                                <Link
                                  key={child.id}
                                  href={`/e-commerce/${encodeURIComponent(catSlug(child))}`}
                                  onClick={() => setShowCats(false)}
                                  className="text-[11px] text-white/40 hover:text-white/80 py-0.5 transition-colors"
                                >
                                  {child.name}
                                </Link>
                              ))}
                              {cat.children.length > 3 && (
                                <button
                                  onClick={e => { e.stopPropagation(); setExpandedCats(prev => { const s = new Set(prev); s.has(cat.id) ? s.delete(cat.id) : s.add(cat.id); return s; }); }}
                                  className="text-[11px] text-left transition-colors mt-0.5"
                                  style={{ color: 'var(--gold-light)' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold)')}
                                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--gold-light)')}
                                >
                                  {expandedCats.has(cat.id) ? '↑ Show less' : `+ ${cat.children.length - 3} more`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link href="/e-commerce/about" className={`ec-nav-link ${isActive('/e-commerce/about') ? 'ec-nav-link-active' : ''}`}>About</Link>
              <Link href="/e-commerce/contact" className={`ec-nav-link ${isActive('/e-commerce/contact') ? 'ec-nav-link-active' : ''}`}>Contact</Link>
            </div>

            {/* ── Right icons ── */}
            <div className="flex items-center gap-1 sm:gap-2">

              {/* Search */}
              <Link
                href="/e-commerce/search"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </Link>

              {/* Account */}
              {isAuthenticated ? (
                <div className="relative hidden sm:block" ref={userRef}>
                  <button
                    onClick={() => setShowUser(v => !v)}
                    className="flex h-9 items-center gap-2 rounded-full px-3 text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <User className="h-4 w-4" />
                    <span className="text-[12px] font-medium hidden md:block">{customer?.name?.split(' ')[0]}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showUser ? 'rotate-180' : ''}`} />
                  </button>
                  {showUser && (
                    <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
                      <div className="px-4 py-3 border-b border-white/10">
                        <p className="text-[13px] font-semibold text-white">{customer?.name}</p>
                        <p className="text-[11px] text-white/40 mt-0.5 truncate">{customer?.email}</p>
                      </div>
                      {[
                        { href: '/e-commerce/my-account', icon: User, label: 'My Account' },
                        { href: '/e-commerce/orders', icon: Package, label: 'My Orders' },
                        { href: '/e-commerce/wishlist', icon: Heart, label: 'Wishlist' },
                      ].map(({ href, icon: Icon, label }) => (
                        <Link key={href} href={href} onClick={() => setShowUser(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-white/70 hover:text-white hover:bg-white/6 transition-all"
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </Link>
                      ))}
                      <div className="mx-4 my-1 border-t border-white/10" />
                      <button onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-white/50 hover:text-white transition-all text-left"
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/e-commerce/login"
                  className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  aria-label="Login"
                >
                  <User className="h-4 w-4" />
                </Link>
              )}

              {/* Cart */}
              <Link href="/e-commerce/cart" aria-label="Cart"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--gold)] px-0.5 text-[9px] font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>

              {/* Mobile menu button */}
              <button
                onClick={() => (mobileOpen ? closeMobileMenu() : setMobileOpen(true))}
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all ml-1"
                aria-label="Menu"
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile menu Drawer ── */}
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className={`lg:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-md ${isClosing ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
              onClick={closeMobileMenu}
            />

            {/* Side Drawer */}
            <div className={`lg:hidden fixed top-0 right-0 bottom-0 z-[101] w-[85%] max-w-[400px] bg-[#0d0d0d] shadow-[-20px_0_80px_rgba(0,0,0,0.8)] flex flex-col ${isClosing ? 'ec-anim-slide-out-right' : 'ec-anim-slide-in-right'}`}>
              {/* Drawer Header */}
              <div className="flex h-16 items-center justify-between px-6 border-b border-white/5">
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', fontWeight: 600, letterSpacing: '0.05em', color: 'white' }}>
                  MENU
                </span>
                <button
                  onClick={closeMobileMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:text-white bg-white/5 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto ec-scrollbar px-6 py-8 space-y-8">

                {/* Auth section */}
                <div className="ec-anim-fade-up ec-delay-1">
                  {isAuthenticated ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-[var(--gold)]/10 flex items-center justify-center border border-[var(--gold)]/20">
                          <User className="h-5 w-5 text-[var(--gold)]" />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-white">{customer?.name}</p>
                          <p className="text-[11px] text-white/30">{customer?.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { href: '/e-commerce/my-account', label: 'Profile' },
                          { href: '/e-commerce/orders', label: 'Orders' },
                          { href: '/e-commerce/wishlist', label: 'Saved' },
                        ].map(({ href, label }) => (
                          <Link key={href} href={href}
                            className="rounded-xl bg-white/5 py-3 text-center text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                          >
                            {label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Link href="/e-commerce/login"
                      className="group flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-4 transition-all hover:bg-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center">
                          <User className="h-4 w-4 text-white/50" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Login / Register</p>
                          <p className="text-[11px] text-white/30">Track your orders & save favorites</p>
                        </div>
                      </div>
                      <ChevronDown className="-rotate-90 h-4 w-4 text-white/20 group-hover:text-white transition-colors" />
                    </Link>
                  )}
                </div>

                {/* Primary Nav */}
                <div className="space-y-2 ec-anim-fade-up ec-delay-2">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-white/20 uppercase mb-4" style={{ fontFamily: "'DM Mono', monospace" }}>Navigation</p>
                  {[
                    { href: '/e-commerce', label: 'Home' },
                    { href: '/e-commerce/products', label: 'Shop All' },
                    { href: '/e-commerce/about', label: 'Our Story' },
                    { href: '/e-commerce/contact', label: 'Get in Touch' },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href}
                      className="flex items-center justify-between py-3 text-[18px] font-medium text-white/70 hover:text-white transition-all border-b border-white/5"
                      style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                      {label}
                      <ChevronDown className="-rotate-90 h-3.5 w-3.5 opacity-20" />
                    </Link>
                  ))}
                </div>

                {/* Categories */}
                <div className="space-y-4 ec-anim-fade-up ec-delay-3">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-white/20 uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>Collections</p>
                  <div className="grid grid-cols-1 gap-1">
                    {categories.slice(0, 8).map(cat => (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center">
                          <Link href={`/e-commerce/${encodeURIComponent(catSlug(cat))}`}
                            className="flex-1 py-1.5 text-[15px] text-white/60 hover:text-white transition-colors"
                          >
                            {cat.name}
                          </Link>
                          {cat.children && cat.children.length > 0 && (
                            <button
                              onClick={() => setMobileActiveCat(mobileActiveCat === cat.id ? null : cat.id)}
                              className="p-2 text-white/20 hover:text-white transition-colors"
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${mobileActiveCat === cat.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        {mobileActiveCat === cat.id && (
                          <div className="pl-4 border-l border-white/10 space-y-1 mb-2">
                            {cat.children?.map(child => (
                              <Link key={child.id} href={`/e-commerce/${encodeURIComponent(catSlug(child))}`}
                                className="block py-1.5 text-[13px] text-white/35 hover:text-[var(--gold-light)] transition-colors"
                              >
                                {child.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <Link href="/e-commerce/categories" className="inline-block mt-2 text-[12px] text-[var(--gold)] font-medium hover:underline">
                      View all collections →
                    </Link>
                  </div>
                </div>

                {/* Footer block */}
                <div className="pt-8 mt-4 border-t border-white/5 ec-anim-fade-up ec-delay-4">
                  {isAuthenticated ? (
                    <button onClick={() => { closeMobileMenu(); handleLogout(); }}
                      className="flex w-full items-center gap-3 py-3 text-[14px] text-white/40 hover:text-rose-400 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out of account
                    </button>
                  ) : (
                    <p className="text-[11px] text-white/20 text-center italic">
                      Step into the world of ERRUM
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </nav>
    </>
  );
};

export default Navbar;
