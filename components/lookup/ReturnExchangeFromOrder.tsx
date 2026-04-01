'use client';

import { RotateCcw, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  order: any;
  onInitiateReturn: (order: any) => void;
  onInitiateExchange: (order: any) => void;
}

export default function ReturnExchangeFromOrder({ order, onInitiateReturn, onInitiateExchange }: Props) {
  const { role, isSuperAdmin } = useAuth();

  // Check roles: admin, branch-manager and POS (pos-salesman)
  const allowedRoles = ['super-admin', 'admin', 'branch-manager', 'pos-salesman'];
  const canInitiate = isSuperAdmin || (role && allowedRoles.includes(role));

  if (!canInitiate) return null;

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onInitiateReturn(order)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 font-medium transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Initiate Return
        </button>
        <button
          onClick={() => onInitiateExchange(order)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 font-medium transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Request Exchange
        </button>
        <a
          href="/returns"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
        >
          View All Returns →
        </a>
      </div>
    </div>
  );
}
  );
}
