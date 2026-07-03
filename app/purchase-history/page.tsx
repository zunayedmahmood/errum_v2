'use client';

import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, Trash2, MoreVertical, Printer, Download, Pencil, Plus, X } from 'lucide-react';
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
import AccessControl from '@/components/AccessControl';
import paymentMethodService, { type PaymentMethod } from '@/services/paymentMethodService';

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
  notes?: string;
  is_installment: boolean;
  order_date: string;
  created_at: string;
  items?: PurchaseHistoryOrderItem[];
  payments?: Array<{
    id: number;
    amount: string;
    payment_method: string;
    payment_type: string;
    payment_method_id?: number | null;
    status: string;
    processed_by?: string;
    created_at: string;
    is_split_payment?: boolean;
    splits?: Array<{
      payment_method_id?: number | null;
      payment_method: string;
      wallet?: string;
      amount: string;
      status?: string;
    }>;
  }>;
  payment_method_summary?: string;
  is_deleted_offline_sale?: boolean;
  offline_sale_deleted?: any;
  return_exchange_blocked?: boolean;
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
  const todayIso = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [exactDate, setExactDate] = useState(() => todayIso());
  const [startDate, setStartDate] = useState(() => todayIso());
  const [endDate, setEndDate] = useState(() => todayIso());
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<number | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ [key: number]: string }>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'excel'>('pdf');
  const [exportDetailMode, setExportDetailMode] = useState<'summary' | 'detailed'>('summary');
  const [exportScope, setExportScope] = useState<'shown' | 'top500' | 'top600' | 'all'>('shown');
  // Legacy state kept for minimal refactor
  const [userRole, setUserRole] = useState<string>('');
  const [userStoreId, setUserStoreId] = useState<string>('');
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Modal states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<any | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [editingOfflineOrder, setEditingOfflineOrder] = useState<any | null>(null);
  const [offlineEditForm, setOfflineEditForm] = useState<any>({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    order_date: '',
    payment_breakdown: [],
  });
  const [savingOfflineEdit, setSavingOfflineEdit] = useState(false);

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

  useEffect(() => {
    paymentMethodService
      .getMethodsByCustomerType('counter')
      .then(setPaymentMethods)
      .catch((err) => {
        console.warn('Failed to load payment methods for offline edit', err);
        setPaymentMethods([]);
      });
  }, []);

  // Fetch orders when relevant filters change
  useEffect(() => {
    fetchOrders();
  }, [selectedStore, exactDate, startDate, endDate, searchTerm]);

  const buildOrderFilters = (overrides: Partial<OrderFilters> = {}): OrderFilters => {
    const filters: OrderFilters = {
      order_type: 'counter',
      per_page: 50,
      ...overrides,
    };

    // Security: Always prioritize scopedStoreId (enforced for non-admins)
    if (scopedStoreId) {
      filters.store_id = scopedStoreId;
    } else if (selectedStore) {
      // Admins can filter by any store from the dropdown
      filters.store_id = Number(selectedStore);
    }

    if (searchTerm.trim()) filters.search = searchTerm.trim();
    if (exactDate) {
      filters.exact_date = exactDate;
      delete filters.date_from;
      delete filters.date_to;
    } else {
      const range = getEffectiveDateRange();
      if (range.from) filters.date_from = range.from;
      if (range.to) filters.date_to = range.to;
    }

    return filters;
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const result = await orderService.getAll(buildOrderFilters({ per_page: 50 }));
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
      // If store-scoped/restricted, only fetch user's assigned store details
      if (!canSelectStore && (scopedStoreId || user?.store_id)) {
        const targetId = scopedStoreId || user?.store_id;
        const res: any = await storeService.getStore(Number(targetId));
        const storeObj = res?.success && res.data ? res.data : (res?.data ?? res);
        
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
      }

      // If user has multi-store access (admin/moderator), fetch all stores for dropdown
      if (canSelectStore) {
        const storesData = await storeService.getAllStores();
        setStores(storesData.map((s: any) => ({
          id: s.id,
          name: s.name,
          location: s.address || s.location || '',
        })));
      } else {
        setStores([]);
      }
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
    const order = orders.find(o => o.id === orderId);
    const label = order?.order_number ? ` ${order.order_number}` : '';
    const ok = confirm(
      `Delete offline sale${label}?\n\nThis keeps a deleted-sale record, restocks sold barcodes into a new deleted-sale batch, cancels the sale finance for the original order date, and blocks return/exchange from Lookup.`
    );
    if (!ok) return;

    try {
      const response = await orderService.voidOfflineSale(orderId, 'Deleted from Offline Sale History');
      const updated = response?.data || response;
      setOrders(orders.map(o => o.id === orderId ? { ...o, ...(updated || {}), is_deleted_offline_sale: true } : o));
      alert('Offline sale marked deleted. The record remains, stock was restored to a new batch, and sale finance was cancelled.');
    } catch (error: any) {
      console.error('Error deleting offline sale:', error);
      alert(error?.response?.data?.message || error?.message || 'Failed to delete offline sale. Please try again.');
    }
  };

  const toDateInputValue = (value: any) => {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const findPaymentMethodId = (label: any, wallet?: string) => {
    const clean = String(label || '').toLowerCase();
    const cleanWallet = String(wallet || '').toLowerCase();
    const exact = paymentMethods.find((m) =>
      String(m.name || '').toLowerCase() === clean || String((m as any).code || '').toLowerCase() === clean
    );
    if (exact) return exact.id;

    if (cleanWallet.includes('bkash') || cleanWallet.includes('nagad') || clean.includes('bkash') || clean.includes('nagad') || clean.includes('mobile')) {
      const mobile = paymentMethods.find((m) => String(m.type).toLowerCase() === 'mobile_banking' || /mobile|bkash|nagad/i.test(m.name));
      if (mobile) return mobile.id;
    }

    if (clean.includes('card')) return paymentMethods.find((m) => String(m.type).toLowerCase() === 'card' || /card/i.test(m.name))?.id || paymentMethods[0]?.id || 0;
    if (clean.includes('cash')) return paymentMethods.find((m) => String(m.type).toLowerCase() === 'cash' || /cash/i.test(m.name))?.id || paymentMethods[0]?.id || 0;
    return paymentMethods[0]?.id || 0;
  };

  const buildPaymentRowsForEdit = (order: any) => {
    const rows: any[] = [];
    (order?.payments || []).forEach((payment: any) => {
      const splits = Array.isArray(payment.splits) ? payment.splits : [];
      if (splits.length > 0) {
        splits.forEach((split: any) => {
          const methodLabel = split.payment_method || '';
          const wallet = split.wallet || (/bkash/i.test(methodLabel) ? 'bkash' : /nagad/i.test(methodLabel) ? 'nagad' : '');
          rows.push({
            payment_method_id: Number(split.payment_method_id || findPaymentMethodId(methodLabel, wallet)),
            amount: parseMoney(split.amount),
            wallet,
            transaction_reference: '',
            notes: '',
          });
        });
      } else if (payment.amount !== undefined) {
        const methodLabel = payment.payment_method || '';
        const wallet = /bkash/i.test(methodLabel) ? 'bkash' : /nagad/i.test(methodLabel) ? 'nagad' : '';
        rows.push({
          payment_method_id: Number(payment.payment_method_id || findPaymentMethodId(methodLabel, wallet)),
          amount: parseMoney(payment.amount),
          wallet,
          transaction_reference: '',
          notes: '',
        });
      }
    });

    if (rows.length === 0) {
      rows.push({ payment_method_id: paymentMethods[0]?.id || 0, amount: parseMoney(order?.paid_amount), wallet: '', transaction_reference: '', notes: '' });
    }

    return rows.filter((r) => Number(r.amount) > 0 || parseMoney(order?.paid_amount) <= 0);
  };

  const openOfflineEdit = async (order: PurchaseHistoryOrder) => {
    setActiveMenu(null);
    try {
      const fullOrder: any = await orderService.getById(order.id);
      setEditingOfflineOrder(fullOrder);
      setOfflineEditForm({
        customer_name: fullOrder.customer?.name || '',
        customer_phone: fullOrder.customer?.phone || '',
        customer_email: fullOrder.customer?.email || '',
        customer_address: fullOrder.customer?.address || fullOrder.customer_address || fullOrder.shipping_address?.address_line_1 || fullOrder.shipping_address?.address_line1 || fullOrder.shipping_address?.street || fullOrder.notes || '',
        order_date: toDateInputValue(fullOrder.order_date || fullOrder.created_at),
        payment_breakdown: buildPaymentRowsForEdit(fullOrder),
      });
    } catch (error: any) {
      alert(error?.message || 'Failed to open offline sale editor.');
    }
  };

  const updateEditPaymentRow = (index: number, patch: any) => {
    setOfflineEditForm((prev: any) => {
      const rows = [...(prev.payment_breakdown || [])];
      rows[index] = { ...rows[index], ...patch };
      return { ...prev, payment_breakdown: rows };
    });
  };

  const saveOfflineEdit = async () => {
    if (!editingOfflineOrder) return;
    const paidTotal = parseMoney(editingOfflineOrder.paid_amount);
    const breakdownTotal = (offlineEditForm.payment_breakdown || []).reduce((sum: number, row: any) => sum + parseMoney(row.amount), 0);
    if (Math.abs(breakdownTotal - paidTotal) > 0.01) {
      alert(`Payment breakdown total must stay ৳${paidTotal.toFixed(2)}. Current total is ৳${breakdownTotal.toFixed(2)}.`);
      return;
    }

    try {
      setSavingOfflineEdit(true);
      const updated = await orderService.editOfflineSale(editingOfflineOrder.id, {
        customer_name: offlineEditForm.customer_name,
        customer_phone: offlineEditForm.customer_phone,
        customer_email: offlineEditForm.customer_email || undefined,
        customer_address: offlineEditForm.customer_address || undefined,
        order_date: offlineEditForm.order_date,
        payment_breakdown: (offlineEditForm.payment_breakdown || [])
          .filter((row: any) => Number(row.payment_method_id) > 0 && parseMoney(row.amount) > 0)
          .map((row: any) => ({
            payment_method_id: Number(row.payment_method_id),
            amount: parseMoney(row.amount),
            wallet: row.wallet || undefined,
            transaction_reference: row.transaction_reference || undefined,
            notes: row.notes || undefined,
          })),
      });
      setOrders((prev) => prev.map((o) => (o.id === editingOfflineOrder.id ? { ...o, ...updated } : o)));
      setEditingOfflineOrder(null);
      await fetchOrders();
      alert('Offline sale updated successfully.');
    } catch (error: any) {
      alert(error?.message || 'Failed to update offline sale.');
    } finally {
      setSavingOfflineEdit(false);
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
        alert('QZ Tray is offline. Opening receipt preview (Save as PDF).');
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

  const formatDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const extractOrderDateOnly = (value?: string | null) => {
    if (!value) return '';

    const directMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];

    const parsed = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return '';

    return formatDateInputValue(parsed);
  };

  const getEffectiveDateRange = () => {
    if (exactDate) {
      return { from: exactDate, to: exactDate };
    }

    if (startDate && endDate && startDate > endDate) {
      return { from: endDate, to: startDate };
    }

    return { from: startDate, to: endDate };
  };

  const handleExactDateChange = (value: string) => {
    setExactDate(value);
    setStartDate(value);
    setEndDate(value);
  };

  const handleStartDateChange = (value: string) => {
    setExactDate('');
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setExactDate('');
    setEndDate(value);
  };

  const handleTodayFilter = () => {
    handleExactDateChange(formatDateInputValue(new Date()));
  };

  const clearDateFilters = () => {
    setExactDate('');
    setStartDate('');
    setEndDate('');
  };

  const getStoreName = (storeId: number) => {
    const store = stores.find(s => s.id === storeId);
    return store ? `${store.name} - ${store.location}` : 'Unknown Store';
  };

  const filteredOrders = orders.filter(order => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      String(order.order_number || '').toLowerCase().includes(normalizedSearch) ||
      String(order.customer?.name || '').toLowerCase().includes(normalizedSearch) ||
      String(order.customer?.phone || '').includes(searchTerm.trim());

    const matchesStore =
      !selectedStore ||
      String(order.store?.id || '') === String(selectedStore);

    const orderDate = extractOrderDateOnly(order.order_date || order.created_at);
    const { from, to } = getEffectiveDateRange();
    const matchesStartDate = !from || (orderDate && orderDate >= from);
    const matchesEndDate = !to || (orderDate && orderDate <= to);

    return matchesSearch && matchesStore && matchesStartDate && matchesEndDate;
  });

  const totalSalesAmount = filteredOrders.reduce((sum, order) => {
    const amount = parseFloat(order.total_amount.replace(/,/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const totalOrders = filteredOrders.length;

  const totalDue = filteredOrders.reduce((sum, order) => {
    const amount = parseFloat(order.outstanding_amount.replace(/,/g, ''));
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const parseMoney = (value: any) => Number(String(value ?? '0').replace(/[^0-9.-]/g, '')) || 0;
  const money = (value: any) => `৳${parseMoney(value).toFixed(2)}`;
  const normalizePaymentLabel = (label: any, splitIndex = 0, allSplits: any[] = []) => {
    const raw = String(label || 'Unknown');
    if (/mobile\s*banking/i.test(raw) && allSplits.filter((s) => /mobile\s*banking/i.test(String(s?.payment_method || ''))).length > 1) {
      return splitIndex === 0 ? 'bKash' : splitIndex === 1 ? 'Nagad' : raw;
    }
    return raw.replace(/^bkash$/i, 'bKash').replace(/^nagad$/i, 'Nagad');
  };

  const normalizeLegacyPaymentSummary = (summary: string) => {
    let mobileIndex = 0;
    return String(summary || '').replace(/Mobile Banking/gi, () => {
      mobileIndex += 1;
      return mobileIndex === 1 ? 'bKash' : mobileIndex === 2 ? 'Nagad' : 'Mobile Banking';
    });
  };

  const getPaymentSplits = (payment: any) => {
    if (!payment) return [];
    return Array.isArray(payment.splits) ? payment.splits : [];
  };

  const formatPaymentBreakdown = (order: any) => {
    if (order?.payment_method_summary) return normalizeLegacyPaymentSummary(order.payment_method_summary);

    const payments = Array.isArray(order?.payments) ? order.payments : [];
    const parts = payments.flatMap((payment: any) => {
      const splits = getPaymentSplits(payment);

      if (splits.length > 0) {
        return splits.map((split: any, index: number) => `${normalizePaymentLabel(split.payment_method, index, splits)} ${money(split.amount)}`);
      }

      if (payment?.payment_method) {
        return [`${payment.payment_method} ${money(payment.amount)}`];
      }

      return [];
    });

    return parts.length > 0 ? parts.join(' + ') : 'N/A';
  };

  const exportColumns = [
    'Order #',
    'Date',
    'Customer',
    'Phone',
    'Sales By',
    'Store',
    'Status',
    'Payment Status',
    'Payment Methods',
    'Subtotal',
    'Order Discount',
    'Shipping',
    'Total',
    'Paid',
    'Due',
    'Order Note',
  ];

  const detailedCsvColumns = [
    'Row Type',
    'Order #',
    'Date',
    'Customer',
    'Phone',
    'Sales By',
    'Store',
    'Status',
    'Payment Status',
    'Subtotal',
    'Order Discount',
    'Shipping',
    'Total',
    'Paid',
    'Due',
    'Order Note',
    'Product',
    'SKU',
    'Batch',
    'Barcode',
    'Qty',
    'Unit Price',
    'Item Discount',
    'Tax/VAT',
    'Line Total',
    'Payment Method',
    'Payment Type',
    'Payment Amount',
    'Payment Status Detail',
    'Payment Date',
  ];

  const formatExportDate = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return String(value);

    return `${parsed.toLocaleDateString('en-GB')} ${parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  };

  const getOrderItems = (order: any) => Array.isArray(order?.items) ? order.items : [];
  const getOrderPayments = (order: any) => Array.isArray(order?.payments) ? order.payments : [];
  const getItemLineTotal = (item: any) => {
    const explicit = item?.total_amount ?? item?.total_price;
    if (explicit !== undefined && explicit !== null) return parseMoney(explicit);

    const qty = Number(item?.quantity || 0);
    const unit = parseMoney(item?.unit_price);
    const discount = parseMoney(item?.discount_amount);
    const tax = parseMoney(item?.tax_amount);
    return Math.max(0, (unit * qty) - discount + tax);
  };

  const toExportRows = (sourceOrders: any[]) => sourceOrders.map((order) => ({
    'Order #': order.order_number || '',
    'Date': formatExportDate(order.order_date || order.created_at),
    'Customer': order.customer?.name || 'N/A',
    'Phone': order.customer?.phone || 'N/A',
    'Sales By': order.salesman?.name || 'N/A',
    'Store': order.store?.name || '',
    'Status': order.status || '',
    'Payment Status': order.payment_status || '',
    'Payment Methods': formatPaymentBreakdown(order),
    'Subtotal': parseMoney(order.subtotal ?? order.subtotal_amount).toFixed(2),
    'Order Discount': parseMoney(order.discount_amount).toFixed(2),
    'Shipping': parseMoney(order.shipping_amount ?? order.shipping_cost).toFixed(2),
    'Total': parseMoney(order.total_amount).toFixed(2),
    'Paid': parseMoney(order.paid_amount).toFixed(2),
    'Due': parseMoney(order.outstanding_amount).toFixed(2),
    'Order Note': order.notes || '',
  }));

  const toDetailedCsvRows = (sourceOrders: any[]) => {
    const rows: Record<string, any>[] = [];

    sourceOrders.forEach((order) => {
      const summary = toExportRows([order])[0] as Record<string, any>;
      rows.push({
        'Row Type': 'ORDER',
        ...summary,
      });

      getOrderItems(order).forEach((item: any) => {
        rows.push({
          'Row Type': 'ITEM',
          'Order #': order.order_number || '',
          'Date': formatExportDate(order.order_date || order.created_at),
          'Product': item.product_name || '',
          'SKU': item.product_sku || '',
          'Batch': item.batch_number || '',
          'Barcode': item.barcode || '',
          'Qty': item.quantity ?? '',
          'Unit Price': parseMoney(item.unit_price).toFixed(2),
          'Item Discount': parseMoney(item.discount_amount).toFixed(2),
          'Tax/VAT': parseMoney(item.tax_amount).toFixed(2),
          'Line Total': getItemLineTotal(item).toFixed(2),
        });
      });

      getOrderPayments(order).forEach((payment: any) => {
        const splits = getPaymentSplits(payment);
        if (splits.length > 0) {
          splits.forEach((split: any) => {
            rows.push({
              'Row Type': 'PAYMENT SPLIT',
              'Order #': order.order_number || '',
              'Date': formatExportDate(order.order_date || order.created_at),
              'Payment Method': split.payment_method || 'Unknown',
              'Payment Type': payment.payment_type || '',
              'Payment Amount': parseMoney(split.amount).toFixed(2),
              'Payment Status Detail': split.status || payment.status || '',
              'Payment Date': formatExportDate(payment.created_at),
            });
          });
        } else {
          rows.push({
            'Row Type': 'PAYMENT',
            'Order #': order.order_number || '',
            'Date': formatExportDate(order.order_date || order.created_at),
            'Payment Method': payment.payment_method || 'Unknown',
            'Payment Type': payment.payment_type || '',
            'Payment Amount': parseMoney(payment.amount).toFixed(2),
            'Payment Status Detail': payment.status || '',
            'Payment Date': formatExportDate(payment.created_at),
          });
        }
      });
    });

    return rows;
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const escapeHtml = (value: any) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[ch] || ch));

  const getExportFilterLabel = () => {
    const range = getEffectiveDateRange();
    const storeLabel = selectedStore ? (stores.find((s) => String(s.id) === String(selectedStore))?.name || `Store ID ${selectedStore}`) : 'All stores';
    const dateLabel = exactDate ? exactDate : `${range.from || 'beginning'} to ${range.to || 'latest'}`;
    return `Date: ${dateLabel} • Store: ${storeLabel} • Search: ${searchTerm.trim() || 'None'} • Rows: ${exportScope} • Details: ${exportDetailMode === 'detailed' ? 'With details' : 'Without details'}`;
  };

  const buildReportStyles = () => `
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;margin:0;padding:18px;background:#f3f4f6;color:#111827}.sheet{max-width:1280px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    h1{margin:0 0 5px;font-size:22px;line-height:1.2}.muted{color:#6b7280;font-size:11px;line-height:1.5}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.card{border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#f9fafb}.label{font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:800;letter-spacing:.04em}.value{font-size:16px;font-weight:900;margin-top:3px}.money{text-align:right;white-space:nowrap}.badge{display:inline-block;border-radius:999px;background:#eef2ff;color:#3730a3;padding:2px 7px;font-size:9px;font-weight:900}.badge.green{background:#ecfdf5;color:#047857}
    table{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:6px}th{background:#111827;color:white;text-align:left;padding:6px;border:1px solid #111827;font-weight:800}td{padding:5px 6px;border:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even){background:#f9fafb}.order-block{border:1px solid #d1d5db;border-radius:12px;margin:12px 0;background:#fff;overflow:hidden;page-break-inside:avoid}.order-row{display:grid;grid-template-columns:1.6fr 1fr .8fr .8fr;gap:8px;align-items:center;background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:10px 12px}.order-no{font-size:13px;font-weight:900}.order-meta{font-size:10px;color:#6b7280;margin-top:2px}.order-total{text-align:right;font-size:13px;font-weight:900}.expanded{padding:10px 12px}.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:8px}.info-box{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:7px;min-height:42px}.section-title{font-size:11px;font-weight:900;margin:9px 0 4px}.totals-table{max-width:620px;margin-left:auto}.no-print button{padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#111827;color:white;font-weight:700}
    @media print{body{background:white;padding:0}.sheet{max-width:none;box-shadow:none;border:0;border-radius:0;padding:0}.no-print{display:none}.order-block{break-inside:avoid}.summary{grid-template-columns:repeat(3,1fr)}}
  `;

  const buildSummaryReportHtml = (sourceOrders: any[], rows: Record<string, any>[], autoPrint = false) => {
    const totalExportSalesAmount = sourceOrders.reduce((sum, order) => sum + parseMoney(order.total_amount), 0);
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Offline Sale History</title><style>${buildReportStyles()}</style></head><body><div class="sheet">${autoPrint ? '<div class="no-print" style="text-align:right;margin-bottom:12px"><button onclick="window.print()">Save / Download PDF</button></div>' : ''}<h1>Offline Sale History</h1><p class="muted">Exported from Errum admin. ${escapeHtml(getExportFilterLabel())}</p><div class="summary"><div class="card"><div class="label">Rows</div><div class="value">${rows.length}</div></div><div class="card"><div class="label">Total Sales Amount</div><div class="value">৳${totalExportSalesAmount.toFixed(2)}</div></div><div class="card"><div class="label">Mode</div><div class="value">Summary</div></div></div><table><thead><tr>${exportColumns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${exportColumns.map((col) => `<td class="${['Subtotal','Order Discount','Shipping','Total','Paid','Due'].includes(col) ? 'money' : ''}">${escapeHtml((row as any)[col])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${autoPrint ? '<script>setTimeout(() => window.print(), 250);</script>' : ''}</body></html>`;
  };

  const buildDetailedReportHtml = (sourceOrders: any[], autoPrint = false) => {
    const totalExportSalesAmount = sourceOrders.reduce((sum, order) => sum + parseMoney(order.total_amount), 0);

    const orderBlocks = sourceOrders.map((order, index) => {
      const items = getOrderItems(order);
      const payments = getOrderPayments(order);
      const paymentRows = payments.flatMap((payment: any) => {
        const splits = getPaymentSplits(payment);
        if (splits.length > 0) {
          return splits.map((split: any) => ({
            method: split.payment_method || 'Unknown',
            type: payment.payment_type || 'split',
            amount: parseMoney(split.amount),
            status: split.status || payment.status || '',
            date: payment.created_at,
          }));
        }
        return [{ method: payment.payment_method || 'Unknown', type: payment.payment_type || '', amount: parseMoney(payment.amount), status: payment.status || '', date: payment.created_at }];
      });

      const itemsTable = items.length
        ? `<table><thead><tr><th>Product</th><th>SKU</th><th>Batch</th><th>Barcode</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Tax/VAT</th><th>Total</th></tr></thead><tbody>${items.map((item: any) => `<tr><td>${escapeHtml(item.product_name || '')}</td><td>${escapeHtml(item.product_sku || '')}</td><td>${escapeHtml(item.batch_number || '-')}</td><td>${escapeHtml(item.barcode || '-')}</td><td class="money">${escapeHtml(item.quantity ?? '')}</td><td class="money">৳${parseMoney(item.unit_price).toFixed(2)}</td><td class="money">৳${parseMoney(item.discount_amount).toFixed(2)}</td><td class="money">৳${parseMoney(item.tax_amount).toFixed(2)}</td><td class="money">৳${getItemLineTotal(item).toFixed(2)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No items found for this order.</p>';

      const paymentsTable = paymentRows.length
        ? `<table><thead><tr><th>Method</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${paymentRows.map((payment: any) => `<tr><td>${escapeHtml(payment.method)}</td><td>${escapeHtml(payment.type)}</td><td class="money">৳${payment.amount.toFixed(2)}</td><td>${escapeHtml(payment.status)}</td><td>${escapeHtml(formatExportDate(payment.date))}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No payment history found.</p>';

      return `<div class="order-block"><div class="order-row"><div><div class="order-no">${index + 1}. ${escapeHtml(order.order_number || '')}</div><div class="order-meta">${escapeHtml(formatExportDate(order.order_date || order.created_at))}</div></div><div><span class="badge">${escapeHtml(order.payment_status || 'payment')}</span> <span class="badge green">${escapeHtml(order.status || 'status')}</span></div><div class="order-total">৳${parseMoney(order.total_amount).toFixed(2)}<div class="order-meta">Due ৳${parseMoney(order.outstanding_amount).toFixed(2)}</div></div><div class="order-meta" style="text-align:right">${escapeHtml(order.store?.name || '')}</div></div><div class="expanded"><div class="info-grid"><div class="info-box"><div class="label">Customer</div><div>${escapeHtml(order.customer?.name || 'N/A')}</div></div><div class="info-box"><div class="label">Phone</div><div>${escapeHtml(order.customer?.phone || 'N/A')}</div></div><div class="info-box"><div class="label">Sales By</div><div>${escapeHtml(order.salesman?.name || 'N/A')}</div></div><div class="info-box"><div class="label">Payment Summary</div><div>${escapeHtml(formatPaymentBreakdown(order))}</div></div>${order.notes ? `<div class="info-box" style="grid-column:1/-1"><div class="label">Order Note</div><div>${escapeHtml(order.notes)}</div></div>` : ''}</div><div class="section-title">Ordered Products</div>${itemsTable}<table class="totals-table"><tbody><tr><td>Subtotal</td><td class="money">৳${parseMoney(order.subtotal ?? order.subtotal_amount).toFixed(2)}</td></tr><tr><td>Discount</td><td class="money">৳${parseMoney(order.discount_amount).toFixed(2)}</td></tr><tr><td>Shipping</td><td class="money">৳${parseMoney(order.shipping_amount ?? order.shipping_cost).toFixed(2)}</td></tr><tr><td><strong>Total</strong></td><td class="money"><strong>৳${parseMoney(order.total_amount).toFixed(2)}</strong></td></tr><tr><td>Paid</td><td class="money">৳${parseMoney(order.paid_amount).toFixed(2)}</td></tr><tr><td>Due</td><td class="money">৳${parseMoney(order.outstanding_amount).toFixed(2)}</td></tr></tbody></table><div class="section-title">Payment History</div>${paymentsTable}</div></div>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8" /><title>Offline Sale History - Details</title><style>${buildReportStyles()}</style></head><body><div class="sheet">${autoPrint ? '<div class="no-print" style="text-align:right;margin-bottom:12px"><button onclick="window.print()">Save / Download PDF</button></div>' : ''}<h1>Offline Sale History</h1><p class="muted">Exported from Errum admin. ${escapeHtml(getExportFilterLabel())}</p><div class="summary"><div class="card"><div class="label">Orders</div><div class="value">${sourceOrders.length}</div></div><div class="card"><div class="label">Total Sales Amount</div><div class="value">৳${totalExportSalesAmount.toFixed(2)}</div></div><div class="card"><div class="label">Mode</div><div class="value">With Details</div></div></div>${orderBlocks}</div>${autoPrint ? '<script>setTimeout(() => window.print(), 250);</script>' : ''}</body></html>`;
  };

  const buildExcelReportHtml = (sourceOrders: any[], rows: Record<string, any>[]) => {
    const moneyCols = new Set(['Subtotal', 'Order Discount', 'Shipping', 'Total', 'Paid', 'Due', 'Payment Amount', 'Line Total']);
    const tableRows = rows.map((row) => `<tr>${exportColumns.map((col) => `<td class="${moneyCols.has(col) ? 'num' : ''}">${escapeHtml((row as any)[col])}</td>`).join('')}</tr>`).join('');
    const totalExportSalesAmount = sourceOrders.reduce((sum, order) => sum + parseMoney(order.total_amount), 0);

    const detailTables = sourceOrders.map((order, index) => {
      const items = getOrderItems(order);
      const payments = getOrderPayments(order);
      return `<tr class="section"><td colspan="9">${index + 1}. ${escapeHtml(order.order_number || '')} — ${escapeHtml(formatExportDate(order.order_date || order.created_at))}</td></tr><tr><td>Customer</td><td colspan="2">${escapeHtml(order.customer?.name || 'N/A')}</td><td>Phone</td><td>${escapeHtml(order.customer?.phone || 'N/A')}</td><td>Store</td><td>${escapeHtml(order.store?.name || '')}</td><td>Status</td><td>${escapeHtml(order.status || '')}</td></tr><tr><td>Total</td><td>${parseMoney(order.total_amount).toFixed(2)}</td><td>Paid</td><td>${parseMoney(order.paid_amount).toFixed(2)}</td><td>Due</td><td>${parseMoney(order.outstanding_amount).toFixed(2)}</td><td>Discount</td><td>${parseMoney(order.discount_amount).toFixed(2)}</td><td>${escapeHtml(order.notes || '')}</td></tr><tr class="subhead"><td>Product</td><td>SKU</td><td>Batch</td><td>Barcode</td><td>Qty</td><td>Unit Price</td><td>Discount</td><td>Tax/VAT</td><td>Line Total</td></tr>${items.length ? items.map((item: any) => `<tr><td>${escapeHtml(item.product_name || '')}</td><td>${escapeHtml(item.product_sku || '')}</td><td>${escapeHtml(item.batch_number || '-')}</td><td>${escapeHtml(item.barcode || '-')}</td><td class="num">${escapeHtml(item.quantity ?? '')}</td><td class="num">${parseMoney(item.unit_price).toFixed(2)}</td><td class="num">${parseMoney(item.discount_amount).toFixed(2)}</td><td class="num">${parseMoney(item.tax_amount).toFixed(2)}</td><td class="num">${getItemLineTotal(item).toFixed(2)}</td></tr>`).join('') : '<tr><td colspan="9">No items found</td></tr>'}<tr class="subhead"><td>Payment Method</td><td>Payment Type</td><td>Amount</td><td>Status</td><td>Date</td><td colspan="4"></td></tr>${payments.length ? payments.map((payment: any) => `<tr><td>${escapeHtml(payment.payment_method || 'Unknown')}</td><td>${escapeHtml(payment.payment_type || '')}</td><td class="num">${parseMoney(payment.amount).toFixed(2)}</td><td>${escapeHtml(payment.status || '')}</td><td>${escapeHtml(formatExportDate(payment.created_at))}</td><td colspan="4"></td></tr>`).join('') : '<tr><td colspan="9">No payment history found</td></tr>'}<tr><td colspan="9"></td></tr>`;
    }).join('');

    const body = exportDetailMode === 'detailed'
      ? detailTables
      : `<tr>${exportColumns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>${tableRows}`;

    return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}th{background:#111827;color:white;font-weight:bold}td,th{border:1px solid #cbd5e1;padding:6px;font-size:11px;vertical-align:top}.title{font-size:18px;font-weight:bold;background:#e5e7eb}.meta{background:#f8fafc;color:#475569}.section{background:#dbeafe;font-weight:bold;font-size:13px}.subhead{background:#e5e7eb;font-weight:bold}.num{text-align:right;mso-number-format:"0.00"}</style></head><body><table><tr><td class="title" colspan="9">Offline Sale History</td></tr><tr><td class="meta" colspan="9">${escapeHtml(getExportFilterLabel())}</td></tr><tr><td class="meta">Orders/Rows</td><td>${exportDetailMode === 'detailed' ? sourceOrders.length : rows.length}</td><td class="meta">Total Sales</td><td>${totalExportSalesAmount.toFixed(2)}</td><td class="meta">Mode</td><td>${exportDetailMode === 'detailed' ? 'With Details' : 'Summary'}</td><td colspan="3"></td></tr>${body}</table></body></html>`;
  };

  const hydrateOrdersForDetailedExport = async (sourceOrders: any[]) => {
    const hydrated: any[] = [];

    for (let i = 0; i < sourceOrders.length; i += 10) {
      const chunk = sourceOrders.slice(i, i + 10);
      const chunkDetails = await Promise.all(chunk.map(async (order) => {
        try {
          return await orderService.getById(order.id);
        } catch (error) {
          console.warn(`Could not hydrate details for order ${order?.order_number || order?.id}`, error);
          return order;
        }
      }));
      hydrated.push(...chunkDetails);
    }

    return hydrated;
  };

  const getExportOrders = async () => {
    if (exportScope === 'shown') return filteredOrders;

    const limit = exportScope === 'top500' ? 500 : exportScope === 'top600' ? 600 : null;
    const perPage = limit ? Math.min(limit, 500) : 500;
    const firstPage = await orderService.getAll(buildOrderFilters({ per_page: perPage, page: 1 }));
    let collected = [...firstPage.data];

    if (exportScope === 'all') {
      for (let page = 2; page <= firstPage.last_page; page += 1) {
        const result = await orderService.getAll(buildOrderFilters({ per_page: perPage, page }));
        collected = collected.concat(result.data);
      }
      return collected;
    }

    let page = 2;
    while (limit && collected.length < limit && page <= firstPage.last_page) {
      const result = await orderService.getAll(buildOrderFilters({ per_page: perPage, page }));
      collected = collected.concat(result.data);
      page += 1;
    }

    return collected.slice(0, limit || collected.length);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const baseOrders = await getExportOrders();
      const sourceOrders = exportDetailMode === 'detailed'
        ? await hydrateOrdersForDetailedExport(baseOrders)
        : baseOrders;
      const rows = toExportRows(sourceOrders);
      const range = getEffectiveDateRange();
      const dateLabel = exactDate || [range.from || 'all', range.to || 'latest'].join('_to_');
      const detailLabel = exportDetailMode === 'detailed' ? 'with-details' : 'without-details';
      const filenameBase = `offline-sale-history_${detailLabel}_${dateLabel}_${new Date().toISOString().slice(0, 10)}`;

      if (sourceOrders.length === 0) {
        alert('No offline sale history rows found for export.');
        return;
      }

      if (exportFormat === 'csv') {
        if (exportDetailMode === 'detailed') {
          const detailRows = toDetailedCsvRows(sourceOrders);
          const csv = [detailedCsvColumns.join(','), ...detailRows.map((row) => detailedCsvColumns.map((col) => escapeCsv((row as any)[col])).join(','))].join('\n');
          downloadBlob(csv, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
          return;
        }

        const csv = [exportColumns.join(','), ...rows.map((row) => exportColumns.map((col) => escapeCsv((row as any)[col])).join(','))].join('\n');
        downloadBlob(csv, `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
        return;
      }

      const html = exportDetailMode === 'detailed'
        ? buildDetailedReportHtml(sourceOrders, exportFormat === 'pdf')
        : buildSummaryReportHtml(sourceOrders, rows, exportFormat === 'pdf');

      if (exportFormat === 'excel') {
        const excelHtml = buildExcelReportHtml(sourceOrders, rows);
        downloadBlob(excelHtml, `${filenameBase}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
        return;
      }

      const w = window.open('', '_blank', 'width=1200,height=800');
      if (!w) {
        alert('Popup blocked. Please allow popups to save/download PDF.');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(error?.message || 'Failed to export offline sale history');
    } finally {
      setExporting(false);
    }
  };

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
                  Offline Sale History
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
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Sales Amount</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ৳{totalSalesAmount.toFixed(2)}
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Order#, customer, phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {!canSelectStore && scopedStoreId ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Store</label>
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
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Store</label>
                      <select
                        value={selectedStore}
                        onChange={(e) => setSelectedStore(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="">All Stores</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name} - {store.location}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Exact Date</label>
                    <input
                      type="date"
                      value={exactDate}
                      onChange={(e) => handleExactDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase px-1">From</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase px-1">To</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex flex-col gap-1 md:col-span-2 xl:col-span-5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Date Actions</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleTodayFilter}
                        className="px-3 py-2 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={clearDateFilters}
                        disabled={!exactDate && !startDate && !endDate}
                        className="px-3 py-2 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Clear Date Filter
                      </button>
                      {(exactDate || startDate || endDate) && (
                        <span className="self-center text-xs text-gray-500 dark:text-gray-400">
                          Showing order dates {getEffectiveDateRange().from || 'beginning'} to {getEffectiveDateRange().to || 'latest'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Download className="w-4 h-4" /> Export Offline Sale History
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Export uses the same search, store, and date filters currently applied above.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Format</label>
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                        <option value="excel">Excel</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Details</label>
                      <select
                        value={exportDetailMode}
                        onChange={(e) => setExportDetailMode(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="summary">Without details</option>
                        <option value="detailed">With details</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Rows</label>
                      <select
                        value={exportScope}
                        onChange={(e) => setExportScope(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="shown">Current shown rows</option>
                        <option value="top500">Top 500 filtered rows</option>
                        <option value="top600">Top 600 filtered rows</option>
                        <option value="all">All filtered rows</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={exporting || loading}
                      className="px-4 py-2 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {exporting ? 'Exporting...' : 'Export'}
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <div className="text-gray-500 dark:text-gray-400">Loading orders...</div>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <div className="text-gray-500 dark:text-gray-400">No offline sale orders found</div>
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
                              {order.is_deleted_offline_sale && (
                                <span className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold">
                                  Deleted sale · stock restored to new batch
                                </span>
                              )}
                              <span className={`text-xs px-2 py-1 rounded ${order.payment_status === 'paid'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : order.payment_status === 'partial'
                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                }`}>
                                {order.is_deleted_offline_sale ? 'Deleted' : order.payment_status === 'paid' ? 'Paid' :
                                  order.payment_status === 'partial' ? 'Partial' : order.payment_status === 'refunded' ? 'Cancelled' : 'Pending'}
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
                              <div className="md:col-span-2 lg:col-span-4">
                                <span className="text-gray-600 dark:text-gray-400">Payment: </span>
                                <span className="text-gray-900 dark:text-white font-medium">
                                  {formatPaymentBreakdown(order)}
                                </span>
                              </div>
                              {order.notes && (
                                <div className="md:col-span-2 lg:col-span-4 rounded-md bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 px-3 py-2">
                                  <span className="text-blue-700 dark:text-blue-300 font-medium">Order Note: </span>
                                  <span className="text-gray-800 dark:text-gray-200">{order.notes}</span>
                                </div>
                              )}
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
                                    setMenuPosition(computeMenuPosition(rect, 192, 80, 8, 8));
                                  }
                                  setActiveMenu(next);
                                }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                              >
                                <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              </button>

                              {activeMenu === order.id && menuPosition && (
                                <div className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-gray-300 dark:border-gray-600 z-50" style={{ top: menuPosition.top, left: menuPosition.left }}>
                                  {!order.is_deleted_offline_sale && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openOfflineEdit(order);
                                      }}
                                      className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 rounded-lg transition-colors"
                                    >
                                      <Pencil className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                                      <span>Edit Sale</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePrint(order);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 rounded-lg transition-colors"
                                  >
                                    <Printer className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                                    <span>Print Receipt</span>
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
                            <AccessControl roles={["super-admin", "admin", "online-moderator", "branch-manager"]}>
                              <button
                                onClick={() => handleDelete(order.id)}
                                disabled={order.is_deleted_offline_sale}
                                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={order.is_deleted_offline_sale ? 'Already deleted' : 'Delete offline sale'}
                              >
                                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                              </button>
                            </AccessControl>
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
                                      {order.payments?.map((payment: any) => {
                                        const splits = getPaymentSplits(payment);

                                        if (splits.length > 0) {
                                          return (
                                            <div key={payment.id} className="rounded-md bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 p-2 space-y-1">
                                              <div className="flex justify-between text-xs font-medium">
                                                <span className="text-gray-700 dark:text-gray-300">
                                                  Split Payment ({payment.payment_type})
                                                </span>
                                                <span className="text-gray-900 dark:text-white">
                                                  {money(payment.amount)}
                                                </span>
                                              </div>
                                              <div className="space-y-1 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                                                {splits.map((split: any, splitIndex: number) => (
                                                  <div key={`${payment.id}-split-${splitIndex}`} className="flex justify-between text-xs">
                                                    <span className="text-gray-600 dark:text-gray-400">
                                                      {normalizePaymentLabel(split.payment_method || 'Unknown method', splitIndex, splits)}
                                                    </span>
                                                    <span className="text-gray-900 dark:text-white font-medium">
                                                      {money(split.amount)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={payment.id} className="flex justify-between text-xs">
                                            <span className="text-gray-600 dark:text-gray-400">
                                              {payment.payment_method} ({payment.payment_type})
                                            </span>
                                            <span className="text-gray-900 dark:text-white">
                                              {money(payment.amount)}
                                            </span>
                                          </div>
                                        );
                                      })}
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

      {editingOfflineOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Offline Sale</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{editingOfflineOrder.order_number} · item totals cannot be changed here</p>
              </div>
              <button onClick={() => setEditingOfflineOrder(null)} className="p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Customer Name</label>
                  <input value={offlineEditForm.customer_name} onChange={(e) => setOfflineEditForm((p: any) => ({ ...p, customer_name: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Phone</label>
                  <input value={offlineEditForm.customer_phone} onChange={(e) => setOfflineEditForm((p: any) => ({ ...p, customer_phone: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Email</label>
                  <input value={offlineEditForm.customer_email} onChange={(e) => setOfflineEditForm((p: any) => ({ ...p, customer_email: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Order Date</label>
                  <input type="date" value={offlineEditForm.order_date} onChange={(e) => setOfflineEditForm((p: any) => ({ ...p, order_date: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Address / Note</label>
                  <textarea rows={2} value={offlineEditForm.customer_address} onChange={(e) => setOfflineEditForm((p: any) => ({ ...p, customer_address: e.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white" />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">Payment Breakdown</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total must remain {money(editingOfflineOrder.paid_amount)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOfflineEditForm((p: any) => ({ ...p, payment_breakdown: [...(p.payment_breakdown || []), { payment_method_id: paymentMethods[0]?.id || 0, amount: 0, wallet: '', transaction_reference: '', notes: '' }] }))}
                    className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(offlineEditForm.payment_breakdown || []).map((row: any, index: number) => {
                    const method = paymentMethods.find((m) => Number(m.id) === Number(row.payment_method_id));
                    const isMobile = method?.type === 'mobile_banking' || /mobile|bkash|nagad/i.test(method?.name || '');
                    return (
                      <div key={index} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-4">
                          <label className="text-[10px] uppercase font-semibold text-gray-500">Method</label>
                          <select value={row.payment_method_id} onChange={(e) => updateEditPaymentRow(index, { payment_method_id: Number(e.target.value), wallet: '' })} className="mt-1 w-full px-2 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white text-sm">
                            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        {isMobile && (
                          <div className="md:col-span-2">
                            <label className="text-[10px] uppercase font-semibold text-gray-500">Wallet</label>
                            <select value={row.wallet || ''} onChange={(e) => updateEditPaymentRow(index, { wallet: e.target.value })} className="mt-1 w-full px-2 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white text-sm">
                              <option value="">Mobile</option>
                              <option value="bkash">bKash</option>
                              <option value="nagad">Nagad</option>
                            </select>
                          </div>
                        )}
                        <div className={isMobile ? 'md:col-span-2' : 'md:col-span-3'}>
                          <label className="text-[10px] uppercase font-semibold text-gray-500">Amount</label>
                          <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => updateEditPaymentRow(index, { amount: e.target.value })} className="mt-1 w-full px-2 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white text-sm" />
                        </div>
                        <div className={isMobile ? 'md:col-span-3' : 'md:col-span-4'}>
                          <label className="text-[10px] uppercase font-semibold text-gray-500">Reference</label>
                          <input value={row.transaction_reference || ''} onChange={(e) => updateEditPaymentRow(index, { transaction_reference: e.target.value })} className="mt-1 w-full px-2 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white text-sm" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setOfflineEditForm((p: any) => ({ ...p, payment_breakdown: (p.payment_breakdown || []).filter((_: any, i: number) => i !== index) }))}
                          className="md:col-span-1 px-2 py-2 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Breakdown total</span>
                  <span className="font-bold text-gray-900 dark:text-white">{money((offlineEditForm.payment_breakdown || []).reduce((sum: number, row: any) => sum + parseMoney(row.amount), 0))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingOfflineOrder(null)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">Cancel</button>
                <button type="button" disabled={savingOfflineEdit} onClick={saveOfflineEdit} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
                  {savingOfflineEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
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