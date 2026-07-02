'use client';

import ReportCard from './ReportCard';
import { NamedValue } from '@/services/businessAnalyticsService';
import { FolderKanban } from 'lucide-react';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function CategoryPerformanceCard({ data }: { data: NamedValue[] }) {
  const rows = [...(data || [])].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0) || 1;
  const top = rows[0];

  return (
    <ReportCard
      title="All Category Ranking"
      subtitle="Every category/subcategory is ranked by sales for the selected branch, product, and date filters"
    >
      <div className="space-y-5">
        {top ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2.5 text-indigo-600 shadow-sm dark:bg-gray-900 dark:text-indigo-400">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">Top Category</div>
                <div className="mt-1 text-lg font-black text-gray-900 dark:text-white">{top.label}</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Sales {currency(top.value)} • {Number(top.units || 0)} units • {((top.value / total) * 100).toFixed(1)}% of category sales
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-black uppercase tracking-[0.16em] text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-3 pr-4">Rank</th>
                <th className="py-3 px-4">Category / Subcategory</th>
                <th className="py-3 px-4 text-right">Orders</th>
                <th className="py-3 px-4 text-right">Units</th>
                <th className="py-3 px-4 text-right">Sales</th>
                <th className="py-3 px-4 text-right">Profit</th>
                <th className="py-3 px-4 text-right">Stock</th>
                <th className="py-3 pl-4 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? rows.map((row, index) => {
                const share = (Number(row.value || 0) / total) * 100;
                return (
                  <tr key={`${row.category_id || row.label}-${index}`} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <td className="py-4 pr-4 font-black text-gray-500">#{row.rank || index + 1}</td>
                    <td className="py-4 px-4">
                      <div className="font-bold text-gray-900 dark:text-white">{row.label || 'Uncategorized'}</div>
                      <div className="mt-2 h-2.5 w-full max-w-[220px] overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${Math.max(share, 3)}%` }} />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right text-gray-700 dark:text-gray-300">{row.orders || 0}</td>
                    <td className="py-4 px-4 text-right font-black text-gray-900 dark:text-white">{row.units || 0}</td>
                    <td className="py-4 px-4 text-right font-black text-gray-900 dark:text-white">{currency(row.value)}</td>
                    <td className="py-4 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{currency(row.gross_profit || 0)}</td>
                    <td className="py-4 px-4 text-right text-gray-700 dark:text-gray-300">{row.stock_on_hand || 0}</td>
                    <td className="py-4 pl-4 text-right font-semibold text-gray-700 dark:text-gray-300">{share.toFixed(1)}%</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No category sales found for this date range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportCard>
  );
}
