'use client';

import { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';

export interface CartItem {
  id: number;
  productId: number;
  productName: string;
  batchId: number;
  batchNumber: string;
  qty: number;
  price: number;
  discount: number; // Computed absolute discount amount for the line
  discountType: 'fixed' | 'percentage'; // Type of discount applied
  discountValue: number; // The raw input value (e.g., 10 for 10% or 50 for ৳50)
  amount: number; // Final amount after discount
  availableQty: number;
  barcode?: string;
}

interface CartTableProps {
  items: CartItem[];
  onRemoveItem: (id: number) => void;
  onUpdateQuantity: (id: number, newQty: number) => void;
  onUpdateDiscount: (id: number, discountValue: number, discountType: 'fixed' | 'percentage') => void;
  darkMode: boolean;
  vatRate?: number; // VAT percentage to calculate per-product tax
}

/**
 * Sub-component for handling product-level discount inputs with debounce.
 */
function DiscountInput({
  item,
  onUpdateDiscount
}: {
  item: CartItem;
  onUpdateDiscount: CartTableProps['onUpdateDiscount'];
}) {
  const [localPercent, setLocalPercent] = useState<string>(
    item.discountType === 'percentage' && item.discountValue > 0 ? item.discountValue.toString() : ''
  );
  const [localAmount, setLocalAmount] = useState<string>(
    item.discountType === 'fixed' && item.discountValue > 0 ? item.discountValue.toString() : ''
  );

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Synchronize local state with item state
  useEffect(() => {
    if (item.discountType === 'percentage') {
      setLocalPercent(item.discountValue > 0 ? item.discountValue.toString() : '');
      setLocalAmount('');
    } else {
      setLocalAmount(item.discountValue > 0 ? item.discountValue.toString() : '');
      setLocalPercent('');
    }
  }, [item.id, item.discountType, item.discountValue]);

  const handleUpdate = (value: number, type: 'fixed' | 'percentage') => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      onUpdateDiscount(item.id, value, type);
    }, 300);
  };

  return (
    <div className="flex flex-col gap-1 items-center">
      {/* Discount Percentage */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="%"
          value={localPercent}
          onChange={(e) => {
            const val = e.target.value;
            setLocalPercent(val);
            setLocalAmount(''); // Mutually exclusive: clear other local state
            const numVal = Math.max(0, parseFloat(val) || 0);
            handleUpdate(numVal, 'percentage');
          }}
          className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs text-center focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">%</span>
      </div>

      {/* Discount Amount */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">৳</span>
        <input
          type="number"
          placeholder="Amount"
          value={localAmount}
          onChange={(e) => {
            const val = e.target.value;
            setLocalAmount(val);
            setLocalPercent(''); // Mutually exclusive: clear other local state
            const numVal = Math.max(0, parseFloat(val) || 0);
            handleUpdate(numVal, 'fixed');
          }}
          className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs text-center focus:ring-1 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

export default function CartTable({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateDiscount,
  darkMode,
  vatRate = 0
}: CartTableProps) {

  /**
   * Calculate proportional VAT for a specific item
   */
  const calculateItemVAT = (item: CartItem): number => {
    if (vatRate === 0) return 0;

    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    if (subtotal === 0) return 0;

    const totalVAT = (subtotal * vatRate) / 100;
    const itemShare = item.amount / subtotal;
    const itemVAT = totalVAT * itemShare;

    return itemVAT;
  };

  /**
   * Calculate total with VAT for a specific item
   */
  const getItemTotalWithVAT = (item: CartItem): number => {
    return item.amount + calculateItemVAT(item);
  };

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No items in cart. Scan or add products to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-medium text-gray-900 dark:text-white">
          Cart ({items.length} {items.length === 1 ? 'item' : 'items'})
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Product
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Discount
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Subtotal
              </th>
              {vatRate > 0 && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  VAT ({vatRate}%)
                </th>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                {/* Product Info */}
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Batch: {item.batchNumber}
                    </p>
                    {item.barcode && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {item.barcode}
                      </p>
                    )}
                  </div>
                </td>

                {/* Quantity Controls */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        if (item.qty > 1) {
                          onUpdateQuantity(item.id, item.qty - 1);
                        }
                      }}
                      disabled={item.qty <= 1}
                      className="p-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3 h-3 text-gray-700 dark:text-gray-300" />
                    </button>
                    <input
                      type="number"
                      value={item.qty === 0 ? '' : item.qty}
                      placeholder="0"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          onUpdateQuantity(item.id, 0); // Allow temporary 0/empty for typing
                        } else {
                          const newQty = parseInt(val);
                          if (!isNaN(newQty) && newQty >= 0 && newQty <= item.availableQty) {
                            onUpdateQuantity(item.id, newQty);
                          }
                        }
                      }}
                      min="0"
                      max={item.availableQty}
                      className="w-16 text-center px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <button
                      onClick={() => {
                        if (item.qty < item.availableQty) {
                          onUpdateQuantity(item.id, item.qty + 1);
                        }
                      }}
                      disabled={item.qty >= item.availableQty}
                      className="p-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3 text-gray-700 dark:text-gray-300" />
                    </button>
                  </div>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">
                    Stock: {item.availableQty}
                  </p>
                </td>

                {/* Price */}
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ৳{item.price.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ৳{(item.price * item.qty).toFixed(2)}
                  </p>
                </td>

                {/* Discount Inputs */}
                <td className="px-4 py-3">
                  <DiscountInput
                    item={item}
                    onUpdateDiscount={onUpdateDiscount}
                  />
                </td>

                {/* Total Amount (Before VAT) */}
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ৳{item.amount.toFixed(2)}
                  </p>
                  {item.discount > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      -৳{item.discount.toFixed(2)} off
                    </p>
                  )}
                </td>

                {/* VAT Column (Conditional) */}
                {vatRate > 0 && (
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      ৳{calculateItemVAT(item).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {((item.amount / items.reduce((s, i) => s + i.amount, 0)) * 100).toFixed(1)}%
                    </p>
                  </td>
                )}

                {/* Final Total (With VAT) */}
                <td className="px-4 py-3 text-right">
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    ৳{getItemTotalWithVAT(item).toFixed(2)}
                  </p>
                </td>

                {/* Remove Button */}
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cart Summary */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Gross Subtotal
            </span>
            <span className="text-sm text-gray-900 dark:text-white">
              ৳{items.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2)}
            </span>
          </div>

          {items.some(item => item.discount > 0) && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-green-600 dark:text-green-400">
                Total Line Discounts
              </span>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                -৳{items.reduce((sum, item) => sum + item.discount, 0).toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Net Subtotal
            </span>
            <span className="text-base font-semibold text-gray-900 dark:text-white">
              ৳{items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
            </span>
          </div>

          {vatRate > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-blue-600 dark:text-blue-400">
                VAT ({vatRate}%)
              </span>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                +৳{items.reduce((sum, item) => sum + calculateItemVAT(item), 0).toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-300 dark:border-gray-600">
            <span className="text-base font-bold text-gray-900 dark:text-white">
              Grand Total
            </span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              ৳{items.reduce((sum, item) => sum + getItemTotalWithVAT(item), 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}