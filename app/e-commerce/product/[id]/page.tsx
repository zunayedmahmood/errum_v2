'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Heart, RefreshCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import catalogService, { Product } from '@/services/catalogService';
import cartService from '@/services/cartService';
import { useCart } from '@/app/e-commerce/CartContext';
import { wishlistUtils } from '@/lib/wishlistUtils';
import { categoryName, formatPrice, productImage, productName } from '@/components/ecommerce/reference/storefrontUtils';

const variantLabel = (variant: Product, index: number) => {
  const attrs = variant.attributes || {};
  const raw = attrs.size || variant.option_label || variant.variation_suffix || attrs.color || variant.sku;
  return String(raw || `OPTION ${index + 1}`).replace(/^[-\s]+/, '').replace(/-/g, ' ').trim();
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { addToCart, setIsCartOpen } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [wished, setWished] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    catalogService.getProduct(id, { include_availability: true, hide_cost_price: true }).then(({ product: loaded }) => {
      if (cancelled) return;
      setProduct(loaded);
      const candidates = [loaded, ...((loaded as any).variants || [])].filter((item, index, array) => item && array.findIndex((candidate) => candidate.id === item.id) === index);
      setSelected(candidates.find((candidate) => candidate.in_stock || Number(candidate.stock_quantity) > 0) || candidates[0] || loaded);
      setWished(wishlistUtils.isInWishlist(loaded.id));
    }).catch(() => setProduct(null)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  const variants = useMemo(() => product ? [product, ...((product as any).variants || [])].filter((item, index, array) => item && array.findIndex((candidate) => candidate.id === item.id) === index) : [], [product]);
  const images = selected?.images?.length ? selected.images : product?.images || [];
  const active = selected || product;

  const toggleWishlist = () => {
    if (!active) return;
    if (wished) wishlistUtils.remove(product!.id);
    else wishlistUtils.add({ id: product!.id, name: productName(active), price: Number(active.selling_price || 0), image: productImage(active), sku: active.sku });
    setWished(!wished);
  };

  const add = async (buyNow = false) => {
    if (!active || adding || !active.in_stock) return;
    setAdding(true);
    try {
      const options: Record<string, any> = {};
      if (active.attributes?.size) options.size = active.attributes.size;
      if (active.attributes?.color) options.color = active.attributes.color;
      await addToCart(active.id, 1, options);
      if (buyNow) {
        const cart = await cartService.getCart();
        const matching = [...(cart.cart_items || [])].reverse().find((item: any) => Number(item.product_id) === Number(active.id));
        if (matching) localStorage.setItem('checkout-selected-items', JSON.stringify([matching.id]));
        setIsCartOpen(false);
        router.push('/e-commerce/checkout');
      } else setIsCartOpen(true);
    } finally { setAdding(false); }
  };

  if (loading) return <main className="ref-storefront ref-product-page"><Navigation/><div className="ref-page-loader">LOADING DROP...</div></main>;
  if (!product || !active) return <main className="ref-storefront ref-product-page"><Navigation/><div className="ref-empty-state"><h2>DROP NOT FOUND</h2><button onClick={() => router.push('/e-commerce/products')}>BACK TO SHOP</button></div></main>;

  const cat = categoryName(active);
  return <main className="ref-storefront ref-product-page">
    <Navigation />
    <div className="ref-product-detail">
      <section className="ref-product-media">
        <div className="ref-product-media__main"><div className="ref-product-media__watermark">ERRUM</div><img src={images[imageIndex]?.url || productImage(active)} alt={productName(active)} /></div>
        {images.length > 1 && <div className="ref-product-thumbs">{images.map((image, index) => <button className={imageIndex === index ? 'is-active' : ''} key={image.id || index} onClick={() => setImageIndex(index)}><img src={image.url} alt="" /></button>)}</div>}
      </section>
      <section className="ref-product-info">
        <div className="ref-breadcrumb">{cat || 'ERRUM'} • {product.base_name || product.name}</div>
        <h1>{productName(product)}</h1>
        <p className="ref-product-sku">SKU: {active.sku}</p>
        <div className="ref-product-price">{formatPrice(active.selling_price)}</div>
        {variants.length > 1 && <div className="ref-product-variants"><header><b>SELECT SIZE</b><span>EU Sizing</span></header><div>{variants.map((variant, index) => {
          const available = variant.in_stock || Number(variant.stock_quantity) > 0;
          return <button key={variant.id} className={`${selected?.id === variant.id ? 'is-selected' : ''} ${!available ? 'is-out' : ''}`} disabled={!available} onClick={() => { setSelected(variant); setImageIndex(0); }}><span>{variantLabel(variant, index)}</span>{!available && <small>OUT</small>}</button>;
        })}</div></div>}
        <div className="ref-product-actions"><button disabled={adding || !active.in_stock} onClick={() => add(false)}><ShoppingBag size={16}/>{adding ? 'ADDING...' : 'ADD TO CART'}</button><button className={wished ? 'is-active' : ''} onClick={toggleWishlist}><Heart size={18} fill={wished ? 'currentColor' : 'none'} /></button></div>
        <button className="ref-shop-now" disabled={adding || !active.in_stock} onClick={() => add(true)}>SHOP NOW</button>
        <div className="ref-product-promises"><p><Truck size={17}/>Cash on Delivery nationwide (2-4 business days)</p><p><ShieldCheck size={17}/>100% inspected and verified authentic product drops</p><p><RefreshCcw size={17}/>Easy exchange policy within 7 days of drop dispatch</p></div>
        <div className="ref-product-description"><h3>DESCRIPTION</h3><p>{product.description || product.short_description || `${productName(product)}. Premium release at ERRUM. Engineered for style and comfort.`}</p></div>
      </section>
    </div>
  </main>;
}
