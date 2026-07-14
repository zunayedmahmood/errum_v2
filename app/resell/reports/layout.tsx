import RouteGuard from '@/components/RouteGuard';
import { PAGE_ACCESS } from '@/lib/accessMap';

export default function ResellReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={PAGE_ACCESS['/resell/reports']}>
      {children}
    </RouteGuard>
  );
}
