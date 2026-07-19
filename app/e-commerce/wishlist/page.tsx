'use client';

import React, { useEffect, useState } from 'react';
import { Heart, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import { wishlistUtils, WishlistItem } from '@/lib/wishlistUtils';
import { formatPrice } from '@/components/ecommerce/reference/storefrontUtils';

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WishlistItem[]>([]);
  useEffect(() => { const load = () => setItems(wishlistUtils.getAll()); load(); window.addEventListener('wishlist-updated', load); return () => window.removeEventListener('wishlist-updated', load); }, []);
  return <main className="ref-storefront ref-wishlist-page"><Navigation />
    <header><span>FAVOURITES</span><h1>YOUR WISHLIST</h1><p>Saved premium drops and future essentials.</p></header>
    {!items.length ? <section className="ref-empty-wishlist"><Heart size={30}/><h2>YOUR WISHLIST IS EMPTY</h2><p>Add items while browsing to track them here.</p><button onClick={() => router.push('/e-commerce/products')}>EXPLORE DROPS</button></section> : <section className="ref-wishlist-grid">{items.map((item) => <article key={item.id} onClick={() => router.push(`/e-commerce/product/${item.id}`)}><div><img src={item.image} alt={item.name}/><button onClick={(event) => { event.stopPropagation(); wishlistUtils.remove(item.id); }}><X size={16}/></button></div><h2>{item.name}</h2><b>{formatPrice(item.price)}</b></article>)}</section>}
  </main>;
}
