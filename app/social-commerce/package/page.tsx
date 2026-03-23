'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  Package,
  Scan,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ArrowLeft,
  Loader,
  RefreshCw,
  ShoppingBag,
  Globe,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import orderService from '@/services/orderService';
import barcodeService from '@/services/barcodeService';
import Toast from '@/components/Toast';

interface ScannedItemTracking {
  required: number;
  scanned: string[]; // Product names for display
  barcodes: string[]; // Actual barcode values
}

interface ScanHistoryEntry {
  barcode: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

// Helper function to parse prices correctly (handles "৳2,000.00", "2,000", etc.)
const parsePrice = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, ''); // removes ৳, commas, spaces
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
};

const formatBDT = (value: any, decimals: 0 | 2 = 0) => {
  const amount = parsePrice(value);

  try {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    const fixed = amount.toFixed(decimals);
    const parts = fixed.split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `৳${intPart}${decimals ? '.' + (parts[1] || '00') : ''}`;
  }
};

export default function WarehouseFulfillmentPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [scannedItems, setScannedItems] = useState<Record<number, ScannedItemTracking>>({});
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchPendingOrders();

    // Initialize audio for success sound
    if (typeof window !== 'undefined') {
      // Add /public/sounds/beep.mp3
      audioRef.current = new Audio('/sounds/beep.mp3');
    }
  }, []);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails(selectedOrderId);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    if (isScanning && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [isScanning]);

  const fetchPendingOrders = async () => {
    setIsLoadingOrders(true);
    try {
      // Fetch both social_commerce and ecommerce orders
      const [socialCommerceResponse, ecommerceResponse] = await Promise.all([
        orderService.getPendingFulfillment({ per_page: 100, order_type: 'social_commerce' }),
        orderService.getPendingFulfillment({ per_page: 100, order_type: 'ecommerce' }),
      ]);

      const allOrders = [...(socialCommerceResponse.data || []), ...(ecommerceResponse.data || [])];

      // Sort by date, newest first
      allOrders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());

      setPendingOrders(allOrders);
      console.log('📦 Loaded pending orders:', {
        social_commerce: socialCommerceResponse.data?.length || 0,
        ecommerce: ecommerceResponse.data?.length || 0,
        total: allOrders.length,
      });
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      displayToast('Error loading orders: ' + error.message, 'error');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const fetchOrderDetails = async (orderId: number) => {
    setIsLoadingDetails(true);
    try {
      const order = await orderService.getById(orderId);
      setOrderDetails(order);
      console.log('✅ Order details loaded:', order);

      // Initialize scanned items tracking
      const initialScanned: Record<number, ScannedItemTracking> = {};
      order.items?.forEach((item: any) => {
        initialScanned[item.id] = {
          required: item.quantity,
          scanned: [],
          barcodes: [],
        };
      });
      setScannedItems(initialScanned);
      setScanHistory([]);
    } catch (error: any) {
      console.error('Error fetching order details:', error);
      displayToast('Error loading order: ' + error.message, 'error');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const displayToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const playSuccessSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((e) => console.log('Audio play failed:', e));
    }
  };

  const playErrorSound = () => {
    // Different pitch for errors (tiny embedded wav)
    const audio = new Audio(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8ti...'
    );
    audio.play().catch(() => console.log('Error sound failed'));
  };

  const addToScanHistory = (barcode: string, status: 'success' | 'warning' | 'error', message: string) => {
    const entry: ScanHistoryEntry = {
      barcode,
      status,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setScanHistory((prev) => [entry, ...prev.slice(0, 49)]); // Keep last 50 scans
  };

  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentBarcode.trim()) {
      handleBarcodeScan(currentBarcode.trim());
      setCurrentBarcode('');
    }
  };

  const handleBarcodeScan = async (barcode: string) => {
    if (!orderDetails) {
      displayToast('No order selected', 'error');
      return;
    }

    try {
      console.log('🔍 Scanning barcode:', barcode);

      // Validate barcode format
      if (barcode.length < 5) {
        displayToast('Invalid barcode format', 'error');
        addToScanHistory(barcode, 'error', 'Invalid format');
        playErrorSound();
        return;
      }

      // Check if barcode already scanned in this order
      const alreadyScanned = Object.values(scannedItems).some((item) => item.barcodes.includes(barcode));
      if (alreadyScanned) {
        displayToast('⚠️ Barcode already scanned for this order', 'warning');
        addToScanHistory(barcode, 'warning', 'Duplicate scan');
        playErrorSound();
        return;
      }

      // Scan barcode to get product info
      const scanResult = await barcodeService.scanBarcode(barcode);

      if (!scanResult.success || !scanResult.data || !scanResult.data.product) {
        displayToast('❌ Barcode not found in system', 'error');
        addToScanHistory(barcode, 'error', 'Barcode not found');
        playErrorSound();
        return;
      }

      const scannedProduct = scanResult.data.product;
      const scannedBatch = scanResult.data.current_batch;
      const isAvailable = scanResult.data.is_available;

      console.log('✅ Barcode valid:', {
        product: scannedProduct.name,
        batch: scannedBatch?.batch_number,
        available: isAvailable,
      });

      // Check if product is available (not sold/defective)
      if (!isAvailable) {
        displayToast('❌ This barcode is not available (already sold or inactive)', 'error');
        addToScanHistory(barcode, 'error', `${scannedProduct.name} - Not available`);
        playErrorSound();
        return;
      }

      // Find matching order item
      // Normalize ids (handles product_id vs product.id, string vs number)
const getProductId = (item: any) =>
  Number(item?.product_id ?? item?.productId ?? item?.product?.id ?? 0) || 0;

const getBatchId = (item: any) =>
  Number(item?.batch_id ?? item?.batchId ?? item?.batch?.id ?? 0) || 0;

const scannedProductId = Number(scannedProduct?.id ?? 0) || 0;
const scannedBatchId = Number(scannedBatch?.id ?? 0) || 0;

// Find candidates by product first
const candidates = (orderDetails.items || []).filter((item: any) => {
  return getProductId(item) === scannedProductId;
});

if (candidates.length === 0) {
  displayToast(`❌ "${scannedProduct.name}" not in this order`, 'error');
  addToScanHistory(barcode, 'error', `${scannedProduct.name} - Not in order`);
  playErrorSound();
  return;
}

// If order item has batch assigned, enforce it. If not assigned, allow any batch.
const candidateWithBatchRules = candidates.filter((item: any) => {
  const orderItemBatchId = getBatchId(item);

  // If order item has NO batch, accept any scanned batch
  if (!orderItemBatchId) return true;

  // If scanned batch missing, reject (order expects a batch)
  if (!scannedBatchId) return false;

  // Otherwise enforce match
  return orderItemBatchId === scannedBatchId;
});

// Choose an item that still needs scanning (important when same product appears multiple times)
const matchingItem = candidateWithBatchRules.find((item: any) => {
  const track = scannedItems[item.id];
  const required = Number(item.quantity || 0);
  const already = track?.scanned.length || 0;
  return already < required;
});

if (!matchingItem) {
  displayToast(`⚠️ "${scannedProduct.name}" is already fully scanned (or batch mismatch)`, 'warning');
  addToScanHistory(barcode, 'warning', `${scannedProduct.name} - Already complete / batch mismatch`);
  playErrorSound();
  return;
}


      // Check if item already fully scanned
      const currentScanned = scannedItems[matchingItem.id];
      if (currentScanned.scanned.length >= currentScanned.required) {
        displayToast(`⚠️ Item already complete (${currentScanned.required}/${currentScanned.required})`, 'warning');
        addToScanHistory(barcode, 'warning', `${scannedProduct.name} - Already complete`);
        playErrorSound();
        return;
      }

      // Add barcode to scanned list
      const newScannedCount = currentScanned.scanned.length + 1;
      setScannedItems((prev) => ({
        ...prev,
        [matchingItem.id]: {
          ...prev[matchingItem.id],
          scanned: [...prev[matchingItem.id].scanned, scannedProduct.name],
          barcodes: [...prev[matchingItem.id].barcodes, barcode],
        },
      }));

      displayToast(`✅ ${scannedProduct.name} (${newScannedCount}/${currentScanned.required})`, 'success');
      addToScanHistory(barcode, 'success', `${scannedProduct.name} - ${newScannedCount}/${currentScanned.required}`);
      playSuccessSound();

      // Auto-focus input for next scan
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } catch (error: any) {
      console.error('❌ Scan error:', error);
      displayToast('Scan error: ' + error.message, 'error');
      addToScanHistory(barcode, 'error', error.message);
      playErrorSound();
    }
  };

  const handleFulfillOrder = async () => {
    if (!orderDetails) return;

    // Check if all items are fully scanned
    const allItemsScanned = orderDetails.items?.every((item: any) => {
      const scanned = scannedItems[item.id];
      return scanned && scanned.scanned.length === scanned.required;
    });

    if (!allItemsScanned) {
      displayToast('⚠️ Please scan all required items before fulfilling', 'warning');

      // Show which items are missing (debug)
      const missingItems = orderDetails.items?.filter((item: any) => {
        const scanned = scannedItems[item.id];
        return !scanned || scanned.scanned.length < scanned.required;
      });

      console.log('❌ Missing items:', missingItems);
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare fulfillment payload
      const fulfillments = orderDetails.items.map((item: any) => ({
        order_item_id: item.id,
        barcodes: scannedItems[item.id].barcodes,
      }));

      console.log('📦 Fulfilling order:', orderDetails.order_number);
      console.log('Fulfillments:', fulfillments);

      // Call fulfill API
      const fulfillResult = await orderService.fulfill(orderDetails.id, { fulfillments });

      console.log('✅ Order fulfilled:', fulfillResult);
      displayToast('✅ Order fulfilled successfully!', 'success');

      // Wait 1 second then auto-complete the order
      setTimeout(async () => {
        try {
          console.log('🚀 Completing order...');
          await orderService.complete(orderDetails.id);
          console.log('✅ Order completed and inventory reduced');
          displayToast('✅ Order completed! Inventory updated.', 'success');

          // Reset and go back to order list after 2 seconds
          setTimeout(() => {
            setSelectedOrderId(null);
            setOrderDetails(null);
            setScannedItems({});
            setScanHistory([]);
            fetchPendingOrders();
          }, 2000);
        } catch (completeError: any) {
          console.error('❌ Complete error:', completeError);
          displayToast('⚠️ Fulfilled but completion failed: ' + completeError.message, 'error');

          // Still go back after showing error
          setTimeout(() => {
            setSelectedOrderId(null);
            fetchPendingOrders();
          }, 3000);
        }
      }, 1000);
    } catch (error: any) {
      console.error('❌ Fulfill error:', error);
      displayToast('❌ Fulfillment failed: ' + error.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getOrderProgress = () => {
    if (!orderDetails) return { scanned: 0, total: 0, percentage: 0 };

    let scanned = 0;
    let total = 0;

    orderDetails.items?.forEach((item: any) => {
      total += Number(item.quantity || 0);
      scanned += scannedItems[item.id]?.scanned.length || 0;
    });

    return {
      scanned,
      total,
      percentage: total > 0 ? (scanned / total) * 100 : 0,
    };
  };

  const getOrderTypeBadge = (orderType: string) => {
    if (orderType === 'social_commerce') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          <ShoppingBag className="h-3.5 w-3.5" />
          Social Commerce
        </span>
      );
    }

    if (orderType === 'ecommerce') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Globe className="h-3.5 w-3.5" />
          E-Commerce
        </span>
      );
    }

    return null;
  };

  const filteredOrders = pendingOrders.filter(
    (order) =>
      order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const progress = getOrderProgress();

  // ORDER LIST VIEW
  if (!selectedOrderId) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

            <main className="flex-1 overflow-auto p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">📦 Warehouse Fulfillment</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Scan barcodes to fulfill pending social commerce & e-commerce orders
                    </p>
                  </div>
                  <button
                    onClick={fetchPendingOrders}
                    disabled={isLoadingOrders}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {/* Search */}
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by order number or customer name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Orders List */}
                {isLoadingOrders ? (
                  <div className="text-center py-12">
                    <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Loading orders...</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <Package className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                      {searchQuery ? 'No matching orders' : 'No pending fulfillment orders'}
                    </p>
                    {!searchQuery && (
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">All orders have been fulfilled or completed</p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className="p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer transition-all hover:border-blue-500 hover:shadow-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{order.order_number}</h3>
                              {getOrderTypeBadge(order.order_type)}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {order.customer?.name} • {order.items?.length || 0} item(s)
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(order.order_date).toLocaleDateString()} - {order.store?.name}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              Pending Fulfillment
                            </span>

                            {/* ✅ FIXED PRICE RENDERING */}
                            <p className="text-lg font-bold mt-2 text-gray-900 dark:text-white">
                              {formatBDT(order.total_amount, 0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>

        {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}
      </div>
    );
  }

  // FULFILLMENT VIEW
  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setSelectedOrderId(null);
                      setOrderDetails(null);
                      setScannedItems({});
                      setScanHistory([]);
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ArrowLeft className="text-gray-900 dark:text-white" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                        {orderDetails?.order_number || 'Loading...'}
                      </h1>
                      {orderDetails && getOrderTypeBadge(orderDetails.order_type)}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {orderDetails?.customer?.name} • {orderDetails?.items?.length || 0} items
                      {orderDetails?.total_amount != null && (
                        <span className="ml-2 text-gray-500 dark:text-gray-500">• Total: {formatBDT(orderDetails.total_amount, 0)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsScanning(!isScanning)}
                  className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    isScanning ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  <Scan className="h-5 w-5" />
                  {isScanning ? 'Stop Scanning' : 'Start Scanning'}
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mb-6 p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Progress: {progress.scanned} / {progress.total} items scanned
                  </span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{progress.percentage.toFixed(0)}%</span>
                </div>
                <div className="w-full h-4 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-4 bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                {progress.percentage === 100 && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                    ✅ All items scanned! Ready to fulfill order.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Order Items */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Order Items</h2>
                  <div className="space-y-3">
                    {isLoadingDetails ? (
                      <div className="text-center py-8">
                        <Loader className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                      </div>
                    ) : (
                      orderDetails?.items?.map((item: any) => {
                        const scanned = scannedItems[item.id];
                        const isComplete = scanned?.scanned.length === scanned?.required;
                        const scannedCount = scanned?.scanned.length || 0;

                        // ✅ Pricing calculations (safe + consistent)
                        const unit = parsePrice(item.unit_price);
                        const discount = parsePrice(item.discount_amount);
                        const qty = Number(item.quantity || 0);
                        const lineTotal =
                          item.total_amount !== undefined && item.total_amount !== null
                            ? parsePrice(item.total_amount)
                            : Math.max(unit * qty - discount, 0);

                        return (
                          <div
                            key={item.id}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              isComplete
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                                : scannedCount > 0
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-medium text-gray-900 dark:text-white">{item.product_name}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">SKU: {item.product_sku}</p>
                                {item.batch_number && <p className="text-xs text-gray-500 dark:text-gray-500">Batch: {item.batch_number}</p>}

                                {/* ✅ Fixed / Added pricing UI */}
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                  <div className="text-gray-600 dark:text-gray-400">
                                    Unit:{' '}
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {formatBDT(unit, 0)}
                                    </span>
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400">
                                    Discount:{' '}
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {formatBDT(discount, 0)}
                                    </span>
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400 sm:text-right">
                                    Line:{' '}
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {formatBDT(lineTotal, 0)}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-2 flex items-center gap-2">
                                  <div
                                    className={`text-sm font-semibold ${
                                      isComplete
                                        ? 'text-green-600 dark:text-green-400'
                                        : scannedCount > 0
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-gray-600 dark:text-gray-400'
                                    }`}
                                  >
                                    {scannedCount} / {scanned?.required || 0} scanned
                                  </div>
                                  {scannedCount > 0 && !isComplete && (
                                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className="h-2 bg-blue-500 transition-all"
                                        style={{ width: `${(scannedCount / (scanned?.required || 1)) * 100}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="ml-4">
                                {isComplete ? (
                                  <CheckCircle className="h-8 w-8 text-green-600" />
                                ) : scannedCount > 0 ? (
                                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{scannedCount}</span>
                                  </div>
                                ) : (
                                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    onClick={handleFulfillOrder}
                    disabled={isProcessing || progress.percentage !== 100}
                    className={`w-full mt-6 px-6 py-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                      progress.percentage === 100 && !isProcessing ? 'bg-green-600 hover:bg-green-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Processing Order...
                      </>
                    ) : progress.percentage === 100 ? (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Complete Fulfillment & Update Inventory
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5" />
                        Scan All Items First ({progress.scanned}/{progress.total})
                      </>
                    )}
                  </button>
                </div>

                {/* Right Column - Scanning Interface */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Barcode Scanner</h2>

                  {/* Barcode Input */}
                  <div className="p-6 rounded-lg mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Scan or Enter Barcode</label>
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={currentBarcode}
                      onChange={(e) => setCurrentBarcode(e.target.value)}
                      onKeyPress={handleBarcodeInput}
                      disabled={!isScanning}
                      placeholder={isScanning ? 'Scan barcode or type manually...' : 'Start scanning first'}
                      className={`w-full px-4 py-3 rounded-lg border-2 text-lg font-mono transition-all ${
                        isScanning
                          ? 'bg-white dark:bg-gray-700 border-blue-500 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'
                          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 cursor-not-allowed'
                      } focus:outline-none`}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {isScanning ? '📱 Scan barcode or type manually and press Enter' : '⏸️ Click "Start Scanning" to begin'}
                      </p>
                      {isScanning && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">Scanner Active</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={() => {
                        setScanHistory([]);
                        displayToast('Scan history cleared', 'info');
                      }}
                      disabled={scanHistory.length === 0}
                      className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Clear History
                    </button>
                    <button
                      onClick={() => {
                        setScannedItems((prev) => {
                          const reset: Record<number, ScannedItemTracking> = {};
                          orderDetails?.items?.forEach((item: any) => {
                            reset[item.id] = {
                              required: item.quantity,
                              scanned: [],
                              barcodes: [],
                            };
                          });
                          return reset;
                        });
                        setScanHistory([]);
                        displayToast('All scans reset', 'info');
                      }}
                      disabled={progress.scanned === 0}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reset All Scans
                    </button>
                  </div>

                  {/* Scan History */}
                  <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Scan History</h3>
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        {scanHistory.length} scan{scanHistory.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {scanHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <Scan className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-500">No scans yet</p>
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Start scanning to see history</p>
                        </div>
                      ) : (
                        scanHistory.map((scan, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border transition-all ${
                              scan.status === 'success'
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                : scan.status === 'warning'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {scan.status === 'success' ? (
                                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : scan.status === 'warning' ? (
                                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )}
                                  <span
                                    className={`text-xs font-mono font-semibold truncate ${
                                      scan.status === 'success'
                                        ? 'text-green-700 dark:text-green-400'
                                        : scan.status === 'warning'
                                        ? 'text-yellow-700 dark:text-yellow-400'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}
                                  >
                                    {scan.barcode}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 pl-6">{scan.message}</p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0">{scan.timestamp}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Success</span>
                      </div>
                      <p className="text-xl font-bold text-green-700 dark:text-green-400">{scanHistory.filter((s) => s.status === 'success').length}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Warning</span>
                      </div>
                      <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{scanHistory.filter((s) => s.status === 'warning').length}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">Error</span>
                      </div>
                      <p className="text-xl font-bold text-red-700 dark:text-red-400">{scanHistory.filter((s) => s.status === 'error').length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 3px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a5568;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #718096;
        }
      `}</style>
    </div>
  );
}
