'use client';
import Link from 'next/link';
import { Facebook, Instagram, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
const outlets=[
 {name:'MIRPUR 12',address:'Level 3, Hazi Kujrat Ali Mollah Super Market, Mirpur 12',phone:'01942565664'},
 {name:'JAMUNA FUTURE PARK',address:'3C-17A, Level 3, South Court, Jamuna Future Park',phone:'01307130535'},
 {name:'BASHUNDHARA CITY',address:'38,39,40, Block D, Level 5, Bashundhara City Shopping Complex',phone:'01336041064'},
];
export default function Footer(){return <>
<section className="errum-manifesto"><div>Engineered for the streets.<br/>Curated for the culture.</div><strong>©26</strong></section>
<footer className="errum-footer"><div className="ec-container">
 <div className="errum-footer__brand"><div><img src="/logo.png" alt="ERRUM"/><b>ERRUM</b></div><p>BEST IMPORTED SNEAKERS SELLING BRAND IN BANGLADESH.</p><a href="https://wa.me/8801942565664"><MessageCircle size={16}/> WhatsApp: 01942565664 <small>INT'L ORDER</small></a></div>
 <div className="errum-footer__rule"/>
 <div className="errum-footer__grid"><section><small>ABOUT ERRUM</small><p>Curating premium drops, high-quality sneaker imports, and streetwear cultural artifacts for the fashion-forward in Bangladesh. 100% authentic products guaranteed.</p><small>SOCIAL NETWORKS</small><div className="errum-socials"><a href="#"><Facebook size={15}/> MAIN</a><a href="#"><Facebook size={15}/> BACKUP</a><a href="#"><Instagram size={15}/> JFP GROUP</a><a href="#"><Youtube size={15}/> YOUTUBE</a></div></section>
 <section><small>FLAGSHIP OUTLETS</small><h3>OUR RETAIL LOCATIONS</h3><div className="errum-outlets">{outlets.map(o=><div key={o.name}><b><MapPin size={14}/>{o.name}</b><p>{o.address}</p><a href={`tel:${o.phone}`}><Phone size={14}/>{o.phone}</a></div>)}</div></section></div>
 <div className="errum-footer__bottom"><span>© 2026 ERRUM. All Rights Reserved.</span><span>AUTHENTIC SNEAKER RELEASES & CULTURAL ARTIFACTS</span></div>
 </div></footer></>}
