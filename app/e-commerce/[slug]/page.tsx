'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import ReferenceCatalogPage from '@/components/ecommerce/reference/ReferenceCatalogPage';
export default function CategoryPage() { const params = useParams(); const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug; return <Suspense fallback={<div className="ref-page-loader">LOADING DROPS...</div>}><ReferenceCatalogPage categorySlug={slug || null} /></Suspense>; }
