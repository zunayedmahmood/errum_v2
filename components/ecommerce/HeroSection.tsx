'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export interface HeroImage { url: string; path?: string; title?: string; subtitle?: string; href?: string; }

export default function HeroSection({ images = [], title, showTitle = true, slideshowEnabled = true, autoplaySpeed = 4200 }: {
  images?: HeroImage[]; title?: string; showTitle?: boolean; slideshowEnabled?: boolean; autoplaySpeed?: number; textPosition?: string; textColor?: string; fontSize?: number; transitionType?: 'fade'|'slide';
}) {
  const [active, setActive] = useState(0);
  const slides = useMemo(() => images.filter(i => i?.url), [images]);
  useEffect(() => {
    if (!slideshowEnabled || slides.length < 2) return;
    const id = window.setInterval(() => setActive(v => (v + 1) % slides.length), Math.max(2200, autoplaySpeed));
    return () => window.clearInterval(id);
  }, [slideshowEnabled, autoplaySpeed, slides.length]);
  if (!slides.length) return <section className="errum-hero errum-hero--empty"/>;
  const activeSlide = slides[active] || slides[0];
  const word = (activeSlide.title || title || ['SNEAKERS','PERFUMES','WATCHES','CLOTHING'][active % 4]).toUpperCase();
  const visible = [...slides, ...slides].slice(0, 5);
  return <section className="errum-hero">
    <div className="errum-hero__copy">
      {showTitle && <h1 key={active}>{word}<span className="errum-hero__cursor" /></h1>}
      <p>ERRUM — PREMIUM STREETWEAR CATALOG,<br/>CURATING CULTURE FOR SNEAKERHEADS.</p>
      <small>AUTHENTIC. LIMITED. HIGH-END.</small>
    </div>
    <div className="errum-hero__mosaic">
      {visible.map((img, idx) => {
        const originalIndex = idx % slides.length;
        const href = img.href || '/e-commerce/products';
        return <Link href={href} key={`${img.url}-${idx}`} className={`errum-hero-card card-${idx} ${originalIndex===active ? 'is-active':''}`} onMouseEnter={()=>setActive(originalIndex)}>
          <img src={img.url} alt={img.title || `ERRUM category ${idx+1}`} />
          <div><small>CAT . {String(idx+1).padStart(2,'0')}</small><b>{(img.title || ['SNEAKERS','PERFUMES','WATCHES','CLOTHING','ACCESSORIES'][idx]).toUpperCase()}</b></div>
        </Link>
      })}
    </div>
    <div className="errum-hero__progress">{slides.map((_,i)=><button key={i} onClick={()=>setActive(i)} className={i===active?'active':''}/>)}</div>
  </section>;
}
