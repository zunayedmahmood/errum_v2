import { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Calculator, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import BarcodeScanner, { ScannedProduct } from '@/components/pos/BarcodeScanner';
import storeService, { type Store } from '@/services/storeService';

interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  batch_id: number;
  batch_number?: string;
  barcode_id?: number;
  barcode?: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  total_price: string;
}

interface Order {
  id: number;
  order_number: string;
  customer?: {
    id: number;
    name: string;
    phone: string;
  };
  store: {
    id: number;
    name: string;
  };
  items: OrderItem[];
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
}

interface ExchangeProductModalProps {
  order: Order;
  onClose: () => void;
  onExchange: (exchangeData: {
    removedProducts: Array<{
      order_item_id: number;
      quantity: number;
      unit_price: number;
      total_price: number;
      product_barcode_id?: number;
    }>;
    replacementProducts: Array<{
      product_id: number;
      batch_id: number;
      quantity: number;
      unit_price: number;
      barcode?: string;
      barcode_id?: number;
    }>;
    paymentRefund: {
      type: 'payment' | 'refund' | 'none';
      cash: number;
      card: number;
      bkash: number;
      nagad: number;
      total: number;
    };
    exchangeAtStoreId: number; // ✅ NEW FIELD
  }) => Promise<void>;
}

interface ReplacementProduct {
  id: number | string;
  product_id: number;
  batch_id: number;
  name: string;
  batchNumber?: string;
  price: number;
  quantity: number;
  amount: number;
  available: number;
  barcode?: string;
  barcode_id?: number; // Optional since it may not be available from scanner
}

