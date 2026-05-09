'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Globe, DollarSign, CreditCard, Wallet, Truck } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import axios from '@/lib/axios';
import defectIntegrationService from '@/services/defectIntegrationService';
import Toast from '@/components/Toast';

const SC_EDIT_CONTEXT_KEY = 'socialCommerceEditContextV1';

interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  type: string;
  supports_partial: boolean;
  requires_reference: boolean;
  fixed_fee?: number;
  percentage_fee?: number;
}

type PaymentOption = 'full' | 'partial' | 'none' | 'installment';

const parseNumber = (v: any): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const calculateItemAmount = (item: any): number => {
  if (item?.amount !== undefined && item?.amount !== null) return parseNumber(item.amount);
  const unitPrice = parseNumber(item?.unit_price);
  const qty = parseNumber(item?.quantity);
  const disc = parseNumber(item?.discount_amount);
  return unitPrice * qty - disc;
};

const normalizeKey = (item: any): string => {
  const productId = Number(item?.product_id ?? item?.productId ?? 0) || 0;
  const batchId = Number(item?.batch_id ?? item?.batchId ?? 0) || 0;
  return `${productId}::${batchId}`;
};

const normalizeShippingPayload = (addr: any) => {
  if (!addr || typeof addr !== 'object') return {};
  const normalized = { ...addr };

  // 1. address_line1 is mandatory
  if (!normalized.address_line1) {
    normalized.address_line1 = normalized.street || normalized.address || normalized.address_line_1 || '';
  }

  // 2. city is mandatory
  if (!normalized.city) {
    normalized.city = 'Dhaka'; // Default domestic fallback
  }

  // 3. country is mandatory
  if (!normalized.country) {
    normalized.country = 'Bangladesh'; // Default domestic fallback
  }

  return normalized;
};

