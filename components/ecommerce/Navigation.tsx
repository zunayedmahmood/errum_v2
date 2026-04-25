'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShoppingCart, Search, User, ChevronDown, LogOut, Heart, Package, Menu, X, Home, Sparkles } from 'lucide-react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import catalogService, { CatalogCategory } from '@/services/catalogService';
import cartService from '@/services/cartService';
import { useCart } from '@/app/e-commerce/CartContext';
import GlobalCategorySidebar from './category/GlobalCategorySidebar';


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
  const { isCartOpen } = useCart();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCategorySidebarOpen, setIsCategorySidebarOpen] = useState(false);

  useEffect(() => {
    const handleToggle = (e: any) => setIsFiltersOpen(!!e.detail?.open);
    window.addEventListener('mobile-sidebar-toggle', handleToggle);
    return () => window.removeEventListener('mobile-sidebar-toggle', handleToggle);
  }, []);

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

    {/* ── Mobile Bottom Tab Bar ─────────────────────────────────── */}
      <nav
        className="flex items-stretch"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (isCartOpen || isFiltersOpen || isCategorySidebarOpen) ? -1 : 10000,
          opacity: (isCartOpen || isFiltersOpen || isCategorySidebarOpen) ? 0 : 1,
          pointerEvents: (isCartOpen || isFiltersOpen || isCategorySidebarOpen) ? 'none' : 'auto',
          visibility: (isCartOpen || isFiltersOpen || isCategorySidebarOpen) ? 'hidden' : 'visible',
          transform: (isCartOpen || isFiltersOpen || isCategorySidebarOpen) ? 'translateY(100%)' : 'translateY(0)',
          transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
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
          <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: "'Poppins', sans-serif", letterSpacing: '0.04em' }}>ERRUM</span>
        </Link>

        {/* Search */}
        <Link href="/e-commerce/search"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', textDecoration: 'none', color: isSearchPage ? '#111111' : '#777777', transition: 'color 0.15s' }}
        >
          <Search style={{ width: '22px', height: '22px', strokeWidth: isSearchPage ? 2.5 : 2 }} />
          <span style={{ fontSize: '13px', fontWeight: isSearchPage ? 800 : 700 }}>Search</span>
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
          <span style={{ fontSize: '13px', fontWeight: isNewArrival ? 800 : 700, color: isNewArrival ? '#111111' : '#777777' }}>New</span>
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
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Cart</span>
        </button>

        {/* Categories */}
        <button
          onClick={() => setIsCategorySidebarOpen(true)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#777777', position: 'relative', transition: 'color 0.15s' }}
        >
          <Menu style={{ width: '22px', height: '22px', strokeWidth: 2 }} />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Categories</span>
        </button>
      </nav>

      <GlobalCategorySidebar 
        categories={categories} 
        isOpen={isCategorySidebarOpen} 
        onClose={() => setIsCategorySidebarOpen(false)} 
      />
    </>
  );
};

export default Navbar;
