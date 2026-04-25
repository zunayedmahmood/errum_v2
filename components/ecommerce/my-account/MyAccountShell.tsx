'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import AccountSidebar from '@/components/ecommerce/my-account/AccountSidebar';
import PaymentStatusChecker from '@/components/ecommerce/Paymentstatuschecker';
import { useRequireCustomerAuth } from '@/contexts/CustomerAuthContext';
import { ShoppingBag, User, MapPin, Heart } from 'lucide-react';

export default function MyAccountShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { isLoading } = useRequireCustomerAuth('/e-commerce/login');
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    { label: 'Orders', icon: ShoppingBag, path: '/e-commerce/my-account/orders' },
    { label: 'Profile', icon: User, path: '/e-commerce/my-account/account-details' },
    { label: 'Addresses', icon: MapPin, path: '/e-commerce/my-account/addresses' },
    { label: 'Wishlist', icon: Heart, path: '/e-commerce/wishlist' },
  ];

  return (
    <div className="ec-root min-h-screen pb-20 lg:pb-0">
      <Navigation />
      <PaymentStatusChecker />
      <div className="flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="hidden lg:block w-72 flex-shrink-0">
          <AccountSidebar />
        </div>

        <div className="flex-1 lg:ml-12">
          <h1 className="text-3xl font-medium mb-2 text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>{title}</h1>
          {subtitle ? <p className="text-[var(--text-secondary)] mb-10 text-[14px] leading-relaxed max-w-xl">{subtitle}</p> : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-[3px] border-[var(--cyan)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="ec-anim-fade-up">
              {children}
            </div>
          )}
        </div>
      </div>

      {/* 8.2 — Mobile Tab Navigation */}
      <div className="ec-mobile-tabs lg:hidden bg-[var(--bg-depth)] border-t border-[var(--border-default)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.path;
          return (
            <button
              key={tab.label}
              onClick={() => router.push(tab.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all duration-300 py-3 ${
                isActive 
                  ? 'text-[var(--cyan)]' 
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon size={18} className={isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ fontFamily: "'Poppins', sans-serif" }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
