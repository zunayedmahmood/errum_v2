'use client';

import React from 'react';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import { useCart } from '../CartContext';
import { formatPrice } from '@/components/ecommerce/reference/storefrontUtils';

export default function CartPage() {
  const router = useRouter();
  const { cart, isLoading, updateQuantity, removeFromCart, getTotalPrice } = useCart();
  const checkout = () => { localStorage.setItem('checkout-selected-items', JSON.stringify(cart.map((item) => item.id))); router.push('/e-commerce/checkout'); };
  return <main className="ref-storefront ref-cart-page"><Navigation />
    {isLoading ? <div className="ref-page-loader">SYNCING CART...</div> : cart.length === 0 ? <section className="ref-empty-commerce"><ShoppingBag size={26}/><h1>YOUR CART IS EMPTY</h1><p>Please add items to your cart before checking out.</p><button onClick={() => router.push('/e-commerce/products')}>GO TO SHOP</button></section> : <section className="ref-cart-layout">
      <div><span className="ref-eyebrow">YOUR SELECTION</span><h1>YOUR CART</h1>{cart.map((item) => <article key={item.id} className="ref-cart-line"><img src={item.image || '/images/placeholder-product.jpg'} alt={item.name}/><div><h2>{item.name}</h2><p>{[item.color,item.size].filter(Boolean).join(' / ')}</p><b>{formatPrice(item.price)}</b></div><div className="ref-quantity"><button onClick={() => updateQuantity(item.id, Math.max(1,item.quantity-1))}><Minus size={14}/></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id,item.quantity+1)}><Plus size={14}/></button></div><button className="ref-cart-remove" onClick={() => removeFromCart(item.id)}><Trash2 size={16}/></button></article>)}</div>
      <aside><span>ORDER SUMMARY</span><dl><div><dt>Subtotal</dt><dd>{formatPrice(getTotalPrice())}</dd></div><div><dt>Delivery</dt><dd>Calculated at checkout</dd></div></dl><strong><span>TOTAL</span><b>{formatPrice(getTotalPrice())}</b></strong><button onClick={checkout}>PROCEED TO CHECKOUT</button><button className="is-secondary" onClick={() => router.push('/e-commerce/products')}>CONTINUE SHOPPING</button></aside>
    </section>}
  </main>;
}
