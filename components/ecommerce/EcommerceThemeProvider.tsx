'use client';

import React, { useEffect, useState } from 'react';
import settingsService from '@/services/settingsService';
import {
  EcommerceTheme,
  buildEcommerceThemeVars,
  getEcommerceFontImport,
  normalizeEcommerceTheme,
} from '@/lib/ecommerceDesignSystem';

export default function EcommerceThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<EcommerceTheme>(() => normalizeEcommerceTheme());

  useEffect(() => {
    let mounted = true;
    settingsService
      .getGlobalTheme()
      .then((globalTheme) => {
        if (mounted) setTheme(normalizeEcommerceTheme(globalTheme));
      })
      .catch((error) => {
        console.error('Failed to load ecommerce design system:', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: getEcommerceFontImport(theme) }} />
      <div
        className="ec-root"
        style={{
          ...buildEcommerceThemeVars(theme),
          minHeight: '100vh',
          backgroundColor: 'var(--ec-color-bg-primary)',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </>
  );
}
