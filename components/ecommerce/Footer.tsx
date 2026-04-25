"use client";

import React from "react";
import Link from "next/link";
import { Facebook, Instagram, Youtube, MapPin, Phone, MessageCircle } from "lucide-react";

const BRAND = "Errum";

const stores = [
  { name: "Mirpur 12", address: "Level 3, Hazi Kujrat Ali Mollah Market, Mirpur 12", phone: "01942565664" },
  { name: "Jamuna Future Park", address: "3C-17A, Level 3, Jamuna Future Park", phone: "01307130535" },
  { name: "Bashundhara City", address: "38, 39, 40, Block D, Level 5, Bashundhara City", phone: "01336041064" },
];

const LINK_STYLE: React.CSSProperties = {
  fontSize: '13px',
  color: '#555555',
  textDecoration: 'none',
  lineHeight: 2,
  display: 'block',
  transition: 'color 0.15s',
  fontFamily: "'Poppins', sans-serif",
};

const COL_HEADER_STYLE: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#111111',
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
  marginBottom: '16px',
  fontFamily: "'Poppins', sans-serif",
};

export default function Footer() {
  const year = new Date().getFullYear();

  const outlets = [
    { name: "Bashundhara City Complex", image: "/Bashundhara_shopping_mall.png" },
    { name: "Mirpur 12 Outlet", image: "/Mirpure_store.png" },
    { name: "Jamuna Future Park", image: "/Jamuna_Future_Park.png" },
  ];

  return (
    <footer style={{ background: '#f8f8f8', borderTop: '1px solid rgba(0,0,0,0.08)', paddingBottom: '80px' }}>
      <div className="ec-container">

        {/* ── Outlet Showcase ── */}
        <section style={{ padding: '56px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
            <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#111111', margin: 0 }}>
              Our Outlets
            </h2>
            <div style={{ height: '1px', flex: 1, maxWidth: '80px', background: '#111111' }} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-8 px-2 lg:px-48 mb-12">
            {outlets.map((outlet, idx) => (
              <div key={idx} style={{ overflow: 'hidden', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.08)', background: '#ffffff', maxWidth: '320px', margin: '0 auto' }}>
                <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden' }}>
                  <img
                    src={outlet.image}
                    alt={outlet.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                </div>
                <div style={{ padding: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontFamily: "'Poppins', sans-serif", fontSize: '12px', fontWeight: 700, color: '#111111', margin: 0, textAlign: 'center', letterSpacing: '0.04em' }}>
                    {outlet.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Main footer grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12" style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '48px' }}>

          {/* Column 1 — Brand & Info */}
          <div>
            <Link href="/e-commerce" style={{ display: 'inline-block', marginBottom: '16px', textDecoration: 'none' }}>
              <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: '24px', fontWeight: 800, letterSpacing: '0.05em', color: '#111111' }}>
                ERRUM
              </span>
            </Link>
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#555555', maxWidth: '300px', fontFamily: "'Poppins', sans-serif", marginBottom: '24px' }}>
              A complete lifestyle brand — footwear, clothing, watches, and bags curated for everyday confidence across Bangladesh.
            </p>

            <p style={COL_HEADER_STYLE}>Quick Info</p>
            <nav style={{ marginBottom: '24px' }}>
              {[
                { href: '/e-commerce/about', label: 'About Us' },
                { href: '/e-commerce/contact', label: 'Contact Us' },
                { href: '/e-commerce/track', label: 'Track Your Order' },
                { href: '/e-commerce/categories', label: 'All Categories' },
                { href: '/e-commerce/products', label: 'New & Popular' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  style={LINK_STYLE}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#111111'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#555555'}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* Social Icons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { Icon: Facebook, href: 'https://facebook.com/errum', label: 'Facebook' },
                { Icon: Instagram, href: 'https://instagram.com/errum', label: 'Instagram' },
                { Icon: Youtube, href: 'https://youtube.com/errum', label: 'YouTube' },
              ].map(({ Icon, href, label }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
                  style={{
                    display: 'flex',
                    width: '36px',
                    height: '36px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    border: '1px solid rgba(0,0,0,0.15)',
                    color: '#555555',
                    textDecoration: 'none',
                    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#111111'; el.style.borderColor = '#111111'; el.style.color = '#ffffff'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'rgba(0,0,0,0.15)'; el.style.color = '#555555'; }}
                >
                  <Icon style={{ width: '16px', height: '16px' }} />
                </a>
              ))}
            </div>
          </div>

          {/* Column 2 — Useful Links */}
          <div>
            <p style={COL_HEADER_STYLE}>Useful Links</p>
            <nav>
              {[
                { href: '/e-commerce/products', label: 'New Arrivals' },
                { href: '/e-commerce/categories', label: 'Collections' },
                { href: '/e-commerce/my-account', label: 'My Account' },
                { href: '/e-commerce/orders', label: 'My Orders' },
                { href: '/e-commerce/wishlist', label: 'Wishlist' },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  style={LINK_STYLE}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#111111'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#555555'}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 3 — Our Promise + WhatsApp */}
          <div>
            <p style={COL_HEADER_STYLE}>Our Promise</p>
            <div style={{ marginBottom: '24px' }}>
              {[
                { title: 'Comfort & Quality Assured', sub: 'Thoughtfully selected with quality finishing.' },
                { title: 'In-Store & Online Support', sub: 'Visit us or order easily — responsive service.' },
                { title: 'Nationwide Delivery', sub: 'Smooth and reliable delivery across Bangladesh.' },
              ].map(({ title, sub }) => (
                <div key={title} style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: '12px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#111111', margin: '0 0 2px 0', fontFamily: "'Poppins', sans-serif" }}>{title}</p>
                  <p style={{ fontSize: '12px', color: '#555555', margin: 0, fontFamily: "'Poppins', sans-serif" }}>{sub}</p>
                </div>
              ))}
            </div>

            <a href="https://wa.me/8801942565664" target="_blank" rel="noreferrer"
              style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '4px', border: '1px solid rgba(37,211,102,0.25)', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
            >
              <MessageCircle style={{ width: '14px', height: '14px', color: '#25D366', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px 0', fontFamily: "'Poppins', sans-serif" }}>International Orders</p>
                <p style={{ fontSize: '12px', color: '#111111', margin: 0, fontFamily: "'Poppins', sans-serif" }}>WhatsApp: <strong>01942565664</strong></p>
              </div>
            </a>
          </div>
        </div>

        {/* ── Store Locations (Side by Side) ── */}
        <div style={{ marginTop: '48px', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '48px' }}>
          <p style={COL_HEADER_STYLE}>Our Store Locations</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            {stores.map(store => (
              <div key={store.name} style={{ padding: '16px', background: '#ffffff', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#111111', margin: '0 0 8px 0', fontFamily: "'Poppins', sans-serif" }}>{store.name}</p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <MapPin style={{ width: '14px', height: '14px', color: '#999999', marginTop: '2px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#555555', fontFamily: "'Poppins', sans-serif", lineHeight: 1.5 }}>{store.address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone style={{ width: '14px', height: '14px', color: '#999999', flexShrink: 0 }} />
                  <a href={`tel:${store.phone}`} style={{ fontSize: '12px', color: '#555555', fontFamily: "'Poppins', sans-serif", textDecoration: 'none' }}>{store.phone}</a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <p style={{ fontSize: '12px', color: '#999999', fontFamily: "'Poppins', sans-serif", margin: 0 }}>
            © {year} Errum STORE — Handcrafted for Confidence.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {['bKash', 'Nagad', 'Visa', 'Mastercard'].map(m => (
              <span key={m} style={{
                padding: '4px 10px',
                border: '1px solid rgba(0,0,0,0.15)',
                color: '#555555',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: "'Poppins', sans-serif",
                borderRadius: '4px',
                letterSpacing: '0.05em',
              }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
