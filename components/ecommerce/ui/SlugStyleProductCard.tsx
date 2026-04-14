'use client';

import React from 'react';
import Image from 'next/image';
import { getCardPriceText, getCardStockLabel } from '@/lib/ecommerceCardUtils';

type AnyProduct = any;

interface SlugStyleProductCardProps {
  product: AnyProduct;
  imageErrored?: boolean;
  onImageError?: (id: number | string) => void;
  onViewProduct?: (id: number | string) => void;
}

export default function SlugStyleProductCard({
  product,
  imageErrored,
  onImageError,
  onViewProduct,
}: SlugStyleProductCardProps) {
  const productId = (product as any)?.id;
  const name =
    (product as any)?.display_name ||
    (product as any)?.base_name ||
    (product as any)?.baseName ||
    (product as any)?.name ||
    'Product';

  const primaryImage =
    (Array.isArray((product as any)?.images)
      ? (product as any).images.find((img: any) => Boolean(img?.is_primary))?.url || (product as any).images[0]?.url
      : '') || '';
  const shouldUseFallback = Boolean(imageErrored) || !primaryImage;
  const imageUrl = shouldUseFallback ? '/images/placeholder-product.jpg' : primaryImage;

  const stockLabel = getCardStockLabel(product);
  const hasStock = stockLabel !== 'Out of Stock';

  const goToProduct = () => onViewProduct?.(productId);

  return (
    <div className="ec-dark-card ec-dark-card-hover overflow-hidden group">
      <div className="relative h-64 bg-gray-100 cursor-pointer" onClick={goToProduct}>
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          onError={shouldUseFallback ? undefined : () => onImageError?.(productId)}
        />

        <span
          className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full ${stockLabel === 'In Stock'
              ? 'bg-green-100 text-green-700'
              : hasStock
                ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-50 text-neutral-900'
            }`}
        >
          {stockLabel}
        </span>
      </div>

      <div className="p-4">
        <h3
          className="font-semibold text-gray-900 mb-2 line-clamp-2 cursor-pointer hover:text-neutral-900"
          onClick={goToProduct}
        >
          {name}
        </h3>

        <div className="mb-3">
          <span className="text-lg font-bold text-neutral-900">{getCardPriceText(product)}</span>
        </div>

        <button
          onClick={goToProduct}
          className="w-full bg-neutral-900 text-white py-2 px-4 rounded-lg hover:bg-neutral-800 transition-colors"
        >
          Choose Options
        </button>
      </div>
    </div>
  );
}
