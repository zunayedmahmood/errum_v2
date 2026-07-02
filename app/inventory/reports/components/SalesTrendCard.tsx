'use client';

import React, { useEffect, useState } from 'react';
import businessAnalyticsService, { TrendPoint, ReportingFilters } from '@/services/businessAnalyticsService';
import ReportCard from './ReportCard';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function SalesTrendCard({
  initialData,
  initialFilters
}: {
  initialData: TrendPoint[],
  initialFilters: ReportingFilters
}) {
  const [data, setData] = useState<TrendPoint[]>(initialData);
  const [filters, setFilters] = useState<ReportingFilters>(initialFilters);
  const [interval, setInterval] = useState('day');
  const [loading, setLoading] = useState(false);

  const fetchData = async (f = filters, i = interval) => {
    setLoading(true);
    try {
      const res = await businessAnalyticsService.getSalesTrend({ ...f, interval: i });
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch sales trend:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
    setFilters(initialFilters);
  }, [initialData, initialFilters]);

  const handleIntervalChange = (newInterval: string) => {
    setInterval(newInterval);
    fetchData(filters, newInterval);
  };

  // SVG Chart Logic
  const values = data.map((p) => p.net_sales);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const width = 1000;
  const height = 300;
  const padding = 40;

  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const scaleY = (value: number) => {
    const range = max - min || 1;
    return (height - padding * 2) - ((value - min) / range) * (height - padding * 3) + padding;
  };

  const path = data.length > 1
    ? data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${padding + i * stepX} ${scaleY(p.net_sales)}`).join(' ')
    : '';

  const area = data.length > 1
    ? `${path} L ${padding + (data.length - 1) * stepX} ${height - padding} L ${padding} ${height - padding} Z`
    : '';

  return (
    <ReportCard
      title="Date-wise Sales"
      subtitle="Track daily, weekly, or monthly sales movement for the selected filters"
      isLoading={loading}
      onRefresh={() => fetchData()}
      headerAction={
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
            {['day', 'week', 'month', 'year'].map((i) => (
              <button
                key={i}
                onClick={() => handleIntervalChange(i)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md capitalize transition-all ${interval === i
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 uppercase'
                  }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="relative">
        <div className="absolute top-0 right-0 flex gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-500" />
            <span className="text-gray-600 dark:text-gray-400">Net Sales: {currency(data.reduce((s, p) => s + p.net_sales, 0))}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-gray-600 dark:text-gray-400">Peak: {currency(max)}</span>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto scrollbar-hide">
          <div className="min-w-[800px]">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[300px]">
              <defs>
                <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const y = padding + p * (height - padding * 2);
                const val = max - p * (max - min);
                return (
                  <React.Fragment key={i}>
                    <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4 4" className="text-gray-400 dark:text-gray-600" />
                    <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="10" className="fill-gray-400 dark:text-gray-500 font-medium">
                      {currency(val)}
                    </text>
                  </React.Fragment>
                );
              })}

              {data.length > 1 && (
                <>
                  <path d={area} fill="url(#salesGradient)" />
                  <path
                    d={path}
                    fill="none"
                    stroke="rgb(99 102 241)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {data.map((p, i) => {
                    const x = padding + i * stepX;
                    const y = scaleY(p.net_sales);

                    // Only show limited labels to avoid overlap
                    const shouldShowLabel = data.length <= 15 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1;

                    return (
                      <g key={i} className="group cursor-pointer">
                        <circle cx={x} cy={y} r="4" fill="white" stroke="rgb(99 102 241)" strokeWidth="2" />
                        <circle cx={x} cy={y} r="10" fill="transparent" />
                        {shouldShowLabel && (
                          <text
                            x={x}
                            y={height - padding + 20}
                            textAnchor="middle"
                            fontSize="10"
                            className="fill-gray-500 dark:fill-gray-400 font-medium rotate-0"
                          >
                            {p.date}
                          </text>
                        )}
                        {/* Tooltip-like behavior could be added here */}
                      </g>
                    );
                  })}
                </>
              )}

              {data.length === 1 && (
                <circle cx={width / 2} cy={height / 2} r="5" fill="rgb(99 102 241)" />
              )}
            </svg>
          </div>
        </div>
      </div>
    </ReportCard>
  );
}