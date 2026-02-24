import { Suspense } from 'react';
import SearchClient from './search-client';

interface SearchPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query  = ((params.q as string) || '').trim();

  return (
    <Suspense fallback={null}>
      <SearchClient initialQuery={query} />
    </Suspense>
  );
}
