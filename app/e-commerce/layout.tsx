'use client';

import { Suspense } from 'react';
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext';

import { PromotionProvider } from '@/contexts/PromotionContext';
import Footer from '@/components/ecommerce/Footer';
import ScrollToTopOnRouteChange from '@/components/ecommerce/ScrollToTopOnRouteChange';
import GlobalCartSidebar from '@/components/ecommerce/cart/GlobalCartSidebar';
import EcommerceThemeProvider from '@/components/ecommerce/EcommerceThemeProvider';

export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerAuthProvider>
      <PromotionProvider>
        <EcommerceThemeProvider>
          <Suspense fallback={null}>
            <ScrollToTopOnRouteChange />
          </Suspense>

          <GlobalCartSidebar />

          {/* All page content */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            {children}
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Footer />
          </div>
        </EcommerceThemeProvider>
      </PromotionProvider>
    </CustomerAuthProvider>
  );
}
