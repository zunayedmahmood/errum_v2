import RouteGuard from '@/components/RouteGuard';
import { PAGE_ACCESS } from '@/lib/accessMap';

export default function ResellLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={PAGE_ACCESS['/resell']}>
      {children}
    </RouteGuard>
  );
}
