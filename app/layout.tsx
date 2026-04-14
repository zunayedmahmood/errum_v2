import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GlobalProviders from "./GlobalProviders";
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
        <GlobalProviders>
          {children}
        </GlobalProviders>
      </body>
    </html>
  );
}