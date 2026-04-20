'use client';

import RouteGuard from '@/components/RouteGuard';
import { PAGE_ACCESS } from '@/lib/accessMap';

export default function SocialTextImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={PAGE_ACCESS['/social-commerce/text-import'] || ['super-admin', 'admin', 'online-moderator']}>
      {children}
    </RouteGuard>
  );
}
