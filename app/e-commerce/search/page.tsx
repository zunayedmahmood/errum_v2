import { Suspense } from 'react';
import SearchClient from './search-client';
export default function SearchPage() { return <Suspense fallback={<div className="ref-page-loader">SEARCHING DROPS...</div>}><SearchClient /></Suspense>; }
