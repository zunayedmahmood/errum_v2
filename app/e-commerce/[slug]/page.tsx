'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import ReferenceCatalogPage from '@/components/ecommerce/reference/ReferenceCatalogPage';

export default function CategoryPage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  // Never mount the catalog without the route filter. This prevents a first
  // unfiltered request during client hydration on category URLs.
  if (!slug) return <div className="ref-page-loader">LOADING CATEGORY...</div>;

  return (
    <Suspense fallback={<div className="ref-page-loader">LOADING DROPS...</div>}>
      <ReferenceCatalogPage categorySlug={slug} />
    </Suspense>
  );
}
