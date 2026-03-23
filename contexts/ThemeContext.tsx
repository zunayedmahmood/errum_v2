"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeContextType {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Primary theme should be dark mode (true)
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    } else {
      // Default to dark mode if no preference is saved
      setDarkMode(true);
      localStorage.setItem('darkMode', 'true');
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('darkMode', darkMode.toString());
      
      // Also apply/remove dark class from document element for global Tailwind support
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [darkMode, isInitialized]);

  // Prevent flash of incorrect theme during initialization
  // (We render children anyway, but document.documentElement will have the right class)
  
  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
