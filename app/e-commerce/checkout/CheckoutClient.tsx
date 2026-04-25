'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Package, MapPin, CreditCard, ShoppingBag, AlertCircle, Loader2, ChevronRight, Plus, Edit2, Trash2, CheckCircle, Lock } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import SSLCommerzPayment from '@/components/ecommerce/SSLCommerzPayment';
import checkoutService, { Address, OrderItem, PaymentMethod } from '@/services/checkoutService';
import cartService from '@/services/cartService';
import guestCheckoutService, { GuestPaymentMethod } from '@/services/guestCheckoutService';
import campaignService, { CouponValidationResult, CouponErrorCode } from '@/services/campaignService';
import { usePromotion } from '@/contexts/PromotionContext';

export default function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getApplicablePromotion } = usePromotion();

  // State
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState<'shipping' | 'payment' | 'review'>('shipping');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Address management
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<number | null>(null);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);

  const getEmptyAddressForm = (): Omit<Address, 'id'> => ({
    name: '',
    phone: '',
    email: '',
    address_line_1: '',
    address_line_2: '',
    city: 'Dhaka',
    state: 'Dhaka Division',
    postal_code: '',
    country: 'Bangladesh',
    landmark: '',
    delivery_instructions: '',
    type: 'both',
    is_default_shipping: false,
    is_default_billing: false,
  });

  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>(getEmptyAddressForm());
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(''); // ✅ CHANGED: stores payment method CODE
  const [orderNotes, setOrderNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ discount: number; message: string; promotion_name?: string } | null>(null);
  const [couponApplyLoading, setCouponApplyLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [shippingCharge, setShippingCharge] = useState(60);

  // Guest checkout state
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPaymentMethod, setGuestPaymentMethod] = useState<GuestPaymentMethod>('cod');
  const [guestAddress, setGuestAddress] = useState({
    full_name: '',
    phone: '',
    address_line_1: '',
    address_line_2: '',
    city: 'Dhaka',
    state: 'Dhaka',
    postal_code: '',
    country: 'Bangladesh',
  });

  // ✅ NEW: SSLCommerz payment screen state
  const [showSSLCommerzPayment, setShowSSLCommerzPayment] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false); // Mobile summary collapse
  const formRef = useRef<HTMLDivElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isAuthenticated = () => {
    const token = localStorage.getItem('auth_token');
    return !!token;
  };

  const isGuestCheckout = () => !isAuthenticated();

  const cleanPhone = (input: string) => input.replace(/[^0-9+]/g, '');

  const formatBDPhone = (input: string) => {
    const cleaned = input.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+880')) return cleaned;
    if (cleaned.startsWith('880')) return '+880' + cleaned.slice(3);
    if (cleaned.startsWith('0')) return cleaned;
    if (/^1[3-9]\d{8}$/.test(cleaned)) return '0' + cleaned;
    return cleaned;
  };

  const isValidBDPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return /^(?:880|0)?1[3-9]\d{8}$/.test(cleaned);
  };

  // ✅ NEW: Handle payment errors from URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'payment_failed':
          setError('Payment failed. Please try again or use a different method.');
          break;
        case 'payment_cancelled':
          setError('Payment was cancelled. You can try again when you are ready.');
          break;
        case 'payment_processing_error':
          setError('An error occurred while processing your payment. Please contact support if the amount was deducted.');
          break;
        default:
          setError('An unexpected payment error occurred.');
      }
    }
  }, [searchParams]);

  const refreshCheckoutItems = async () => {
    const selectedIdsStr = localStorage.getItem('checkout-selected-items');
    if (!selectedIdsStr) {
      router.push('/e-commerce');
      return;
    }

    try {
      const ids = JSON.parse(selectedIdsStr);
      if (!Array.isArray(ids) || ids.length === 0) {
        router.push('/e-commerce');
        return;
      }

      const cartData = await cartService.getCart();
      const items = cartData.cart_items.filter(item => ids.includes(item.id));

      if (items.length === 0) {
        localStorage.removeItem('checkout-selected-items');
        router.push('/e-commerce');
        return;
      }

      const transformedItems = items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        category_id: typeof item.product?.category === 'object' && item.product?.category != null ? (item.product.category as any).id : (typeof item.product?.category_id === 'number' ? item.product.category_id : undefined),
        name: item.product.name,
        images: item.product.images || [],
        sku: item.product.sku ?? '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        variant_options: item.variant_options,
        notes: item.notes,
        available_inventory: item.product.available_inventory,
      }));

      setSelectedItems(transformedItems);
      setIsLoadingItems(false);
    } catch (error) {
      console.error('❌ Error refreshing checkout items:', error);
    }
  };

  useEffect(() => {
    refreshCheckoutItems();
  }, [router]);

  const handleUpdateQuantity = async (cartItemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      await cartService.updateQuantity(cartItemId, { quantity: newQuantity });
      await refreshCheckoutItems();
    } catch (err: any) {
      alert(err.message || 'Failed to update quantity');
    }
  };

  const handleRemoveItem = async (cartItemId: number) => {
    if (!confirm('Remove this item from your order?')) return;
    try {
      await cartService.removeFromCart(cartItemId);
      const selectedIdsStr = localStorage.getItem('checkout-selected-items');
      if (selectedIdsStr) {
        const ids = JSON.parse(selectedIdsStr).filter((id: number) => id !== cartItemId);
        if (ids.length === 0) {
          localStorage.removeItem('checkout-selected-items');
          router.push('/e-commerce');
        } else {
          localStorage.setItem('checkout-selected-items', JSON.stringify(ids));
          await refreshCheckoutItems();
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to remove item');
    }
  };


  // Fetch addresses
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!isAuthenticated()) return;

      try {
        setLoadingAddresses(true);
        const result = await checkoutService.getAddresses();

        console.log('📍 Fetched addresses:', result);
        setAddresses(result.addresses);

        if (result.default_shipping) {
          setSelectedShippingAddressId(result.default_shipping.id!);
        } else if (result.addresses.length > 0) {
          setSelectedShippingAddressId(result.addresses[0].id!);
        }

        if (result.default_billing) {
          setSelectedBillingAddressId(result.default_billing.id!);
        }

      } catch (error: any) {
        console.error('Failed to fetch addresses:', error);
        setError('Failed to load addresses');
      } finally {
        setLoadingAddresses(false);
      }
    };

    fetchAddresses();
  }, []);

  // ✅ FIXED: Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const methods = await checkoutService.getPaymentMethods();
        console.log('💳 Fetched payment methods:', methods);
        setPaymentMethods(methods);

        // Set default payment method by CODE
        if (methods.length > 0) {
          const defaultMethod = methods.find(m => m.code === 'cash') || methods[0];
          setSelectedPaymentMethod(defaultMethod.code);
        }
      } catch (error) {
        console.error('Failed to fetch payment methods:', error);

        const fallbackMethods: PaymentMethod[] = [
          {
            id: 1,
            code: 'cash',
            name: 'Cash on Delivery',
            description: 'Pay with cash when your order is delivered',
            type: 'cash',
            allowed_customer_types: ['ecommerce'],
            is_active: true,
            requires_reference: false,
            supports_partial: true,
            min_amount: null,
            max_amount: null,
            processor: null,
            processor_config: null,
            icon: null,
            fixed_fee: 0,
            percentage_fee: 0,
            sort_order: 1,
          }
        ];
        setPaymentMethods(fallbackMethods);
        setSelectedPaymentMethod(fallbackMethods[0].code);
      }
    };
    fetchPaymentMethods();
  }, []);

  // Update shipping charge based on selected address
  useEffect(() => {
    if (selectedShippingAddressId) {
      const address = addresses.find(a => a.id === selectedShippingAddressId);
      if (address) {
        const charge = checkoutService.calculateDeliveryCharge(address.city);
        setShippingCharge(charge);
      }
    }
  }, [selectedShippingAddressId, addresses]);

  // Guest shipping charge (based on typed city)
  useEffect(() => {
    if (isGuestCheckout()) {
      setShippingCharge(checkoutService.calculateDeliveryCharge(guestAddress.city || 'Dhaka'));
    }
  }, [guestAddress.city]);

  // Calculate totals
  const orderItems: OrderItem[] = selectedItems.map(item => {
    const originalUnitPrice = typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price;
    const promo = getApplicablePromotion(item.product_id, item.category_id ?? null);
    const discountPercent = promo?.discount_value ?? 0;
    const unitPrice = discountPercent > 0 ? Math.max(0, originalUnitPrice - (originalUnitPrice * discountPercent / 100)) : originalUnitPrice;
    const totalPrice = unitPrice * item.quantity;
    
    return {
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      price: unitPrice,
      total: totalPrice,
      original_price: originalUnitPrice, // Add this for UI strike-through
      product_image: item.images?.find((i: any) => i?.is_primary)?.image_url || (item.images?.[0] as any)?.image_url || (item.images?.[0] as any)?.url || '/placeholder-product.png',
      sku: item.sku || '',
    };
  });
  const couponDiscount = appliedCoupon?.discount || 0;
  const summary = checkoutService.calculateOrderSummary(orderItems, shippingCharge, couponDiscount);

  const handleSaveAddress = async () => {
    setError(null);

    if (!addressForm.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!addressForm.phone.trim() || addressForm.phone.length !== 11) {
      setError('Valid 11-digit phone number is required');
      return;
    }

    if (!addressForm.address_line_1.trim()) {
      setError('Address is required');
      return;
    }

    if (!addressForm.city || addressForm.city === '') {
      setError('City is required');
      return;
    }

    if (!addressForm.state || addressForm.state === '') {
      setError('State/Division is required');
      return;
    }

    // Postal code is optional

    try {
      setIsProcessing(true);

      if (editingAddressId) {
        const result = await checkoutService.updateAddress(editingAddressId, {
          ...addressForm,
          postal_code: addressForm.postal_code || undefined
        });
        setAddresses(prev => prev.map(addr =>
          addr.id === editingAddressId ? result.address : addr
        ));
      } else {
        const result = await checkoutService.createAddress({
          ...addressForm,
          postal_code: addressForm.postal_code || undefined
        });
        setAddresses(prev => [...prev, result.address]);

        if (addresses.length === 0 || addressForm.is_default_shipping) {
          setSelectedShippingAddressId(result.address.id!);
        }
      }

      setShowAddressForm(false);
      setEditingAddressId(null);
      setAddressForm(getEmptyAddressForm());
      setError(null);

    } catch (error: any) {
      console.error('❌ Failed to save address:', error);
      setError(error.message || 'Failed to save address. Please try again.');

      // 6.3 — Auto-scroll to error
      setTimeout(() => {
        const firstErr = formRef.current?.querySelector('[aria-invalid="true"]');
        if (firstErr) {
          firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (firstErr as HTMLElement).focus();
        }
      }, 100);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAddress = (address: Address) => {
    setAddressForm(address);
    setEditingAddressId(address.id!);
    setShowAddressForm(true);
    setError(null);
  };

  const handleDeleteAddress = async (id: number) => {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
      await checkoutService.deleteAddress(id);
      setAddresses(prev => prev.filter(addr => addr.id !== id));

      if (selectedShippingAddressId === id) {
        const remainingAddresses = addresses.filter(addr => addr.id !== id);
        setSelectedShippingAddressId(remainingAddresses[0]?.id || null);
      }
      if (selectedBillingAddressId === id) {
        setSelectedBillingAddressId(null);
      }
    } catch (error: any) {
      console.error('Failed to delete address:', error);
      setError(error.message || 'Failed to delete address');
    }
  };

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    setCouponApplyLoading(true);
    setCouponError(null);
    setCouponSuccess(null);

    // Build cart context
    const customerIdRaw = localStorage.getItem('customer_id') || localStorage.getItem('customerId');
    const customer_id = customerIdRaw ? parseInt(customerIdRaw, 10) : null;

    const cart_items = selectedItems.map((item: any) => ({
      product_id: item.product_id ?? item.id,
      category_id: item.category_id ?? undefined,
      quantity: item.quantity ?? 1,
      unit_price: Number(item.selling_price ?? item.price ?? 0),
    }));

    const result: CouponValidationResult = await campaignService.validateCouponCode({
      code,
      customer_id,
      cart_subtotal: summary.subtotal,
      cart_items,
    });

    setCouponApplyLoading(false);

    if (result.success && result.data) {
      setAppliedCoupon({
        discount: result.data.applied_amount,
        message: result.data.message,
        promotion_name: result.data.promotion.name,
      });
      setCouponSuccess(
        `${result.data.promotion.name} applied! You save ৳${result.data.applied_amount.toFixed(2)}` +
        (result.data.capped ? ` (max discount: ৳${result.data.max_discount})` : '')
      );
    } else {
      setAppliedCoupon(null);
      // Human-readable messages for each known error code
      const errorMessages: Record<CouponErrorCode, string> = {
        INVALID_CODE: 'Invalid coupon code. Please check and try again.',
        PROMOTION_EXPIRED: 'This coupon has expired.',
        PROMOTION_NOT_STARTED: 'This coupon is not active yet.',
        PROMOTION_LIMIT_REACHED: 'This coupon has reached its usage limit.',
        PROMOTION_INACTIVE: 'This coupon is currently inactive.',
        CUSTOMER_LIMIT_REACHED: 'You have already used this coupon the maximum number of times.',
        CUSTOMER_NOT_ELIGIBLE: 'You are not eligible for this coupon.',
        MINIMUM_NOT_MET: `This coupon requires a minimum order of ৳${(result.minimum_purchase ?? 0).toFixed(2)}.`,
        NO_ELIGIBLE_ITEMS: 'No items in your cart are eligible for this coupon.',
        LOGIN_REQUIRED: 'Please log in to use this coupon.',
      };
      setCouponError(
        result.error_code ? (errorMessages[result.error_code] ?? result.message ?? 'Invalid coupon.') : (result.message ?? 'Invalid coupon.')
      );
    }
  };


  const handleGuestPlaceOrder = async () => {
    setError(null);

    if (selectedItems.length === 0) {
      setError('Your cart is empty. Please add items first.');
      return;
    }

    if (!guestPhone.trim() || !isValidBDPhone(guestPhone)) {
      setError('Please enter a valid Bangladesh phone number (e.g. 017xxxxxxxx)');
      return;
    }

    if (!guestAddress.full_name.trim()) {
      setError('Delivery name is required');
      return;
    }

    if (!guestAddress.address_line_1.trim()) {
      setError('Delivery address is required');
      return;
    }

    if (!guestAddress.city.trim()) {
      setError('City is required');
      return;
    }

    // Postal code is optional

    setIsProcessing(true);
    try {
      const payload = {
        phone: cleanPhone(formatBDPhone(guestPhone)),
        items: selectedItems.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          ...(it.variant_options ? { variant_options: it.variant_options } : {}),
        })),
        payment_method: guestPaymentMethod,
        // Force no pre-assigned branch/store for ecommerce orders
        store_id: null,
        delivery_address: {
          full_name: guestAddress.full_name,
          ...(guestAddress.phone?.trim() ? { phone: cleanPhone(guestAddress.phone) } : {}),
          address_line_1: guestAddress.address_line_1,
          ...(guestAddress.address_line_2?.trim() ? { address_line_2: guestAddress.address_line_2 } : {}),
          city: guestAddress.city,
          ...(guestAddress.state?.trim() ? { state: guestAddress.state } : {}),
          postal_code: guestAddress.postal_code || undefined,
          country: guestAddress.country || 'Bangladesh',
        },
        ...(guestName.trim() ? { customer_name: guestName.trim() } : {}),
        ...(guestEmail.trim() ? { customer_email: guestEmail.trim() } : {}),
        ...(orderNotes.trim() ? { notes: orderNotes.trim() } : {}),
      };

      const resp: any = await guestCheckoutService.checkout(payload as any);

      // SSLCommerz style response
      const paymentUrl = resp?.data?.payment_url;
      if (paymentUrl) {
        // Store a lightweight last-order preview (guest can't fetch /customer/orders)
        try {
          const orderNo = resp?.data?.order_number || resp?.data?.order?.order_number;
          const txn = resp?.data?.transaction_id;
          const amt = resp?.data?.total_amount ?? summary.total_amount;
          if (orderNo) {
            localStorage.setItem(
              'ec_last_order',
              JSON.stringify({
                order_number: orderNo,
                payment_method: 'sslcommerz',
                total_amount: typeof amt === 'number' ? amt : Number(amt),
                shipping_charge: shippingCharge,
                discount: couponDiscount,
                created_at: Date.now(),
                customer: { phone: cleanPhone(formatBDPhone(guestPhone)), name: guestName || undefined, email: guestEmail || undefined },
                items: selectedItems.map((it) => ({
                  name: it.name,
                  quantity: it.quantity,
                  unit_price: Number(it.unit_price),
                  total_price: Number(it.total_price),
                  image_url: it.images?.find((i: any) => i?.is_primary)?.image_url || (it.images?.[0] as any)?.image_url || (it.images?.[0] as any)?.url || '/placeholder-product.png',
                  sku: it.sku || '',
                  variant_options: it.variant_options || undefined,
                })),
              })
            );
          }

          // Also store intent so /payment/success can resolve order reference
          if (orderNo && txn) {
            localStorage.setItem(
              'sslc_payment_intent',
              JSON.stringify({
                order_id: resp?.data?.order_id || resp?.data?.order?.order_id || resp?.data?.order?.id || 0,
                order_number: orderNo,
                transaction_id: txn,
                amount: typeof amt === 'number' ? amt : Number(amt),
                timestamp: Date.now(),
              })
            );
          }
        } catch {
          // ignore localStorage errors
        }
        window.location.href = paymentUrl;
        return;
      }

      // COD style response
      const orderNumber = resp?.data?.order?.order_number;
      if (!orderNumber) {
        throw new Error(resp?.message || 'Order created, but no order number returned');
      }

      // Store a lightweight last-order preview for the Thank You page
      try {
        localStorage.setItem(
          'ec_last_order',
          JSON.stringify({
            order_number: orderNumber,
            payment_method: guestPaymentMethod,
            total_amount: summary.total_amount,
            shipping_charge: shippingCharge,
            discount: couponDiscount,
            created_at: Date.now(),
            customer: { phone: cleanPhone(formatBDPhone(guestPhone)), name: guestName || undefined, email: guestEmail || undefined },
            items: selectedItems.map((it) => ({
              product_name: it.name,
              quantity: it.quantity,
              price: Number(it.unit_price),
              total: Number(it.total_price),
              product_image: it.images?.find((i: any) => i?.is_primary)?.image_url || (it.images?.[0] as any)?.image_url || (it.images?.[0] as any)?.url || '/placeholder-product.png',
              sku: it.sku || '',
              variant_options: it.variant_options || undefined,
            })),
          })
        );
      } catch {
        // ignore
      }

      // Remove checked-out items from cart
      for (const it of selectedItems) {
        try {
          await cartService.removeFromCart(it.id);
        } catch {
          // ignore
        }
      }

      localStorage.removeItem('checkout-selected-items');

      router.push(`/e-commerce/order-confirmation/${orderNumber}`);
    } catch (err: any) {
      console.error('❌ Guest checkout failed:', err);

      const serverError = err?.response?.data;
      if (serverError?.errors) {
        console.error('📋 Server validation errors:', serverError.errors);
        const mappedErrors: Record<string, string> = {};
        Object.keys(serverError.errors).forEach(key => {
          mappedErrors[key] = Array.isArray(serverError.errors[key]) ? serverError.errors[key][0] : serverError.errors[key];
        });
        setFieldErrors(mappedErrors);
        setError('Please check the highlighted fields');
      } else {
        setError(serverError?.message || err?.message || 'Failed to place order. Please try again.');
      }

      // Auto-scroll to error
      setTimeout(() => {
        const firstErr = formRef.current?.querySelector('[aria-invalid="true"]');
        if (firstErr) {
          firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (firstErr as HTMLElement).focus();
        }
      }, 100);
    } finally {
      setIsProcessing(false);
    }
  };

  // ✅ FIXED: Handle place order with SSLCommerz detection
  const handlePlaceOrder = async () => {
    if (!selectedShippingAddressId) {
      setError('Please select a shipping address');
      return;
    }

    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    // ✅ Find the selected payment method object
    const paymentMethod = paymentMethods.find(pm => pm.code === selectedPaymentMethod);

    if (!paymentMethod) {
      setError('Invalid payment method selected');
      return;
    }

    console.log('💳 Selected payment method:', paymentMethod);

    // ✅ Check if it's an online payment method
    const isOnlinePayment = checkoutService.isOnlinePaymentMethod(paymentMethod);

    console.log('🔍 Is online payment:', isOnlinePayment);

    if (isOnlinePayment) {
      // ✅ Show SSLCommerz payment component
      console.log('🔐 Showing SSLCommerz payment screen');
      setShowSSLCommerzPayment(true);
      return;
    }

    // ✅ Continue with offline payment (COD, Cash, etc.)
    setIsProcessing(true);
    setError(null);

    try {
      const orderData: any = {
        payment_method: paymentMethod.code, // ✅ Use payment method code
        shipping_address_id: selectedShippingAddressId,
        billing_address_id: sameAsShipping ? selectedShippingAddressId : (selectedBillingAddressId || selectedShippingAddressId),
        notes: orderNotes || '',
        delivery_preference: 'standard' as const,
        // Keep unassigned; manual assignment from Store Assignment page
        store_id: null,
      };

      if (appliedCoupon && couponCode) {
        orderData.coupon_code = couponCode;
      }

      console.log('📦 Placing order:', orderData);

      const result = await checkoutService.createOrderFromCart(orderData);

      console.log('✅ Order placed successfully:', result);

      // Store last order preview (even for logged-in users, nicer UX)
      try {
        localStorage.setItem(
          'ec_last_order',
          JSON.stringify({
            order_number: result.order.order_number,
            payment_method: paymentMethod.code,
            total_amount: typeof result.order.total_amount === 'number' ? result.order.total_amount : Number(result.order.total_amount),
            created_at: Date.now(),
            items: orderItems.map((it) => ({
              product_name: it.product_name,
              quantity: it.quantity,
              price: it.price,
              total: it.total,
              product_image: it.product_image || '/placeholder-product.png',
              sku: it.sku || '',
            })),
          })
        );
      } catch {
        // ignore
      }

      // Clear checkout data
      localStorage.removeItem('checkout-selected-items');

      // ✅ Show success message

      // ✅ Redirect to a public Thank You page (no forced login)
      router.push(`/e-commerce/order-confirmation/${result.order.order_number}`);

    } catch (error: any) {
      console.error('❌ Order placement failed:', error);
      setError(error?.response?.data?.message || error.message || 'Failed to place order. Please try again.');

      // 6.3 — Auto-scroll to error
      setTimeout(() => {
        const firstErr = formRef.current?.querySelector('[aria-invalid="true"]');
        if (firstErr) {
          firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (firstErr as HTMLElement).focus();
        }
      }, 100);
    } finally {
      setIsProcessing(false);
    }
  };

  // Loading state
  if (isLoadingItems) {
    return (
      <div className="ec-root ec-darkify min-h-screen">
        <Navigation />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-[var(--gold)] mx-auto mb-4" />
            <p className="text-white/60">Loading checkout...</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ NEW: Show SSLCommerz payment screen
  if (showSSLCommerzPayment) {
    return (
      <div className="ec-root ec-darkify min-h-screen">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
          <button
            onClick={() => setShowSSLCommerzPayment(false)}
            className="mb-4 text-neutral-900 hover:text-neutral-900 flex items-center gap-2 font-medium"
          >
            ← Back to Review Order
          </button>

          <SSLCommerzPayment
            shippingAddressId={selectedShippingAddressId!}
            billingAddressId={sameAsShipping ? selectedShippingAddressId! : (selectedBillingAddressId ?? undefined)}
            orderNotes={orderNotes}
            couponCode={appliedCoupon ? couponCode : undefined}
            totalAmount={summary.total_amount}
            items={selectedItems}
            shippingCharge={shippingCharge}
            discount={couponDiscount}
            onError={(error) => {
              console.error('❌ Payment error:', error);
              setError(error);
              setShowSSLCommerzPayment(false);
            }}
            onCancel={() => {
              setShowSSLCommerzPayment(false);
            }}
          />
        </div>
      </div>
    );
  }

  // Guest checkout UI (no login required)
  if (isGuestCheckout()) {
    return (
      <div className="ec-root ec-darkify min-h-screen">
        <Navigation />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>Quick Checkout</h1>
              <p className="text-[var(--text-secondary)] mt-1">Direct delivery without account creation.</p>
            </div>
            <Link
              href="/e-commerce/login"
              className="hidden sm:inline-flex px-4 py-2 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
            >
              Login / Register
            </Link>
          </div>

          {error && (
            <div className="mb-6 bg-red-600 rounded-xl p-4 flex items-start ec-anim-fade-up shadow-lg shadow-red-500/20">
              <AlertCircle className="text-white mr-3 mt-0.5 flex-shrink-0" size={20} />
              <div className="text-white font-medium">{error}</div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Form */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Contact</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="017XXXXXXXX"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="ec-input"
                      aria-invalid={!isValidBDPhone(guestPhone) && guestPhone !== ''}
                    />
                    {!isValidBDPhone(guestPhone) && guestPhone !== '' && (
                      <p className="text-xs text-rose-500 mt-1">Please enter a valid 11-digit phone</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Your Name (optional)</label>
                    <input
                      type="text"
                      autoComplete="name"
                      autoCapitalize="words"
                      placeholder="Your name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="ec-input"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="ec-input"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Delivery Address</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Full Name *</label>
                    <input
                      type="text"
                      autoComplete="name"
                      autoCapitalize="words"
                      placeholder="Recipient name"
                      value={guestAddress.full_name}
                      onChange={(e) => setGuestAddress({ ...guestAddress, full_name: e.target.value })}
                      className="ec-input"
                      aria-invalid={!guestAddress.full_name && isProcessing}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Address Line 1 *</label>
                    <input
                      type="text"
                      autoComplete="address-line1"
                      placeholder="House, road, area"
                      value={guestAddress.address_line_1}
                      onChange={(e) => setGuestAddress({ ...guestAddress, address_line_1: e.target.value })}
                      className="ec-input"
                      aria-invalid={!guestAddress.address_line_1 && isProcessing}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Address Line 2 (optional)</label>
                    <input
                      type="text"
                      autoComplete="address-line2"
                      placeholder="Apartment, floor, landmark"
                      value={guestAddress.address_line_2}
                      onChange={(e) => setGuestAddress({ ...guestAddress, address_line_2: e.target.value })}
                      className="ec-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">City *</label>
                    <input
                      type="text"
                      autoComplete="address-level2"
                      placeholder="Dhaka"
                      value={guestAddress.city}
                      onChange={(e) => setGuestAddress({ ...guestAddress, city: e.target.value })}
                      className="ec-input"
                      aria-invalid={!guestAddress.city && isProcessing}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Postal Code (optional)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="1207"
                      value={guestAddress.postal_code}
                      onChange={(e) => setGuestAddress({ ...guestAddress, postal_code: e.target.value })}
                      className="ec-input"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-tight">Special Instructions (optional)</label>
                    <textarea
                      rows={3}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="w-full bg-[var(--bg-surface-2)] border border-[var(--border-strong)] rounded-[var(--radius-md)] px-4 py-3 text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--cyan-glow)] focus:border-[var(--cyan)] transition-all outline-none"
                      placeholder="e.g., deliver after 5 PM"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Payment Method</h2>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      name="guest_payment_method"
                      value="cod"
                      checked={guestPaymentMethod === 'cod'}
                      onChange={() => setGuestPaymentMethod('cod')}
                    />
                    <div>
                      <div className="font-medium text-neutral-900">Cash on Delivery</div>
                      <div className="text-sm text-neutral-600">Pay when your order is delivered</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      name="guest_payment_method"
                      value="sslcommerz"
                      checked={guestPaymentMethod === 'sslcommerz'}
                      onChange={() => setGuestPaymentMethod('sslcommerz')}
                    />
                    <div>
                      <div className="font-medium text-neutral-900">Pay Online (SSLCommerz)</div>
                      <div className="text-sm text-neutral-600">You’ll be redirected to complete payment</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="lg:col-span-5">
              <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-6 sticky top-24 shadow-sm">
                <h2 className="text-xl font-medium text-[var(--text-primary)] mb-6" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Summary</h2>

                <div className="space-y-4 max-h-[40vh] overflow-auto pr-1">
                  {selectedItems.map((item: any) => {
                    const originalUnitPrice = Number(item.unit_price || 0);
                    const promo = getApplicablePromotion(item.product_id, item.category_id ?? null);
                    const discountPercent = promo?.discount_value ?? 0;
                    const activeUnitPrice = discountPercent > 0 ? Math.max(0, originalUnitPrice - (originalUnitPrice * discountPercent / 100)) : originalUnitPrice;

                    return (
                      <div key={item.id} className="flex items-start gap-4 py-2 border-b border-[var(--border-default)] last:border-0">
                        <div className="w-16 h-16 rounded-[var(--radius-md)] overflow-hidden bg-[var(--bg-surface-2)] flex-shrink-0 border border-[var(--border-default)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image || item.images?.find((i: any) => i?.is_primary)?.image_url || (item.images?.[0] as any)?.image_url || '/placeholder-product.png'}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between gap-2">
                            <p className="text-[13px] font-medium text-[var(--text-primary)] leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.name}</p>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors p-1"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 uppercase tracking-tight flex gap-2 items-center" style={{ fontFamily: "'Poppins', sans-serif" }}>
                            <span>৳{activeUnitPrice.toLocaleString()}</span>
                            {discountPercent > 0 && originalUnitPrice > 0 && (
                              <span className="line-through opacity-60">৳{originalUnitPrice.toLocaleString()}</span>
                            )}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center rounded-lg bg-[var(--bg-depth)] border border-[var(--border-default)]">
                              <button
                                onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                className="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                              >
                                -
                              </button>
                              <span className="w-6 text-center text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                                disabled={item.quantity >= (item.available_inventory ?? 999)}
                                className="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-[13px] font-bold text-[var(--text-primary)]">
                              ৳{(item.quantity * activeUnitPrice).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Coupon Input */}
                <div className="mt-6 pt-6 border-t border-[var(--border-default)]">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="PROMO CODE"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-[11px] font-bold tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cyan)] transition-all"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={!couponCode || couponApplyLoading}
                      className="px-6 py-3 bg-[var(--text-primary)] text-[var(--bg-root)] rounded-xl text-[10px] font-bold tracking-widest uppercase hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                      {couponApplyLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                  {couponError && <p className="text-[10px] text-rose-500 mt-2 ml-1 font-medium">{couponError}</p>}
                  {couponSuccess && <p className="text-[10px] text-[var(--status-success)] mt-2 ml-1 font-medium">{couponSuccess}</p>}
                </div>

                <div className="border-t border-[var(--border-default)] mt-6 pt-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-secondary)]">Subtotal</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">৳{summary.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--text-secondary)]">Standard Delivery</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">৳{shippingCharge.toLocaleString()}</span>
                  </div>
                  {couponDiscount > 0 && (
                    <div className="flex justify-between items-center text-[var(--status-success)]">
                      <span className="text-sm underline decoration-dotted">Store Credit / Promo</span>
                      <span className="text-sm font-bold">-৳{couponDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-[var(--border-strong)] mt-4 pt-4">
                    <span className="text-base font-bold text-[var(--text-primary)]">Total</span>
                    <span className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>৳{summary.total_amount.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={handleGuestPlaceOrder}
                  disabled={isProcessing}
                  className="ec-btn-primary w-full mt-8 py-4 text-xs font-bold tracking-[0.2em] uppercase"
                >
                  {isProcessing ? 'Processing…' : `Place Order`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root ec-darkify min-h-screen pb-20">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="mb-12">
          <div className="hidden sm:flex items-center justify-between mb-8">
            {['shipping', 'payment', 'review'].map((stepId, idx) => {
              const isActive = currentStep === stepId;
              const isCompleted = ['shipping', 'payment', 'review'].indexOf(currentStep) > idx;
              const Icon = [MapPin, CreditCard, Package][idx];
              const labels = ['Shipping', 'Payment', 'Review'];

              return (
                <div key={stepId} className="flex flex-col items-center flex-1 relative">
                  {idx > 0 && (
                    <div className={`absolute right-[50%] top-5 w-full h-[2px] -z-10 transition-colors duration-500 ${isCompleted || isActive ? 'bg-[var(--cyan)] opacity-30' : 'bg-[var(--border-default)]'}`} />
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                    isActive ? 'bg-[var(--cyan-pale)] border-[var(--cyan)] text-[var(--cyan)] shadow-xl scale-110' :
                    isCompleted ? 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--bg-root)]' : 
                    'bg-[var(--bg-depth)] border-[var(--border-default)] text-[var(--text-muted)]'
                  }`}>
                    {isCompleted ? <span className="text-sm font-bold">✓</span> : <Icon size={16} />}
                  </div>
                  <span className={`mt-3 text-[10px] font-bold uppercase tracking-[0.2em] ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {labels[idx]}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="hidden sm:block h-1 w-full bg-[var(--bg-lifted)] rounded-full overflow-hidden mt-8">
            <div
              className="h-full bg-[var(--cyan)] transition-all duration-700 ease-out"
              style={{ width: `${((['shipping', 'payment', 'review'].indexOf(currentStep) + 1) / 3) * 100}%` }}
            />
          </div>

          <div className="sm:hidden flex flex-col gap-3">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.2em]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Step {['shipping', 'payment', 'review'].indexOf(currentStep) + 1} of 3
                </span>
                <h2 className="text-xl font-medium text-[var(--text-primary)] mt-1 capitalize" style={{ fontFamily: "'Poppins', sans-serif" }}>{currentStep} Details</h2>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]" style={{ fontFamily: "'Poppins', sans-serif" }}>Next Up</span>
                <p className="text-sm font-medium text-[var(--text-secondary)] capitalize">
                  {currentStep === 'shipping' ? 'Payment' : currentStep === 'payment' ? 'Review' : 'Order Done'}
                </p>
              </div>
            </div>
            <div className="h-1.5 w-full bg-[var(--bg-lifted)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--cyan)] transition-all duration-700 ease-out"
                style={{ width: `${((['shipping', 'payment', 'review'].indexOf(currentStep) + 1) / 3) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-600 rounded-xl p-6 flex items-start gap-4 ec-anim-fade-up shadow-lg shadow-red-500/20">
            <AlertCircle className="text-white flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>Action Required</h3>
              <p className="text-white text-sm font-medium leading-relaxed">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-white/70 hover:text-white transition-colors">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start" ref={formRef}>
          <div className="lg:col-span-7 space-y-8">
            {/* Shipping Info */}
            {currentStep === 'shipping' && (
              <div className="ec-anim-fade-up">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-bold text-neutral-900 flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    <MapPin className="text-neutral-900" size={28} />
                    Shipping Address
                  </h2>
                  <button
                    onClick={() => {
                      setShowAddressForm(true);
                      setEditingAddressId(null);
                      setAddressForm(getEmptyAddressForm());
                      setError(null);
                    }}
                    className="flex items-center gap-2 text-neutral-900 font-medium hover:text-neutral-900"
                  >
                    <Plus size={20} />
                    <span className="hidden sm:inline">Add New Address</span>
                  </button>
                </div>

                {loadingAddresses ? (
                  <div className="text-center py-8">
                    <Loader2 className="animate-spin h-8 w-8 text-neutral-900 mx-auto mb-2" />
                    <p className="text-neutral-600">Loading addresses...</p>
                  </div>
                ) : addresses.length === 0 && !showAddressForm ? (
                  <div className="text-center py-8">
                    <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-neutral-600 mb-4">No addresses found. Please add a delivery address.</p>
                    <button
                      onClick={() => {
                        setShowAddressForm(true);
                        setError(null);
                      }}
                      className="bg-neutral-900 text-white px-6 py-2 rounded-xl font-medium hover:bg-neutral-800"
                    >
                      Add Address
                    </button>
                  </div>
                ) : (
                  <>
                    {showAddressForm && (
                      <div className="mb-8 p-6 border border-white/10 rounded-2xl space-y-6 ec-dark-card shadow-2xl">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-white">
                            {editingAddressId ? 'Edit Address' : 'New Address'}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddressForm(false);
                              setEditingAddressId(null);
                              setAddressForm(getEmptyAddressForm());
                              setError(null);
                            }}
                            className="text-neutral-500 hover:text-neutral-700 text-2xl leading-none"
                          >
                            ×
                          </button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                              Full Name <span className="text-rose-600">*</span>
                            </label>
                            <input
                              type="text"
                              autoComplete="name"
                              autoCapitalize="words"
                              value={addressForm.name}
                              onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                              className="ec-input"
                              placeholder="John Doe"
                              aria-invalid={!addressForm.name && isProcessing}
                            />
                            {!addressForm.name && isProcessing && <p className="text-xs text-rose-500 mt-1">Name is required</p>}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                              Phone Number <span className="text-rose-600">*</span>
                            </label>
                            <input
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel"
                              value={addressForm.phone}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setAddressForm({ ...addressForm, phone: value });
                              }}
                              placeholder="01712345678"
                              maxLength={11}
                              className="ec-input"
                              aria-invalid={(!addressForm.phone || addressForm.phone.length !== 11) && isProcessing}
                            />
                            {(!addressForm.phone || addressForm.phone.length !== 11) && isProcessing && <p className="text-xs text-rose-500 mt-1">11-digit phone required</p>}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Email (Optional)
                          </label>
                          <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            value={addressForm.email || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, email: e.target.value })}
                            placeholder="john@example.com"
                            className="ec-input"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Address Line 1 <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            autoComplete="address-line1"
                            value={addressForm.address_line_1}
                            onChange={(e) => setAddressForm({ ...addressForm, address_line_1: e.target.value })}
                            placeholder="House/Flat number, Street name"
                            className="ec-input"
                            aria-invalid={!addressForm.address_line_1 && isProcessing}
                          />
                          {!addressForm.address_line_1 && isProcessing && <p className="text-xs text-rose-500 mt-1">Address is required</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Address Line 2 (Optional)
                          </label>
                          <input
                            type="text"
                            autoComplete="address-line2"
                            value={addressForm.address_line_2 || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, address_line_2: e.target.value })}
                            placeholder="Area, Sector"
                            className="ec-input"
                          />
                        </div>

                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                              City <span className="text-rose-600">*</span>
                            </label>
                            <select
                              value={addressForm.city}
                              onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                              className="ec-input w-full appearance-none bg-[#1a1a1a] text-white border-white/10"
                            >
                              <option value="Dhaka">Dhaka</option>
                              <option value="Chittagong">Chittagong</option>
                              <option value="Sylhet">Sylhet</option>
                              <option value="Rajshahi">Rajshahi</option>
                              <option value="Khulna">Khulna</option>
                              <option value="Barisal">Barisal</option>
                              <option value="Rangpur">Rangpur</option>
                              <option value="Mymensingh">Mymensingh</option>
                              <option value="Comilla">Comilla</option>
                              <option value="Gazipur">Gazipur</option>
                              <option value="Narayanganj">Narayanganj</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                              State <span className="text-rose-600">*</span>
                            </label>
                            <select
                              value={addressForm.state}
                              onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                              className="ec-input w-full appearance-none bg-[#1a1a1a] text-white border-white/10"
                            >
                              <option value="Dhaka Division">Dhaka Division</option>
                              <option value="Chittagong Division">Chittagong Division</option>
                              <option value="Rajshahi Division">Rajshahi Division</option>
                              <option value="Khulna Division">Khulna Division</option>
                              <option value="Barisal Division">Barisal Division</option>
                              <option value="Sylhet Division">Sylhet Division</option>
                              <option value="Rangpur Division">Rangpur Division</option>
                              <option value="Mymensingh Division">Mymensingh Division</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">
                              Postal Code (Optional)
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="postal-code"
                              value={addressForm.postal_code || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setAddressForm({ ...addressForm, postal_code: value });
                              }}
                              placeholder="1234"
                              maxLength={4}
                              className="ec-input"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Landmark (Optional)
                          </label>
                          <input
                            type="text"
                            value={addressForm.landmark || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                            placeholder="Near XYZ School"
                            className="ec-input"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-400 mb-1">
                            Delivery Instructions (Optional)
                          </label>
                          <textarea
                            value={addressForm.delivery_instructions || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, delivery_instructions: e.target.value })}
                            placeholder="e.g., Call before delivery"
                            rows={2}
                            className="ec-input h-auto min-h-[80px] py-4"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="defaultShipping"
                            checked={addressForm.is_default_shipping || false}
                            onChange={(e) => setAddressForm({ ...addressForm, is_default_shipping: e.target.checked })}
                            className="w-4 h-4 text-neutral-900 focus:ring-neutral-200 rounded"
                          />
                          <label htmlFor="defaultShipping" className="text-sm text-neutral-700">
                            Set as default shipping address
                          </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleSaveAddress}
                            disabled={isProcessing}
                            className="flex-1 bg-neutral-900 text-white py-2.5 rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="animate-spin" size={16} />
                                Saving...
                              </>
                            ) : (
                              <>
                                {editingAddressId ? 'Update Address' : 'Save Address'}
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddressForm(false);
                              setEditingAddressId(null);
                              setAddressForm(getEmptyAddressForm());
                              setError(null);
                            }}
                            disabled={isProcessing}
                            className="px-6 bg-neutral-100 text-neutral-700 py-2.5 rounded-xl font-medium hover:bg-gray-300 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Address List */}
                    {!showAddressForm && addresses.length > 0 && (
                      <div className="space-y-3">
                        {addresses.map((address) => (
                          <label
                            key={address.id}
                            className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${selectedShippingAddressId === address.id
                              ? 'border-neutral-900 bg-neutral-50'
                              : 'border-neutral-200 hover:border-neutral-300'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="shipping_address"
                                value={address.id}
                                checked={selectedShippingAddressId === address.id}
                                onChange={() => setSelectedShippingAddressId(address.id!)}
                                className="mt-1 w-5 h-5 text-neutral-900"
                              />
                              <div className="flex-1">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-bold text-neutral-900 text-lg leading-tight mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>{address.name}</p>
                                    <p className="text-sm font-medium text-neutral-500 mb-3">{address.phone}</p>
                                    <div className="space-y-0.5 text-[13px] text-neutral-600 leading-relaxed">
                                      <p>{address.address_line_1}</p>
                                      {address.address_line_2 && <p>{address.address_line_2}</p>}
                                      <p>{address.city}, {address.state} {address.postal_code}</p>
                                    </div>
                                    {address.is_default_shipping && (
                                      <span className="inline-block mt-4 px-3 py-1 bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-green-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                                        Default Shipping
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleEditAddress(address);
                                      }}
                                      className="p-1 text-white/50 hover:bg-white/5 rounded transition-colors"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteAddress(address.id!);
                                      }}
                                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {addresses.length > 0 && !showAddressForm && (
                  <button
                    onClick={() => setCurrentStep('payment')}
                    disabled={!selectedShippingAddressId}
                    className="w-full mt-6 bg-neutral-900 text-white py-3 rounded-xl font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Payment
                  </button>
                )}
              </div>
            )}

            {/* ✅ FIXED: Payment Method */}
            {currentStep === 'payment' && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                  <CreditCard className="text-neutral-900" />
                  Payment Method
                </h2>

                <div className="space-y-4">
                  {paymentMethods.map((method) => (
                    <label
                      key={method.code}
                      className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${selectedPaymentMethod === method.code
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={method.code}
                        checked={selectedPaymentMethod === method.code}
                        onChange={(e) => {
                          console.log('💳 Payment method selected:', e.target.value);
                          setSelectedPaymentMethod(e.target.value);
                        }}
                        className="mt-1 w-5 h-5 text-neutral-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-neutral-900">{method.name}</h3>
                        {method.description && (
                          <p className="text-sm text-neutral-600 mt-1">{method.description}</p>
                        )}
                        {(method.fixed_fee > 0 || method.percentage_fee > 0) && (
                          <p className="text-sm text-neutral-900 mt-1">
                            Fee: ৳{method.fixed_fee}
                            {method.percentage_fee > 0 && ` + ${method.percentage_fee}%`}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-6 flex gap-4">
                  <button
                    onClick={() => setCurrentStep('shipping')}
                    className="flex-1 bg-neutral-100 text-neutral-700 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Back to Shipping
                  </button>
                  <button
                    onClick={() => setCurrentStep('review')}
                    disabled={!selectedPaymentMethod}
                    className="flex-1 bg-neutral-900 text-white py-3 rounded-xl font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue to Review
                  </button>
                </div>
              </div>
            )}

            {/* 🔒 ORIGINAL REVIEW CODE - UNCHANGED (except payment method display) */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                {/* Shipping Address Review */}
                <div className="bg-white rounded-xl shadow-md p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-neutral-900">Shipping Address</h3>
                    <button
                      onClick={() => setCurrentStep('shipping')}
                      className="text-neutral-900 text-sm font-medium hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  {selectedShippingAddressId && (
                    (() => {
                      const address = addresses.find(a => a.id === selectedShippingAddressId);
                      if (!address) return null;
                      return (
                        <div className="text-neutral-700">
                          <p className="font-semibold">{address.name}</p>
                          <p>{address.phone}</p>
                          {address.email && <p>{address.email}</p>}
                          <p className="mt-2">
                            {address.address_line_1}
                            {address.address_line_2 && `, ${address.address_line_2}`}
                          </p>
                          <p>
                            {address.city}, {address.state} {address.postal_code}
                          </p>
                          {address.landmark && <p className="text-sm text-neutral-600 mt-1">Landmark: {address.landmark}</p>}
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Payment Method Review */}
                <div className="bg-white rounded-xl shadow-md p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-neutral-900">Payment Method</h3>
                    <button
                      onClick={() => setCurrentStep('payment')}
                      className="text-neutral-900 text-sm font-medium hover:underline"
                    >
                      Change
                    </button>
                  </div>
                  <p className="text-neutral-700">
                    {paymentMethods.find(m => m.code === selectedPaymentMethod)?.name || selectedPaymentMethod}
                  </p>
                </div>

                {/* Order Notes */}
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Notes (Optional)</h3>
                  <textarea
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Any special instructions for your order"
                    rows={4}
                    className="w-full px-4 py-3 bg-[var(--bg-surface-2)] border border-[var(--border-strong)] rounded-[var(--radius-md)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--cyan-glow)] focus:border-[var(--cyan)] transition-all outline-none"
                  />
                </div>

                {/* Place Order Button */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={isProcessing}
                  className="ec-btn-primary w-full py-4 text-xs font-bold tracking-[0.2em] uppercase"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Processing...
                    </>
                  ) : (
                    <>
                      Place Order
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 🔒 ORIGINAL ORDER SUMMARY - UNCHANGED */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 space-y-4">
              {/* Order Summary: Collapsible on Mobile */}
              <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] border border-[var(--border-default)] overflow-hidden shadow-sm">
                {/* Header / Toggle */}
                <button
                  onClick={() => setIsSummaryOpen(!isSummaryOpen)}
                  className="w-full flex items-center justify-between p-6 sm:cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="text-[var(--cyan)]" size={20} />
                    <h2 className="text-xl font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Summary</h2>
                  </div>
                  <div className="flex items-center gap-3 sm:hidden">
                    <span className="text-lg font-bold text-[var(--text-primary)]">৳{summary.total_amount.toLocaleString()}</span>
                    <ChevronRight className={`transition-transform duration-300 ${isSummaryOpen ? 'rotate-90' : ''}`} size={20} />
                  </div>
                </button>

                {/* Content */}
                <div className={`transition-all duration-500 ease-in-out ${isSummaryOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 sm:max-h-none opacity-0 sm:opacity-100'} overflow-hidden`}>
                  <div className="p-6 pt-0">
                    <div className="space-y-4">
                      {selectedItems.map((item: any) => {
                        const originalUnitPrice = Number(item.unit_price || 0);
                        const promo = getApplicablePromotion(item.product_id, item.category_id ?? null);
                        const discountPercent = promo?.discount_value ?? 0;
                        const unitPrice = discountPercent > 0 ? Math.max(0, originalUnitPrice - (originalUnitPrice * discountPercent / 100)) : originalUnitPrice;
                        return (
                          <div key={item.id} className="flex gap-4 items-start py-2 border-b border-[var(--border-default)] last:border-0">
                            <div className="w-16 h-16 rounded-[var(--radius-md)] overflow-hidden bg-[var(--bg-surface-2)] flex-shrink-0 border border-[var(--border-default)]">
                              <img
                                src={item.image || item.images?.find((i: any) => i?.is_primary)?.image_url || (item.images?.[0] as any)?.image_url || '/placeholder-product.png'}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between gap-2">
                                <h4 className="text-[13px] font-medium text-[var(--text-primary)] leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.name}</h4>
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors p-1"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <p className="text-[11px] text-[var(--text-muted)] mt-1 uppercase tracking-tight flex gap-2 items-center" style={{ fontFamily: "'Poppins', sans-serif" }}>
                                <span>৳{unitPrice.toLocaleString()}</span>
                                {discountPercent > 0 && originalUnitPrice > 0 && (
                                  <span className="line-through opacity-60">৳{originalUnitPrice.toLocaleString()}</span>
                                )}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center rounded-lg bg-[var(--bg-depth)] border border-[var(--border-default)]">
                                  <button
                                    onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                    className="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                                  >
                                    -
                                  </button>
                                  <span className="w-6 text-center text-[11px] font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                                    disabled={item.quantity >= (item.available_inventory ?? 999)}
                                    className="w-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="text-[13px] font-bold text-[var(--text-primary)]">
                                  ৳{(unitPrice * item.quantity).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Coupon Input */}
                    <div className="mt-6 pt-6 border-t border-[var(--border-default)]">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="PROMO CODE"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-default)] text-[11px] font-bold tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cyan)] transition-all"
                          style={{ fontFamily: "'Poppins', sans-serif" }}
                        />
                        <button
                          onClick={handleApplyCoupon}
                          disabled={couponApplyLoading || !couponCode}
                          className="px-6 py-3 rounded-xl bg-[var(--text-primary)] text-[var(--bg-root)] text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
                        >
                          {couponApplyLoading ? 'Apply...' : 'Apply'}
                        </button>
                      </div>
                      {couponError && (
                        <div className="mt-2 px-3 py-2 bg-red-600 rounded-lg text-[10px] text-white font-bold uppercase tracking-wider animate-pulse">
                          {couponError}
                        </div>
                      )}
                      {couponSuccess && <p className="text-[10px] text-[var(--status-success)] mt-2 font-medium">{couponSuccess}</p>}
                    </div>

                    {/* Fees & Discounts */}
                    <div className="space-y-3 pt-6">

                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Subtotal</span>
                        <span className="text-[var(--text-primary)] font-medium">৳{summary.subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Delivery</span>
                        <span className="text-[var(--text-primary)] font-medium">+ ৳{shippingCharge.toLocaleString()}</span>
                      </div>
                      {summary.discount_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[var(--status-success)] font-medium">Discount</span>
                          <span className="text-[var(--status-success)] font-bold">- ৳{summary.discount_amount.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Total */}
                      <div className="flex justify-between pt-6 border-t border-[var(--border-strong)] items-center">
                        <span className="text-base font-bold text-[var(--text-primary)]">Total</span>
                        <h3 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          ৳{summary.total_amount.toLocaleString()}
                        </h3>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secure Payment Badge */}
              <div className="p-5 rounded-[var(--radius-lg)] bg-[var(--bg-surface-2)] border border-[var(--border-default)] flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[var(--status-success)]/10 flex items-center justify-center text-[var(--status-success)]">
                  <Lock size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-tight">Secure Checkout</h4>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest" style={{ fontFamily: "'Poppins', sans-serif" }}>SSL Encrypted</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}