'use client';

import { Suspense } from 'react';
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext';
import { PromotionProvider } from '@/contexts/PromotionContext';
import Footer from '@/components/ecommerce/Footer';
import ScrollToTopOnRouteChange from '@/components/ecommerce/ScrollToTopOnRouteChange';
import GlobalCartSidebar from '@/components/ecommerce/cart/GlobalCartSidebar';

export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerAuthProvider>
      <PromotionProvider>
        <div className="errum-storefront-root">
          <Suspense fallback={null}>
            <ScrollToTopOnRouteChange />
          </Suspense>

          <GlobalCartSidebar />

          <div className="errum-storefront-content">{children}</div>
          <Footer />
        </div>
      </PromotionProvider>
    </CustomerAuthProvider>
  );
}
