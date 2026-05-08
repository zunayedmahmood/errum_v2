import React from 'react';
import { PAGE_ACCESS } from '@/lib/accessMap';
import RouteGuard from '@/components/auth/RouteGuard';

export default function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedRoles={PAGE_ACCESS['/collections']}>
      {children}
    </RouteGuard>
  );
}
