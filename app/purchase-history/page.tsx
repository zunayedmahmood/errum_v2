'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, Trash2, MoreVertical, ArrowRightLeft, RotateCcw, Printer } from 'lucide-react';
import { computeMenuPosition } from '@/lib/menuPosition';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import orderService, { type OrderFilters } from '@/services/orderService';
import productReturnService, { type CreateReturnRequest } from '@/services/productReturnService';
import refundService, { type CreateRefundRequest } from '@/services/refundService';
import ReturnProductModal from '@/components/sales/ReturnProductModal';
import ExchangeProductModal from '@/components/sales/ExchangeProductModal';
import axiosInstance from '@/lib/axios';
import { checkQZStatus, printReceipt } from '@/lib/qz-tray';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from "@/contexts/ThemeContext";
import storeService from '@/services/storeService';

interface PurchaseHistoryOrderItem {
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

interface PurchaseHistoryOrder {
  id: number;
  order_number: string;
  order_type: string;
  order_type_label: string;
  status: string;
  payment_status: string;
  customer?: {
    id: number;
    name: string;
    phone: string;
    email?: string;
    customer_code: string;
  };
  store: {
    id: number;
    name: string;
  };
  salesman?: {
    id: number;
    name: string;
  };
  subtotal: string;
  subtotal_amount: string;
  tax_amount: string;
  discount_amount: string;
  shipping_amount: string;
  shipping_cost: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  is_installment: boolean;
  order_date: string;
  created_at: string;
  items?: PurchaseHistoryOrderItem[];
  payments?: Array<{
    id: number;
    amount: string;
    payment_method: string;
    payment_type: string;
    status: string;
    processed_by?: string;
    created_at: string;
  }>;
}

interface Store {
  id: number;
  name: string;
  location: string;
}

export default function PurchaseHistoryPage() {
  const { user, scopedStoreId, canSelectStore } = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<number | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ [key: number]: string }>({});
  const [loading, setLoading] = useState(true);
  // Legacy state kept for minimal refactor
  const [userRole, setUserRole] = useState<string>('');
  const [userStoreId, setUserStoreId] = useState<string>('');
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Modal states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<any | null>(null);

  // Initialize roles and initial store selection
  useEffect(() => {
    if (!user) return;

    const roleSlug = user?.role?.slug || '';
    setUserRole(roleSlug);

    const storeId = scopedStoreId ? String(scopedStoreId) : (user?.store_id || '');
    setUserStoreId(storeId);

    // Auto-select store if scoped (security requirement)
    if (scopedStoreId) {
      setSelectedStore(String(scopedStoreId));
    }

    fetchStores();
  }, [user?.id, scopedStoreId]);

  // Fetch orders when relevant filters change
  useEffect(() => {
    fetchOrders();
  }, [selectedStore, startDate, endDate, searchTerm]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const filters: OrderFilters = {
        order_type: 'counter',
        per_page: 50,
      };

      // Security: Always prioritize scopedStoreId (enforced for non-admins)
      if (scopedStoreId) {
        filters.store_id = scopedStoreId;
      } else if (selectedStore) {
        // Admins can filter by any store from the dropdown
        filters.store_id = Number(selectedStore);
      }

      if (searchTerm) filters.search = searchTerm;
      if (startDate) filters.date_from = startDate;
      if (endDate) filters.date_to = endDate;

      const result = await orderService.getAll(filters);
      setOrders(result.data);

    } catch (error) {
      console.error('❌ Failed to fetch orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      // If store-scoped/restricted, only fetch user's assigned store details for the display field
      if (!canSelectStore && (scopedStoreId || user?.store_id)) {
        try {
          const targetId = scopedStoreId || user?.store_id;
          const res: any = await storeService.getStore(Number(targetId));
          const storeObj = res?.data ?? res;
          if (storeObj) {
            setStores([
              {
                id: storeObj.id,
                name: storeObj.name,
                location: storeObj.address || storeObj.location || '',
              },
            ]);
            return;
          }
        } catch {
          // fallback to empty
        }
      }

      // If user has multi-store access (admin/moderator), fetch all stores for dropdown
      if (canSelectStore) {
        const response = await axiosInstance.get('/stores');
        const result = response.data;
        let storesData: Store[] = result?.success && Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
        setStores(storesData);
      } else {
        setStores([]);
      }

      const response = await axiosInstance.get('/stores');
      const result = response.data;

      let storesData: Store[] = [];
      if (result?.success && Array.isArray(result.data)) {
        storesData = result.data;
      } else if (Array.isArray(result)) {
        storesData = result;
      }

      setStores(storesData);
    } catch (error) {
      console.error('Failed to fetch stores:', error);
      setStores([]);
    }
  };

