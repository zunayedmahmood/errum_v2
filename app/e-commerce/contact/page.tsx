"use client";

import React from "react";
import Navigation from "@/components/ecommerce/Navigation";
import { Phone, MapPin, MessageCircle, Clock, ChevronRight } from "lucide-react";

const locations = [
  { title: "Mirpur 12",         address: "Level 3, Hazi Kujrat Ali Mollah Market, Mirpur 12", phone: "01942565664" },
  { title: "Jamuna Future Park",address: "3C-17A, Level 3, Jamuna Future Park",                phone: "01307130535" },
  { title: "Bashundhara City",  address: "38, 39, 40, Block D, Level 5, Bashundhara City",     phone: "01336041064" },
];

export default function ContactPage() {
  return (
    <div className="ec-root min-h-screen bg-[var(--bg-root)]">
      <Navigation />

      {/* ── Header ── */}
      <section className="ec-page-section relative overflow-hidden border-b border-[var(--border-default)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-80 w-80 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />
        </div>
        <div className="ec-container relative py-12">
          <div className="ec-dark-tag mb-6">Get in Touch</div>
          <h1 className="text-[var(--text-primary)]"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 'clamp(44px, 7vw, 88px)',
                fontWeight: 300,
                lineHeight: 0.9,
                letterSpacing: '-0.02em'
              }}>
            We&apos;re Here<br />
            <span className="italic" style={{ fontWeight: 600, color: 'var(--gold)' }}>For You</span>
          </h1>
          <p className="mt-8 max-w-lg text-[16px] leading-relaxed text-[var(--text-secondary)]">
            Visit any of our three stores, call us directly, or reach out via WhatsApp. We&apos;re always happy to help.
          </p>
        </div>
      </section>

      {/* ── Stores ── */}
      <section className="ec-page-section border-b border-[var(--border-default)]">
        <div className="ec-container">
          <p className="ec-eyebrow mb-6 text-[var(--cyan)]">Store Locations</p>
          <h2 className="mb-10 text-[var(--text-primary)]"
              style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 'clamp(32px, 5vw, 52px)',
                fontWeight: 500,
                letterSpacing: '-0.01em'
              }}>
            Visit Us In Person
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {locations.map(loc => (
              <div key={loc.title} className="ec-surface p-8 group hover:border-[var(--cyan-border)] transition-all">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--cyan-pale)] border border-[var(--cyan-border)] group-hover:bg-[var(--cyan)] transition-colors duration-500">
                  <MapPin className="h-6 w-6 text-[var(--cyan)] group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-medium text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>{loc.title}</h3>
                <p className="text-sm leading-relaxed mb-6 text-[var(--text-secondary)]">{loc.address}</p>
                <a href={`tel:${loc.phone}`} className="inline-flex items-center gap-2 text-[13px] font-bold tracking-wider text-[var(--gold)] hover:text-[var(--gold-strong)] transition-colors" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  <Phone className="h-3.5 w-3.5" />
                  {loc.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick contact cards ── */}
      <section className="ec-page-section">
        <div className="ec-container">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { icon: Phone,         title: 'Call Us',          sub: 'Available during store hours', action: 'tel:01942565664',              cta: '01942565664',      gold: true },
              { icon: MessageCircle, title: 'WhatsApp',         sub: 'For international orders too', action: 'https://wa.me/8801942565664', cta: 'Chat on WhatsApp', gold: false },
              { icon: Clock,         title: 'Store Hours',      sub: 'Sat – Thu: 10am – 9pm\nFri: 2pm – 9pm', action: null, cta: null, gold: false },
            ].map(({ icon: Icon, title, sub, action, cta, gold }, i) => (
              <div key={title}
                   className="ec-surface p-8 flex flex-col gap-5 ec-anim-fade-up"
                   style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-depth)] border border-[var(--border-default)]">
                  <Icon className={`h-6 w-6 ${gold ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'}`} />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>{title}</h3>
                  <p className="mt-3 text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">{sub}</p>
                </div>
                {action && cta && (
                  <a href={action} target={action.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                     className="mt-auto inline-flex items-center gap-2 text-[12px] font-bold tracking-widest text-[var(--gold)] hover:translate-x-1 transition-all"
                     style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {cta.toUpperCase()} <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
