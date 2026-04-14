'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingCart, Search, User, ChevronDown, LogOut, Heart, Package, Menu, X, Home, Sparkles } from 'lucide-react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import cartService from '@/services/cartService';
import { useCart } from '@/app/e-commerce/CartContext';


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
  const { setIsCartOpen } = useCart();

  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showCats, setShowCats] = useState(false);
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
    }, 350);
  };

  const handleLogout = async () => {
    setShowUser(false);
    try { await logout(); router.push('/e-commerce'); } catch { }
  };

  const isActive = (href: string) => pathname === href;

  // Mobile bottom tab check
  const isHomePage = pathname === '/e-commerce';
  const isSearchPage = pathname === '/e-commerce/search';
  const isNewArrival = pathname.includes('/e-commerce/products') || pathname.includes('/e-commerce/new');
  const isAccountPage = pathname.includes('/e-commerce/my-account') || pathname.includes('/e-commerce/login');

  return (
    <>
      {/* ── Main navbar (desktop + mobile top bar) ─────────────────── */}
      <nav
        style={{
          background: '#ffffff',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: scrolled ? '0 2px 12px rgba(0,0,0,0.08)' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}
      >
        <div className="ec-container">
          <div style={{ display: 'flex', height: '56px', alignItems: 'center', justifyContent: 'space-between' }}>

            {/* ── Logo ── */}
            <Link href="/e-commerce" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <img
                src="/logo.png"
                alt="Errum"
                style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
              />
              <span style={{
                fontFamily: "'Jost', sans-serif",
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '0.05em',
                color: '#111111',
              }}>
                ERRUM
              </span>
            </Link>

            {/* ── Desktop nav links ── */}
            <div className="hidden lg:flex items-center gap-8">
              <Link href="/e-commerce" style={{
                fontFamily: "'Jost', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: isActive('/e-commerce') ? '#111111' : '#555555',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}>
                Home
              </Link>

              {/* Categories mega-dropdown */}
              <div style={{ position: 'relative' }} ref={catsRef}>
                <button
                  onClick={() => setShowCats(v => !v)}
                  style={{
                    fontFamily: "'Jost', sans-serif",
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: showCats ? '#111111' : '#555555',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Categories
                  <ChevronDown style={{ width: '12px', height: '12px', transform: showCats ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {showCats && categories.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '100%',
                    marginTop: '8px',
                    transform: 'translateX(-50%)',
                    width: '800px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#ffffff',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                    zIndex: 100,
                  }}>
                    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f8f8' }}>
                      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', color: '#999999', textTransform: 'uppercase' }}>
                        ALL CATEGORIES
                      </span>
                      <Link
                        href="/e-commerce/categories"
                        style={{ fontSize: '12px', color: '#111111', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}
                        onClick={() => setShowCats(false)}
                      >
                        Explore all →
                      </Link>
                    </div>

                    <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px', maxHeight: '480px', overflowY: 'auto' }}>
                      {categories.map(cat => (
                        <div key={cat.id}>
                          <Link
                            href={`/e-commerce/${encodeURIComponent(catSlug(cat))}`}
                            onClick={() => setShowCats(false)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderRadius: '6px',
                              padding: '10px 12px',
                              color: '#111111',
                              textDecoration: 'none',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              background: '#f0f0f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: "'Jost', sans-serif",
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#111111',
                              flexShrink: 0,
                            }}>
                              {cat.name.charAt(0)}
                            </div>
                            <div>
                              <p style={{ fontSize: '14px', fontWeight: 600, color: '#111111', margin: 0 }}>{cat.name}</p>
                              {cat.children && cat.children.length > 0 && (
                                <p style={{ fontSize: '11px', color: '#999999', margin: '2px 0 0 0' }}>{cat.children.length} collections</p>
                              )}
                            </div>
                          </Link>

                          {cat.children && cat.children.length > 0 && (
                            <div style={{ paddingLeft: '60px', paddingBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {(expandedCats.has(cat.id) ? cat.children : cat.children.slice(0, 4)).map(child => (
                                <Link
                                  key={child.id}
                                  href={`/e-commerce/${encodeURIComponent(catSlug(child))}`}
                                  onClick={() => setShowCats(false)}
                                  style={{ fontSize: '13px', color: '#555555', textDecoration: 'none', padding: '2px 0' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#111111')}
                                  onMouseLeave={e => (e.currentTarget.style.color = '#555555')}
                                >
                                  {child.name}
                                </Link>
                              ))}
                              {cat.children.length > 4 && (
                                <button
                                  onClick={e => { e.stopPropagation(); setExpandedCats(prev => { const s = new Set(prev); s.has(cat.id) ? s.delete(cat.id) : s.add(cat.id); return s; }); }}
                                  style={{ fontSize: '11px', fontWeight: 700, color: '#111111', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                >
                                  {expandedCats.has(cat.id) ? '↑ Show fewer' : `+ ${cat.children.length - 4} more`}
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

              <Link href="/e-commerce/about" style={{ fontFamily: "'Jost', sans-serif", fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive('/e-commerce/about') ? '#111111' : '#555555', textDecoration: 'none' }}>About</Link>
              <Link href="/e-commerce/contact" style={{ fontFamily: "'Jost', sans-serif", fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive('/e-commerce/contact') ? '#111111' : '#555555', textDecoration: 'none' }}>Contact</Link>
            </div>

            {/* ── Right icons (desktop) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

              {/* Search */}
              <Link
                href="/e-commerce/search"
                style={{ display: 'flex', width: '38px', height: '38px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#555555', textDecoration: 'none', transition: 'background 0.15s, color 0.15s' }}
                aria-label="Search"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f0f0'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
              >
                <Search style={{ width: '18px', height: '18px' }} />
              </Link>

              {/* Account — desktop only */}
              {isAuthenticated ? (
                <div style={{ position: 'relative' }} className="hidden sm:block" ref={userRef}>
                  <button
                    onClick={() => setShowUser(v => !v)}
                    style={{ display: 'flex', height: '38px', alignItems: 'center', gap: '6px', borderRadius: '999px', padding: '0 12px', color: '#555555', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f0f0'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
                  >
                    <User style={{ width: '18px', height: '18px' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600 }} className="hidden md:block">{customer?.name?.split(' ')[0]}</span>
                    <ChevronDown style={{ width: '12px', height: '12px', transform: showUser ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  {showUser && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '8px', width: '200px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.12)', background: '#ffffff', boxShadow: '0 8px 32px rgba(0,0,0,0.10)', overflow: 'hidden', zIndex: 100 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, margin: 0, color: '#111111' }}>{customer?.name}</p>
                        <p style={{ fontSize: '11px', color: '#999999', margin: '2px 0 0 0' }}>{customer?.email}</p>
                      </div>
                      {[
                        { href: '/e-commerce/my-account', label: 'My Account' },
                        { href: '/e-commerce/orders', label: 'My Orders' },
                        { href: '/e-commerce/wishlist', label: 'Wishlist' },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href} onClick={() => setShowUser(false)}
                          style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', fontSize: '13px', color: '#555555', textDecoration: 'none', transition: 'background 0.15s, color 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
                        >
                          {label}
                        </Link>
                      ))}
                      <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }} />
                      <button onClick={handleLogout}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '13px', color: '#999999', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#111111')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#999999')}
                      >
                        <LogOut style={{ width: '14px', height: '14px' }} />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/e-commerce/login"
                  style={{ width: '38px', height: '38px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#555555', textDecoration: 'none', transition: 'background 0.15s, color 0.15s' }}
                  className="hidden sm:flex"
                  aria-label="Login"
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f0f0'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
                >
                  <User style={{ width: '18px', height: '18px' }} />
                </Link>
              )}

              {/* Cart */}
              <button
                onClick={() => setIsCartOpen(true)}
                aria-label="Cart"
                style={{ position: 'relative', display: 'flex', width: '38px', height: '38px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#555555', background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f0f0'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
              >
                <ShoppingCart style={{ width: '18px', height: '18px' }} />
                {cartCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    display: 'flex',
                    height: '18px',
                    minWidth: '18px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '999px',
                    background: '#111111',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '0 4px',
                  }}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              {/* Mobile menu button — visible < lg */}
              <button
                onClick={() => (mobileOpen ? closeMobileMenu() : setMobileOpen(true))}
                style={{ display: 'flex', width: '38px', height: '38px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#555555', background: 'none', border: 'none', cursor: 'pointer' }}
                className="lg:hidden"
                aria-label="Menu"
              >
                {mobileOpen ? <X style={{ width: '18px', height: '18px' }} /> : <Menu style={{ width: '18px', height: '18px' }} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile Drawer ── */}
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className={`lg:hidden fixed inset-0 z-[1000] bg-black/30 ${isClosing ? 'ec-anim-backdrop-out' : 'ec-anim-backdrop'}`}
              onClick={closeMobileMenu}
            />

            {/* Side Drawer */}
            <div className={`lg:hidden fixed top-0 left-0 bottom-0 z-[1001] w-[80%] max-w-[340px] bg-white shadow-[20px_0_80px_rgba(0,0,0,0.15)] flex flex-col border-r border-[rgba(0,0,0,0.08)] ${isClosing ? 'ec-anim-slide-out-right' : 'ec-anim-slide-in-right'}`}
              style={{ transform: isClosing ? 'translateX(-100%)' : 'translateX(0)' }}>
              {/* Drawer Header */}
              <div style={{ display: 'flex', height: '56px', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: '16px', fontWeight: 800, letterSpacing: '0.05em', color: '#111111' }}>
                  ERRUM
                </span>
                <button
                  onClick={closeMobileMenu}
                  style={{ display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#999999', background: '#f5f5f5', border: 'none', cursor: 'pointer' }}
                >
                  <X style={{ width: '16px', height: '16px' }} />
                </button>
              </div>

              {/* Drawer Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                {/* Auth section */}
                {isAuthenticated ? (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.08)', marginBottom: '8px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User style={{ width: '18px', height: '18px', color: '#555555' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#111111', margin: 0 }}>{customer?.name}</p>
                        <p style={{ fontSize: '11px', color: '#999999', margin: '2px 0 0 0' }}>{customer?.email}</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {[
                        { href: '/e-commerce/my-account', label: 'Profile' },
                        { href: '/e-commerce/orders', label: 'Orders' },
                        { href: '/e-commerce/wishlist', label: 'Saved' },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href} style={{ display: 'block', padding: '10px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555555', background: '#f0f0f0', borderRadius: '6px', textDecoration: 'none', border: '1px solid rgba(0,0,0,0.08)' }}>
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Link href="/e-commerce/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px', background: '#111111', padding: '16px', marginBottom: '24px', textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User style={{ width: '18px', height: '18px', color: '#ffffff' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Log In / Sign Up</p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '2px 0 0 0' }}>Track orders & unlock benefits</p>
                      </div>
                    </div>
                    <ChevronDown style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.6)', transform: 'rotate(-90deg)' }} />
                  </Link>
                )}

                {/* Primary Nav */}
                <div style={{ marginBottom: '24px' }}>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#999999', textTransform: 'uppercase', marginBottom: '12px', margin: '0 0 12px 0' }}>Menu</p>
                  {[
                    { href: '/e-commerce', label: 'Home' },
                    { href: '/e-commerce/products', label: 'New & Popular' },
                    { href: '/e-commerce/search', label: 'Search' },
                    { href: '/e-commerce/about', label: 'About' },
                    { href: '/e-commerce/contact', label: 'Contact Us' },
                  ].map(({ href, label }) => (
                    <Link key={href} href={href}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', fontSize: '16px', fontWeight: 500, color: pathname === href ? '#111111' : '#555555', borderBottom: '1px solid rgba(0,0,0,0.06)', textDecoration: 'none', transition: 'color 0.15s' }}
                    >
                      {label}
                      <ChevronDown style={{ width: '14px', height: '14px', transform: 'rotate(-90deg)', opacity: 0.3 }} />
                    </Link>
                  ))}
                </div>

                {/* Categories */}
                <div style={{ marginBottom: '24px' }}>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#999999', textTransform: 'uppercase', margin: '0 0 12px 0' }}>Collections</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {categories.slice(0, 14).map(cat => (
                      <Link key={cat.id} href={`/e-commerce/${encodeURIComponent(catSlug(cat))}`}
                        style={{ display: 'block', padding: '11px 12px', fontSize: '15px', fontWeight: 500, color: '#555555', background: pathname.includes(catSlug(cat)) ? '#f0f0f0' : 'transparent', borderRadius: '6px', textDecoration: 'none', transition: 'background 0.15s, color 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; (e.currentTarget as HTMLElement).style.color = '#111111'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = pathname.includes(catSlug(cat)) ? '#f0f0f0' : 'transparent'; (e.currentTarget as HTMLElement).style.color = '#555555'; }}
                      >
                        {cat.name}
                      </Link>
                    ))}
                    <Link href="/e-commerce/categories" style={{ display: 'block', textAlign: 'center', marginTop: '8px', padding: '10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.12)', fontSize: '12px', color: '#111111', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none', transition: 'background 0.15s' }}>
                      View all collections
                    </Link>
                  </div>
                </div>

                {/* Footer block */}
                {isAuthenticated && (
                  <button onClick={() => { closeMobileMenu(); handleLogout(); }}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '8px', background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.10)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555555', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    <LogOut style={{ width: '16px', height: '16px' }} />
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </nav>

      {/* ── Mobile Bottom Tab Bar ─────────────────────────────────── */}
      <nav
        className="lg:hidden flex items-stretch"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1005,
          background: '#ffffff',
          borderTop: '1px solid rgba(0,0,0,0.10)',
          height: '64px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* Brand/Home */}
        <Link href="/e-commerce"
          style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', textDecoration: 'none', color: '#111111' }}
        >
          <img src="/logo.png" alt="" style={{ height: '22px', width: 'auto' }} />
          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: "'Jost', sans-serif", letterSpacing: '0.02em' }}>ERRUM</span>
        </Link>

        {/* Search */}
        <Link href="/e-commerce/search"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', textDecoration: 'none', color: isSearchPage ? '#111111' : '#777777', transition: 'color 0.15s' }}
        >
          <Search style={{ width: '22px', height: '22px', strokeWidth: isSearchPage ? 2.5 : 2 }} />
          <span style={{ fontSize: '11px', fontWeight: isSearchPage ? 800 : 600 }}>Search</span>
        </Link>

        {/* New Arrivals / Center */}
        <Link href="/e-commerce/products"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', textDecoration: 'none', color: '#111111', transition: 'color 0.15s', position: 'relative' }}
        >
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#111111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '-24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            flexShrink: 0,
          }}>
            <Sparkles style={{ width: '22px', height: '22px', color: '#ffffff' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: isNewArrival ? 800 : 600, color: isNewArrival ? '#111111' : '#777777' }}>New</span>
        </Link>

        {/* Cart */}
        <button
          onClick={() => setIsCartOpen(true)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#777777', position: 'relative', transition: 'color 0.15s' }}
        >
          <div style={{ position: 'relative' }}>
            <ShoppingCart style={{ width: '22px', height: '22px', strokeWidth: 2 }} />
            {cartCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-6px',
                right: '-8px',
                display: 'flex',
                height: '18px',
                minWidth: '18px',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '999px',
                background: '#111111',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 800,
                padding: '0 4px',
                border: '1.5px solid #ffffff',
              }}>
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>Cart</span>
        </button>

        {/* Account */}
        <Link href={isAuthenticated ? "/e-commerce/my-account" : "/e-commerce/login"}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', textDecoration: 'none', color: isAccountPage ? '#111111' : '#777777', transition: 'color 0.15s' }}
        >
          <User style={{ width: '22px', height: '22px', strokeWidth: isAccountPage ? 2.5 : 2 }} />
          <span style={{ fontSize: '11px', fontWeight: isAccountPage ? 800 : 600 }}>Profile</span>
        </Link>
      </nav>

      {/* Spacer for mobile bottom bar */}
      <div className="lg:hidden" style={{ height: '64px' }} />
    </>
  );
};

export default Navbar;
