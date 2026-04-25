'use client';
import React from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ eyebrow, title, subtitle, actionLabel, onAction }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && (
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--cyan)] mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>
          {eyebrow}
        </p>
      )}
      <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-[14px] max-w-lg text-[var(--text-secondary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
          {subtitle}
        </p>
      )}
    </div>
    {actionLabel && onAction && (
      <button onClick={onAction}
        className="self-start sm:self-auto flex items-center gap-2 px-0 py-2 text-[12px] font-bold uppercase tracking-widest text-[var(--cyan)] transition-all relative group"
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        <span className="relative">
          {actionLabel}
          <span className="absolute bottom-0 left-0 w-0 h-px bg-[var(--cyan)] transition-all duration-300 group-hover:w-full" />
        </span>
        <span className="group-hover:translate-x-1 transition-transform">→</span>
      </button>
    )}
  </div>
);

export default SectionHeader;
