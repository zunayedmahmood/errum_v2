'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Users } from 'lucide-react';

export default function HRMRootPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const roleSlug = user?.role?.slug;
    if (!roleSlug) return;

    if (['super-admin', 'admin', 'branch-manager', 'online-moderator'].includes(roleSlug)) {
      router.replace('/hrm/branch');
    } else {
      router.replace('/hrm/my');
    }
  }, [router, user?.role?.slug]);

  return (
    <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-center dark:border-gray-700 dark:bg-gray-800">
      <Users className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Opening HRM workspace...</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Redirecting you to the right HRM page for your role.</p>
    </div>
  );
}
