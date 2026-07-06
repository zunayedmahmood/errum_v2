'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedCashSheetNewRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/cash-sheet');
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white text-sm">
      Redirecting to Daily Cash Sheet...
    </main>
  );
}
