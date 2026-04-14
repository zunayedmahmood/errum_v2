'use client';

import React, { useState } from 'react';
import { ShoppingCart, Heart, Star, ArrowRight, Eye } from 'lucide-react';

export default function SaleProducts() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const products = [
    {
      id: 1,
      name: 'Reshom Halfsilk Jamdani 84',
      price: '14,990',
      oldPrice: '19,990',
      image: '/uploads/1760593060934-jamdani product.webp',
      rating: 5,
      discount: '-25%',
    },
    {
      id: 2,
      name: 'Jamdani Saree Mix Count',
      price: '6,800',
      oldPrice: '9,800',
      image: '/uploads/1760593060934-jamdani product.webp',
      rating: 5,
      discount: '-31%',
    },
    {
      id: 3,
      name: 'High Range Monipuri',
      price: '6,500',
      oldPrice: '8,500',
      image: '/uploads/1760593060934-jamdani product.webp',
      rating: 5,
      discount: '-24%',
    },
    {
      id: 4,
      name: 'Silk Madhurai Saree',
      price: '1,450',
      oldPrice: '1,950',
      image: '/uploads/1760593060934-jamdani product.webp',
      rating: 5,
      discount: '-26%',
    },
  ];

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Sale Products</h2>
          <p className="text-lg text-gray-600">Limited time offers on our finest collections</p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="group bg-white rounded-xl overflow-hidden hover:shadow-2xl transition-all duration-300"
              onMouseEnter={() => setHoveredId(product.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Product Image */}
              <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />

                {/* Discount Badge */}
                <span className="absolute top-3 left-3 bg-rose-500 text-white px-3 py-1.5 text-xs font-bold rounded-lg shadow-lg">
                  {product.discount}
                </span>

                {/* Action Buttons */}
                <div className={`absolute top-3 right-3 flex flex-col gap-2 transition-all duration-300 ${hoveredId === product.id ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
                  <button className="p-2.5 bg-white rounded-lg shadow-lg hover:bg-rose-50 transition-colors">
                    <Heart size={18} className="text-gray-700" />
                  </button>
                  <button className="p-2.5 bg-white rounded-lg shadow-lg hover:bg-blue-50 transition-colors">
                    <Eye size={18} className="text-gray-700" />
                  </button>
                </div>

                {/* Add to Cart Button */}
                <button className={`absolute bottom-0 left-0 right-0 bg-neutral-900 text-white py-3.5 font-semibold transition-transform duration-300 flex items-center justify-center gap-2 ${hoveredId === product.id ? 'translate-y-0' : 'translate-y-full'}`}>
                  Choose Options
                </button>
              </div>

              {/* Product Info */}
              <div className="p-5">
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(product.rating)].map((_, i) => (
                    <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                <h3 className="text-sm font-semibold text-gray-900 mb-3 line-clamp-2 group-hover:text-neutral-900 transition-colors cursor-pointer">
                  {product.name}
                </h3>

                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-900">৳{product.price}</span>
                  <span className="text-sm text-gray-400 line-through">৳{product.oldPrice}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center mt-12">
          <button className="inline-flex items-center gap-3 px-10 py-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl">
            View All Sale Products <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}