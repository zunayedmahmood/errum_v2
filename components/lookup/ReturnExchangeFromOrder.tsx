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

  // Lookup is now the only place where return/exchange can be initiated.
  // Business rule: every order status is eligible except these early/pre-sale states.
  const blockedReturnExchangeStatuses = new Set(['pending', 'assigned_to_store', 'pending_assignment']);
  const normalizeOrderStatus = (status: any) => String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const orderStatus = normalizeOrderStatus(order?.status);
  const isEligibleStatus = !!orderStatus && !blockedReturnExchangeStatuses.has(orderStatus);

  const canInitiate = isSuperAdmin || ['admin', 'branch-manager', 'online-moderator', 'pos-salesman'].includes(role || '');

  const outstandingAmount = Number(order?.outstanding_amount ?? 0);
  const isFullyPaid = Math.abs(outstandingAmount) < 0.01; // handle floating point epsilon

  if (!canInitiate || !isEligibleStatus) return null;

  if (!isFullyPaid) {
    return (
      <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2 font-medium">
            ⚠️ Order must be fully paid before initiating return or exchange. 
            (Outstanding: ৳{outstandingAmount.toFixed(2)})
          </p>
        </div>
      </div>
    );
  }

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
      </div>
    </div>
  );
}