  const handleExpandOrder = async (orderId: number) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      return;
    }

    setExpandedOrder(orderId);
    const order = orders.find(o => o.id === orderId);

    if (order?.items && order.items.length > 0) {
      return;
    }

    setLoadingDetails(orderId);
    setErrorDetails(prev => ({ ...prev, [orderId]: '' }));

    try {
      const fullOrder = await orderService.getById(orderId);
      setOrders(orders.map(o => o.id === orderId ? fullOrder : o));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load order details';
      setErrorDetails(prev => ({ ...prev, [orderId]: errorMessage }));
    } finally {
      setLoadingDetails(null);
    }
  };

  const handleDelete = async (orderId: number) => {
    if (!confirm('Are you sure you want to delete this order?')) return;

    try {
      await orderService.cancel(orderId, 'Deleted by user');
      setOrders(orders.filter(o => o.id !== orderId));
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order. Please try again.');
    }
  };

  const handleReturn = async (order: PurchaseHistoryOrder) => {
    setActiveMenu(null);

    if (!order.items || order.items.length === 0) {
      try {
        const fullOrder = await orderService.getById(order.id);
        setSelectedOrderForAction(fullOrder);
      } catch (error) {
        console.error('Failed to load order details:', error);
        alert('Failed to load order details. Please try again.');
        return;
      }
    } else {
      setSelectedOrderForAction(order);
    }

    setShowReturnModal(true);
  };

  const handleExchange = async (order: PurchaseHistoryOrder) => {
    setActiveMenu(null);

    if (!order.items || order.items.length === 0) {
      try {
        const fullOrder = await orderService.getById(order.id);
        setSelectedOrderForAction(fullOrder);
      } catch (error) {
        console.error('Failed to load order details:', error);
        alert('Failed to load order details. Please try again.');
        return;
      }
    } else {
      setSelectedOrderForAction(order);
    }

    setShowExchangeModal(true);
  };

  const handlePrint = async (order: PurchaseHistoryOrder) => {
    setActiveMenu(null);

    try {
      const status = await checkQZStatus();
      if (!status.connected) {
        alert('QZ Tray is offline. Opening receipt preview (Print → Save as PDF).');
      }

      const fullOrder = await orderService.getById(order.id);
      await printReceipt(fullOrder, undefined, { template: 'pos_receipt' });
      alert(`✅ Receipt printed for order #${fullOrder.order_number || fullOrder.id}`);
    } catch (error: any) {
      console.error('Print receipt error:', error);
      alert(`Failed to print receipt: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleReturnSubmit = async (returnData: {
    selectedProducts: Array<{
      order_item_id: number;
      quantity: number;
      product_barcode_id?: number;
    }>;
    refundMethods: {
      cash: number;
      card: number;
      bkash: number;
      nagad: number;
      total: number;
    };
    returnReason: 'defective_product' | 'wrong_item' | 'not_as_described' | 'customer_dissatisfaction' | 'size_issue' | 'color_issue' | 'quality_issue' | 'late_delivery' | 'changed_mind' | 'duplicate_order' | 'other';
    returnType: 'customer_return' | 'store_return' | 'warehouse_return';
    customerNotes?: string;
  }) => {
    try {
      if (!selectedOrderForAction) return;

      console.log('🔄 Processing return with data:', returnData);

      const returnRequest: CreateReturnRequest = {
        order_id: selectedOrderForAction.id,
        return_reason: returnData.returnReason,
        return_type: returnData.returnType,
        items: returnData.selectedProducts.map(item => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          product_barcode_id: item.product_barcode_id,
        })),
        customer_notes: returnData.customerNotes || 'Customer initiated return',
      };

      console.log('📤 Creating return request:', returnRequest);
      const returnResponse = await productReturnService.create(returnRequest);
      const returnId = returnResponse.data.id;
      console.log('✅ Return created with ID:', returnId);

      console.log('⏳ Updating return quality check...');
      await productReturnService.update(returnId, {
        quality_check_passed: true,
        quality_check_notes: 'Auto-approved via POS',
      });

      console.log('⏳ Approving return...');
      await productReturnService.approve(returnId, {
        internal_notes: 'Approved via POS system',
      });

      console.log('⏳ Processing return (restoring inventory)...');
      await productReturnService.process(returnId, {
        restore_inventory: true,
      });

      console.log('⏳ Completing return...');
      await productReturnService.complete(returnId);

      if (returnData.refundMethods.total > 0) {
        console.log('💰 Creating refund...');
        const refundRequest: CreateRefundRequest = {
          return_id: returnId,
          refund_type: 'full',
          refund_method: 'cash',
          refund_method_details: {
            cash: returnData.refundMethods.cash,
            card: returnData.refundMethods.card,
            bkash: returnData.refundMethods.bkash,
            nagad: returnData.refundMethods.nagad,
          },
          internal_notes: 'Refund processed via POS',
        };

        const refundResponse = await refundService.create(refundRequest);
        const refundId = refundResponse.data.id;

        console.log('⏳ Processing and completing refund...');
        await refundService.process(refundId);
        await refundService.complete(refundId, {
          transaction_reference: `POS-REFUND-${Date.now()}`,
        });
        console.log('✅ Refund completed');
      }

      console.log('🔄 Refreshing order list...');
      await fetchOrders();

      alert('✅ Return processed successfully!');
      setShowReturnModal(false);
      setSelectedOrderForAction(null);
    } catch (error: any) {
      console.error('❌ Return processing failed:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to process return';
      alert(`Error: ${errorMsg}`);
    }
  };

  const handleExchangeSubmit = async (exchangeData: {
    removedProducts: Array<{
      order_item_id: number;
      quantity: number;
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
  }) => {
    try {
      if (!selectedOrderForAction) return;

      console.log('🔄 Processing exchange with data:', exchangeData);
      console.log('📦 Original order:', selectedOrderForAction.order_number);

      console.log('\n📤 STEP 1: Creating return for old products...');
      const returnRequest: CreateReturnRequest = {
        order_id: selectedOrderForAction.id,
        return_reason: 'other',
        return_type: 'customer_return',
        items: exchangeData.removedProducts.map(item => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          product_barcode_id: item.product_barcode_id,
        })),
        customer_notes: `Exchange transaction - Original Order: ${selectedOrderForAction.order_number}`,
      };

      const returnResponse = await productReturnService.create(returnRequest);
      const returnId = returnResponse.data.id;
      const returnNumber = returnResponse.data.return_number;
      console.log(`✅ Return created: #${returnNumber} (ID: ${returnId})`);

      console.log('\n⚙️ STEP 2: Auto-approving and processing return...');

      await productReturnService.update(returnId, {
        quality_check_passed: true,
        quality_check_notes: 'Exchange - Auto-approved via POS',
      });
      console.log('✅ Quality check updated');

      await productReturnService.approve(returnId, {
        internal_notes: 'Exchange - Auto-approved via POS',
      });
      console.log('✅ Return approved');

      await productReturnService.process(returnId, {
        restore_inventory: true,
      });
      console.log('✅ Return processed - Inventory restored for old products');

      await productReturnService.complete(returnId);
      console.log('✅ Return completed');

      console.log('\n💰 STEP 3: Creating FULL refund for returned items...');
      const refundRequest: CreateRefundRequest = {
        return_id: returnId,
        refund_type: 'full',
        refund_method: 'cash',
        internal_notes: `Full refund for exchange - Original Order: ${selectedOrderForAction.order_number}`,
      };

      const refundResponse = await refundService.create(refundRequest);
      const refundId = refundResponse.data.id;
      console.log(`✅ Refund created (ID: ${refundId})`);

      await refundService.process(refundId);
      console.log('✅ Refund processed');

      await refundService.complete(refundId, {
        transaction_reference: `EXCHANGE-REFUND-${Date.now()}`,
      });
      console.log('✅ Refund completed - Customer has full refund amount');

      console.log('\n🛒 STEP 4: Creating new order for replacement products...');

      const newOrderData = {
        order_type: 'counter' as const,
        store_id: selectedOrderForAction.store.id,
        customer_id: selectedOrderForAction.customer?.id,
        items: exchangeData.replacementProducts.map(p => ({
          product_id: p.product_id,
          batch_id: p.batch_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          barcode: p.barcode,
          barcode_id: p.barcode_id,
        })),
        notes: `Exchange from order #${selectedOrderForAction.order_number} | Return: #${returnNumber}`,
      };

      console.log('Creating new order (no payment yet)...');
      const newOrder = await orderService.create(newOrderData);
      console.log(`✅ New order created: #${newOrder.order_number} (ID: ${newOrder.id})`);

      // STEP 4a: Link the return and the new order for accounting/exchange history
      console.log('\n🔗 STEP 4a: Linking return to replacement order...');
      try {
        await axiosInstance.post(`/returns/${returnId}/exchange`, {
          new_order_id: newOrder.id,
          notes: `Automatic link from exchange flow. Original: #${selectedOrderForAction.order_number}`
        });
        console.log('✅ Exchange link established');
      } catch (linkErr) {
        console.warn('⚠️ Link failed (non-critical):', linkErr);
      }

      // STEP 4b: Explicitly create + auto-complete the payment so the order is marked "paid"
      // We use the backend-calculated total_amount to ensure it perfectly covers VAT/taxes.
      const rawTotal = String(newOrder.total_amount).replace(/[^0-9.]/g, '');
      const backendTotal = parseFloat(rawTotal) || 0;
      
      console.log(`\n💳 STEP 4b: Completing payment of ৳${backendTotal} for order #${newOrder.order_number}...`);
      await axiosInstance.post(`/orders/${newOrder.id}/payments/simple`, {
        payment_method_id: 1, // Cash
        amount: backendTotal,
        payment_type: 'full',
        auto_complete: true,
        notes: `Exchange payment - Original Order: #${selectedOrderForAction.order_number}`,
      });
      console.log(`✅ Payment completed for order #${newOrder.order_number} — order is now PAID`);


      // Log what happens with the money difference
      if (exchangeData.paymentRefund.type === 'payment') {
        console.log(`\n💳 Financial settlement: Customer collects ADDITIONAL ৳${exchangeData.paymentRefund.total.toLocaleString()}`);
        console.log(`   (New items ৳${backendTotal} > Refund received, customer pays extra)`);
      } else if (exchangeData.paymentRefund.type === 'refund') {
        console.log(`\n💵 Financial settlement: Cashier gives back ৳${exchangeData.paymentRefund.total.toLocaleString()}`);
        console.log(`   (Refund received > New items ৳${backendTotal}, customer gets difference)`);
      } else {
        console.log(`\n📊 Financial settlement: Even exchange (Refund = New items ৳${backendTotal})`);
      }

      console.log('\n🏁 STEP 5: Completing new order...');
      await orderService.complete(newOrder.id);
      console.log('✅ New order completed - Inventory reduced for new products');

      console.log('\n🔄 STEP 6: Refreshing order list...');
      await fetchOrders();

      console.log('\n✅ ========================================');
      console.log('✅ EXCHANGE COMPLETED SUCCESSFULLY!');
      console.log('✅ ========================================');
      console.log(`Old Order: #${selectedOrderForAction.order_number}`);
      console.log(`Return: #${returnNumber}`);
      console.log(`New Order: #${newOrder.order_number}`);
      console.log(`New Order Payment Status: PAID ✅`);

      // Build success message based on exchange type
      console.log('✅ ========================================\n');


      console.log('\n✅ ========================================');
      console.log('✅ EXCHANGE COMPLETED SUCCESSFULLY!');
      console.log('✅ ========================================');
      console.log(`Old Order: #${selectedOrderForAction.order_number}`);
      console.log(`Return: #${returnNumber}`);
      console.log(`New Order: #${newOrder.order_number}`);

      let successMessage = `✅ Exchange processed successfully!\n\n`;
      successMessage += `Return: #${returnNumber}\n`;
      successMessage += `New Order: #${newOrder.order_number}\n\n`;

      if (exchangeData.paymentRefund.type === 'payment') {
        console.log(`Payment Type: Additional payment from customer`);
        console.log(`Amount Collected: ৳${exchangeData.paymentRefund.total.toLocaleString()}`);
        successMessage += `💳 Customer paid additional: ৳${exchangeData.paymentRefund.total.toLocaleString()}\n`;
        successMessage += `(New items cost more than returned items)`;
      } else if (exchangeData.paymentRefund.type === 'refund') {
        console.log(`Payment Type: Additional refund to customer`);
        console.log(`Amount Refunded: ৳${exchangeData.paymentRefund.total.toLocaleString()}`);
        successMessage += `💵 Additional refund to customer: ৳${exchangeData.paymentRefund.total.toLocaleString()}\n`;
        successMessage += `(Returned items cost more than new items)\n`;
        successMessage += `Please give customer the refund difference in cash/selected method`;
      } else {
        console.log(`Payment Type: Even exchange`);
        successMessage += `Even exchange - no payment difference`;
      }

      console.log('✅ ========================================\n');

      alert(successMessage);

      setShowExchangeModal(false);
      setSelectedOrderForAction(null);
    } catch (error: any) {
      console.error('\n❌ ========================================');
      console.error('❌ EXCHANGE PROCESSING FAILED!');
      console.error('❌ ========================================');
      console.error('Error details:', error);
      console.error('Error response:', error.response?.data);
      console.error('❌ ========================================\n');

      const errorMsg = error.response?.data?.message || error.message || 'Failed to process exchange';
      alert(`❌ Exchange failed: ${errorMsg}\n\nPlease check the console for details.`);
    }
  };

  const getStoreName = (storeId: number) => {
    const store = stores.find(s => s.id === storeId);
    return store ? `${store.name} - ${store.location}` : 'Unknown Store';
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.phone?.includes(searchTerm);

    const matchesStore = !selectedStore || order.store.id === parseInt(selectedStore);

    const orderDate = new Date(order.created_at);
    const matchesStartDate = !startDate || orderDate >= new Date(startDate);
    const matchesEndDate = !endDate || orderDate <= new Date(endDate);

    return matchesSearch && matchesStore && matchesStartDate && matchesEndDate;
  });

  const totalRevenue = filteredOrders.reduce((sum, order) => {
    const amount = parseFloat(order.total_amount.replace(/,/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const totalOrders = filteredOrders.length;

  const totalDue = filteredOrders.reduce((sum, order) => {
    const amount = parseFloat(order.outstanding_amount.replace(/,/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
                  Purchase History
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {userRole === 'branch-manager'
                    ? 'View and manage your store counter sales'
                    : 'View and manage all counter sales transactions'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Orders</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalOrders}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ৳{totalRevenue.toFixed(2)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Due</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    ৳{totalDue.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by order#, customer, phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {!canSelectStore && scopedStoreId ? (
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={
                          stores.find((s) => String(s.id) === String(selectedStore))
                            ? `${stores.find((s) => String(s.id) === String(selectedStore))?.name ?? ''} - ${stores.find((s) => String(s.id) === String(selectedStore))?.location ?? ''}`
                            : 'Loading Store...'
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white text-sm cursor-not-allowed"
                      />
                    </div>
                  ) : (
                    <select
                      value={selectedStore}
                      onChange={(e) => setSelectedStore(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">All Stores</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} - {store.location}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />

                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {loading ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <div className="text-gray-500 dark:text-gray-400">Loading orders...</div>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <div className="text-gray-500 dark:text-gray-400">No counter orders found</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md relative"
                    >
                      <div className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded text-blue-700 dark:text-blue-400">
                                {order.order_number}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${order.payment_status === 'paid'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : order.payment_status === 'partial'
                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                }`}>
                                {order.payment_status === 'paid' ? 'Paid' :
                                  order.payment_status === 'partial' ? 'Partial' : 'Pending'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${order.status === 'confirmed'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : order.status === 'cancelled'
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                }`}>
                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Customer: </span>
                                <span className="text-gray-900 dark:text-white font-medium">
                                  {order.customer?.name || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Phone: </span>
                                <span className="text-gray-900 dark:text-white">
                                  {order.customer?.phone || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Sales By: </span>
                                <span className="text-gray-900 dark:text-white font-medium">
                                  {order.salesman?.name || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Store: </span>
                                <span className="text-gray-900 dark:text-white">
                                  {order.store?.name || getStoreName(order.store.id)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600 dark:text-gray-400">Date: </span>
                                <span className="text-gray-900 dark:text-white">
                                  {new Date(order.created_at).toLocaleDateString('en-GB')} {new Date(order.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-right mr-4">
                              <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
                              <div className="text-lg font-bold text-gray-900 dark:text-white">
                                ৳{Number(String(order.total_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                              </div>
                              {parseFloat(order.outstanding_amount) > 0 && (
                                <div className="text-xs text-red-600 dark:text-red-400">
                                  Due: ৳{Number(String(order.outstanding_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                                </div>
                              )}
                            </div>

                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = activeMenu === order.id ? null : order.id;
                                  if (next !== null) {
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setMenuPosition(computeMenuPosition(rect, 192, 220, 8, 8));
                                  }
                                  setActiveMenu(next);
                                }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                              >
                                <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              </button>

                              {activeMenu === order.id && menuPosition && (
                                <div className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-gray-300 dark:border-gray-600 z-50" style={{ top: menuPosition.top, left: menuPosition.left }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePrint(order);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 rounded-t-lg transition-colors"
                                  >
                                    <Printer className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                                    <span>Print Receipt</span>
                                  </button>
                                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExchange(order);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors"
                                  >
                                    <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    <span>Exchange Products</span>
                                  </button>
                                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReturn(order);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 rounded-b-lg transition-colors"
                                  >
                                    <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400" />
                                    <span>Return Products</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleExpandOrder(order.id)}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            >
                              {expandedOrder === order.id ? (
                                <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(order.id)}
                              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md transition-colors"
                            >
                              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {expandedOrder === order.id && (
                        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                          <div className="p-4 space-y-4">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Order Items</h3>
                              {loadingDetails === order.id ? (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
                                  <div className="text-gray-500 dark:text-gray-400">Loading items...</div>
                                </div>
                              ) : errorDetails[order.id] ? (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                  <div className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">
                                    Failed to load order details
                                  </div>
                                  <div className="text-xs text-red-600 dark:text-red-500 mb-3">
                                    {errorDetails[order.id]}
                                  </div>
                                  <button
                                    onClick={() => handleExpandOrder(order.id)}
                                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                                  >
                                    Try Again
                                  </button>
                                </div>
                              ) : !order.items || order.items.length === 0 ? (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-700 dark:text-yellow-400">
                                  No items found for this order.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-100 dark:bg-gray-800">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Product</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">SKU</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Batch</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Barcode</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Qty</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Price</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Discount</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Tax</th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800">
                                      {order.items?.map((item: any, itemIndex: number) => (
                                        <tr key={item.id} className="border-t border-gray-200 dark:border-gray-700">
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                                            {item.product_name}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">
                                            {item.product_sku || '-'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                                            {item.batch_number || '-'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs font-mono">
                                            {item.barcode || '-'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">{item.quantity}</td>
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">৳{Number(String(item.unit_price ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</td>
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">৳{Number(String(item.discount_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</td>
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">৳{Number(String(item.tax_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</td>
                                          <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">
                                            ৳{Number(String(item.total_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Amount Details</h3>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                                    <span className="text-gray-900 dark:text-white">৳{Number(String(order.subtotal ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Discount</span>
                                    <span className="text-gray-900 dark:text-white">৳{Number(String(order.discount_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Tax/VAT</span>
                                    <span className="text-gray-900 dark:text-white">৳{Number(String(order.tax_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Shipping</span>
                                    <span className="text-gray-900 dark:text-white">৳{Number(String(order.shipping_cost ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 font-medium">
                                    <span className="text-gray-900 dark:text-white">Total</span>
                                    <span className="text-gray-900 dark:text-white">৳{Number(String(order.paid_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Payment Details</h3>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Total Paid</span>
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      ৳{Number(String(order.paid_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                                    </span>
                                  </div>
                                  {parseFloat(order.outstanding_amount) > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Outstanding</span>
                                      <span className="text-red-600 dark:text-red-400 font-medium">
                                        ৳{Number(String(order.outstanding_amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {order.payments && order.payments.length > 0 && (
                                    <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Payment History:</div>
                                      {order.payments?.map((payment: any, payIndex: number) => (
                                        <div key={payment.id} className="flex justify-between text-xs">
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {payment.payment_method} ({payment.payment_type})
                                          </span>
                                          <span className="text-gray-900 dark:text-white">
                                            ৳{Number(String(payment.amount ?? "0").replace(/[^0-9.-]/g, "")).toFixed(2)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {activeMenu !== null && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setActiveMenu(null)}
        />
      )}

      {showReturnModal && selectedOrderForAction && (
        <ReturnProductModal
          order={selectedOrderForAction}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedOrderForAction(null);
          }}
          onReturn={handleReturnSubmit}
        />
      )}

      {showExchangeModal && selectedOrderForAction && (
        <ExchangeProductModal
          order={selectedOrderForAction}
          onClose={() => {
            setShowExchangeModal(false);
            setSelectedOrderForAction(null);
          }}
          onExchange={handleExchangeSubmit}
        />
      )}
    </div>
  );
}