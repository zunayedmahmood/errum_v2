'use client';
import { Suspense } from 'react';
import ReferenceCatalogPage from '@/components/ecommerce/reference/ReferenceCatalogPage';
export default function ProductsPage() { return <Suspense fallback={<div className="ref-page-loader">LOADING DROPS...</div>}><ReferenceCatalogPage /></Suspense>; }
