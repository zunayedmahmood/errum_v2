'use client';

import React from 'react';
import Navigation from '@/components/ecommerce/Navigation';
import Link from 'next/link';
import { CheckCircle2, Truck, Gem, HeartHandshake, MapPin, Phone } from 'lucide-react';

const STORES = [
  { name: 'Mirpur 12',       address: 'Level 3, Hazi Kujrat Ali Mollah Market, Mirpur 12', phone: '01942565664' },
  { name: 'Jamuna Future Park', address: '3C-17A, Level 3, Jamuna Future Park',              phone: '01307130535' },
  { name: 'Bashundhara City',   address: '38, 39, 40, Block D, Level 5, Bashundhara City',  phone: '01336041064' },
];

const VALUES = [
  { icon: Gem,           title: 'Premium Quality',    desc: 'Every product is hand-selected for craftsmanship, material quality, and lasting durability.' },
  { icon: CheckCircle2,  title: 'Authentic Sourcing', desc: 'We source directly from verified suppliers — no counterfeits, ever.' },
  { icon: Truck,         title: 'Fast Nationwide Delivery', desc: 'Reliable delivery across all of Bangladesh, with real-time order tracking.' },
  { icon: HeartHandshake,title: 'Customer First',     desc: 'Responsive support before, during, and after every purchase.' },
];

export default function AboutPage() {
  return (
    <div className="ec-root min-h-screen bg-[var(--bg-root)]">
      <Navigation />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden ec-page-section border-b border-[var(--border-default)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />
          <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--cyan) 0%, transparent 70%)' }} />
        </div>

        <div className="ec-container relative py-12">
          <div className="ec-dark-tag mb-6">About Errum</div>
          <h1 className="text-[var(--text-primary)]"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 'clamp(44px, 8vw, 96px)',
                fontWeight: 300,
                lineHeight: 0.9,
                letterSpacing: '-0.02em'
              }}>
            More Than<br />
            <span className="italic" style={{ fontWeight: 600, color: 'var(--gold)' }}>a Brand</span>
          </h1>
          <p className="mt-8 max-w-xl text-[var(--text-secondary)] text-[16px] leading-relaxed">
            Errum is Bangladesh&apos;s premium lifestyle destination — fashion, footwear, accessories, and fragrances, curated for those who refuse to compromise on style or quality.
          </p>
          <div className="mt-10 flex gap-4 flex-wrap">
            <Link href="/e-commerce/products" className="ec-btn ec-btn-gold">Shop Collection</Link>
            <Link href="/e-commerce/contact"  className="ec-btn ec-btn-ghost">Find a Store</Link>
          </div>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="ec-page-section border-b border-[var(--border-default)]">
        <div className="ec-container">
          <p className="ec-eyebrow mb-6 text-[var(--cyan)]">Our Promise</p>
          <h2 className="mb-12 text-[var(--text-primary)]"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 'clamp(32px, 5vw, 56px)',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1
              }}>
            What We Stand For
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="ec-surface p-8 group hover:border-[var(--cyan-border)] hover:bg-[var(--bg-surface-2)] transition-all duration-500">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--cyan-pale)] border border-[var(--cyan-border)] group-hover:bg-[var(--cyan)] transition-colors duration-500">
                  <Icon className="h-6 w-6 text-[var(--cyan)] group-hover:text-white transition-colors" />
                </div>
                <h3 className="mb-3 text-lg font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>{title}</h3>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Story ── */}
      <section className="ec-page-section border-b border-[var(--border-default)] bg-[var(--bg-depth)]/30">
        <div className="ec-container">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
            <div className="ec-anim-fade-up">
              <p className="ec-eyebrow mb-6">Our Story</p>
              <h2 className="mb-8 text-[var(--text-primary)]"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    fontSize: 'clamp(32px, 5vw, 64px)',
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    lineHeight: 0.95
                  }}>
                Born in Dhaka,<br />
                <span className="italic" style={{ color: 'var(--gold)' }}>Built for You</span>
              </h2>
              <div className="space-y-6 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                <p>Errum was founded with a simple belief: everyone deserves access to premium fashion without the premium price tag. We started small — a single store in Mirpur — and grew into a brand trusted by thousands across Bangladesh.</p>
                <p>Today, with three physical locations and a growing online presence, we continue to handpick every product in our catalogue, ensuring authenticity, quality, and style that stands the test of time.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['2020', 'Founded'],
                ['3', 'Stores'],
                ['500+', 'Products'],
                ['10k+', 'Customers']
              ].map(([val, lbl], i) => (
                <div key={lbl}
                     className="ec-surface p-8 text-center bg-[var(--bg-root)] ec-anim-fade-up"
                     style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
                  <div className="text-5xl font-bold mb-2 text-[var(--gold)]"
                       style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {val}
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--text-muted)]"
                       style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {lbl}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stores ── */}
      <section className="ec-page-section">
        <div className="ec-container">
          <p className="ec-eyebrow mb-6">Visit Us</p>
          <h2 className="mb-10 text-[var(--text-primary)]"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 'clamp(32px, 5vw, 56px)',
                fontWeight: 500,
                letterSpacing: '-0.01em'
              }}>
            Our Stores
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STORES.map(store => (
              <div key={store.name} className="ec-surface p-8 group hover:border-[var(--border-strong)] transition-all">
                <h3 className="text-xl font-medium text-[var(--text-primary)] mb-6" style={{ fontFamily: "'Poppins', sans-serif" }}>{store.name}</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4 text-[14px] text-[var(--text-secondary)]">
                    <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--gold)]" />
                    <span className="leading-relaxed">{store.address}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[14px] text-[var(--text-secondary)]">
                    <Phone className="h-5 w-5 flex-shrink-0 text-[var(--gold)]" />
                    <span>{store.phone}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
