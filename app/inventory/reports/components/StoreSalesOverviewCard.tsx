'use client';

import ReportCard from './ReportCard';
import { StorePerformanceRow } from '@/services/businessAnalyticsService';
import { Store } from 'lucide-react';

function currency(value: number) {
    return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function percent(value: number) {
    return `${Number(value || 0).toFixed(1)}%`;
}

export default function StoreSalesOverviewCard({ data }: { data: StorePerformanceRow[] }) {
    const rows = [...(data || [])].sort((a, b) => b.net_sales - a.net_sales);
    const totalSales = rows.reduce((sum, row) => sum + Number(row.net_sales || 0), 0) || 1;
    const topStore = rows[0];

    return (
        <ReportCard
            title="Store-wise Sales"
            subtitle="Compare each branch for the selected dates, store/product/category filters"
        >
            <div className="space-y-5">
                {topStore ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-white p-2.5 text-emerald-600 shadow-sm dark:bg-gray-900 dark:text-emerald-400">
                                <Store className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Top Store</div>
                                <div className="mt-1 text-lg font-black text-gray-900 dark:text-white">{topStore.store_name}</div>
                                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">Sales {currency(topStore.net_sales)} • {topStore.orders} orders • Margin {percent(topStore.margin_pct)}</div>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-left text-[11px] font-black uppercase tracking-[0.16em] text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                <th className="py-3 pr-4">Store</th>
                                <th className="py-3 px-4 text-right">Sales</th>
                                <th className="py-3 px-4 text-right">Orders</th>
                                <th className="py-3 px-4 text-right">Units</th>
                                <th className="py-3 px-4 text-right">Profit</th>
                                <th className="py-3 pl-4 text-right">Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length > 0 ? rows.map((row) => {
                                const share = (row.net_sales / totalSales) * 100;
                                return (
                                    <tr key={row.store_id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                                        <td className="py-4 pr-4">
                                            <div className="font-bold text-gray-900 dark:text-white">{row.store_name}</div>
                                            <div className="mt-2 h-2.5 w-full max-w-[180px] overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${Math.max(share, 5)}%` }} />
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-right font-black text-gray-900 dark:text-white">{currency(row.net_sales)}</td>
                                        <td className="py-4 px-4 text-right text-gray-700 dark:text-gray-300">{row.orders}</td>
                                        <td className="py-4 px-4 text-right text-gray-700 dark:text-gray-300">{row.units || 0}</td>
                                        <td className="py-4 px-4 text-right text-indigo-600 dark:text-indigo-400 font-bold">{currency(row.profit)}</td>
                                        <td className="py-4 pl-4 text-right font-semibold text-gray-700 dark:text-gray-300">{share.toFixed(1)}%</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No store sales found for this date range.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </ReportCard>
    );
}