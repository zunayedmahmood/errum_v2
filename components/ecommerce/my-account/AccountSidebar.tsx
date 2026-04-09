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
    <div className="ec-surface overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-xl font-serif text-white uppercase tracking-widest">My Account</h2>
      </div>

      <nav className="p-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                active 
                  ? 'bg-white/5 text-gold-light font-semibold shadow-lg' 
                  : 'text-neutral-400 hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}

        <div className="h-px bg-white/5 mx-4 my-2" />

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all mt-2"
        >
          <LogOut size={18} />
          <span className="text-sm">Logout</span>
        </button>
      </nav>
    </div>
  );
}
