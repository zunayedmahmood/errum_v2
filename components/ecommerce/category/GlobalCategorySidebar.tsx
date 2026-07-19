'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Heart, X } from 'lucide-react';
import type { CatalogCategory } from '@/services/catalogService';
import { categoryImage, slugify } from '../reference/storefrontUtils';

export default function GlobalCategorySidebar({ categories, isOpen, onClose }: { categories: CatalogCategory[]; isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const all = categories.filter((category) => !category.parent_id);
  const go = (path: string) => { onClose(); router.push(path); };
  return <>
    <div className={`ref-drawer-backdrop ${isOpen ? 'is-open' : ''}`} onClick={onClose} />
    <aside className={`ref-category-drawer ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <header><span>☰ CATEGORIES</span><button onClick={onClose}><X size={18} /></button></header>
      <div className="ref-category-drawer__grid">
        {all.map((category) => <button key={category.id} onClick={() => go(`/e-commerce/${category.slug || slugify(category.name)}`)}>
          <img src={categoryImage(category)} alt="" /><span>{category.name}</span>
        </button>)}
      </div>
      <footer>
        <button onClick={() => go('/e-commerce/products')}>SHOP ALL PRODUCTS</button>
        <button onClick={() => go('/e-commerce/wishlist')}><Heart size={14} /> WISHLIST</button>
      </footer>
    </aside>
  </>;
}