export default function AmountDetailsPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orderData, setOrderData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // VAT is inclusive in product prices; do not add extra VAT here
  const [transportCost, setTransportCost] = useState('0');
  const [orderDiscountAmount, setOrderDiscountAmount] = useState('0');

  // Advanced payment options
  // Default to full Cash on Delivery (no advance)
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('none');
  const [advanceAmount, setAdvanceAmount] = useState('');

  // Installment / EMI
  const [installmentCount, setInstallmentCount] = useState(3);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [codPaymentMethod, setCodPaymentMethod] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Intended courier marker (saved after order creation)
  const [intendedCourier, setIntendedCourier] = useState('pathao');

  const courierOptions = useMemo(() => {
    return ['pathao', 'Sundarban', 'Pending', 'Partial Order'];
  }, []);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  // Existing payment info (for Edit mode)
  const [alreadyPaid, setAlreadyPaid] = useState<number>(0);
  const [totalAmountState, setTotalAmountState] = useState<number>(0);
  const [outstandingAmountState, setOutstandingAmountState] = useState<number>(0);
  const [originalDiscountAmount, setOriginalDiscountAmount] = useState<number>(0);
  const [originalShippingAmount, setOriginalShippingAmount] = useState<number>(0);

  const displayToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  useEffect(() => {
    const storedOrder = sessionStorage.getItem('pendingOrder');
    if (!storedOrder) {
      window.location.href = '/social-commerce';
      return;
    }

    const parsedOrder = JSON.parse(storedOrder);

    // Keep social-commerce edit mode sticky across page transitions/drafts.
    // If this id is missing, the old code fell back to POST /orders and created a duplicate order.
    try {
      const editCtx = JSON.parse(sessionStorage.getItem(SC_EDIT_CONTEXT_KEY) || '{}');
      const contextEditOrderId = Number(editCtx.editOrderId || 0) || null;
      if (!parsedOrder.editOrderId && contextEditOrderId) {
        parsedOrder.editOrderId = contextEditOrderId;
      }
      if (!parsedOrder.editOrderNumber && typeof editCtx.editOrderNumber === 'string') {
        parsedOrder.editOrderNumber = editCtx.editOrderNumber;
      }
      if (parsedOrder.editOrderId) {
        sessionStorage.setItem(
          SC_EDIT_CONTEXT_KEY,
          JSON.stringify({
            editOrderId: Number(parsedOrder.editOrderId),
            editOrderNumber: parsedOrder.editOrderNumber || editCtx.editOrderNumber || null,
          })
        );
      }
    } catch {
      // ignore bad session data
    }

    // Load payment/amount metadata for existing orders
    if (parsedOrder.paid_amount !== undefined) setAlreadyPaid(parseNumber(parsedOrder.paid_amount));
    if (parsedOrder.total_amount !== undefined) setTotalAmountState(parseNumber(parsedOrder.total_amount));
    if (parsedOrder.outstanding_amount !== undefined) setOutstandingAmountState(parseNumber(parsedOrder.outstanding_amount));
    if (parsedOrder.original_discount_amount !== undefined) {
      setOriginalDiscountAmount(parseNumber(parsedOrder.original_discount_amount));
      setOrderDiscountAmount(String(parsedOrder.original_discount_amount));
    }
    if (parsedOrder.original_shipping_amount !== undefined) {
      setOriginalShippingAmount(parseNumber(parsedOrder.original_shipping_amount));
      setTransportCost(String(parsedOrder.original_shipping_amount));
    }

    const processedItems = (parsedOrder.items || []).map((item: any) => ({
      ...item,
      amount: calculateItemAmount(item),
    }));

    const processedServices = (parsedOrder.services || []).map((svc: any) => ({
      ...svc,
      amount: calculateItemAmount(svc),
    }));

    parsedOrder.items = processedItems;
    parsedOrder.services = processedServices;

    // Always rebuild subtotal from line totals. Product/item discounts are already
    // deducted in calculateItemAmount(), so this is the NET item subtotal.
    // This prevents stale/gross subtotal from making the order total wrong.
    const itemSubtotal = processedItems.reduce((sum: number, item: any) => sum + item.amount, 0);
    const serviceSubtotal = processedServices.reduce((sum: number, svc: any) => sum + svc.amount, 0);
    parsedOrder.subtotal = itemSubtotal + serviceSubtotal;

    setOrderData(parsedOrder);
    setTransportCost(String(parseNumber(parsedOrder.shipping_amount ?? parsedOrder.shippingAmount ?? 0)));
    setOrderDiscountAmount(String(parseNumber(parsedOrder.discount_amount ?? parsedOrder.orderDiscountAmount ?? parsedOrder.order_discount_amount ?? 0)));

    const fetchPaymentMethods = async () => {
      try {
        const response = await axios.get('/payment-methods', { params: { customer_type: 'social_commerce' } });
        const payload = response.data?.data ?? response.data;
        const methods: PaymentMethod[] = payload?.payment_methods || payload?.data?.payment_methods || payload?.methods || payload || [];

        const normalized = Array.isArray(methods) ? methods : [];
        setPaymentMethods(normalized);

        // Defaults: mobile_banking for advance/full, cash for COD
        const mobile = normalized.find((m) => m.type === 'mobile_banking') || normalized[0];
        const cash = normalized.find((m) => m.type === 'cash') || normalized.find((m) => m.code?.toLowerCase?.() === 'cash');

        if (mobile) setSelectedPaymentMethod(String(mobile.id));
        if (cash) setCodPaymentMethod(String(cash.id));
      } catch (err) {
        console.error('Error fetching payment methods:', err);
        setPaymentMethods([]);
      }
    };

    fetchPaymentMethods();
  }, []);

  const shippingForUi = useMemo(() => {
    if (!orderData) return null;
    return orderData.deliveryAddress || orderData.shipping_address || orderData.delivery_address || null;
  }, [orderData]);

  const itemDiscountTotal = useMemo(() => {
    const itemDisc = (orderData?.items || []).reduce((sum: number, it: any) => sum + parseNumber(it?.discount_amount), 0);
    const serviceDisc = (orderData?.services || []).reduce((sum: number, it: any) => sum + parseNumber(it?.discount_amount), 0);
    return itemDisc + serviceDisc;
  }, [orderData]);

  const grossSubtotal = useMemo(() => {
    const itemGross = (orderData?.items || []).reduce((sum: number, it: any) => {
      return sum + parseNumber(it?.unit_price) * (parseNumber(it?.quantity) || 1);
    }, 0);
    const serviceGross = (orderData?.services || []).reduce((sum: number, it: any) => {
      return sum + parseNumber(it?.unit_price) * (parseNumber(it?.quantity) || 1);
    }, 0);
    return itemGross + serviceGross;
  }, [orderData]);

  const subtotal = useMemo(() => Math.max(0, grossSubtotal - itemDiscountTotal), [grossSubtotal, itemDiscountTotal]);
  const orderDiscount = useMemo(() => Math.max(0, parseNumber(orderDiscountAmount)), [orderDiscountAmount]);
  const transport = useMemo(() => parseNumber(transportCost), [transportCost]);
  const total = useMemo(() => Math.max(0, subtotal - orderDiscount + transport), [subtotal, orderDiscount, transport]);
  
  const isEditMode = useMemo(() => !!(orderData?.editOrderId), [orderData]);

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => String(m.id) === String(selectedPaymentMethod)),
    [paymentMethods, selectedPaymentMethod]
  );
  const codMethod = useMemo(
    () => paymentMethods.find((m) => String(m.id) === String(codPaymentMethod)),
    [paymentMethods, codPaymentMethod]
  );

  const suggestedInstallmentAmount = useMemo(() => {
    if (paymentOption !== 'installment') return 0;
    const n = Math.max(2, Math.min(24, Number(installmentCount) || 2));
    const remaining = total - alreadyPaid;
    if (remaining <= 0) return 0;
    return Number((remaining / n).toFixed(2));
  }, [total, alreadyPaid, paymentOption, installmentCount]);

  const [installmentPayNow, setInstallmentPayNow] = useState('');

  useEffect(() => {
    if (paymentOption !== 'installment') {
      setInstallmentPayNow('');
      return;
    }

    setInstallmentPayNow((prev) => {
      const prevNum = parseNumber(prev);
      if (prevNum > 0) return prev;
      return suggestedInstallmentAmount > 0 ? String(suggestedInstallmentAmount) : '';
    });
  }, [paymentOption, suggestedInstallmentAmount]);

  const advance = useMemo(() => {
    if (paymentOption === 'none') return 0;
    const remaining = total - alreadyPaid;
    if (paymentOption === 'full') return Math.max(0, remaining);
    if (paymentOption === 'installment') return parseNumber(installmentPayNow);
    return parseNumber(advanceAmount);
  }, [paymentOption, total, alreadyPaid, advanceAmount, installmentPayNow]);

  const finalDue = useMemo(() => Math.max(0, total - alreadyPaid - advance), [total, alreadyPaid, advance]);

  const codAmount = useMemo(() => {
    if (paymentOption === 'full') return 0;
    if (paymentOption === 'none') return Math.max(0, total - alreadyPaid);
    if (paymentOption === 'installment') return 0;
    return Math.max(0, total - alreadyPaid - advance);
  }, [paymentOption, total, alreadyPaid, advance]);

  const advanceFee = useMemo(() => {
    if (!selectedMethod || paymentOption === 'none') return 0;
    const fixed = parseNumber(selectedMethod.fixed_fee);
    const pct = parseNumber(selectedMethod.percentage_fee);
    return fixed + (advance * pct) / 100;
  }, [selectedMethod, paymentOption, advance]);

  const codFee = useMemo(() => {
    if (!codMethod) return 0;
    if (paymentOption !== 'partial' && paymentOption !== 'none') return 0;
    const fixed = parseNumber(codMethod.fixed_fee);
    const pct = parseNumber(codMethod.percentage_fee);
    return fixed + (codAmount * pct) / 100;
  }, [codMethod, paymentOption, codAmount]);

  const totalFees = useMemo(() => advanceFee + codFee, [advanceFee, codFee]);

  if (!orderData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    // Store can be blank for auto-assigned social/e-commerce orders.
    // If a store is selected on the previous page, we pass it. Otherwise the backend keeps store_id null.
    const parsedStoreId = Number.parseInt(String(orderData?.store_id ?? ''), 10);
    const hasStoreId = Number.isFinite(parsedStoreId) && parsedStoreId > 0;

    // Validation: payment methods
    if (paymentOption === 'full' || paymentOption === 'partial' || paymentOption === 'installment') {
      if (!selectedPaymentMethod) {
        displayToast('Please select a payment method', 'error');
        return;
      }
      // Transaction reference is optional (even if a method normally requires it)
    }

    // Installment validation
    if (paymentOption === 'installment') {
      const n = Math.max(2, Math.min(24, Number(installmentCount) || 2));
      if (n < 2) {
        displayToast('Total installments must be at least 2', 'error');
        return;
      }
      if (advance <= 0) {
        displayToast('Installment amount is invalid', 'error');
        return;
      }
    }

    if (paymentOption === 'partial') {
      if (!advanceAmount || advance <= 0 || advance >= total) {
        displayToast('Please enter a valid advance amount (between 0 and total)', 'error');
        return;
      }
      if (!codPaymentMethod) {
        displayToast('Please select a COD payment method', 'error');
        return;
      }
    }

    if (paymentOption === 'none') {
      if (!codPaymentMethod) {
        displayToast('Please select a COD payment method', 'error');
        return;
      }
    }

    setIsProcessing(true);

    try {
      let editContextOrderId: number | null = null;
      let editContextOrderNumber: string | null = null;
      try {
        const editCtx = JSON.parse(sessionStorage.getItem(SC_EDIT_CONTEXT_KEY) || '{}');
        editContextOrderId = Number(editCtx.editOrderId || 0) || null;
        editContextOrderNumber = typeof editCtx.editOrderNumber === 'string' ? editCtx.editOrderNumber : null;
      } catch {
        // ignore bad session data
      }

      const effectiveEditOrderId = Number(orderData?.editOrderId || editContextOrderId || 0) || null;
      const isEditMode = !!effectiveEditOrderId;
      const rawShipping = orderData.shipping_address || orderData.delivery_address || orderData.deliveryAddress || {};
      const shippingPayload = normalizeShippingPayload(rawShipping);

      const itemPayloads = (orderData.items || []).map((item: any) => {
        const rawExistingId = Number(item.id ?? item.order_item_id ?? 0) || 0;
        const numericExistingId = rawExistingId > 0 && rawExistingId < 1000000000 ? rawExistingId : null;
        return {
          id: numericExistingId,
          product_id: item.product_id,
          batch_id: item.batch_id ?? null,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          discount_amount: Number(item.discount_amount) || 0,
        };
      });

      let createdOrder: any = null;

      if (isEditMode) {
        const targetOrderId = Number(effectiveEditOrderId);
        if (!targetOrderId) {
          throw new Error('Edit order id missing');
        }

        const updatePayload: any = {
          customer_name: orderData.customer?.name,
          customer_phone: orderData.customer?.phone,
          customer_email: orderData.customer?.email || undefined,
          customer_address: orderData.customer?.address || undefined,
          shipping_address: shippingPayload,
          discount_amount: orderDiscount,
          shipping_amount: transport,
          ...(Array.isArray(orderData.services) && orderData.services.length > 0 ? { services: orderData.services } : {}),
          ...(String(orderData.notes || '').trim() ? { notes: String(orderData.notes).trim() } : {}),
        };

        console.log('✏️ Updating order:', targetOrderId, updatePayload);
        const updateResponse = await axios.patch(`/orders/${targetOrderId}`, updatePayload);
        const updateBody: any = updateResponse.data;
        if (updateBody?.success === false) {
          throw new Error(updateBody?.message || 'Failed to update order');
        }

        const existingResponse = await axios.get(`/orders/${targetOrderId}`);
        const existingBody: any = existingResponse.data;
        if (existingBody?.success === false) {
          throw new Error(existingBody?.message || 'Failed to load existing order items');
        }

        const existingOrder = existingBody?.data ?? existingBody;
        const existingItems = Array.isArray(existingOrder?.items) ? existingOrder.items : [];

        const desiredById = new Map<number, any>();
        const desiredUnmatched: any[] = [];
        for (const item of itemPayloads) {
          const numericId = Number(item.id);
          if (numericId) desiredById.set(numericId, item);
          else desiredUnmatched.push(item);
        }

        const usedExistingIds = new Set<number>();

        for (const existingItem of existingItems) {
          const existingId = Number(existingItem?.id);
          if (!existingId) continue;

          if (desiredById.has(existingId)) {
            const desiredItem = desiredById.get(existingId);
            await axios.put(`/orders/${targetOrderId}/items/${existingId}`, {
              quantity: desiredItem.quantity,
              unit_price: desiredItem.unit_price,
              discount_amount: desiredItem.discount_amount,
            });
            usedExistingIds.add(existingId);
            desiredById.delete(existingId);
            continue;
          }

          const fallbackIndex = desiredUnmatched.findIndex((candidate) => normalizeKey(candidate) === normalizeKey(existingItem));
          if (fallbackIndex >= 0) {
            const desiredItem = desiredUnmatched.splice(fallbackIndex, 1)[0];
            await axios.put(`/orders/${targetOrderId}/items/${existingId}`, {
              quantity: desiredItem.quantity,
              unit_price: desiredItem.unit_price,
              discount_amount: desiredItem.discount_amount,
            });
            usedExistingIds.add(existingId);
            continue;
          }

          await axios.delete(`/orders/${targetOrderId}/items/${existingId}`);
        }

        for (const [, desiredItem] of desiredById) {
          await axios.post(`/orders/${targetOrderId}/items`, {
            product_id: desiredItem.product_id,
            batch_id: desiredItem.batch_id,
            quantity: desiredItem.quantity,
            unit_price: desiredItem.unit_price,
            discount_amount: desiredItem.discount_amount,
          });
        }

        for (const desiredItem of desiredUnmatched) {
          await axios.post(`/orders/${targetOrderId}/items`, {
            product_id: desiredItem.product_id,
            batch_id: desiredItem.batch_id,
            quantity: desiredItem.quantity,
            unit_price: desiredItem.unit_price,
            discount_amount: desiredItem.discount_amount,
          });
        }

        const refreshedResponse = await axios.get(`/orders/${targetOrderId}`);
        const refreshedBody: any = refreshedResponse.data;
        if (refreshedBody?.success === false) {
          throw new Error(refreshedBody?.message || 'Order updated but failed to reload final details');
        }
        createdOrder = refreshedBody?.data ?? refreshedBody;
      } else {
        // 1) Create order (sanitize payload)
        const orderPayload: any = {
          order_type: orderData.order_type || 'social_commerce',
          ...(hasStoreId ? { store_id: parsedStoreId, store_assignment_mode: 'assign_now' } : {}),
          customer: {
            name: orderData.customer?.name,
            email: orderData.customer?.email || undefined,
            phone: orderData.customer?.phone,
          },
          shipping_address: shippingPayload,
          delivery_address: shippingPayload,
          items: itemPayloads.map((item: any) => ({
            product_id: item.product_id,
            batch_id: item.batch_id ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_amount: item.discount_amount || 0,
            // VAT is inclusive; do not add extra tax
            tax_amount: 0,
          })),
          // ✅ Services (kept separate from items)
          ...(Array.isArray(orderData.services) && orderData.services.length > 0
            ? { services: orderData.services }
            : {}),
          discount_amount: orderDiscount,
          shipping_amount: transport,
          ...(paymentOption === 'installment'
            ? {
                installment_plan: {
                  total_installments: Math.max(2, Math.min(24, Number(installmentCount) || 2)),
                  installment_amount: suggestedInstallmentAmount,
                  // Some backends validate date; omit instead of null
                  start_date: undefined,
                },
              }
            : {}),
          ...(String(orderData.notes || '').trim() ? { notes: String(orderData.notes).trim() } : {}),
        };

        console.log('📦 Creating order:', orderPayload);
        const createOrderResponse = await axios.post('/orders', orderPayload);
        const createBody: any = createOrderResponse.data;
        if (createBody?.success === false) {
          throw new Error(createBody?.message || 'Failed to create order');
        }
        createdOrder = createBody?.data ?? createBody;
        if (!createdOrder?.id) {
          throw new Error('Order was not created (missing order id)');
        }
        console.log('✅ Order created:', createdOrder.order_number);
      }

      if (!createdOrder?.id) {
        throw new Error('Order save failed (missing order id)');
      }

      // 2) Set intended courier marker (optional)
      if (intendedCourier && intendedCourier.trim()) {
        try {
          await axios.patch(`/orders/${createdOrder.id}/set-courier`, {
            intended_courier: intendedCourier.trim(),
          });
        } catch (e) {
          console.warn('Failed to set intended courier marker:', e);
          // Don't fail order placement if marker update fails
          displayToast('Order placed, but failed to set order marker.', 'warning');
        }
      }

      // 3) Defective items
      const defectiveItems = orderData.defectiveItems || [];
      if (defectiveItems.length > 0) {
        console.log('🏷️ Processing defective items:', defectiveItems.length);
        for (const defectItem of defectiveItems) {
          try {
            await defectIntegrationService.markDefectiveAsSold(defectItem.defectId, {
              order_id: createdOrder.id,
              selling_price: defectItem.price,
              sale_notes: `Sold via Social Commerce - Order #${createdOrder.order_number}`,
              sold_at: new Date().toISOString(),
            });
          } catch (e) {
            console.warn('Failed to mark defect as sold:', defectItem?.defectId, e);
          }
        }
      }

      // 4) Payments
      if (paymentOption === 'full' && (total - alreadyPaid) > 0) {
        const paymentData: any = {
          payment_method_id: parseInt(selectedPaymentMethod, 10),
          amount: total - alreadyPaid,
          payment_type: 'full',
          auto_complete: true,
          notes: paymentNotes || `Social Commerce full payment via ${selectedMethod?.name}`,
          payment_data: {},
        };

        if (transactionReference) {
          paymentData.transaction_reference = transactionReference;
          paymentData.external_reference = transactionReference;
        }

        if (selectedMethod?.type === 'mobile_banking' && transactionReference) {
          paymentData.payment_data = {
            mobile_number: orderData.customer?.phone,
            provider: selectedMethod.name,
            transaction_id: transactionReference,
          };
        } else if (selectedMethod?.type === 'card' && transactionReference) {
          paymentData.payment_data = {
            card_reference: transactionReference,
            payment_method: selectedMethod.name,
          };
        } else if (selectedMethod?.type === 'bank_transfer' && transactionReference) {
          paymentData.payment_data = {
            transfer_reference: transactionReference,
            bank_name: selectedMethod.name,
          };
        } else {
          paymentData.payment_data = {
            notes: paymentNotes || `Payment via ${selectedMethod?.name}`,
          };
        }

        const paymentResponse = await axios.post(`/orders/${createdOrder.id}/payments/simple`, paymentData);
        if (!paymentResponse.data?.success) {
          throw new Error(paymentResponse.data?.message || 'Failed to process payment');
        }
      }

      if (paymentOption === 'partial' && advance > 0) {
        const advancePaymentData: any = {
          payment_method_id: parseInt(selectedPaymentMethod, 10),
          amount: advance,
          payment_type: 'partial',
          auto_complete: true,
          notes: paymentNotes || `Advance via ${selectedMethod?.name}. COD remaining: ৳${(total - alreadyPaid - advance).toFixed(2)}`,
          payment_data: {},
        };

        if (transactionReference) {
          advancePaymentData.transaction_reference = transactionReference;
          advancePaymentData.external_reference = transactionReference;
        }

        if (selectedMethod?.type === 'mobile_banking' && transactionReference) {
          advancePaymentData.payment_data = {
            mobile_number: orderData.customer?.phone,
            provider: selectedMethod.name,
            transaction_id: transactionReference,
            payment_stage: 'advance',
          };
        } else if (selectedMethod?.type === 'card' && transactionReference) {
          advancePaymentData.payment_data = {
            card_reference: transactionReference,
            payment_method: selectedMethod.name,
            payment_stage: 'advance',
          };
        } else if (selectedMethod?.type === 'bank_transfer' && transactionReference) {
          advancePaymentData.payment_data = {
            transfer_reference: transactionReference,
            bank_name: selectedMethod.name,
            payment_stage: 'advance',
          };
        } else {
          advancePaymentData.payment_data = {
            notes: `Advance payment - COD remaining: ৳${codAmount.toFixed(2)}`,
            payment_stage: 'advance',
          };
        }

        const advanceResponse = await axios.post(`/orders/${createdOrder.id}/payments/simple`, advancePaymentData);
        if (!advanceResponse.data?.success) {
          throw new Error(advanceResponse.data?.message || 'Failed to process advance payment');
        }
      }


      if (paymentOption === 'installment' && advance > 0) {
        const firstPayment: any = {
          payment_method_id: parseInt(selectedPaymentMethod, 10),
          amount: advance,
          auto_complete: true,
          notes: paymentNotes || `Installment/EMI - 1st installment of ${installmentCount} via ${selectedMethod?.name}`,
          payment_data: {},
        };

        if (transactionReference) {
          firstPayment.transaction_reference = transactionReference;
          firstPayment.external_reference = transactionReference;
        }

        if (selectedMethod?.type === 'mobile_banking' && transactionReference) {
          firstPayment.payment_data = {
            mobile_number: orderData.customer?.phone,
            provider: selectedMethod.name,
            transaction_id: transactionReference,
            payment_stage: 'installment_1',
          };
        } else if (selectedMethod?.type === 'card' && transactionReference) {
          firstPayment.payment_data = {
            card_reference: transactionReference,
            payment_method: selectedMethod.name,
            payment_stage: 'installment_1',
          };
        } else if (selectedMethod?.type === 'bank_transfer' && transactionReference) {
          firstPayment.payment_data = {
            transfer_reference: transactionReference,
            bank_name: selectedMethod.name,
            payment_stage: 'installment_1',
          };
        } else {
          firstPayment.payment_data = {
            notes: paymentNotes || `Installment payment via ${selectedMethod?.name}`,
            payment_stage: 'installment_1',
          };
        }

        const instResponse = await axios.post(`/orders/${createdOrder.id}/payments/installment`, firstPayment);
        if (!instResponse.data?.success) {
          throw new Error(instResponse.data?.message || 'Failed to process installment payment');
        }
      }

      // paymentOption === 'none' => no payment now

      const actionWord = isEditMode ? 'updated' : 'placed';
      const msg =
        paymentOption === 'full'
          ? `Order ${createdOrder.order_number} ${actionWord} with full payment.`
          : paymentOption === 'partial'
            ? `Order ${createdOrder.order_number} ${actionWord}. Advance ৳${advance.toFixed(2)}, COD ৳${codAmount.toFixed(2)}.`
            : paymentOption === 'installment'
              ? `Order ${createdOrder.order_number} ${actionWord} on EMI. ${installmentCount} installments × ৳${suggestedInstallmentAmount.toFixed(2)} suggested (1st paid ৳${advance.toFixed(2)}).`
              : `Order ${createdOrder.order_number} ${actionWord}. Cash on delivery ৳${codAmount.toFixed(2)}.`;

      displayToast(msg, 'success');
      sessionStorage.removeItem('pendingOrder');
      sessionStorage.removeItem('socialCommerceDraftV1');
      if (isEditMode) sessionStorage.removeItem(SC_EDIT_CONTEXT_KEY);

      setTimeout(() => {
        window.location.href = '/orders';
      }, 2000);
    } catch (error: any) {
      console.error('❌ Order placement failed:', error);
      const errMsg = error.response?.data?.message || error.message || 'Error placing order. Please try again.';
      displayToast(errMsg, 'error');
    } finally {
      setIsProcessing(false);
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
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-4 md:mb-6">
                Amount Details
              </h1>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Left: Order Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4">Order Summary</h2>

                  {/* Customer */}
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-2">Customer Information</p>
                    <p className="text-sm text-gray-900 dark:text-white">{orderData.customer?.name}</p>
                    {orderData.customer?.email && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">{orderData.customer.email}</p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-400">{orderData.customer?.phone}</p>
                    <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300">
                      Store: <span className="font-semibold">{orderData.store_id ? String(orderData.store_id) : 'Auto assignment'}</span>
                    </p>
                  </div>

                  {/* Address */}
                  <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-800 dark:text-green-300 font-medium mb-2">Delivery Address</p>

                    {orderData.isInternational ? (
                      <>
                        <p className="text-xs text-gray-900 dark:text-white">
                          {shippingForUi?.city || ''}
                          {shippingForUi?.state ? `, ${shippingForUi.state}` : ''}, {shippingForUi?.country || ''}
                        </p>
                        {shippingForUi?.postalCode || shippingForUi?.postal_code ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Postal Code: {shippingForUi?.postalCode || shippingForUi?.postal_code}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {shippingForUi?.address || shippingForUi?.street || orderData.customer?.address || ''}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                          <Globe className="w-3 h-3" />
                          <span>International Delivery</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-900 dark:text-white">
                          {shippingForUi?.city || ''}
                          {shippingForUi?.zone ? `, ${shippingForUi.zone}` : ''}
                          {shippingForUi?.area ? `, ${shippingForUi.area}` : ''}
                        </p>
                        {(shippingForUi?.postalCode || shippingForUi?.postal_code) && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Postal Code: {shippingForUi?.postalCode || shippingForUi?.postal_code}
                          </p>
                        )}
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {shippingForUi?.address || shippingForUi?.street || orderData.customer?.address || ''}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Products */}
                  {Array.isArray(orderData.items) && orderData.items.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                        Products ({orderData.items.length})
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {orderData.items.map((item: any, idx: number) => {
                          const itemAmount = calculateItemAmount(item);
                          return (
                            <div key={idx} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-700">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-900 dark:text-white truncate">{item.productName || `Product #${item.product_id}`}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  Qty: {item.quantity} × ৳{parseNumber(item.unit_price).toFixed(2)}
                                </p>
                                {parseNumber(item.discount_amount) > 0 && (
                                  <p className="text-xs text-red-600 dark:text-red-400">
                                    Discount: -৳{parseNumber(item.discount_amount).toFixed(2)}
                                  </p>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white sm:ml-2 self-end sm:self-auto">৳{itemAmount.toFixed(2)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Services */}
                  {Array.isArray(orderData.services) && orderData.services.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                        Services ({orderData.services.length})
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {orderData.services.map((svc: any, idx: number) => {
                          const svcAmount = calculateItemAmount(svc);
                          return (
                            <div key={`svc-${idx}`} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 p-2 rounded bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-indigo-900 dark:text-indigo-100 font-medium truncate">{svc.service_name || svc.productName || 'Service'}</p>
                                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                                  Qty: {svc.quantity} × ৳{parseNumber(svc.unit_price).toFixed(2)}
                                </p>
                                {parseNumber(svc.discount_amount) > 0 && (
                                  <p className="text-xs text-red-600 dark:text-red-400">
                                    Discount: -৳{parseNumber(svc.discount_amount).toFixed(2)}
                                  </p>
                                )}
                              </div>
                              <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100 sm:ml-2 self-end sm:self-auto">৳{svcAmount.toFixed(2)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Gross Subtotal</span>
                      <span className="text-gray-900 dark:text-white">৳{grossSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Item Discounts</span>
                      <span className="text-red-600 dark:text-red-400">-৳{itemDiscountTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Net Item Total</span>
                      <span className="text-gray-900 dark:text-white">৳{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Order Discount</span>
                      <span className="text-red-600 dark:text-red-400">-৳{orderDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Shipping Cost</span>
                      <span className="text-gray-900 dark:text-white">৳{transport.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-semibold mt-2">
                      <span className="text-gray-900 dark:text-white">Total Amount</span>
                      <span className="text-gray-900 dark:text-white">৳{total.toFixed(2)}</span>
                    </div>

                    {alreadyPaid > 0 && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-green-700 dark:text-green-400 font-medium">Already Paid</span>
                        <span className="text-green-700 dark:text-green-400 font-medium">৳{alreadyPaid.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
                      <span className="text-gray-900 dark:text-white">Final Due</span>
                      <span className="text-indigo-600 dark:text-indigo-400">৳{finalDue.toFixed(2)}</span>
                    </div>

                    {totalFees > 0 && (
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-600 dark:text-gray-400">Estimated gateway fees</span>
                        <span className="text-gray-700 dark:text-gray-300">৳{totalFees.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Payment */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
                  <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-4">Charges & Payments</h2>

                  {/* Transport */}
                  <div className="mb-4">
                    <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Shipping Cost (৳)</label>
                    <input
                      value={transportCost}
                      onChange={(e) => setTransportCost(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Whole Order Discount (৳)</label>
                    <input
                      value={orderDiscountAmount}
                      onChange={(e) => setOrderDiscountAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Example: total 3200, customer pays 3000 → enter 200"
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      This discount applies to the full order after item prices are set.
                    </p>
                  </div>

                  {/* Intended Courier Marker */}
                  <div className="mb-4">
                    <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">
                      Add Order Marker
                    </label>
                    <div className="relative">
                      <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <select
                        value={intendedCourier}
                        onChange={(e) => setIntendedCourier(e.target.value)}
                        disabled={isProcessing}
                        className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select marker (optional)</option>
                        {courierOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      This will be saved as an order marker and you can edit it later from the Orders page.
                    </p>
                  </div>

                  {/* Payment Option */}
                  <div className="mb-4">
                    {alreadyPaid > 0 && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm font-semibold">Previous Payments: ৳{alreadyPaid.toFixed(2)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                          This order already has recorded payments. The "Final Due" below accounts for these. 
                          Selecting a payment option now will add a NEW payment record.
                        </p>
                      </div>
                    )}

                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Payment Option</p>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          className="h-4 w-4"
                          checked={paymentOption === 'none'}
                          onChange={() => setPaymentOption('none')}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          <span>Cash on delivery</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          className="h-4 w-4"
                          checked={paymentOption === 'full'}
                          onChange={() => setPaymentOption('full')}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          <span>Full payment now</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          className="h-4 w-4"
                          checked={paymentOption === 'partial'}
                          onChange={() => setPaymentOption('partial')}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4" />
                          <span>Advance + Cash on Delivery</span>
                        </div>
                      </label>



                      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          className="h-4 w-4"
                          checked={paymentOption === 'installment'}
                          onChange={() => setPaymentOption('installment')}
                          disabled={isProcessing}
                        />
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          <span>Installment / EMI (Pay 1st now)</span>
                        </div>
                      </label>

                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-3">
                    {(paymentOption === 'full' || paymentOption === 'partial' || paymentOption === 'installment') && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
                          <select
                            value={selectedPaymentMethod}
                            onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                            disabled={isProcessing}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">Select payment method</option>
                            {paymentMethods.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {paymentOption === 'installment' && (
                          <div>
                            <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Total Installments</label>
                            <input
                              type="number"
                              min={2}
                              max={24}
                              value={installmentCount}
                              onChange={(e) => setInstallmentCount(parseInt(e.target.value || '2', 10))}
                              disabled={isProcessing}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                              Suggested per installment: <span className="font-semibold">৳{suggestedInstallmentAmount.toFixed(2)}</span>
                            </p>
                          </div>
                        )}

                        {paymentOption === 'partial' && (
                          <div>
                            <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Advance Amount (৳)</label>
                            <input
                              value={advanceAmount}
                              onChange={(e) => setAdvanceAmount(e.target.value)}
                              disabled={isProcessing}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              placeholder="e.g. 500"
                            />
                            <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                              COD will be: <span className="font-semibold">৳{finalDue.toFixed(2)}</span>
                            </p>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">
                            Transaction Reference <span className="text-gray-500">(optional)</span>
                          </label>
                          <input
                            value={transactionReference}
                            onChange={(e) => setTransactionReference(e.target.value)}
                            disabled={isProcessing}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="e.g. Txn ID"
                          />
                        </div>
                      </>
                    )}

                    {(paymentOption === 'partial' || paymentOption === 'none') && (
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">COD Payment Method</label>
                        <select
                          value={codPaymentMethod}
                          onChange={(e) => setCodPaymentMethod(e.target.value)}
                          disabled={isProcessing}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">Select COD method</option>
                          {paymentMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Payment Notes (optional)</label>
                      <textarea
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        disabled={isProcessing}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g. bKash from customer's number..."
                      />
                    </div>

                    {/* Summary */}
                    <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 p-3 text-xs">
                      <p className="font-semibold text-gray-900 dark:text-white mb-2">Payment Summary</p>
                      <div className="space-y-1 text-gray-700 dark:text-gray-200">
                        <div className="flex justify-between">
                          <span>Net Item Total</span>
                          <span className="font-medium">৳{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Order Discount</span>
                          <span className="font-medium text-red-600 dark:text-red-400">-৳{orderDiscount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping</span>
                          <span className="font-medium">৳{transport.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total</span>
                          <span className="font-medium">৳{total.toFixed(2)}</span>
                        </div>
                        {paymentOption === 'installment' ? (
                          <>
                            <div className="flex justify-between">
                              <span>Installments</span>
                              <span className="font-medium">{installmentCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Suggested / Installment</span>
                              <span className="font-medium">৳{suggestedInstallmentAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>1st Installment (Now)</span>
                              <span className="font-medium">৳{advance.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Remaining (Later)</span>
                              <span className="font-medium">৳{Math.max(0, total - advance).toFixed(2)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span>Advance</span>
                              <span className="font-medium">৳{advance.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>COD</span>
                              <span className="font-medium">৳{codAmount.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        {totalFees > 0 && (
                          <div className="flex justify-between">
                            <span>Estimated Fees</span>
                            <span className="font-medium">৳{totalFees.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handlePlaceOrder}
                      disabled={isProcessing}
                      className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60"
                    >
                      {isProcessing ? 'Processing...' : 'Place Order'}
                    </button>
                  </div>
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
          </main>
        </div>
      </div>
    </div>
  );
}
