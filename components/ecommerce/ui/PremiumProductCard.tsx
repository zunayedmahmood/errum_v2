'use client';

import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import type { SimpleProduct } from '@/services/catalogService';
import { wishlistUtils } from '@/lib/wishlistUtils';
import { categoryName, formatPrice, productImage, productName } from '../reference/storefrontUtils';

interface Props {
  product: SimpleProduct;
  imageErrored?: boolean;
  onImageError?: (id: number) => void;
  onOpen: (product: SimpleProduct) => void;
  onAddToCart: (product: SimpleProduct, event: React.MouseEvent) => void | Promise<void>;
  compact?: boolean;
  animDelay?: number;
}

export default function PremiumProductCard({ product, onOpen, animDelay = 0, onImageError }: Props) {
  const [wished, setWished] = useState(false);
  useEffect(() => setWished(wishlistUtils.isInWishlist(product.id)), [product.id]);
  const toggleWish = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (wished) wishlistUtils.remove(product.id);
    else wishlistUtils.add({ id: product.id, name: productName(product), price: Number(product.selling_price || 0), image: productImage(product), sku: product.sku });
    setWished(!wished);
  };
  const visualType = `${categoryName(product)} ${productName(product)}`.toLowerCase();
  const studio = ['sneaker', 'shoe', 'perfume', 'fragrance', 'watch'].some((word) => visualType.includes(word));
  return <article className="ref-product-card" style={{ animationDelay: `${animDelay}ms` }} onClick={() => onOpen(product)}>
    <div className={`ref-product-card__image ${studio ? 'is-studio' : 'is-editorial'}`}>
      <img src={productImage(product)} alt={productName(product)} onError={() => onImageError?.(product.id)} />
      <span>{categoryName(product) || 'ERRUM DROP'}</span>
      <button className={wished ? 'is-active' : ''} onClick={toggleWish} aria-label="Add to wishlist"><Heart size={17} fill={wished ? 'currentColor' : 'none'} /></button>
      {!product.in_stock && <i>SOLD OUT</i>}
    </div>
    <h3>{productName(product)}</h3>
    <b>{formatPrice(product.selling_price)}</b>
  </article>;
}
