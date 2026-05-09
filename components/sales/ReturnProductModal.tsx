import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Calculator, ChevronDown, AlertCircle, Scan } from 'lucide-react';
import BarcodeScanner, { type ScannedProduct } from '@/components/pos/BarcodeScanner';
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
  total_amount: string;
}

interface Order {
  id: number;
  order_number: string;
  store: {
    id: number;
    name: string;
  };
  customer?: {
    name: string;
    phone: string;
  };
  items: OrderItem[];
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
}

interface ReturnedBarcode {
  barcode: string;
  barcode_id?: number;
}

type ReturnReason = 'defective_product' | 'wrong_item' | 'not_as_described' | 'customer_dissatisfaction' | 'size_issue' | 'color_issue' | 'quality_issue' | 'late_delivery' | 'changed_mind' | 'duplicate_order' | 'other';
type ReturnType = 'customer_return' | 'store_return' | 'warehouse_return';

interface ReturnProductModalProps {
  order: Order;
  onClose: () => void;
  onReturn: (returnData: {
    selectedProducts: Array<{
      order_item_id: number;
      quantity: number;
      unit_price: number;
      total_price: number;
      product_barcode_id?: number;
      barcode_id?: number;
      barcode?: string;
    }>;
    refundMethods: {
      cash: number;
      card: number;
      bkash: number;
      nagad: number;
      total: number;
    };
    returnReason: ReturnReason;
    returnType: ReturnType;
    receivedAtStoreId: number; // ✅ NEW FIELD
    customerNotes?: string;
  }) => Promise<void>;
}

