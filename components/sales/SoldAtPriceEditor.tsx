'use client';

import { parseMoney } from '@/lib/sales/soldAtPricing';

interface SoldAtPriceEditorProps {
  itemId: number;
  value: string;
  quantity: number;
  onChange: (itemId: number, value: string) => void;
}

/** Shared editor used by both Lookup Return and Lookup Exchange. */
export default function SoldAtPriceEditor({
  itemId,
  value,
  quantity,
  onChange,
}: SoldAtPriceEditorProps) {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <label
          htmlFor={`sold-at-price-${itemId}`}
          className="block text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 mb-1"
        >
          Sold At Price *
        </label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">৳</span>
          <input
            id={`sold-at-price-${itemId}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => onChange(itemId, event.target.value)}
            className="w-full pl-6 pr-2 py-1.5 text-sm border border-orange-200 dark:border-orange-900/30 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 outline-none font-bold transition-all"
            placeholder="0.00"
            aria-label="Sold at price"
          />
        </div>
      </div>
      <div className="text-right">
        <span className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Value</span>
        <span className="text-sm font-black text-gray-900 dark:text-white">
          ৳{(Math.max(0, quantity) * parseMoney(value)).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
