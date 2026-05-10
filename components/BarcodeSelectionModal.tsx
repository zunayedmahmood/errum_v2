"use client";
import React, { useState, useEffect } from "react";
import Barcode from 'react-barcode';

interface BarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  codes: string[];
  productName: string;
  price: number;
  onPrint: (selected: string[], quantities: Record<string, number>) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export default function BarcodeSelectionModal({
  isOpen,
  onClose,
  codes,
  productName,
  price,
  onPrint,
  isLoading = false,
  error = null
}: BarcodeModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectAll, setSelectAll] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Reset state when modal opens/closes or codes change
  useEffect(() => {
    if (isOpen && codes.length > 0) {
      const initialQuantities: Record<string, number> = {};
      codes.forEach(code => {
        initialQuantities[code] = 1;
      });
      setQuantities(initialQuantities);
      setSelected(new Set());
      setSelectAll(false);
    }
  }, [isOpen, codes]);

  const handleToggle = (code: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelected(newSelected);
    setSelectAll(newSelected.size === codes.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(codes));
      setSelectAll(true);
    }
  };

  const handleQuantityChange = (code: string, value: string) => {
    const num = parseInt(value) || 1;
    setQuantities(prev => ({
      ...prev,
      [code]: Math.max(1, Math.min(100, num)) // Max 100 copies per barcode
    }));
  };

  const handlePrint = async () => {
    if (selected.size === 0) {
      alert("Please select at least one barcode to print");
      return;
    }

    try {
      setIsPrinting(true);
      const selectedArray = Array.from(selected);
      await onPrint(selectedArray, quantities);
    } catch (error) {
      console.error("Print error:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  const getTotalLabels = () => {
    return Array.from(selected).reduce((sum, code) => sum + (quantities[code] || 1), 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Select Barcodes to Print
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span>{productName} - </span><span className="font-bold" style={{ fontFamily: 'Poppins, Arial, sans-serif' }}>BDT {price.toLocaleString('en-BD')}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isPrinting}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading barcodes...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium">Error loading barcodes</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && codes.length === 0 && (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">No barcodes available</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                This batch doesn't have any barcodes yet
              </p>
            </div>
          )}

          {/* Barcode List */}
          {!isLoading && !error && codes.length > 0 && (
            <>
              {/* Select All */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    Select All ({codes.length} barcode{codes.length !== 1 ? 's' : ''})
                  </span>
                </label>
                {selected.size > 0 && (
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selected.size} selected · {getTotalLabels()} label{getTotalLabels() !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Barcode Items Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {codes.map((code) => (
                  <div
                    key={code}
                    className={`flex flex-col p-4 rounded-lg border-2 transition-all ${
                      selected.has(code)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {/* Checkbox and Barcode */}
                    <div className="flex items-start gap-3 mb-3">
                      <input
                        type="checkbox"
                        checked={selected.has(code)}
                        onChange={() => handleToggle(code)}
                        className="w-5 h-5 mt-1 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                      />
                      
                      {/* Barcode Visual */}
                      <div className="flex-1 flex justify-center bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-600">
                        <Barcode 
                          value={code} 
                          format="CODE128" 
                          renderer="svg" 
                          width={1.5} 
                          height={40} 
                          displayValue={true} 
                          margin={2}
                          fontSize={11}
                        />
                      </div>
                    </div>
                    
                    {/* Quantity Control */}
                    {selected.has(code) && (
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Quantity:
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQuantityChange(code, String(Math.max(1, (quantities[code] || 1) - 1)))}
                            className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold transition-colors"
                            disabled={quantities[code] <= 1}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={quantities[code] || 1}
                            onChange={(e) => handleQuantityChange(code, e.target.value)}
                            className="w-16 px-2 py-1 text-center text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <button
                            onClick={() => handleQuantityChange(code, String((quantities[code] || 1) + 1))}
                            className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold transition-colors"
                            disabled={quantities[code] >= 100}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !error && codes.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selected.size > 0 ? (
                <span>
                  <strong>{getTotalLabels()}</strong> label{getTotalLabels() !== 1 ? 's' : ''} will be printed
                </span>
              ) : (
                <span>Select barcodes to print</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isPrinting}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePrint}
                disabled={selected.size === 0 || isPrinting}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isPrinting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Printing...
                  </>
                ) : (
                  <>
                    Print {selected.size > 0 && `(${getTotalLabels()})`}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}