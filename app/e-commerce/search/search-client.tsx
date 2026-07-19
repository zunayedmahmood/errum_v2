'use client';
import { useSearchParams } from 'next/navigation';
import ReferenceCatalogPage from '@/components/ecommerce/reference/ReferenceCatalogPage';
export default function SearchClient() { const params = useSearchParams(); return <ReferenceCatalogPage forcedSearch={params.get('q') || params.get('search') || ''} />; }
