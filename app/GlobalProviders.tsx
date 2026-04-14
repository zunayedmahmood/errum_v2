'use client';

import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CartProvider } from './e-commerce/CartContext';
import QZTrayLoader from '@/components/QzTrayLoader';
import ReceiptPreviewModalHost from '@/components/ReceiptPreviewModalHost';
import GlobalToastHost from '@/components/GlobalToastHost';
import { Toaster } from 'react-hot-toast';

export default function GlobalProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CartProvider>
          <QZTrayLoader />
          <ReceiptPreviewModalHost />
          <GlobalToastHost />
          <Toaster position="top-right" reverseOrder={false} />
          {children}
        </CartProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
