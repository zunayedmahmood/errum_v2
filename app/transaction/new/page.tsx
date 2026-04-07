'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

/**
 * Legacy Page: New Transaction
 * This page has been replaced by the ManualEntryModal in /transaction.
 * Redirecting users to the main list.
 */
export default function NewTransactionPage() {
  const router = useRouter();

  useEffect(() => {
    toast.dismiss();
    toast.success('Manual entry is now available directly in the list view!', {
      duration: 5000,
      icon: '✨'
    });
    router.replace('/transaction');
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Redirecting to Transactions List...
      </p>
    </div>
  );
}