export default function ExchangeProductModal({ order, onClose, onExchange }: ExchangeProductModalProps) {
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [exchangeQuantities, setExchangeQuantities] = useState<{ [key: number]: number }>({});
  const [replacementProducts, setReplacementProducts] = useState<ReplacementProduct[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [soldAtPrices, setSoldAtPrices] = useState<{ [key: number]: string }>({});
  // ✅ NEW: Store selection
  const [stores, setStores] = useState<Store[]>([]);
  const [exchangeAtStoreId, setExchangeAtStoreId] = useState<number>(order.store.id);
  const [inventoryWarnings, setInventoryWarnings] = useState<{ [key: number]: string }>({});
  const [isCheckingInventory, setIsCheckingInventory] = useState(false);

  // Payment/Refund states
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [bkashAmount, setBkashAmount] = useState(0);
  const [nagadAmount, setNagadAmount] = useState(0);
  const [showNoteCounter, setShowNoteCounter] = useState(false);

  // Note counter states
  const [note1000, setNote1000] = useState(0);
  const [note500, setNote500] = useState(0);
  const [note200, setNote200] = useState(0);
  const [note100, setNote100] = useState(0);
  const [note50, setNote50] = useState(0);
  const [note20, setNote20] = useState(0);
  const [note10, setNote10] = useState(0);
  const [note5, setNote5] = useState(0);
  const [note2, setNote2] = useState(0);
  const [note1, setNote1] = useState(0);

  // ✅ NEW: Fetch stores on mount
  useEffect(() => {
    fetchStores();
  }, []);

  // ✅ NEW: Check inventory when store or selected products change
  useEffect(() => {
    if (selectedProducts.length > 0) {
      checkInventoryAvailability();
    } else {
      setInventoryWarnings({});
    }
  }, [exchangeAtStoreId, selectedProducts, exchangeQuantities]);

  const fetchStores = async () => {
    try {
      const response = await storeService.getStores({ is_active: true });
      console.log('🏪 Store service response:', response);
      
      let storesData: Store[] = [];
      if (response?.success && response?.data) {
        if (Array.isArray(response.data.data)) {
          storesData = response.data.data;
        } else if (Array.isArray(response.data)) {
          storesData = response.data;
        }
      } else if (response?.data && Array.isArray(response.data)) {
        storesData = response.data;
      } else if (Array.isArray(response)) {
        storesData = response;
      }
      
      console.log('✅ Parsed stores:', storesData);
      setStores(storesData);
      
      if (storesData.length === 0) {
        console.warn('⚠️ No stores available');
      }
    } catch (error) {
      console.error('❌ Failed to fetch stores:', error);
      setStores([]);
    }
  };

  // ✅ NEW: Check if selected products have sufficient inventory in the selected store
  const checkInventoryAvailability = async () => {
    if (selectedProducts.length === 0) return;

    setIsCheckingInventory(true);
    const warnings: { [key: number]: string } = {};

    try {
      // Here you would call your inventory service to check availability
      // For now, we'll show a placeholder implementation
      
      for (const itemId of selectedProducts) {
        const item = order.items.find(i => i.id === itemId);
        const exchangeQty = exchangeQuantities[itemId] || 0;
        
        if (!item || exchangeQty === 0) continue;

        // TODO: Replace with actual API call to check inventory
        // Example: const inventory = await inventoryService.checkStock({
        //   store_id: exchangeAtStoreId,
        //   product_id: item.product_id,
        //   batch_id: item.batch_id
        // });

        // Placeholder: If exchange is at a different store, show warning
        if (exchangeAtStoreId !== order.store.id) {
          warnings[itemId] = `⚠️ Please verify inventory at ${stores.find(s => s.id === exchangeAtStoreId)?.name || 'selected store'}`;
        }
      }

      setInventoryWarnings(warnings);
    } catch (error) {
      console.error('Failed to check inventory:', error);
    } finally {
      setIsCheckingInventory(false);
    }
  };

  // Handle barcode scanned
  const handleProductScanned = (scannedProduct: ScannedProduct) => {
    const newItem: ReplacementProduct = {
      id: Date.now() + Math.random(),
      product_id: scannedProduct.productId,
      batch_id: scannedProduct.batchId,
      name: scannedProduct.productName,
      batchNumber: scannedProduct.batchNumber,
      price: scannedProduct.price,
      quantity: 1,
      amount: scannedProduct.price,
      available: scannedProduct.availableQty,
      barcode: scannedProduct.barcode,
      // barcode_id will be handled by backend or can be omitted if not available
    };

    setReplacementProducts(prev => [...prev, newItem]);
  };

  const handleProductCheckbox = (itemId: number) => {
    setSelectedProducts(prev => {
      if (prev.includes(itemId)) {
        const newSelected = prev.filter(id => id !== itemId);
        const newQuantities = { ...exchangeQuantities };
        delete newQuantities[itemId];
        setExchangeQuantities(newQuantities);
        return newSelected;
      } else {
        return [...prev, itemId];
      }
    });
  };

  const handleQuantityChange = (itemId: number, qty: number, maxQty: number) => {
    if (qty < 1 || qty > maxQty) return;
    setExchangeQuantities(prev => ({ ...prev, [itemId]: qty }));
  };

  const handleSoldAtChange = (itemId: number, price: string) => {
    setSoldAtPrices(prev => ({ ...prev, [itemId]: price }));
  };

  const handleRemoveReplacement = (id: number | string) => {
    setReplacementProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleUpdateReplacementQty = (id: number | string, newQty: number) => {
    if (newQty < 1) {
      handleRemoveReplacement(id);
      return;
    }

    setReplacementProducts(prev =>
      prev.map(p => {
        if (p.id === id) {
          if (newQty > p.available) {
            alert(`Only ${p.available} units available`);
            return p;
          }
          return {
            ...p,
            quantity: newQty,
            amount: p.price * newQty,
          };
        }
        return p;
      })
    );
  };

  const parsePrice = (value: any) => {
    if (value == null) return 0;
    const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const calculateTotals = () => {
    // Calculate original amount for exchanged items
    const originalAmount = selectedProducts.reduce((sum, itemId) => {
      const item = order.items.find(i => i.id === itemId);
      if (!item) return sum;
      const qty = exchangeQuantities[itemId] || 0;
      const price = parsePrice(soldAtPrices[itemId] || 0);
      return sum + (price * qty);
    }, 0);

    // Calculate new products subtotal
    const newSubtotal = replacementProducts.reduce((sum, p) => sum + p.amount, 0);

    // Calculate VAT based on order's VAT rate
    const orderSubtotal = parsePrice(order.subtotal_amount);
    const orderTotal = parsePrice(order.total_amount);
    const orderVat = orderTotal - orderSubtotal;
    const vatRate = orderSubtotal > 0 ? (orderVat / orderSubtotal) : 0;

    const vatAmount = newSubtotal * vatRate;
    const totalNewAmount = newSubtotal + vatAmount;
    const difference = totalNewAmount - originalAmount;

    return {
      originalAmount,
      newSubtotal,
      vatRate: vatRate * 100,
      vatAmount,
      totalNewAmount,
      difference,
    };
  };

  const totals = calculateTotals();

  const cashFromNotes = 
    (note1000 * 1000) + (note500 * 500) + (note200 * 200) + 
    (note100 * 100) + (note50 * 50) + (note20 * 20) + 
    (note10 * 10) + (note5 * 5) + (note2 * 2) + (note1 * 1);

  const effectiveCash = cashFromNotes > 0 ? cashFromNotes : cashAmount;
  const totalPaymentRefund = effectiveCash + cardAmount + bkashAmount + nagadAmount;
  
  const due = totals.difference > 0 
    ? Math.max(0, totals.difference - totalPaymentRefund)
    : Math.max(0, Math.abs(totals.difference) - totalPaymentRefund);

  const handleProcessExchange = async () => {
    if (selectedProducts.length === 0) {
      alert('Please select at least one product to exchange');
      return;
    }

    if (replacementProducts.length === 0) {
      alert('Please add replacement products');
      return;
    }

    const hasInvalidQuantities = selectedProducts.some(id => {
      const qty = exchangeQuantities[id];
      return !qty || qty <= 0;
    });

    if (hasInvalidQuantities) {
      alert('Please set valid quantities for all selected products');
      return;
    }

    const hasMissingPrices = selectedProducts.some(id => {
      const price = soldAtPrices[id];
      return !price || parseFloat(price) < 0;
    });

    if (hasMissingPrices) {
      alert('Please enter the manual "Sold At" price for all items being exchanged as per the historical record.');
      return;
    }

    // ✅ NEW: Check for inventory warnings
    const hasWarnings = Object.keys(inventoryWarnings).length > 0;
    if (hasWarnings) {
      const warningMessage = Object.values(inventoryWarnings).join('\n');
      if (!confirm(`⚠️ INVENTORY WARNINGS:\n\n${warningMessage}\n\nDo you want to proceed anyway?`)) {
        return;
      }
    }

    let confirmMessage = `Process exchange for order ${order.order_number}?\n\n`;
    confirmMessage += `Exchange Location: ${stores.find(s => s.id === exchangeAtStoreId)?.name || 'N/A'}\n`;
    confirmMessage += `Exchanging ${selectedProducts.length} item(s)\n`;
    confirmMessage += `Adding ${replacementProducts.length} replacement item(s)\n\n`;

    if (totals.difference > 0) {
      confirmMessage += `Customer owes: ৳${totals.difference.toLocaleString()}\n`;
      confirmMessage += `Collected: ৳${totalPaymentRefund.toLocaleString()}\n`;
      if (due > 0) {
        confirmMessage += `Remaining: ৳${due.toLocaleString()} (can pay later)`;
      } else {
        confirmMessage += `✓ Fully paid`;
      }
    } else if (totals.difference < 0) {
      const refundRequired = Math.abs(totals.difference);
      confirmMessage += `Refund required: ৳${refundRequired.toLocaleString()}\n`;
      confirmMessage += `Refunded: ৳${totalPaymentRefund.toLocaleString()}\n`;
      if (due > 0) {
        confirmMessage += `Remaining: ৳${due.toLocaleString()} (can refund later)`;
      } else {
        confirmMessage += `✓ Fully refunded`;
      }
    } else {
      confirmMessage += 'No payment difference - even exchange';
    }

    if (!confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      const exchangeData = {
        removedProducts: selectedProducts.map(itemId => {
          const item = order.items.find(i => i.id === itemId);
          const unitPrice = parsePrice(soldAtPrices[itemId]);
          const quantity = exchangeQuantities[itemId];
          return {
            order_item_id: itemId,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: unitPrice * quantity,
            product_barcode_id: item?.barcode_id,
          };
        }),
        replacementProducts: replacementProducts.map(p => ({
          product_id: p.product_id,
          batch_id: p.batch_id,
          quantity: p.quantity,
          unit_price: p.price,
          barcode: p.barcode,
          barcode_id: p.barcode_id,
        })),
        paymentRefund: {
          type: (totals.difference > 0 ? 'payment' : totals.difference < 0 ? 'refund' : 'none') as 'payment' | 'refund' | 'none',
          cash: effectiveCash,
          card: cardAmount,
          bkash: bkashAmount,
          nagad: nagadAmount,
          total: totalPaymentRefund,
        },
        exchangeAtStoreId, // ✅ NEW: Pass the selected store ID
      };

      await onExchange(exchangeData);
        
    } catch (error: any) {
      console.error('Exchange failed:', error);
      alert(error.message || 'Failed to process exchange');
    } finally {
      setIsProcessing(false);
    }
  };

  const NoteInput = ({ value, state, setState }: any) => (
    <div>
      <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">৳{value}</label>
      <input
        type="number"
        min="0"
        value={state}
        onChange={(e) => setState(Number(e.target.value))}
        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-5 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Exchange Products</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Order #{order.order_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Select Items to Exchange */}
            <div className="col-span-2 space-y-6">
              {/* Customer Info */}
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Customer</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {order.customer?.name || 'Walk-in Customer'}
                    </p>
                    {order.customer?.phone && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{order.customer.phone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Order Total</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      ৳{parsePrice(order.total_amount).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* ✅ NEW: Store Selection */}
              <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-2">
                      Exchange Location
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Select the store where this exchange will be processed. Items must be available at the selected location.
                    </p>
                    
                    {stores.length === 0 ? (
                      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Loading stores...
                      </div>
                    ) : (
                      <select
                        value={exchangeAtStoreId}
                        onChange={(e) => setExchangeAtStoreId(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                      >
                        {stores.map(store => (
                          <option key={store.id} value={store.id}>
                            {store.name} {store.is_warehouse ? '(Warehouse)' : '(Store)'}
                            {store.id === order.store.id ? ' - Original Order Location' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {stores.length} store(s) available • Original order location: {order.store.name}
                    </p>
                    
                    {isCheckingInventory && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-blue-600 dark:text-blue-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking inventory availability...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Select Items to Exchange */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-4">
                  Select Items to Exchange
                </h3>

                {order.items && order.items.length > 0 ? (
                  <div className="space-y-3">
                    {order.items.map((item) => {
                      const hasWarning = inventoryWarnings[item.id];
                      
                      return (
                        <div
                          key={item.id}
                          className={`bg-white dark:bg-gray-900 rounded-lg p-4 border ${
                            hasWarning 
                              ? 'border-orange-300 dark:border-orange-700' 
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(item.id)}
                              onChange={() => handleProductCheckbox(item.id)}
                              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {item.product_name}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                      SKU: {item.product_sku}
                                    </span>
                                    {item.batch_number && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        Batch: {item.batch_number}
                                      </span>
                                    )}
                                    {item.barcode && (
                                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-mono">
                                        🏷️ {item.barcode}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white">
                                  ৳{(parsePrice(item.unit_price) * item.quantity).toFixed(2)}
                                </p>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                Price: ৳{parsePrice(item.unit_price).toFixed(2)} × Qty: {item.quantity}
                              </p>

                              {/* ✅ NEW: Show inventory warning */}
                              {hasWarning && selectedProducts.includes(item.id) && (
                                <div className="mb-3 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-orange-700 dark:text-orange-300">
                                      {hasWarning}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {selectedProducts.includes(item.id) && (
                                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Available Qty
                                      </label>
                                      <input
                                        type="number"
                                        value={item.quantity}
                                        readOnly
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Exchange Qty *
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        max={item.quantity}
                                        value={exchangeQuantities[item.id] || ''}
                                        onChange={(e) =>
                                          handleQuantityChange(item.id, parseInt(e.target.value) || 0, item.quantity)
                                        }
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Enter qty"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
                                        Manual Sold At Price (REQUIRED) *
                                      </label>
                                      <div className="relative">
                                        <span className="absolute left-3 top-2 text-gray-400 text-sm">৳</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={soldAtPrices[item.id] || ''}
                                          onChange={(e) => handleSoldAtChange(item.id, e.target.value)}
                                          className="w-full pl-7 pr-3 py-2 text-sm border-2 border-orange-200 dark:border-orange-900/50 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <p className="text-[10px] text-gray-500 mt-1 italic">Verify with original invoice/history</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No items in this order
                  </div>
                )}
              </div>

              {/* Barcode Scanner for Replacement Products */}
              {selectedProducts.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-4">
                    Scan Replacement Products
                  </h3>

                  <BarcodeScanner
                    isEnabled={true}
                    selectedOutlet={String(exchangeAtStoreId)}
                    onProductScanned={handleProductScanned}
                    onError={(msg) => alert(msg)}
                  />

                  {/* Replacement Products List */}
                  {replacementProducts.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Replacement Products ({replacementProducts.length})
                      </h4>
                      {replacementProducts.map((product) => (
                        <div
                          key={product.id}
                          className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {product.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  ৳{product.price.toLocaleString()} × {product.quantity}
                                </p>
                                {product.barcode && (
                                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded font-mono">
                                    {product.barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleUpdateReplacementQty(product.id, product.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-white">
                                {product.quantity}
                              </span>
                              <button
                                onClick={() => handleUpdateReplacementQty(product.id, product.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                +
                              </button>
                              <p className="font-bold text-gray-900 dark:text-white min-w-[80px] text-right">
                                ৳{product.amount.toLocaleString()}
                              </p>
                              <button
                                onClick={() => handleRemoveReplacement(product.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Summary & Payment */}
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Summary</h3>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </div>

                <div className="space-y-3">
                  {/* ✅ NEW: Show selected store */}
                  <div className="flex justify-between text-sm pb-3 border-b border-gray-300 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">Exchange at:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {stores.find(s => s.id === exchangeAtStoreId)?.name || 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Items to exchange:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{selectedProducts.length}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Replacement items:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {replacementProducts.length}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-gray-300 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Original Amount:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ৳{totals.originalAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">New Subtotal:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ৳{totals.newSubtotal.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">VAT ({totals.vatRate.toFixed(1)}%):</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ৳{totals.vatAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-gray-600 dark:text-gray-400">New Total:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ৳{totals.totalNewAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border-2 border-gray-300 dark:border-gray-700">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900 dark:text-white">Difference:</span>
                        <span
                          className={`font-bold text-lg ${
                            totals.difference > 0
                              ? 'text-orange-600 dark:text-orange-400'
                              : totals.difference < 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {totals.difference > 0 ? '+' : ''}৳{totals.difference.toLocaleString()}
                        </span>
                      </div>
                      {totals.difference > 0 && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          Customer needs to pay additional
                        </p>
                      )}
                      {totals.difference < 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">Refund to customer</p>
                      )}
                      {totals.difference === 0 && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Even exchange</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment/Refund Section */}
              {totals.difference !== 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {totals.difference > 0 ? 'Collect Payment' : 'Process Refund'}
                    </h3>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Cash with Note Counter */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Cash {totals.difference > 0 ? 'Payment' : 'Refund'}
                        </label>
                        <button
                          onClick={() => setShowNoteCounter(!showNoteCounter)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        >
                          <Calculator className="w-3 h-3" />
                          {showNoteCounter ? 'Hide' : 'Count Notes'}
                        </button>
                      </div>

                      {showNoteCounter ? (
                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <NoteInput value={1000} state={note1000} setState={setNote1000} />
                            <NoteInput value={500} state={note500} setState={setNote500} />
                            <NoteInput value={200} state={note200} setState={setNote200} />
                            <NoteInput value={100} state={note100} setState={setNote100} />
                            <NoteInput value={50} state={note50} setState={setNote50} />
                            <NoteInput value={20} state={note20} setState={setNote20} />
                            <NoteInput value={10} state={note10} setState={setNote10} />
                            <NoteInput value={5} state={note5} setState={setNote5} />
                            <NoteInput value={2} state={note2} setState={setNote2} />
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-blue-200 dark:border-blue-800">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Total Cash:</span>
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              ৳{cashFromNotes.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="number"
                            min="0"
                            value={cashFromNotes > 0 ? cashFromNotes : cashAmount}
                            onChange={(e) => {
                              setCashAmount(Number(e.target.value));
                              setNote1000(0); setNote500(0); setNote200(0); setNote100(0);
                              setNote50(0); setNote20(0); setNote10(0); setNote5(0);
                              setNote2(0); setNote1(0);
                            }}
                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* Other Payment Methods */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Card</label>
                        <input
                          type="number"
                          min="0"
                          value={cardAmount}
                          onChange={(e) => setCardAmount(Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Bkash</label>
                        <input
                          type="number"
                          min="0"
                          value={bkashAmount}
                          onChange={(e) => setBkashAmount(Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Nagad</label>
                        <input
                          type="number"
                          min="0"
                          value={nagadAmount}
                          onChange={(e) => setNagadAmount(Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">
                          Total {totals.difference > 0 ? 'Collected' : 'Refunded'}
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ৳{totalPaymentRefund.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">
                          {totals.difference > 0 ? 'Amount Due' : 'Refund Required'}
                        </span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ৳{Math.abs(totals.difference).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-base">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {totals.difference > 0 ? 'Outstanding' : 'Remaining Refund'}
                        </span>
                        <span
                          className={`font-bold ${
                            due > 0
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          ৳{due.toFixed(2)}
                        </span>
                      </div>
                      {due > 0 && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          Can {totals.difference > 0 ? 'pay' : 'refund'} later
                        </p>
                      )}
                      {due === 0 && totalPaymentRefund > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          ✓ Fully {totals.difference > 0 ? 'paid' : 'refunded'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessExchange}
                  disabled={isProcessing || selectedProducts.length === 0 || replacementProducts.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-5 h-5" />
                      Process Exchange
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}