export default function ReturnProductModal({ order, onClose, onReturn }: ReturnProductModalProps) {
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [returnedQuantities, setReturnedQuantities] = useState<{ [key: number]: number }>({});
  const [returnedBarcodes, setReturnedBarcodes] = useState<{ [key: number]: ReturnedBarcode[] }>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [soldAtPrices, setSoldAtPrices] = useState<{ [key: number]: string }>({});

  // Return info
  const [returnReason, setReturnReason] = useState<ReturnReason>('other');
  const [returnType, setReturnType] = useState<ReturnType>('customer_return');
  const [customerNotes, setCustomerNotes] = useState('');

  // ✅ NEW: Store selection for where return is received
  const [stores, setStores] = useState<Store[]>([]);
  const [receivedAtStoreId, setReceivedAtStoreId] = useState<number>(order.store?.id || 0);

  // Refund payment states
  const [refundCash, setRefundCash] = useState(0);
  const [refundCard, setRefundCard] = useState(0);
  const [refundBkash, setRefundBkash] = useState(0);
  const [refundNagad, setRefundNagad] = useState(0);
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

  const fetchStores = async () => {
    try {
      const response = await storeService.getStores({ is_active: true });
      console.log('🏪 Store service response:', response);

      // Handle different response formats
      let storesData: Store[] = [];
      if (response?.success && response?.data) {
        // Format: { success: true, data: [...] }
        if (Array.isArray(response.data.data)) {
          storesData = response.data.data;
        } else if (Array.isArray(response.data)) {
          storesData = response.data;
        }
      } else if (response?.data && Array.isArray(response.data)) {
        // Format: { data: [...] }
        storesData = response.data;
      } else if (Array.isArray(response)) {
        // Format: [...]
        storesData = response;
      }

      console.log('✅ Parsed stores:', storesData);
      setStores(storesData);

      // If no stores found, show warning
      if (storesData.length === 0) {
        console.warn('⚠️ No stores available');
      } else if (receivedAtStoreId === 0) {
        // ✅ NEW: Auto-select first store if none assigned
        setReceivedAtStoreId(storesData[0].id);
      }
    } catch (error) {
      console.error('❌ Failed to fetch stores:', error);
      setStores([]);
    }
  };

  const outstandingAmount = parseFloatValue(order.outstanding_amount);
  const isFullyPaid = Math.abs(outstandingAmount) < 0.01;

  const returnReasonOptions: Array<{ value: ReturnReason; label: string }> = [
    { value: 'defective_product', label: 'Defective Product' },
    { value: 'wrong_item', label: 'Wrong Item' },
    { value: 'not_as_described', label: 'Not As Described' },
    { value: 'customer_dissatisfaction', label: 'Customer Dissatisfaction' },
    { value: 'size_issue', label: 'Size Issue' },
    { value: 'color_issue', label: 'Color Issue' },
    { value: 'quality_issue', label: 'Quality Issue' },
    { value: 'late_delivery', label: 'Late Delivery' },
    { value: 'changed_mind', label: 'Changed Mind' },
    { value: 'duplicate_order', label: 'Duplicate Order' },
    { value: 'other', label: 'Other' },
  ];

  const returnTypeOptions: Array<{ value: ReturnType; label: string }> = [
    { value: 'customer_return', label: 'Customer Return' },
    { value: 'store_return', label: 'Store Return' },
    { value: 'warehouse_return', label: 'Warehouse Return' },
  ];

  const handleProductScanned = (scannedProduct: ScannedProduct) => {
    // Check if it's a return (part of the original order)
    const matchingOrderItems = order.items.filter(item =>
      item.product_id === scannedProduct.productId ||
      item.barcode === scannedProduct.barcode ||
      item.product_sku === scannedProduct.barcode
    );

    let targetItem = null;
    if (matchingOrderItems.length > 0) {
      targetItem = matchingOrderItems.find(item => item.barcode === scannedProduct.barcode);
      if (!targetItem) {
        targetItem = matchingOrderItems.find(item => (returnedQuantities[item.id] || 0) < item.quantity);
      }
    }

    if (targetItem) {
      const currentQty = returnedQuantities[targetItem.id] || 0;
      const currentBarcodes = returnedBarcodes[targetItem.id] || [];
      const scannedCode = String(scannedProduct.barcode || '').trim();
      const targetHasTrackedBarcode = Boolean(targetItem.barcode_id || targetItem.barcode);
      const shouldRecordBarcode = Boolean(
        scannedProduct.barcodeId ||
        (targetHasTrackedBarcode && scannedCode && scannedCode === String(targetItem.barcode || '').trim())
      );

      if (shouldRecordBarcode && currentBarcodes.some(b => b.barcode === scannedCode)) {
        alert('This barcode has already been scanned for this return item.');
        return;
      }

      const addQuantity = () => {
        if (currentQty >= targetItem.quantity) {
          alert('This product is already fully selected for return.');
          return false;
        }
        setReturnedQuantities(prev => ({ ...prev, [targetItem.id]: currentQty + 1 }));
        return true;
      };

      if (shouldRecordBarcode) {
        const newBarcode = { barcode: scannedCode, barcode_id: scannedProduct.barcodeId || targetItem.barcode_id };
        if (currentQty === 1 && currentBarcodes.length === 0) {
          setReturnedBarcodes(prev => ({
            ...prev,
            [targetItem.id]: [newBarcode]
          }));
        } else if (addQuantity()) {
          setReturnedBarcodes(prev => ({
            ...prev,
            [targetItem.id]: [...(prev[targetItem.id] || []), newBarcode]
          }));
        } else {
          return;
        }
      } else if (!addQuantity()) {
        return;
      }

      if (!selectedProducts.includes(targetItem.id)) {
        setSelectedProducts(prev => [...prev, targetItem.id]);
      }

      if (!soldAtPrices[targetItem.id]) {
        setSoldAtPrices(prev => ({ ...prev, [targetItem.id]: targetItem.unit_price }));
      }
      return;
    }

    alert('Product not found in this order.');
  };

  const handleRemoveReturnBarcode = (itemId: number, barcode: string) => {
    setReturnedBarcodes(prev => {
      const current = prev[itemId] || [];
      const filtered = current.filter(bc => bc.barcode !== barcode);
      return { ...prev, [itemId]: filtered };
    });

    setReturnedQuantities(prev => {
      const currentQty = prev[itemId] || 0;
      const newQty = Math.max(0, currentQty - 1);
      if (newQty === 0 && !returnedBarcodes[itemId]?.length) {
        setSelectedProducts(sel => sel.filter(id => id !== itemId));
      }
      return { ...prev, [itemId]: newQty };
    });
  };

  const handleProductCheckbox = (itemId: number) => {
    setSelectedProducts(prev => {
      const isSelected = prev.includes(itemId);
      if (isSelected) {
        const newSelected = prev.filter(id => id !== itemId);
        setReturnedQuantities(q => { const n = { ...q }; delete n[itemId]; return n; });
        setReturnedBarcodes(b => { const n = { ...b }; delete n[itemId]; return n; });
        return newSelected;
      } else {
        const item = order.items.find(i => i.id === itemId);
        if (item) {
          setSoldAtPrices(p => ({ ...p, [itemId]: item.unit_price }));
          setReturnedQuantities(q => ({ ...q, [itemId]: Math.max(q[itemId] || 0, 1) }));
        }
        return [...prev, itemId];
      }
    });
  };

  const handleSoldAtChange = (itemId: number, price: string) => {
    setSoldAtPrices(prev => ({ ...prev, [itemId]: price }));
  };

  const parseFloatValue = (value: any) => {
    if (value == null) return 0;
    const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const calculateTotals = () => {
    const orderSubtotal = order.items.reduce((sum, item) => {
      const price = parseFloatValue(item.unit_price);
      return sum + (price * item.quantity);
    }, 0);

    const orderTotal = parseFloatValue(order.total_amount);
    const orderVat = orderTotal - orderSubtotal;
    const vatRate = orderSubtotal > 0 ? orderVat / orderSubtotal : 0;

    const returnSubtotal = selectedProducts.reduce((sum, productId) => {
      const product = order.items.find(p => p.id === productId);
      if (!product) return sum;
      const qty = returnedQuantities[productId] || 0;
      const price = parseFloatValue(soldAtPrices[productId] || 0);
      return sum + (price * qty);
    }, 0);

    const returnVat = returnSubtotal * vatRate;
    const returnAmount = returnSubtotal + returnVat;
    const totalPaid = parseFloatValue(order.paid_amount);
    const refundToCustomer = Math.min(returnAmount, totalPaid);

    return {
      returnAmount,
      totalPaid,
      refundToCustomer,
    };
  };

  const totals = calculateTotals();

  const cashFromNotes = (note1000 * 1000) + (note500 * 500) + (note200 * 200) +
    (note100 * 100) + (note50 * 50) + (note20 * 20) +
    (note10 * 10) + (note5 * 5) + (note2 * 2) + (note1 * 1);

  const effectiveRefundCash = cashFromNotes > 0 ? cashFromNotes : refundCash;
  const totalRefundProcessed = effectiveRefundCash + refundCard + refundBkash + refundNagad;
  const remainingRefund = totals.refundToCustomer - totalRefundProcessed;

  const handleProcessReturn = async () => {
    if (!isFullyPaid) {
      alert(`This order has an outstanding balance of ৳${outstandingAmount.toFixed(2)}. It must be fully paid before a return can be processed.`);
      return;
    }

    if (selectedProducts.length === 0) {
      alert('Please select at least one product to return');
      return;
    }

    const hasInvalidQuantities = selectedProducts.some(id => {
      const qty = returnedQuantities[id];
      return !qty || qty <= 0;
    });

    if (hasInvalidQuantities) {
      alert('Please set quantities for all selected products');
      return;
    }

    const hasMissingPrices = selectedProducts.some(id => {
      const price = soldAtPrices[id];
      return !price || parseFloat(price) < 0;
    });

    if (hasMissingPrices) {
      alert('Please enter the manual "Sold At" price for all selected items as per the physical invoice or historical record.');
      return;
    }

    // 🚫 Block partial refunds (Frontend enforcement)
    if (remainingRefund > 0.01) {
      alert(`Full refund required. Please process exactly ৳${totals.refundToCustomer.toFixed(2)} to complete this return.`);
      return;
    }

    let confirmMessage = `Process return?\n\n`;
    confirmMessage += `Return Reason: ${returnReasonOptions.find(r => r.value === returnReason)?.label}\n`;
    confirmMessage += `Return Type: ${returnTypeOptions.find(t => t.value === returnType)?.label}\n`;
    confirmMessage += `Received At: ${stores.find(s => s.id === receivedAtStoreId)?.name || 'N/A'}\n\n`;

    if (totals.refundToCustomer > 0) {
      confirmMessage += `Refund ৳${totals.refundToCustomer.toLocaleString()} to customer (Fully processed)`;
    } else {
      confirmMessage += `Reduce order total by ৳${totals.returnAmount.toLocaleString()}`;
    }

    if (!confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      const selectedProductsWithBarcodes = selectedProducts.flatMap(itemId => {
        const item = order.items.find(i => i.id === itemId);
        const unitPrice = parseFloatValue(soldAtPrices[itemId]);
        const barcodes = returnedBarcodes[itemId] || [];

        if (barcodes.length > 0) {
          return barcodes.map(bc => ({
            order_item_id: itemId,
            quantity: 1,
            unit_price: unitPrice,
            total_price: unitPrice,
            product_barcode_id: bc.barcode_id || item?.barcode_id,
            barcode_id: bc.barcode_id || item?.barcode_id,
            barcode: bc.barcode,
          }));
        } else {
          const quantity = returnedQuantities[itemId] || 0;
          return [{
            order_item_id: itemId,
            quantity: quantity,
            unit_price: unitPrice,
            total_price: unitPrice * quantity,
            product_barcode_id: item?.barcode_id,
            barcode_id: item?.barcode_id,
          }];
        }
      });

      await onReturn({
        selectedProducts: selectedProductsWithBarcodes,
        refundMethods: {
          cash: effectiveRefundCash,
          card: refundCard,
          bkash: refundBkash,
          nagad: refundNagad,
          total: totalRefundProcessed,
        },
        returnReason,
        returnType,
        receivedAtStoreId, // ✅ NEW: Pass received_at_store_id
        customerNotes: customerNotes.trim() || undefined,
      });
    } catch (error: any) {
      console.error('Return failed:', error);
      alert(error.message || 'Failed to process return');
    } finally {
      setIsProcessing(false);
    }
  };

  const NoteInput = ({ value, state, setState }: any) => (
    <div>
      <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">৳{value} ×</label>
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
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-5 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Return Products - {order.order_number}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Select items to return and process refund</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Customer</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{order.customer?.name || 'N/A'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{order.customer?.phone || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Paid</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">৳{totals.totalPaid.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {!isFullyPaid && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3 mb-6">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Payment Required</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      This order has an outstanding balance of ৳{outstandingAmount.toFixed(2)}. 
                      Returns can only be processed for fully paid orders.
                    </p>
                  </div>
                </div>
              )}

              {/* Return Reason & Type */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-4">Return Information</h3>
                <div className="space-y-3">
                  {/* ✅ NEW: Store Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Received At Store *
                    </label>
                    {stores.length === 0 ? (
                      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Loading stores...
                      </div>
                    ) : (
                      <select
                        value={receivedAtStoreId}
                        onChange={(e) => setReceivedAtStoreId(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {stores.map(store => (
                          <option key={store.id} value={store.id}>
                            {store.name} {store.is_warehouse ? '(Warehouse)' : '(Store)'}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Select where the returned items will be received ({stores.length} stores available)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Return Type</label>
                    <select
                      value={returnType}
                      onChange={(e) => setReturnType(e.target.value as ReturnType)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {returnTypeOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Return Reason *</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {returnReasonOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Customer Notes (Optional)</label>
                    <textarea
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Additional notes from customer..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Product Selection */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Select Items to Return</h3>
                  <div className="flex items-center gap-2 px-3 py-1 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-bold">
                    <Scan className="w-3 h-3" />
                    Barcode Driven
                  </div>
                </div>

                <div className="mb-6">
                  <BarcodeScanner onProductScanned={handleProductScanned} />
                </div>

                {order.items.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">No products in this order</div>
                ) : (
                  <div className="space-y-4">
                    {Object.values(order.items.reduce((acc, item) => {
                      const key = `${item.product_id}-${item.batch_id}-${item.unit_price}`;
                      if (!acc[key]) {
                        acc[key] = {
                          product_id: item.product_id,
                          product_name: item.product_name,
                          product_sku: item.product_sku,
                          unit_price: item.unit_price,
                          batch_number: item.batch_number,
                          items: [] as OrderItem[],
                        };
                      }
                      acc[key].items.push(item);
                      return acc;
                    }, {} as Record<string, any>)).map((group: any) => {
                      const groupPrice = parseFloatValue(group.unit_price);

                      return (
                        <div
                          key={`${group.product_id}-${group.batch_number}`}
                          className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-bold text-gray-900 dark:text-white text-base">
                                    {group.product_name}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                      SKU: {group.product_sku}
                                    </span>
                                    {group.batch_number && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        Batch: {group.batch_number}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Unit Price</p>
                                  <p className="font-bold text-gray-900 dark:text-white">
                                    ৳{groupPrice.toFixed(2)}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4">
                                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">
                                  Available Barcodes / Units (Click to select)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {group.items.map((item: OrderItem) => {
                                    const isItemSelected = selectedProducts.includes(item.id);
                                    const qtyReturned = returnedQuantities[item.id] || 0;
                                    const isFullyReturned = qtyReturned >= item.quantity;

                                    return (
                                      <button
                                        key={item.id}
                                        onClick={() => {
                                          handleProductScanned({
                                            productId: item.product_id,
                                            productName: item.product_name,
                                            batchId: item.batch_id,
                                            batchNumber: item.batch_number || '',
                                            price: parseFloatValue(item.unit_price),
                                            availableQty: item.quantity,
                                            barcode: item.barcode_id && item.barcode ? item.barcode : '',
                                            barcodeId: item.barcode_id
                                          });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-2 border-2 ${isItemSelected
                                            ? 'bg-red-50 dark:bg-red-900/10 border-red-500 text-red-700 dark:text-red-300 shadow-sm'
                                            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                                          }`}
                                      >
                                        <div className={`w-2 h-2 rounded-full ${isItemSelected ? 'bg-red-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                        {item.barcode || 'Select Item'}
                                        {item.quantity > 1 && (
                                          <span className="bg-gray-200 dark:bg-gray-700 px-1.5 rounded text-[10px]">
                                            {qtyReturned}/{item.quantity}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {group.items.some((it: any) => selectedProducts.includes(it.id)) && (
                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {group.items.filter((it: any) => selectedProducts.includes(it.id)).map((item: OrderItem) => (
                                    <div key={item.id} className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Unit: {item.barcode || item.id}</span>
                                        <button
                                          onClick={() => handleProductCheckbox(item.id)}
                                          className="text-red-500 hover:text-red-700"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>

                                      <div className="flex gap-4">
                                        <div className="flex-1">
                                          <label className="block text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 mb-1">
                                            Sold At Price *
                                          </label>
                                          <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">৳</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={soldAtPrices[item.id] || ''}
                                              onChange={(e) => handleSoldAtChange(item.id, e.target.value)}
                                              className="w-full pl-6 pr-2 py-1.5 text-sm border border-orange-200 dark:border-orange-900/30 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 outline-none font-bold transition-all"
                                              placeholder="0.00"
                                            />
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <span className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Value</span>
                                          <span className="text-sm font-black text-gray-900 dark:text-white">
                                            ৳{((returnedQuantities[item.id] || 0) * parseFloatValue(soldAtPrices[item.id])).toFixed(2)}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        {(returnedBarcodes[item.id] || []).map((bc, idx) => (
                                          <div key={idx} className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded text-[10px] border border-red-100 dark:border-red-800/50">
                                            <span className="font-mono text-red-700 dark:text-red-300">{bc.barcode}</span>
                                            <button
                                              onClick={() => handleRemoveReturnBarcode(item.id, bc.barcode)}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              <X size={12} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right sidebar - Return Summary & Refund Processing */}
            <div className="space-y-4">
              {/* Return Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Return Summary</h3>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Items selected:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{selectedProducts.length}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Return Amount:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">৳{totals.returnAmount.toFixed(2)}</span>
                  </div>

                  <div className="pt-3 border-t-2 border-gray-300 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Customer Paid:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">৳{totals.totalPaid.toFixed(2)}</span>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-500 dark:border-green-600 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-green-900 dark:text-green-300">Refund to Customer:</span>
                        <span className="font-bold text-lg text-green-600 dark:text-green-400">৳{totals.refundToCustomer.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-400 mt-1">Amount to be refunded</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Refund Processing Section */}
              {totals.refundToCustomer > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Process Refund</h3>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Cash Refund</label>
                        <button onClick={() => setShowNoteCounter(!showNoteCounter)} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/30">
                          <Calculator className="w-3 h-3" />
                          {showNoteCounter ? 'Hide' : 'Count Notes'}
                        </button>
                      </div>

                      {showNoteCounter ? (
                        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
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
                          <div className="flex justify-between items-center pt-2 border-t border-green-200 dark:border-green-800">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Total Cash:</span>
                            <span className="text-sm font-bold text-green-600 dark:text-green-400">৳{cashFromNotes.toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Cash Refund</label>
                          <input type="number" min="0" value={cashFromNotes > 0 ? cashFromNotes : refundCash} onChange={(e) => { setRefundCash(Number(e.target.value)); setNote1000(0); setNote500(0); setNote200(0); setNote100(0); setNote50(0); setNote20(0); setNote10(0); setNote5(0); setNote2(0); setNote1(0); }} className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Card Refund</label>
                        <input type="number" min="0" value={refundCard} onChange={(e) => setRefundCard(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Bkash Refund</label>
                        <input type="number" min="0" value={refundBkash} onChange={(e) => setRefundBkash(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Nagad Refund</label>
                        <input type="number" min="0" value={refundNagad} onChange={(e) => setRefundNagad(Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">Total Refunded</span>
                        <span className="text-gray-900 dark:text-white font-medium">৳{totalRefundProcessed.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">Refund Required</span>
                        <span className="text-gray-900 dark:text-white font-medium">৳{totals.refundToCustomer.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-base">
                        <span className="font-semibold text-gray-900 dark:text-white">Remaining</span>
                        <span className={`font-bold ${remainingRefund > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>৳{remainingRefund.toFixed(2)}</span>
                      </div>
                      {remainingRefund > 0.01 && <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1 animate-pulse">⚠️ Full refund required to proceed</p>}
                      {remainingRefund <= 0.01 && totalRefundProcessed > 0 && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Full refund processed</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-semibold">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessReturn}
                  disabled={isProcessing || selectedProducts.length === 0 || remainingRefund > 0.01}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  <RotateCcw className="w-5 h-5" />
                  {isProcessing ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}