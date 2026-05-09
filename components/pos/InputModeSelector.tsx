'use client';

import { Scan } from 'lucide-react';

interface InputModeSelectorProps {
  mode: 'barcode' | 'manual';
  onModeChange: (mode: 'barcode' | 'manual') => void;
}

export default function InputModeSelector({ mode, onModeChange }: InputModeSelectorProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <div className="flex items-center justify-between">
        {/* Description */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            Input Mode
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {mode === 'barcode' 
              ? 'Scan barcodes with your scanner or enter manually' 
              : 'Select products manually from dropdown menu'}
          </p>
        </div>

        {/* Mode Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onModeChange('barcode')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
              mode === 'barcode'
                ? 'bg-blue-600 text-white shadow-md scale-105'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Scan className="w-4 h-4" />
            <span>Barcode Scanner</span>
          </button>
        </div>
      </div>

      {/* Mode-specific hints */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">
            <Scan className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-200 mb-1">
              Barcode Scanner Mode
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Point your scanner at barcodes or type them in the input field. Each scan adds one item to cart with automatic price and batch detection.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}