'use client';

import React, { useState, useEffect } from 'react';
import businessAnalyticsService, { StockWatchRow, ReportingFilters } from '@/services/businessAnalyticsService';
import ReportCard from './ReportCard';
import { AlertTriangle, Clock, TrendingUp } from 'lucide-react';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function StockWatchlistCard({
  initialData,
  filters
}: {
  initialData: StockWatchRow[],
  filters?: ReportingFilters
}) {
  const [data, setData] = useState<StockWatchRow[]>(initialData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await businessAnalyticsService.getStockWatchlist(filters || {});
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch stock watchlist:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReportCard
      title="Stock Watchlist"
      subtitle="Products with high shortage risk"
      isLoading={loading}
      onRefresh={() => fetchData()}
      className="h-full"
    >
      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
        {data.map((row) => (
          <div
            key={row.product_id}
            className="group p-4 bg-white dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-amber-200 dark:hover:border-amber-900/50 transition-all shadow-sm hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <div className="font-bold text-gray-900 dark:text-white truncate">{row.name}</div>
                <div className="text-xs text-gray-500 font-medium">{row.sku || 'No SKU'}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end">
                <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Short by {row.shortage}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-gray-50 dark:border-gray-800/50 pt-3">
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">Available</div>
                <div className="text-sm font-black text-gray-900 dark:text-white">{row.available_quantity}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">Reorder</div>
                <div className="text-sm font-black text-gray-900 dark:text-white">{row.reorder_level}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">30d Rev</div>
                <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">{currency(row.revenue_30d)}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Batch Age:</span>
                <span className={`font-bold ${row.age_days > 90 ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                  {row.age_days} days
                </span>
              </div>
              {row.revenue_30d > 30000 && (
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                  <TrendingUp className="w-3 h-3" />
                  High Sales
                </div>
              )}
            </div>
          </div>
        ))}
        {data.length === 0 && !loading && (
          <div className="py-12 text-center text-gray-400 italic">No inventory alerts at the moment</div>
        )}
      </div>
    </ReportCard>
  );
}
