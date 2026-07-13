'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, ExternalLink } from 'lucide-react';
import activityService, { BusinessHistoryEntry, BusinessHistoryCategory } from '@/services/activityService';
import ActivityLogTable from '@/components/activity/ActivityLogTable';
import { useRouter } from 'next/navigation';

type Props = {
  title?: string;
  /**
   * Suggested module/type, e.g. "orders", "products", "inventory".
   */
  module?: string;
  /**
   * Base model name used by backend `/activity-logs/model/{model}/{id}`.
   * Example: "Order", "Product", "Batch".
   */
  modelName?: string;
  /**
   * If provided, panel will show activity for the specific model record.
   */
  entityId?: number | string;
  /**
   * Optional search terms (order number, invoice, barcode, etc.).
   */
  search?: string;
  /**
   * Optional employee filter.
   */
  employeeId?: number;
  /** How many rows to show. */
  limit?: number;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function ActivityLogPanel({
  title,
  module,
  modelName,
  entityId,
  search,
  employeeId,
  limit = 10,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState<BusinessHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { category, serverParams } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    // Default window for non-entity views.
    // For a specific record (entityId), do NOT date-limit by default,
    // otherwise older orders will appear to have “no activity”.
    start.setDate(start.getDate() - 7);
    // Map legacy "module" to a business-history category. If it doesn't match, fall back to 'all'.
    const cat = (['product-dispatches','orders','purchase-orders','store-assignments','products','returns-exchanges','service-orders','shipments'] as const).includes(module as any)
      ? (module as BusinessHistoryCategory)
      : 'all';

    // Try entity-targeted filters when possible
    const extra: Record<string, any> = {};
    if (entityId != null && modelName) {
      const mid = Number(entityId);
      if (!Number.isNaN(mid)) {
        if (modelName === 'Order') extra.order_id = mid;
        if (modelName === 'PurchaseOrder') extra.purchase_order_id = mid;
        if (modelName === 'Product') extra.product_id = mid;
        if (modelName === 'ProductDispatch') extra.dispatch_id = mid;
      }
    }

    const isEntityView = entityId != null && modelName;

    return {
      category: cat,
      serverParams: {
        // Date filters are great for global views, but can hide history for a specific record.
        ...(isEntityView ? {} : { date_from: isoDate(start), date_to: isoDate(end) }),
        event: undefined,
        per_page: Math.min(Math.max(10, limit), 100),
        page: 1,
        ...extra,
      } as any,
    };
  }, [module, search, employeeId, limit, entityId, modelName]);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await activityService.getHistory(category, serverParams);
      let rows = (res.data || []).slice(0, limit);

      // Optional client-side filters
      if (employeeId) rows = rows.filter(r => r.who?.id === employeeId);

      // If we're already in a specific-record context, avoid overly strict
      // client-side filtering (order numbers may not appear in descriptions).
      const isEntityView = entityId != null && modelName;
      if (search && !isEntityView) {
        const q = search.toLowerCase();
        rows = rows.filter(r => {
          const subjectData = r.subject?.data;
          const subjectDataText = subjectData ? JSON.stringify(subjectData) : '';
          const hay = [
            r.what?.description,
            r.what?.action,
            r.subject?.type,
            String(r.subject?.id ?? ''),
            // Include subject payload (often contains order_number, invoice, etc.)
            subjectDataText,
            r.who?.name,
            r.who?.email,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        });
      }

      setEntries(rows);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load activity logs.';
      setError(msg);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, serverParams.date_from, serverParams.date_to, entityId, modelName, limit, search, employeeId]);

  const viewAllUrl = useMemo(() => {
    const q = new URLSearchParams();
    if (module) q.set('module', module);
    if (modelName) q.set('model', modelName);
    if (entityId != null) q.set('id', String(entityId));
    if (search) q.set('q', search);
    if (employeeId) q.set('employee', String(employeeId));
    return `/activity-logs?${q.toString()}`;
  }, [module, search, employeeId, entityId, modelName]);

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-black dark:bg-white rounded">
            <History className="w-4 h-4 text-white dark:text-black" />
          </div>
          <div>
            <p className="text-sm font-bold text-black dark:text-white leading-none">{title || 'Activity Logs'}</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-none mt-0.5">
              {entityId != null && modelName ? 'This record' : `Last 7 days`}
              {module ? ` • ${module}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs font-medium text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push(viewAllUrl)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-black dark:bg-white text-white dark:text-black rounded text-xs font-medium hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View all
          </button>
        </div>
      </div>

      <div className="p-4">
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400">
            {error}
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              If your backend doesn't expose a global activity endpoint, this panel will fall back to per-employee logs.
            </div>
          </div>
        ) : (
          <ActivityLogTable entries={entries} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
