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

  // Status-based visibility
  const isPos = order.order_type === 'counter';
  const isConfirmed = order.status === 'confirmed';
  const isShipped = order.status === 'shipped';
  const isDelivered = order.status === 'delivered';
  const isFulfilled = order.fulfillment_status === 'fulfilled';

  const isEligibleStatus = isPos 
    ? (isConfirmed || isShipped || isDelivered)
    : (isConfirmed || isFulfilled || isDelivered);

  const canInitiate = isSuperAdmin || ['admin', 'branch-manager', 'online-moderator', 'pos-salesman'].includes(role || '');

  if (!canInitiate || !isEligibleStatus) return null;

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

