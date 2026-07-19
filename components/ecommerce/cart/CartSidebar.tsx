'use client';

import React from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/app/e-commerce/CartContext';
import { formatPrice } from '../reference/storefrontUtils';

export default function CartSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { cart, isLoading, getTotalPrice, updateQuantity, removeFromCart } = useCart();
  const checkout = () => {
    if (!cart.length) return;
    localStorage.setItem('checkout-selected-items', JSON.stringify(cart.map((item) => item.id)));
    onClose();
    router.push('/e-commerce/checkout');
  };
  return <>
    <div className={`ref-drawer-backdrop ${isOpen ? 'is-open' : ''}`} onClick={onClose} />
    <aside className={`ref-cart-drawer ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <header><span><ShoppingBag size={16}/> YOUR CART <b>{cart.length}</b></span><button onClick={onClose}><X size={18}/></button></header>
      <div className="ref-cart-drawer__body">
        {isLoading ? <div className="ref-page-loader">SYNCING CART...</div> : !cart.length ? <div className="ref-cart-drawer__empty"><ShoppingBag size={28}/><h2>YOUR CART IS EMPTY</h2><p>Add some sneakers to get started.</p><button onClick={() => { onClose(); router.push('/e-commerce/products'); }}>SHOP ARRIVALS</button></div> : cart.map((item) => <article key={item.id}><img src={item.image || '/images/placeholder-product.jpg'} alt={item.name}/><div><h3>{item.name}</h3><p>{[item.color,item.size].filter(Boolean).join(' / ')}</p><b>{formatPrice(item.price)}</b><div><button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}><Minus size={12}/></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, item.quantity + 1)}><Plus size={12}/></button></div></div><button onClick={() => removeFromCart(item.id)}><Trash2 size={15}/></button></article>)}
      </div>
      {!!cart.length && <footer><div><span>SUBTOTAL</span><b>{formatPrice(getTotalPrice())}</b></div><button onClick={checkout}>CHECKOUT</button><button onClick={() => { onClose(); router.push('/e-commerce/cart'); }}>VIEW CART</button></footer>}
    </aside>
  </>;
}
