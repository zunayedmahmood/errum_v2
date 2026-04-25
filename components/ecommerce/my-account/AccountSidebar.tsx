'use client';
import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import {
  LayoutDashboard,
  ShoppingBag,
  Download,
  MapPin,
  User,
  Heart,
  LogOut,
  ShoppingCart
} from 'lucide-react';

export default function AccountSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useCustomerAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/e-commerce/my-account' },
    { id: 'shop', label: 'Shop', icon: ShoppingCart, path: '/e-commerce/' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, path: '/e-commerce/my-account/orders' },
    { id: 'downloads', label: 'Downloads', icon: Download, path: '/e-commerce/my-account/downloads' },
    { id: 'addresses', label: 'Addresses', icon: MapPin, path: '/e-commerce/my-account/addresses' },
    { id: 'account-details', label: 'Account details', icon: User, path: '/e-commerce/my-account/account-details' },
    // ✅ you already have /e-commerce/wishlist working
    { id: 'wishlist', label: 'Wishlist', icon: Heart, path: '/e-commerce/wishlist' },
  ];

  const isActive = (path: string) => {
    if (path === '/e-commerce/') {
      return pathname === '/e-commerce' ||
        pathname === '/e-commerce/' ||
        (pathname.startsWith('/e-commerce/') && !pathname.startsWith('/e-commerce/my-account'));
    }
    return pathname === path;
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden">
      <div className="p-8 border-b border-[var(--border-default)] flex flex-col items-center text-center">
        {/* User Avatar Placeholder */}
        <div className="w-20 h-20 rounded-full mb-4 bg-gradient-to-br from-[var(--cyan-dim)] to-[var(--gold-dim)] border-2 border-[var(--border-default)] flex items-center justify-center text-[var(--text-primary)]">
          <User size={32} />
        </div>
        <h2 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>Member Space</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--cyan)] mt-2" style={{ fontFamily: "'Poppins', sans-serif" }}>Exclusive Access</p>
      </div>

      <nav className="p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center justify-between px-5 py-4 transition-all duration-300 group ${active
                  ? 'bg-[var(--cyan-pale)] text-[var(--cyan)] border-l-[3px] border-[var(--cyan)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] border-l-[3px] border-transparent'
                }`}
            >
              <div className="flex items-center gap-4">
                <Icon size={18} className={active ? 'text-[var(--cyan)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'} />
                <span className="text-[14px] font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.label}</span>
              </div>
            </button>
          );
        })}

        <div className="h-px bg-[var(--border-default)] mx-5 my-4" />

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-4 px-5 py-4 text-[var(--status-danger)] hover:bg-[var(--status-danger-pale)] transition-all mt-4 border-l-[3px] border-transparent"
        >
          <LogOut size={18} />
          <span className="text-[14px] font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>Logout</span>
        </button>
      </nav>
    </div>
  );
}
