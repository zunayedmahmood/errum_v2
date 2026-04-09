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

        <div className="flex-1 lg:ml-8">
          <h1 className="text-2xl font-bold mb-2 text-white">{title}</h1>
          {subtitle ? <p className="text-white/60 mb-6 text-sm">{subtitle}</p> : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {/* 8.2 — Mobile Tab Navigation */}
      <div className="ec-mobile-tabs lg:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.path;
          return (
            <button
              key={tab.label}
              onClick={() => router.push(tab.path)}
              className={`ec-mobile-tab-item ${isActive ? 'ec-mobile-tab-item-active' : ''}`}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
