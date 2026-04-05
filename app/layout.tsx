import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import QZTrayLoader from "@/components/QzTrayLoader";
import ReceiptPreviewModalHost from "@/components/ReceiptPreviewModalHost";
import GlobalToastHost from "@/components/GlobalToastHost";
import { CartProvider } from "./e-commerce/CartContext";
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from 'react-hot-toast';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Errum BD",
  description: "Errum BD - Official Store",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
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
      </body>
    </html>
  );
}