'use client';

import React from 'react';
import { Facebook, MapPin, Phone, Youtube } from 'lucide-react';

const locations = [
  { name: 'MIRPUR 12', address: 'Level 3, Hazi Kujrat Ali Mollah Super Market, Mirpur 12', phone: '01942565664' },
  { name: 'JAMUNA FUTURE PARK', address: '3C-17A, Level 3, South Court, Jamuna Future Park', phone: '01307130535' },
  { name: 'BASHUNDHARA CITY', address: '38,39,40, Block D, Level 5, Bashundhara City Shopping Complex', phone: '01336041064' },
];

export default function Footer() {
  return <footer className="ref-footer">
    <div className="ref-footer__top">
      <div className="ref-footer__brand"><div><img src="/logo.png" alt="ERRUM" /><strong>ERRUM</strong></div><p>BEST IMPORTED SNEAKERS SELLING BRAND IN BANGLADESH.</p></div>
      <a className="ref-footer__whatsapp" href="https://wa.me/8801942565664" target="_blank" rel="noopener noreferrer">◉ WhatsApp: 01942565664 <b>INT'L ORDER</b></a>
    </div>
    <div className="ref-footer__main">
      <section className="ref-footer__about"><span>ABOUT ERRUM</span><p>Curating premium drops, high-quality sneaker imports, and streetwear cultural artifacts for the fashion-forward in Bangladesh. 100% authentic products guaranteed.</p><span>SOCIAL NETWORKS</span><div className="ref-footer__socials"><a href="https://www.facebook.com/share/1BqdrJpC8U/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer"><Facebook size={14}/> MAIN</a><a href="https://www.facebook.com/share/18hHoKcwPN/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer"><Facebook size={14}/> BACKUP</a><a href="https://www.facebook.com/share/1b7oM3cVAo/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer"><Facebook size={14}/> JFP GROUP</a><a href="https://youtube.com/@errumbd1" target="_blank" rel="noopener noreferrer"><Youtube size={14}/> YOUTUBE</a></div></section>
      <section className="ref-footer__locations"><span>FLAGSHIP OUTLETS</span><h2>OUR RETAIL LOCATIONS</h2><div>{locations.map((location) => <article key={location.name}><h3><MapPin size={14}/>{location.name}</h3><p>{location.address}</p><a href={`tel:${location.phone}`}><Phone size={13}/>{location.phone}</a></article>)}</div></section>
    </div>
    <div className="ref-footer__bottom"><p>© 2026 ERRUM. All Rights Reserved.</p><p>AUTHENTIC SNEAKER RELEASES & CULTURAL ARTIFACTS</p></div>
  </footer>;
}
