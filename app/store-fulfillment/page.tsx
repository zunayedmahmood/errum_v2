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
  Store as StoreIcon,
  TrendingUp,
  Clock
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import storeFulfillmentService, { AssignedOrder, OrderItem } from '@/services/storeFulfillmentService';
import Toast from '@/components/Toast';
import ActivityLogPanel from '@/components/activity/ActivityLogPanel';

interface ScanHistoryEntry {
  barcode: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
  item_name?: string;
}

export default function StoreFulfillmentPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Store info
  const [storeInfo, setStoreInfo] = useState<{ id: number; name: string; address: string } | null>(null);
  
  // Orders list state
  const [assignedOrders, setAssignedOrders] = useState<AssignedOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('assigned_to_store,picking');

  // Lightweight preview of primary products per order card (loaded lazily)
  const [orderPreviews, setOrderPreviews] = useState<Record<number, string[]>>({});
  const previewLoadedRef = useRef<Set<number>>(new Set());
  
  // Order details state
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Scanning state
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  
  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchAssignedOrders();
    
    // Initialize audio for success sound
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/sounds/beep.mp3');
    }
  }, [statusFilter]);

  // Lazily fetch a small preview (top items) for visible orders so cards don't look empty.
  useEffect(() => {
    if (isLoadingOrders) return;

    const visible = assignedOrders
      .filter(order => 
        order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 12); // only prefetch a small set

    const toFetch = visible
      .map(o => o.id)
      .filter(id => !previewLoadedRef.current.has(id));

    if (toFetch.length === 0) return;

    let cancelled = false;

    const run = async () => {
      const concurrency = 3;
      let idx = 0;

      const worker = async () => {
        while (!cancelled && idx < toFetch.length) {
          const orderId = toFetch[idx++];
          previewLoadedRef.current.add(orderId);
          try {
            const details = await storeFulfillmentService.getOrderDetails(orderId);
            const items = details?.order?.items || [];
            const preview = items
              .map((it: any) => `${it.product_name}${it.quantity ? ` ×${it.quantity}` : ''}`)
              .filter(Boolean);

            if (!cancelled) {
              setOrderPreviews(prev => ({ ...prev, [orderId]: preview }));
            }
          } catch (e) {
            // Silent fail: preview is optional and shouldn't block the list UI
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, toFetch.length) }, () => worker()));
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [assignedOrders, searchQuery, isLoadingOrders]);

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

  const fetchAssignedOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const data = await storeFulfillmentService.getAssignedOrders({
        status: statusFilter,
        per_page: 100
      });
      
      setStoreInfo(data.store);
      setAssignedOrders(data.orders);
      
      console.log('📦 Loaded assigned orders:', {
        store: data.store.name,
        orders: data.orders.length,
        summary: data.summary
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
      const data = await storeFulfillmentService.getOrderDetails(orderId);
      setOrderDetails(data);
      setScanHistory([]);
      
      console.log('✅ Order details loaded:', data);
      
      // Auto-select first pending item
      const firstPendingItem = data.order.items.find(item => item.scan_status === 'pending');
      if (firstPendingItem) {
        setSelectedItemId(firstPendingItem.id);
      }
      
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
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const playErrorSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8ti...');
    audio.play().catch(e => console.log('Error sound failed'));
  };

  const addToScanHistory = (barcode: string, status: 'success' | 'warning' | 'error', message: string, itemName?: string) => {
    const entry: ScanHistoryEntry = {
      barcode,
      status,
      message,
      timestamp: new Date().toLocaleTimeString(),
      item_name: itemName
    };
    setScanHistory(prev => [entry, ...prev.slice(0, 49)]);
  };

  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentBarcode.trim()) {
      handleBarcodeScan(currentBarcode.trim());
      setCurrentBarcode('');
    }
  };

  const handleBarcodeScan = async (barcode: string) => {
    if (!orderDetails || !selectedItemId) {
      displayToast('Please select an item to scan', 'warning');
      return;
    }

    const selectedItem = orderDetails.order.items.find((item: OrderItem) => item.id === selectedItemId);
    
    if (!selectedItem) {
      displayToast('Selected item not found', 'error');
      return;
    }

    if (selectedItem.scan_status === 'scanned') {
      displayToast('This item has already been scanned', 'warning');
      addToScanHistory(barcode, 'warning', 'Item already scanned', selectedItem.product_name);
      return;
    }

    setIsProcessing(true);

    try {
      console.log('🔍 Scanning barcode:', barcode, 'for item:', selectedItem.product_name);

      const result = await storeFulfillmentService.scanBarcode(orderDetails.order.id, {
        barcode: barcode,
        order_item_id: selectedItemId
      });

      console.log('✅ Scan successful:', result);

      // Update order details with new data
      await fetchOrderDetails(orderDetails.order.id);

      displayToast(
        `✅ ${selectedItem.product_name} scanned successfully!`,
        'success'
      );
      
      addToScanHistory(
        barcode,
        'success',
        `Scanned successfully (${result.fulfillment_progress.fulfilled_items}/${result.fulfillment_progress.total_items})`,
        selectedItem.product_name
      );
      
      playSuccessSound();

      // Auto-select next pending item
      setTimeout(() => {
        if (orderDetails?.order.items) {
          const nextPendingItem = orderDetails.order.items.find(
            (item: OrderItem) => item.scan_status === 'pending' && item.id !== selectedItemId
          );
          if (nextPendingItem) {
            setSelectedItemId(nextPendingItem.id);
          }
        }
      }, 500);

      // Auto-focus input for next scan
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);

    } catch (error: any) {
      console.error('❌ Scan error:', error);
      displayToast(error.message || 'Barcode scan failed', 'error');
      addToScanHistory(barcode, 'error', error.message, selectedItem.product_name);
      playErrorSound();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReadyForShipment = async () => {
    if (!orderDetails) return;

    const canShip = orderDetails.fulfillment_status.can_ship;
    
    if (!canShip) {
      displayToast('Please scan all items before marking as ready for shipment', 'warning');
      return;
    }

    setIsProcessing(true);

    try {
      await storeFulfillmentService.markReadyForShipment(orderDetails.order.id);
      
      displayToast('✅ Order marked as ready for shipment!', 'success');
      
      // Go back to order list after 2 seconds
      setTimeout(() => {
        setSelectedOrderId(null);
        setOrderDetails(null);
        setScanHistory([]);
        setSelectedItemId(null);
        fetchAssignedOrders();
      }, 2000);
      
    } catch (error: any) {
      console.error('❌ Mark ready for shipment error:', error);
      displayToast(error.message || 'Failed to mark as ready for shipment', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredOrders = assignedOrders.filter(order => 
    order.order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Lazily load a small "primary products" preview for order cards.
  // The list endpoint may not include items, so we fetch per-order details in the background
  // with a tight concurrency limit to keep the UI snappy.
  useEffect(() => {
    let cancelled = false;

    const candidateIds = filteredOrders
      .slice(0, 12)
      .map(o => o.id)
      .filter(id => !previewLoadedRef.current.has(id));

    if (candidateIds.length === 0) return;

    const concurrency = 3;
    let cursor = 0;

    const worker = async () => {
      while (!cancelled) {
        const orderId = candidateIds[cursor++];
        if (!orderId) break;

        previewLoadedRef.current.add(orderId);
        try {
          const details = await storeFulfillmentService.getOrderDetails(orderId);
          const items = details?.order?.items || [];

          const preview = items
            .slice(0, 3)
            .map((it: any) => {
              const qty = typeof it.quantity === 'number' ? it.quantity : parseFloat(String(it.quantity || 0));
              const name = it.product_name || it.product?.name || 'Item';
              return qty > 1 ? `${name} ×${qty}` : `${name}`;
            });

          if (!cancelled && preview.length > 0) {
            setOrderPreviews(prev => ({ ...prev, [orderId]: preview }));
          }
        } catch (e) {
          // Silently ignore preview failures (card still works; full details load on click)
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, candidateIds.length) }, () => worker());
    Promise.all(workers).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [filteredOrders]);

  // ORDER LIST VIEW
  if (!selectedOrderId) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header 
              darkMode={darkMode} 
              setDarkMode={setDarkMode} 
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
            />
            
            <main className="flex-1 overflow-auto p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                      📦 Store Fulfillment
                    </h1>
                    {storeInfo && (
                      <p className="mt-2 text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <StoreIcon className="h-4 w-4" />
                        {storeInfo.name} • Scan barcodes to fulfill assigned orders
                      </p>
                    )}
                  </div>
                  <button
                    onClick={fetchAssignedOrders}
                    disabled={isLoadingOrders}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {/* Status Filter Tabs */}
                <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
                  <button
                    onClick={() => setStatusFilter('assigned_to_store,picking')}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      statusFilter === 'assigned_to_store,picking'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Active Orders
                  </button>
                  <button
                    onClick={() => setStatusFilter('assigned_to_store')}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      statusFilter === 'assigned_to_store'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    New Assignments
                  </button>
                  <button
                    onClick={() => setStatusFilter('picking')}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      statusFilter === 'picking'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    In Progress
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
                      {searchQuery ? 'No matching orders' : 'No assigned orders'}
                    </p>
                    {!searchQuery && (
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        All assigned orders have been fulfilled
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredOrders.map(order => {
                      const progress = order.fulfillment_progress;
                      const isNew = order.status === 'assigned_to_store';
                      const totalItems = (progress?.total_items ?? order.items?.length ?? 0) as number;
                      const preview = orderPreviews[order.id] || (order.items?.length ? order.items.map((it: any) => {
                        const qty = typeof it.quantity === 'number' ? it.quantity : parseFloat(String(it.quantity || 0));
                        const name = it.product_name || it.product?.name || 'Item';
                        return qty > 1 ? `${name} ×${qty}` : `${name}`;
                      }) : []);
                      
                      return (
                        <div
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          className="p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer transition-all hover:border-blue-500 hover:shadow-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                  {order.order_number}
                                </h3>
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                  isNew
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                                }`}>
                                  {isNew ? '🆕 New' : '🔄 Picking'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                👤 {order.customer?.name} • 📦 {totalItems} items
                              </p>

                              {/* Primary products preview */}
                              {preview.length > 0 ? (
                                <div className="mt-2 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                                  <div className="flex flex-wrap gap-2">
                                    {preview.map((label, idx) => (
                                      <span
                                        key={`${order.id}-prev-${idx}`}
                                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                                      >
                                        {label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                  Tap to view products
                                </p>
                              )}
                              
                              {/* Progress Bar */}
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  <span>Fulfillment Progress</span>
                                  <span className="font-semibold">{progress.percentage.toFixed(0)}%</span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                  <div
                                    className={`h-2 transition-all ${
                                      progress.percentage === 100
                                        ? 'bg-green-500'
                                        : progress.percentage > 0
                                        ? 'bg-blue-500'
                                        : 'bg-gray-300'
                                    }`}
                                    style={{ width: `${progress.percentage}%` }}
                                  />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {progress.fulfilled_items} / {progress.total_items} items scanned
                                </p>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                ৳{parseFloat(String(order.total_amount)).toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1 justify-end">
                                <Clock className="h-3 w-3" />
                                {new Date(order.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>

        {showToast && (
          <Toast 
            message={toastMessage} 
            type={toastType} 
            onClose={() => setShowToast(false)} 
          />
        )}
      </div>
    );
  }

  // FULFILLMENT VIEW
  const progress = orderDetails?.fulfillment_status;
  const order = orderDetails?.order;

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            darkMode={darkMode} 
            setDarkMode={setDarkMode} 
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          />
          
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setSelectedOrderId(null);
                      setOrderDetails(null);
                      setScanHistory([]);
                      setSelectedItemId(null);
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ArrowLeft className="text-gray-900 dark:text-white" />
                  </button>
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                      {order?.order_number || 'Loading...'}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {order?.customer?.name} • {order?.items?.length || 0} items
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsScanning(!isScanning)}
                  className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    isScanning
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  <Scan className="h-5 w-5" />
                  {isScanning ? 'Stop Scanning' : 'Start Scanning'}
                </button>
              </div>

              {/* Progress Bar */}
              {progress && (
                <div className="mb-6 p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Progress: {progress.fulfilled_items} / {progress.total_items} items scanned
                    </span>
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {progress.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-4 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-4 bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 ease-out"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  {progress.is_complete && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                      ✅ All items scanned! Ready to mark for shipment.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Order Items */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Order Items
                  </h2>
                  <div className="space-y-3">
                    {isLoadingDetails ? (
                      <div className="text-center py-8">
                        <Loader className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                      </div>
                    ) : (
                      order?.items?.map((item: OrderItem) => {
                        const isScanned = item.scan_status === 'scanned';
                        const isSelected = selectedItemId === item.id;
                        
                        return (
                          <div
                            key={item.id}
                            onClick={() => !isScanned && setSelectedItemId(item.id)}
                            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                              isScanned
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-500 cursor-default'
                                : isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:border-blue-400'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-gray-900 dark:text-white">
                                    {item.product_name}
                                  </h3>
                                  {isSelected && !isScanned && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  SKU: {item.product_sku} • Qty: {item.quantity}
                                </p>
                                {isScanned && item.barcode && (
                                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono">
                                    ✓ Scanned: {item.barcode.barcode}
                                  </p>
                                )}
                                {!isScanned && (
                                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                    {item.available_barcodes_count} barcode(s) available
                                  </p>
                                )}
                              </div>
                              <div className="ml-4">
                                {isScanned ? (
                                  <CheckCircle className="h-8 w-8 text-green-600" />
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
                    onClick={handleMarkReadyForShipment}
                    disabled={isProcessing || !progress?.can_ship}
                    className={`w-full mt-6 px-6 py-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                      progress?.can_ship && !isProcessing
                        ? 'bg-green-600 hover:bg-green-700 shadow-lg'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : progress?.can_ship ? (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Mark Ready for Shipment
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5" />
                        Scan All Items First ({progress?.fulfilled_items}/{progress?.total_items})
                      </>
                    )}
                  </button>
                </div>

	                {/* Activity for this order */}
	                {order?.id ? (
	                  <div className="mt-6">
	                    <ActivityLogPanel
	                      title="Order Activity"
	                      module="orders"
	                      modelName="Order"
	                      entityId={order.id}
	                      limit={10}
	                    />
	                  </div>
	                ) : null}

                {/* Right Column - Scanning Interface */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Barcode Scanner
                  </h2>
                  
                  {/* Selected Item Info */}
                  {selectedItemId && (
                    <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                        Scanning for:
                      </p>
                      <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                        {order?.items?.find((item: OrderItem) => item.id === selectedItemId)?.product_name || 'Unknown'}
                      </p>
                    </div>
                  )}
                  
                  {/* Barcode Input */}
                  <div className="p-6 rounded-lg mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                      Scan or Enter Barcode
                    </label>
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={currentBarcode}
                      onChange={(e) => setCurrentBarcode(e.target.value)}
                      onKeyPress={handleBarcodeInput}
                      disabled={!isScanning || !selectedItemId}
                      placeholder={
                        !selectedItemId 
                          ? "Select an item first" 
                          : isScanning 
                          ? "Scan barcode or type manually..." 
                          : "Start scanning first"
                      }
                      className={`w-full px-4 py-3 rounded-lg border-2 text-lg font-mono transition-all ${
                        isScanning && selectedItemId
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
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            Scanner Active
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Scan History */}
                  <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Scan History
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        {scanHistory.length} scan{scanHistory.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {scanHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <Scan className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-500">
                            No scans yet
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                            Start scanning to see history
                          </p>
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
                                  <span className={`text-xs font-mono font-semibold truncate ${
                                    scan.status === 'success' ? 'text-green-700 dark:text-green-400' :
                                    scan.status === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                                    'text-red-700 dark:text-red-400'
                                  }`}>
                                    {scan.barcode}
                                  </span>
                                </div>
                                {scan.item_name && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 pl-6 mb-1">
                                    {scan.item_name}
                                  </p>
                                )}
                                <p className="text-xs text-gray-700 dark:text-gray-300 pl-6">
                                  {scan.message}
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0">
                                {scan.timestamp}
                              </span>
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
                      <p className="text-xl font-bold text-green-700 dark:text-green-400">
                        {scanHistory.filter(s => s.status === 'success').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Warning</span>
                      </div>
                      <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">
                        {scanHistory.filter(s => s.status === 'warning').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">Error</span>
                      </div>
                      <p className="text-xl font-bold text-red-700 dark:text-red-400">
                        {scanHistory.filter(s => s.status === 'error').length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <Toast 
          message={toastMessage} 
          type={toastType} 
          onClose={() => setShowToast(false)} 
        />
      )}

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