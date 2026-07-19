'use client';
import React from 'react';
import Link from 'next/link';
interface Collection { id:string|number; title:string; subtitle:string; image:string; href:string; show_text?:boolean }
export default function CollectionTiles({collections=[]}:{collections?:Collection[]}) {
  if (!collections.length) return null;
  return <section className="errum-collections ec-section"><div className="ec-container">
    <header className="errum-section-intro"><span>COLLECTIONS</span><h2>CURATED COLLECTIONS</h2><p>Explore our hand-picked selections of iconic streetwear, luxury fragrances, and everyday premium essentials.</p></header>
    <div className="errum-collection-grid">
      {collections.slice(0,3).map((item,i)=><Link href={item.href || '/e-commerce/products'} key={item.id} className={`errum-collection-tile tile-${i}`}>
        <img src={item.image} alt={item.title}/><i/><div>{item.show_text!==false&&<><small>{item.subtitle}</small><h3>{item.title}</h3></>}<b>↗</b></div>
      </Link>)}
    </div>
  </div></section>
}
