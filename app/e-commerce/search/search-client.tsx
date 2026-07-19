'use client';

import { useSearchParams } from 'next/navigation';
import ReferenceCatalogPage from '@/components/ecommerce/reference/ReferenceCatalogPage';

export default function SearchClient() {
  const params = useSearchParams();
  const query = params.get('q') || params.get('search') || '';

  // Do not briefly request the main catalog while the search URL hydrates.
  if (!query) return <div className="ref-page-loader">SEARCHING DROPS...</div>;

  return <ReferenceCatalogPage forcedSearch={query} />;
}
