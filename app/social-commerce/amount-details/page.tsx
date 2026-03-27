'use client';
import React, { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Globe, DollarSign, CreditCard, Wallet, XCircle } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// Import axios from your custom instance
const axios = typeof window !== 'undefined' ? require('@/lib/axios').default : null;

interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  type: string;
  supports_partial: boolean;
  requires_reference: boolean;
  fixed_fee: number;
  percentage_fee: number;
}

interface OrderData {
  store_id: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  items: Array<{
    product_id: number;
    batch_id: number;
    productName: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    amount?: number;
  }>;
  subtotal: number;
  isInternational: boolean;
  shipping_address: any;
  deliveryAddress: any;
  defectiveItems?: Array<any>;
  notes?: string;
}

export default function AmountDetailsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [vatRate, setVatRate] = useState('5');
  const [transportCost, setTransportCost] = useState('0');
  
  // Payment options: 'full', 'partial', or 'none'
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial' | 'none'>('full');
  const [advanceAmount, setAdvanceAmount] = useState('');
  
  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  
  // COD payment method
  const [codPaymentMethod, setCodePaymentMethod] = useState('');

  // Store assignment
  const [stores, setStores] = useState<any[]>([]);
  const [storeAssignmentType, setStoreAssignmentType] = useState<'auto' | 'specific'>('auto');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [address, setAddress] = useState('');

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' as 'success' | 'error' });

  const formatShippingAddressText = (shipping: any): string => {
    if (!shipping) return '';
    if (typeof shipping === 'string') return shipping;

    const line1 = shipping.address_line1 || shipping.address_line_1 || shipping.street || shipping.address || '';
    const line2 = shipping.address_line2 || shipping.address_line_2 || '';
    const parts = [
      line1,
      line2,
      shipping.area,
      shipping.zone,
      shipping.city,
      shipping.state,
      shipping.country,
    ].filter(Boolean);

    const postalCode = shipping.postal_code || shipping.postalCode || '';
    const text = parts.join(', ');
    return postalCode ? `${text}${text ? ' - ' : ''}${postalCode}` : text;
  };

  const calculateItemAmount = (item: any): number => {
    if (item.amount !== undefined && item.amount !== null) {
      return parseFloat(item.amount);
    }
    
    const unitPrice = parseFloat(item.unit_price || 0);
    const quantity = parseInt(item.quantity || 0);
    const discountAmount = parseFloat(item.discount_amount || 0);
    
    return (unitPrice * quantity) - discountAmount;
  };

  useEffect(() => {
    const storedOrder = sessionStorage.getItem('pendingOrder');
    if (storedOrder) {
      const parsedOrder = JSON.parse(storedOrder);
      console.log('📦 Loaded order data:', parsedOrder);
      
      if (parsedOrder.items) {
        parsedOrder.items = parsedOrder.items.map((item: any) => ({
          ...item,
          amount: calculateItemAmount(item)
        }));
        
        if (!parsedOrder.subtotal || parsedOrder.subtotal === 0) {
          parsedOrder.subtotal = parsedOrder.items.reduce((sum: number, item: any) => 
            sum + calculateItemAmount(item), 0
          );
        }
      }
      
      setOrderData(parsedOrder);
      setAddress(parsedOrder.customer?.address || formatShippingAddressText(parsedOrder.shipping_address) || '');
    } else {
      window.location.href = '/social-commerce';
    }

    const fetchPaymentMethods = async () => {
      try {
        if (!axios) return;
        
        const response = await axios.get('/payment-methods', {
          params: { customer_type: 'social_commerce' }
        });
        
        if (response.data.success) {
          const methods = response.data.data.payment_methods || response.data.data || [];
          setPaymentMethods(methods);
          
          // Set default payment methods
          const mobileMethod = methods.find((m: PaymentMethod) => m.type === 'mobile_banking');
          const cashMethod = methods.find((m: PaymentMethod) => m.type === 'cash');
          
          if (mobileMethod) setSelectedPaymentMethod(String(mobileMethod.id));
          if (cashMethod) setCodePaymentMethod(String(cashMethod.id));
        }
      } catch (error: any) {
        console.error('Error fetching payment methods:', error);
        
        if (error.response?.status === 401) {
          displayToast('Session expired. Please log in again.', 'error');
          localStorage.removeItem('token');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
          return;
        }
        
        displayToast('Error loading payment methods', 'error');
      }
    };

    const fetchStores = async () => {
      try {
        if (!axios) return;
        
        const response = await axios.get('/stores', {
          params: { is_active: true, per_page: 1000 }
        });
        
        if (response.data.success) {
          const storesData = response.data.data?.data || response.data.data || [];
          setStores(storesData);
        }
      } catch (error: any) {
        console.error('Error fetching stores:', error);
        displayToast('Error loading stores', 'error');
      }
    };

    fetchPaymentMethods();
    fetchStores();
  }, []);

  if (!orderData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  const subtotal = orderData.subtotal || 0;
  const totalDiscount = orderData.items?.reduce((sum: number, item: any) => sum + (parseFloat(item.discount_amount) || 0), 0) || 0;
  const vat = (subtotal * parseFloat(vatRate)) / 100;
  const transport = parseFloat(transportCost) || 0;
  const total = subtotal + vat + transport;

  const selectedMethod = paymentMethods.find(m => String(m.id) === selectedPaymentMethod);
  const codMethod = paymentMethods.find(m => String(m.id) === codPaymentMethod);
  
  const advance = paymentOption === 'partial' ? parseFloat(advanceAmount) || 0 : paymentOption === 'full' ? total : 0;
  const codAmount = paymentOption === 'partial' ? total - advance : paymentOption === 'none' ? total : 0;

  // Calculate fees - ensure they're numbers
  const advanceFee = selectedMethod && paymentOption !== 'none'
    ? Number((parseFloat(String(selectedMethod.fixed_fee)) || 0) + (advance * (parseFloat(String(selectedMethod.percentage_fee)) || 0) / 100))
    : 0;
  const codFee = (paymentOption === 'partial' || paymentOption === 'none') && codMethod 
    ? Number((parseFloat(String(codMethod.fixed_fee)) || 0) + (codAmount * (parseFloat(String(codMethod.percentage_fee)) || 0) / 100))
    : 0;
  const totalFees = Number(advanceFee + codFee);

  const displayToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };



  const handlePlaceOrder = async () => {
    // Validation for store assignment
    if (storeAssignmentType === 'specific' && !selectedStoreId) {
      displayToast('Please select a store or choose auto-assign', 'error');
      return;
    }

    // Validation for payment options
    if (paymentOption === 'full' || paymentOption === 'partial') {
      if (!selectedPaymentMethod) {
        displayToast('Please select a payment method', 'error');
        return;
      }

      if (selectedMethod?.requires_reference && !transactionReference.trim()) {
        displayToast(`Please enter transaction reference for ${selectedMethod.name}`, 'error');
        return;
      }
    }

    if (paymentOption === 'partial') {
      if (!advanceAmount || advance <= 0 || advance >= total) {
        displayToast('Please enter a valid advance amount (between 0 and total)', 'error');
        return;
      }
      if (!codPaymentMethod) {
        displayToast('Please select COD payment method', 'error');
        return;
      }
    }

    if (paymentOption === 'none') {
      if (!codPaymentMethod) {
        displayToast('Please select COD payment method for full amount', 'error');
        return;
      }
    }

    if (!axios) {
      displayToast('System error. Please refresh the page.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      console.log('═══════════════════════════════════');
      console.log('📦 PLACING SOCIAL COMMERCE ORDER');
      console.log('Payment Option:', paymentOption);
      console.log('Total:', total);
      console.log('Advance:', advance);
      console.log('COD:', codAmount);
      console.log('═══════════════════════════════════');

      // ✅ FIXED: Step 1: Create Order (with optional store selection)
      console.log('📦 Step 1: Creating order...');
      
      // Determine store_id based on user selection
      const orderStoreId = storeAssignmentType === 'specific' && selectedStoreId 
        ? parseInt(selectedStoreId) 
        : null;
      
      console.log('🏪 Store assignment:', {
        type: storeAssignmentType,
        store_id: orderStoreId,
        note: orderStoreId ? 'Stock will be deducted immediately' : 'Stock deducted at warehouse scanning'
      });
      
      const createOrderResponse = await axios.post('/orders', {
        order_type: 'social_commerce',
        customer: {
          ...orderData.customer,
          address: address.trim(),
        },
        shipping_address: orderData.shipping_address || null,
        store_id: orderStoreId, // ✅ NULL for auto-assign, or specific store ID
        items: orderData.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          batch_id: null, // ✅ NULL - batch assigned at warehouse scanning
          discount_amount: item.discount_amount || 0
          // ❌ Do NOT send store_id in items array
        })),
        shipping_amount: transport,
        discount_amount: 0, // Top-level discount if needed
        notes: orderData.notes || `Social Commerce order. ${
          orderStoreId ? `Assigned to Store ID: ${orderStoreId}. ` : 'Warehouse will assign store. '
        }${
          paymentOption === 'full' ? 'Full payment' : 
          paymentOption === 'partial' ? `Advance: ৳${advance.toFixed(2)}, COD: ৳${codAmount.toFixed(2)}` : 
          'No payment - Full COD'
        }`
      });

      if (!createOrderResponse.data.success) {
        throw new Error(createOrderResponse.data.message || 'Failed to create order');
      }

      const createdOrder = createOrderResponse.data.data;
      console.log('✅ Order created:', createdOrder.order_number);

      // Step 2: Handle defective items
      const defectiveItems = orderData.defectiveItems || [];
      
      if (defectiveItems.length > 0) {
        console.log('🏷️ Processing', defectiveItems.length, 'defective items...');
        
        for (const defectItem of defectiveItems) {
          try {
            await axios.post(`/defects/${defectItem.defectId}/mark-sold`, {
              order_id: createdOrder.id,
              selling_price: defectItem.price,
              sale_notes: `Sold via Social Commerce - Order #${createdOrder.order_number}`,
              sold_at: new Date().toISOString()
            });
            
            console.log(`✅ Defective ${defectItem.defectId} marked as sold`);
          } catch (defectError: any) {
            console.error(`❌ Failed to mark defective ${defectItem.defectId}:`, defectError);
            console.warn(`Warning: Could not update defect status for ${defectItem.productName}`);
          }
        }
      }

      // Step 3: Process Payment(s) - Skip if paymentOption is 'none'
      if (paymentOption === 'full') {
        // Full payment - single payment
        console.log('💰 Step 2: Processing full payment...');
        
        const paymentData: any = {
          payment_method_id: parseInt(selectedPaymentMethod),
          amount: total,
          payment_type: 'full',
          auto_complete: true,
          notes: paymentNotes || `Social Commerce full payment via ${selectedMethod?.name}`,
          payment_data: {}
        };

        // Add transaction reference if required
        if (selectedMethod?.requires_reference && transactionReference) {
          paymentData.transaction_reference = transactionReference;
          paymentData.external_reference = transactionReference;
        }

        // Add mobile banking specific data
        if (selectedMethod?.type === 'mobile_banking' && transactionReference) {
          paymentData.payment_data = {
            mobile_number: orderData.customer.phone,
            provider: selectedMethod.name,
            transaction_id: transactionReference
          };
        } else if (selectedMethod?.type === 'card' && transactionReference) {
          // Card payment data
          paymentData.payment_data = {
            card_reference: transactionReference,
            payment_method: selectedMethod.name
          };
        } else if (selectedMethod?.type === 'bank_transfer' && transactionReference) {
          // Bank transfer data
          paymentData.payment_data = {
            transfer_reference: transactionReference,
            bank_name: selectedMethod.name
          };
        } else {
          // Generic payment data
          paymentData.payment_data = {
            notes: paymentNotes || `Payment via ${selectedMethod?.name}`
          };
        }

        console.log('📤 Sending payment request:', JSON.stringify(paymentData, null, 2));

        const paymentResponse = await axios.post(`/orders/${createdOrder.id}/payments/simple`, paymentData);
        
        console.log('📥 Payment response:', paymentResponse.data);
        
        if (!paymentResponse.data.success) {
          throw new Error(paymentResponse.data.message || 'Failed to process payment');
        }
        
        console.log('✅ Full payment processed, Payment ID:', paymentResponse.data.data?.id);
        displayToast(`Order ${createdOrder.order_number} placed successfully with full payment!`, 'success');
        
      } else if (paymentOption === 'partial') {
        // Partial payment - advance now, COD later
        console.log('💰 Step 2: Processing advance payment...');
        
        const advancePaymentData: any = {
          payment_method_id: parseInt(selectedPaymentMethod),
          amount: advance,
          payment_type: 'partial',
          auto_complete: true,
          notes: `Advance payment via ${selectedMethod?.name}. COD remaining: ৳${codAmount.toFixed(2)}`,
          payment_data: {}
        };

        // Add transaction reference if required
        if (selectedMethod?.requires_reference && transactionReference) {
          advancePaymentData.transaction_reference = transactionReference;
          advancePaymentData.external_reference = transactionReference;
        }

        // Add mobile banking specific data
        if (selectedMethod?.type === 'mobile_banking' && transactionReference) {
          advancePaymentData.payment_data = {
            mobile_number: orderData.customer.phone,
            provider: selectedMethod.name,
            transaction_id: transactionReference,
            payment_stage: 'advance'
          };
        } else if (selectedMethod?.type === 'card' && transactionReference) {
          advancePaymentData.payment_data = {
            card_reference: transactionReference,
            payment_method: selectedMethod.name,
            payment_stage: 'advance'
          };
        } else if (selectedMethod?.type === 'bank_transfer' && transactionReference) {
          advancePaymentData.payment_data = {
            transfer_reference: transactionReference,
            bank_name: selectedMethod.name,
            payment_stage: 'advance'
          };
        } else {
          advancePaymentData.payment_data = {
            notes: `Advance payment - COD remaining: ৳${codAmount.toFixed(2)}`,
            payment_stage: 'advance'
          };
        }

        console.log('📤 Sending advance payment request:', JSON.stringify(advancePaymentData, null, 2));

        const advanceResponse = await axios.post(`/orders/${createdOrder.id}/payments/simple`, advancePaymentData);
        
        console.log('📥 Advance payment response:', advanceResponse.data);
        
        if (!advanceResponse.data.success) {
          throw new Error(advanceResponse.data.message || 'Failed to process advance payment');
        }
        
        console.log('✅ Advance payment processed, Payment ID:', advanceResponse.data.data?.id);
        console.log('⏳ COD amount:', codAmount.toFixed(2), 'Tk to be collected at delivery using', codMethod?.name);
        
        displayToast(`Order ${createdOrder.order_number} placed! Advance: ৳${advance.toFixed(2)}, COD: ৳${codAmount.toFixed(2)}`, 'success');
      } else {
        // No payment option - Full COD
        console.log('⏳ No payment processed - Full COD amount:', codAmount.toFixed(2), 'Tk to be collected at delivery');
        displayToast(`Order ${createdOrder.order_number} placed! Full COD: ৳${codAmount.toFixed(2)}`, 'success');
      }

      console.log('═══════════════════════════════════');
      console.log('✅ ORDER PLACED SUCCESSFULLY');
      console.log(`Order Number: ${createdOrder.order_number}`);
      console.log(`Payment Status: ${paymentOption === 'full' ? 'Paid' : paymentOption === 'partial' ? 'Partially Paid' : 'Unpaid (Full COD)'}`);
      if (paymentOption === 'partial' || paymentOption === 'none') {
        console.log(`Remaining COD: ৳${codAmount.toFixed(2)}`);
      }
      console.log('═══════════════════════════════════');

      sessionStorage.removeItem('pendingOrder');
      
      setTimeout(() => {
        window.location.href = '/orders';
      }, 2000);

    } catch (error: any) {
      console.error('═══════════════════════════════════');
      console.error('❌ ORDER CREATION FAILED');
      console.error('Error:', error);
      console.error('Response Data:', error.response?.data);
      console.error('═══════════════════════════════════');
      
      let errorMessage = 'Error placing order. Please try again.';
      
      if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
        localStorage.removeItem('token');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      displayToast(errorMessage, 'error');
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
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Amount Details</h1>
              </div>
            </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Order Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Order Summary</h2>
            
            {/* Customer Info */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-2">Customer Information</p>
              <p className="text-sm text-gray-900 dark:text-white font-medium">{orderData.customer.name}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{orderData.customer.email}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{orderData.customer.phone}</p>
            </div>

            {/* Delivery Address */}
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-800 dark:text-green-300 font-medium mb-2">Delivery Address</p>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="minimum 10 characters"
                rows={3}
                minLength={0}
                required
                className="w-full px-3 py-2 text-sm border border-green-200 dark:border-green-800 rounded bg-white/50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {orderData.isInternational && (
                <div className="mt-2 flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                  <Globe className="w-3 h-3" />
                  <span>International Delivery</span>
                </div>
              )}
            </div>

            {/* Products List */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">Products ({orderData.items?.length || 0})</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {orderData.items?.map((item: any, index: number) => {
                  const itemAmount = calculateItemAmount(item);
                  
                  return (
                    <div key={index} className="flex justify-between items-center p-2 rounded bg-gray-50 dark:bg-gray-700">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-white truncate">{item.productName}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Qty: {item.quantity} × ৳{parseFloat(item.unit_price || 0).toFixed(2)}
                        </p>
                        {item.discount_amount > 0 && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Discount: -৳{parseFloat(item.discount_amount).toFixed(2)}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white ml-2">৳{itemAmount.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subtotal */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-base font-semibold">
                <span className="text-gray-900 dark:text-white">Subtotal</span>
                <span className="text-gray-900 dark:text-white">৳{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right Column - Payment Details */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payment Details</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Sub Total</span>
                <span className="text-gray-900 dark:text-white">৳{subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total Discount</span>
                <span className="text-red-600 dark:text-red-400">-৳{totalDiscount.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">VAT</label>
                  <input
                    type="text"
                    value={`৳${vat.toFixed(2)}`}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">VAT Rate %</label>
                  <input
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Transport Cost</label>
                <input
                  type="number"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between text-lg font-bold mb-4">
                  <span className="text-gray-900 dark:text-white">Total Amount</span>
                  <span className="text-gray-900 dark:text-white">৳{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Store Assignment Section */}
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Store Assignment
                </label>
                
                <div className="space-y-3">
                  {/* Auto-assign option */}
                  <label className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white dark:hover:bg-gray-700/50 ${
                    storeAssignmentType === 'auto'
                      ? 'border-indigo-600 bg-white dark:bg-gray-700/50'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    <input
                      type="radio"
                      name="storeAssignment"
                      value="auto"
                      checked={storeAssignmentType === 'auto'}
                      onChange={(e) => {
                        setStoreAssignmentType('auto');
                        setSelectedStoreId('');
                      }}
                      disabled={isProcessing}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Auto-assign at Warehouse
                        </span>
                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Warehouse will assign items to best available stores. Stock deducted when barcodes are scanned.
                      </p>
                    </div>
                  </label>

                  {/* Specific store option */}
                  <label className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white dark:hover:bg-gray-700/50 ${
                    storeAssignmentType === 'specific'
                      ? 'border-indigo-600 bg-white dark:bg-gray-700/50'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    <input
                      type="radio"
                      name="storeAssignment"
                      value="specific"
                      checked={storeAssignmentType === 'specific'}
                      onChange={(e) => setStoreAssignmentType('specific')}
                      disabled={isProcessing}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Assign to Specific Store
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Select a store now. Stock will be deducted immediately.
                      </p>
                    </div>
                  </label>

                  {/* Store dropdown (shown when specific is selected) */}
                  {storeAssignmentType === 'specific' && (
                    <div className="pl-8 pt-2">
                      <select
                        value={selectedStoreId}
                        onChange={(e) => setSelectedStoreId(e.target.value)}
                        disabled={isProcessing}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                      >
                        <option value="">Select Store</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name} {store.address ? `- ${store.address}` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedStoreId && (
                        <p className="mt-2 text-xs text-orange-600 dark:text-orange-400 flex items-start gap-1">
                          <span className="text-base">⚠️</span>
                          <span>
                            Stock will be deducted immediately from this store. Make sure all items are available.
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Option Selection */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">Payment Option</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setPaymentOption('full');
                      setAdvanceAmount('');
                    }}
                    disabled={isProcessing}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      paymentOption === 'full'
                        ? 'border-blue-600 bg-blue-100 dark:bg-blue-900/40'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                    } disabled:opacity-50`}
                  >
                    <DollarSign className={`w-5 h-5 mb-1 ${paymentOption === 'full' ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-xs font-medium ${paymentOption === 'full' ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      Full Payment
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pay Now</span>
                  </button>

                  <button
                    onClick={() => setPaymentOption('partial')}
                    disabled={isProcessing}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      paymentOption === 'partial'
                        ? 'border-purple-600 bg-purple-100 dark:bg-purple-900/40'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                    } disabled:opacity-50`}
                  >
                    <Wallet className={`w-5 h-5 mb-1 ${paymentOption === 'partial' ? 'text-purple-600' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-xs font-medium ${paymentOption === 'partial' ? 'text-purple-900 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      Advance + COD
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Partial Now</span>
                  </button>

                  <button
                    onClick={() => {
                      setPaymentOption('none');
                      setAdvanceAmount('');
                      setSelectedPaymentMethod('');
                      setTransactionReference('');
                      // Auto-select cash method for COD
                      const cashMethod = paymentMethods.find((m: PaymentMethod) => m.type === 'cash');
                      if (cashMethod) {
                        setCodePaymentMethod(String(cashMethod.id));
                      }
                    }}
                    disabled={isProcessing}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                      paymentOption === 'none'
                        ? 'border-orange-600 bg-orange-100 dark:bg-orange-900/40'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                    } disabled:opacity-50`}
                  >
                    <XCircle className={`w-5 h-5 mb-1 ${paymentOption === 'none' ? 'text-orange-600' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-xs font-medium ${paymentOption === 'none' ? 'text-orange-900 dark:text-orange-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      No Payment
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Full COD</span>
                  </button>
                </div>
              </div>

              {/* Advance Amount Input (only for partial) */}
              {paymentOption === 'partial' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Advance Amount (Booking Confirmation)
                  </label>
                  <input
                    type="number"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    disabled={isProcessing}
                    placeholder={`Enter amount (Max: ৳${total.toFixed(2)})`}
                    min="0"
                    max={total}
                    step="0.01"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                  />
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Advance Payment:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">৳{advance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">COD at Delivery:</span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">৳{codAmount.toFixed(2)}</span>
                    </div>
                    {totalFees > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Total Fees:</span>
                        <span className="text-red-600 dark:text-red-400">৳{totalFees.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Payment Info */}
              {paymentOption === 'none' && (
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                  <p className="text-sm font-medium text-orange-900 dark:text-orange-300 mb-2">No Advance Payment</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Full COD Amount:</span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">৳{codAmount.toFixed(2)}</span>
                    </div>
                    {codFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">COD Fee:</span>
                        <span className="text-red-600 dark:text-red-400">৳{codFee.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Full payment will be collected on delivery
                  </p>
                </div>
              )}

              {/* Advance Payment Method (not shown for 'none') */}
              {paymentOption !== 'none' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {paymentOption === 'full' ? 'Payment Method' : 'Advance Payment Method'} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedPaymentMethod}
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="">Select Payment Method</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                        {method.percentage_fee > 0 && ` (${method.percentage_fee}% fee)`}
                        {method.fixed_fee > 0 && ` (+৳${method.fixed_fee})`}
                      </option>
                    ))}
                  </select>
                  {selectedMethod && advanceFee > 0 && (
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                      Processing fee: ৳{advanceFee.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* COD Payment Method (for partial and none) */}
              {(paymentOption === 'partial' || paymentOption === 'none') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    COD Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={codPaymentMethod}
                    onChange={(e) => setCodePaymentMethod(e.target.value)}
                    disabled={isProcessing || paymentOption === 'none'}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select COD Method</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                        {method.percentage_fee > 0 && ` (${method.percentage_fee}% fee)`}
                        {method.fixed_fee > 0 && ` (+৳${method.fixed_fee})`}
                      </option>
                    ))}
                  </select>
                  {paymentOption === 'none' && (
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      Automatically set to Cash for COD
                    </p>
                  )}
                  {codMethod && codFee > 0 && (
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                      COD processing fee: ৳{codFee.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Transaction Reference (not shown for 'none') */}
              {paymentOption !== 'none' && selectedMethod?.requires_reference && (
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Transaction Reference <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    disabled={isProcessing}
                    placeholder={`Enter ${selectedMethod.name} transaction ID`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                  />
                </div>
              )}

              {/* Payment Notes */}
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Payment Notes (Optional)</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  disabled={isProcessing}
                  placeholder="Add any payment notes..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button 
                  onClick={() => window.history.back()}
                  disabled={isProcessing}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={
                    isProcessing || 
                    (paymentOption === 'full' && !selectedPaymentMethod) ||
                    (paymentOption === 'partial' && (!advanceAmount || !selectedPaymentMethod || !codPaymentMethod)) ||
                    (paymentOption === 'none' && !codPaymentMethod) ||
                    address.trim().length < 10
                  }
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Place Order
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom">
          <div className={`px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}