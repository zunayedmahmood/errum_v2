import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Eye } from "lucide-react";

interface ProductCardProps {
  product: any;
  onCartOpen?: () => void; // Opens cart sidebar
}

export default function ProductCard({ product, onCartOpen }: ProductCardProps) {
  const router = useRouter(); const [isHovered, setIsHovered] = useState(false); const navigateToProduct = (productId: string | number) => {
    router.push(`/e-commerce/product/${productId}`);
  };
  const priceText = (() => {
    try {
      if (product.priceRange?.includes("-")) return `${product.priceRange}৳`;
      const v = parseFloat(product.priceRange);
      if (Number.isNaN(v)) return `${product.priceRange}৳`;
      return `${v.toLocaleString()}.00৳`;
    } catch {
      return `${product.priceRange}৳`;
    }
  })();

  return (
    <div
      className="group rounded-2xl bg-white border border-neutral-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-black/5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image area */}
      <div
        onClick={() => navigateToProduct(product.variations[0].id)}
        className="relative aspect-square overflow-hidden bg-neutral-50 cursor-pointer"
      >
        <img
          src={product.image}
          alt={product.baseName}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />

        {/* Subtle top gradient for premium feel */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />

        {/* Floating actions */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // placeholder for wishlist interaction if you add later
            }}
            className="h-9 w-9 rounded-full bg-white/95 backdrop-blur border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-700 hover:text-neutral-900 transition"
            aria-label="Wishlist"
          >
            <Heart className="h-4 w-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigateToProduct(product.variations[0].id);
            }}
            className="h-9 w-9 rounded-full bg-white/95 backdrop-blur border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-700 hover:text-neutral-900 transition"
            aria-label="Quick view"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom add-to-cart bar (premium minimal) */}
        <div
          className={`absolute inset-x-3 bottom-3 rounded-xl border border-neutral-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm transition-all duration-300 ${isHovered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
        >
          <button
            onClick={() => navigateToProduct(product?.variations?.[0]?.id)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black transition"
          >
            Choose Options
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          onClick={() => navigateToProduct(product.variations[0].id)}
          className="text-sm sm:text-[15px] font-semibold text-neutral-900 line-clamp-2 cursor-pointer hover:text-neutral-900 transition"
        >
          {product.baseName}
        </h3>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold text-amber-600">{priceText}</span>

        </div>
      </div>
    </div>
  );
}