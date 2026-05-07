'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Heart, X, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { wishlistUtils, WishlistItem } from '@/lib/wishlistUtils';
import { useCart } from '@/app/e-commerce/CartContext';
import Navigation from '@/components/ecommerce/Navigation';

export default function WishlistPage() {
  const router = useRouter();
  const { addToCart, setIsCartOpen } = useCart();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [addingToCartId, setAddingToCartId] = useState<string | number | null>(null);

  // Load wishlist items
  useEffect(() => {
    const loadWishlist = () => {
      setWishlistItems(wishlistUtils.getAll());
    };

    loadWishlist();

    // Listen for wishlist updates
    window.addEventListener('wishlist-updated', loadWishlist);
    return () => window.removeEventListener('wishlist-updated', loadWishlist);
  }, []);

  const handleAddToCart = (item: WishlistItem) => {
    setAddingToCartId(item.id);
    
    // Add to persisted cart (works for both logged-in and guest users)
    addToCart(Number(item.id), 1);

    setTimeout(() => {
      setAddingToCartId(null);
      setIsCartOpen(true); // Open cart sidebar after adding
    }, 1000);
  };

  const handleRemove = (id: string | number) => {
    wishlistUtils.remove(id);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear your wishlist?')) {
      wishlistUtils.clear();
    }
  };

  const handleNavigateToProduct = (id: string | number) => {
    router.push(`/e-commerce/product/${id}`);
  };

  if (wishlistItems.length === 0) {
    return (
      <>
        <Navigation />
        <div className="ec-root min-h-screen py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => router.push('/e-commerce')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
            >
              <ArrowLeft size={20} />
              <span>Back to Shopping</span>
            </button>

            <h1 className="text-3xl font-bold text-gray-900 mb-8">My Wishlist</h1>
            
            <div className="ec-dark-card p-12 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <Heart size={48} className="text-gray-300" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your wishlist is empty</h2>
                <p className="text-gray-600 mb-8">
                  Save your favorite items here to buy them later or share with friends
                </p>
                <button 
                  onClick={() => router.push('/e-commerce')}
                  className="ec-btn ec-btn-gold"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        </div></>
    );
  }

  return (
    <>
      <Navigation />
      <div className="ec-root min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push('/e-commerce')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to Shopping</span>
          </button>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              My Wishlist ({wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'})
            </h1>
            <button
              onClick={handleClearAll}
              className="text-rose-600 hover:text-neutral-900 font-medium text-sm transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {wishlistItems.map((item) => (
              <div
                key={item.id}
                className="ec-dark-card ec-dark-card-hover overflow-hidden group" style={{ borderRadius: '14px' }}
              >
                <div 
                  onClick={() => handleNavigateToProduct(item.id)}
                  className="relative aspect-square overflow-hidden cursor-pointer" style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.currentTarget.src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400"%3E%3Crect fill="%23f3f4f6" width="300" height="400"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="16"%3E' +
                        encodeURIComponent(item.name) +
                        '%3C/text%3E%3C/svg%3E';
                    }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(item.id);
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full z-10 transition-colors" style={{ background: 'rgba(13,13,13,0.7)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}
                    title="Remove from wishlist"
                  >
                    <X size={16} className="text-gray-700 hover:text-rose-600" />
                  </button>
                </div>

                <div className="p-4">
                  <h3 
                    onClick={() => handleNavigateToProduct(item.id)}
                    className="text-sm font-semibold mb-2 line-clamp-2 min-h-[2.5rem] cursor-pointer transition-colors text-white"
                  >
                    {item.name}
                  </h3>
                  <p className="text-lg font-bold text-neutral-900 mb-4">
                    {item.price.toLocaleString()}.00৳
                  </p>
                  
                  <button
                    onClick={() => handleAddToCart(item)}
                    disabled={addingToCartId === item.id}
                    className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                      addingToCartId === item.id
                        ? 'bg-green-600 text-white'
                        : 'bg-neutral-900 text-white hover:bg-neutral-800'
                    }`}
                  >
                    {addingToCartId === item.id ? (
                      <>✓ Added</>
                    ) : (
                      <>
                        <ShoppingCart size={16} />
                        Add to Cart
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}