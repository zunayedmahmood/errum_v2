'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Package, MapPin, CreditCard, ShoppingBag, AlertCircle, Loader2, ChevronRight, Plus, Edit2, Trash2, CheckCircle } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import SSLCommerzPayment from '@/components/ecommerce/SSLCommerzPayment';
import checkoutService, { Address, OrderItem, PaymentMethod } from '@/services/checkoutService';
import cartService from '@/services/cartService';
import guestCheckoutService, { GuestPaymentMethod } from '@/services/guestCheckoutService';
import campaignService, { CouponValidationResult, CouponErrorCode } from '@/services/campaignService';

export default function CheckoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // ✅ FIXED: Load selected items directly from backend
  useEffect(() => {
    const loadCheckoutItems = async () => {
      console.log('🔍 === CHECKOUT LOAD START ===');

      const selectedIdsStr = localStorage.getItem('checkout-selected-items');
      console.log('📋 localStorage checkout items:', selectedIdsStr);

      if (!selectedIdsStr) {
        console.warn('⚠️ No selected items in localStorage, redirecting to cart...');
        setIsLoadingItems(false);
        router.push('/e-commerce/cart');
        return;
      }

      try {
        const ids = JSON.parse(selectedIdsStr);
        console.log('🔢 Selected IDs:', ids);

        if (!Array.isArray(ids) || ids.length === 0) {
          console.error('❌ Invalid selected items format');
          localStorage.removeItem('checkout-selected-items');
          setIsLoadingItems(false);
          router.push('/e-commerce/cart');
          return;
        }

        // ✅ Load fresh cart data from backend
        console.log('📦 Fetching cart from backend...');
        const cartData = await cartService.getCart();
        console.log('✅ Cart data loaded:', cartData);

        // ✅ Filter by selected IDs
        const items = cartData.cart_items.filter(item => ids.includes(item.id));
        console.log('✅ Filtered checkout items:', items);
        console.log('✅ Item count:', items.length);

        if (items.length === 0) {
          console.error('❌ No matching items found in cart!');
          alert('Selected items are no longer in your cart. Redirecting...');
          localStorage.removeItem('checkout-selected-items');
          setIsLoadingItems(false);
          router.push('/e-commerce/cart');
          return;
        }

        // ✅ Transform to match expected format
        const transformedItems = items.map(item => ({
          id: item.id,
          product_id: item.product_id,
          name: item.product.name,
          images: item.product.images || [],
          sku: item.product.sku ?? '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          variant_options: item.variant_options,
          notes: item.notes,
        }));

        console.log('✅ Setting selected items:', transformedItems);
        setSelectedItems(transformedItems);
        setIsLoadingItems(false);
        console.log('🔍 === CHECKOUT LOAD END ===');

      } catch (error) {
        console.error('❌ Error loading checkout items:', error);
        localStorage.removeItem('checkout-selected-items');
        setIsLoadingItems(false);
        router.push('/e-commerce/cart');
      }
    };

    loadCheckoutItems();
  }, [router]); // ✅ Remove cart dependency - we fetch directly

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
    const unitPrice = typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price;
    const totalPrice = typeof item.total_price === 'string' ? parseFloat(item.total_price) : item.total_price;

    return {
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      price: unitPrice,
      total: totalPrice,
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
      setError(err?.response?.data?.message || err?.message || 'Failed to place order. Please try again.');
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
    } finally {
      setIsProcessing(false);
    }
  };

  // Loading state
  if (isLoadingItems) {
    return (
      <div className="ec-root ec-darkify min-h-screen">
        <Navigation />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">Quick Checkout</h1>
              <p className="text-neutral-600 mt-1">No account needed — just enter your phone and delivery details.</p>
            </div>
            <Link
              href="/e-commerce/login"
              className="hidden sm:inline-flex px-4 py-2 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
            >
              Login / Register
            </Link>
          </div>

          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start ec-anim-fade-up">
              <AlertCircle className="text-red-400 mr-3 mt-0.5 flex-shrink-0" size={20} />
              <div className="text-white/90 font-medium">{error}</div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Contact</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="017XXXXXXXX"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                    <p className="text-xs text-neutral-500 mt-1">We’ll use this to confirm and track your order.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Your Name (optional)</label>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Delivery Address</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      placeholder="Recipient name"
                      value={guestAddress.full_name}
                      onChange={(e) => setGuestAddress({ ...guestAddress, full_name: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Address Line 1 *</label>
                    <input
                      type="text"
                      placeholder="House, road, area"
                      value={guestAddress.address_line_1}
                      onChange={(e) => setGuestAddress({ ...guestAddress, address_line_1: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Address Line 2 (optional)</label>
                    <input
                      type="text"
                      placeholder="Apartment, floor, landmark"
                      value={guestAddress.address_line_2}
                      onChange={(e) => setGuestAddress({ ...guestAddress, address_line_2: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">City *</label>
                    <input
                      type="text"
                      placeholder="Dhaka"
                      value={guestAddress.city}
                      onChange={(e) => setGuestAddress({ ...guestAddress, city: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                    <p className="text-xs text-neutral-500 mt-1">Delivery charge updates automatically.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Postal Code (optional)</label>
                    <input
                      type="text"
                      placeholder="1207"
                      value={guestAddress.postal_code}
                      onChange={(e) => setGuestAddress({ ...guestAddress, postal_code: e.target.value })}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Special Instructions (optional)</label>
                    <textarea
                      rows={3}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="w-full border border-neutral-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-neutral-200 focus:border-neutral-900"
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
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Order Summary</h2>

                <div className="space-y-3 max-h-64 overflow-auto pr-1">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-neutral-100 rounded-xl overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.images?.find((i: any) => i?.is_primary)?.image_url || (item.images?.[0] as any)?.image_url || (item.images?.[0] as any)?.url || '/placeholder-product.png'}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{item.name}</p>
                        <p className="text-xs text-neutral-600">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-sm font-semibold text-amber-600">৳{Number(item.total_price).toFixed(0)}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t mt-4 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Subtotal</span>
                    <span className="font-medium">৳{summary.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Delivery</span>
                    <span className="font-medium">৳{shippingCharge.toFixed(2)}</span>
                  </div>
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Discount</span>
                      <span className="font-medium">-৳{couponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-amber-600">৳{summary.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleGuestPlaceOrder}
                  disabled={isProcessing}
                  className="w-full mt-5 bg-[var(--gold)] hover:bg-[#9a6b2e] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
                >
                  {isProcessing ? 'Processing…' : `Place Order – ৳${summary.total_amount.toFixed(0)}`}
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        {/* Step Progress Indicator - Polished for Mobile */}
        <div className="flex items-center justify-between mb-10 overflow-x-auto pb-4 scrollbar-hide sm:justify-start sm:gap-12">
          {[
            { id: 'shipping', label: 'Shipping', icon: MapPin },
            { id: 'payment', label: 'Payment', icon: CreditCard },
            { id: 'review', label: 'Review', icon: Package }
          ].map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted = ['shipping', 'payment', 'review'].indexOf(currentStep) > idx;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center gap-3 flex-shrink-0">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200 scale-110' :
                  isCompleted ? 'bg-green-500 text-white' : 'bg-neutral-100 text-neutral-400'
                  }`}>
                  {isCompleted ? <CheckCircle size={18} /> : <Icon size={18} />}
                </div>
                <div className="flex flex-col">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`} style={{ fontFamily: "'DM Mono', monospace" }}>
                    Step {idx + 1}
                  </span>
                  <span className={`text-sm font-bold ${isActive ? 'text-neutral-900' : 'text-neutral-400'}`} style={{ fontFamily: "'Jost', sans-serif" }}>
                    {step.label}
                  </span>
                </div>
                {idx < 2 && <ChevronRight className="hidden sm:block text-neutral-200 ml-4" size={16} />}
              </div>
            );
          })}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 ec-anim-fade-up">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="font-bold text-red-500">Notice</h3>
              <p className="text-white/80 text-sm font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-white/30 hover:text-white transition-colors">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          <div className="lg:col-span-2 space-y-8">
            {/* Shipping Info */}
            {currentStep === 'shipping' && (
              <div className="ec-anim-fade-up">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-bold text-neutral-900 flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
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
                          <h3 className="font-bold text-neutral-900">
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
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              Full Name <span className="text-rose-600">*</span>
                            </label>
                            <input
                              type="text"
                              value={addressForm.name}
                              onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                              placeholder="John Doe"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              Phone Number <span className="text-rose-600">*</span>
                            </label>
                            <input
                              type="tel"
                              value={addressForm.phone}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setAddressForm({ ...addressForm, phone: value });
                              }}
                              placeholder="01712345678"
                              maxLength={11}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                            />
                            <p className="text-xs text-neutral-500 mt-1">11 digits, e.g., 01712345678</p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Email (Optional)
                          </label>
                          <input
                            type="email"
                            value={addressForm.email || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, email: e.target.value })}
                            placeholder="john@example.com"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Address Line 1 <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={addressForm.address_line_1}
                            onChange={(e) => setAddressForm({ ...addressForm, address_line_1: e.target.value })}
                            placeholder="House/Flat number, Street name"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Address Line 2 (Optional)
                          </label>
                          <input
                            type="text"
                            value={addressForm.address_line_2 || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, address_line_2: e.target.value })}
                            placeholder="Area, Sector"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                          />
                        </div>

                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              City <span className="text-rose-600">*</span>
                            </label>
                            <select
                              value={addressForm.city}
                              onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
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
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              State <span className="text-rose-600">*</span>
                            </label>
                            <select
                              value={addressForm.state}
                              onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
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
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              Postal Code (Optional)
                            </label>
                            <input
                              type="text"
                              value={addressForm.postal_code || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setAddressForm({ ...addressForm, postal_code: value });
                              }}
                              placeholder="1234"
                              maxLength={4}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                            />
                            <p className="text-xs text-neutral-500 mt-1">4 digits</p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Landmark (Optional)
                          </label>
                          <input
                            type="text"
                            value={addressForm.landmark || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                            placeholder="Near XYZ School"
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Delivery Instructions (Optional)
                          </label>
                          <textarea
                            value={addressForm.delivery_instructions || ''}
                            onChange={(e) => setAddressForm({ ...addressForm, delivery_instructions: e.target.value })}
                            placeholder="e.g., Call before delivery"
                            rows={2}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
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
                                    <p className="font-bold text-neutral-900 text-lg leading-tight mb-1" style={{ fontFamily: "'Jost', sans-serif" }}>{address.name}</p>
                                    <p className="text-sm font-medium text-neutral-500 mb-3">{address.phone}</p>
                                    <div className="space-y-0.5 text-[13px] text-neutral-600 leading-relaxed">
                                      <p>{address.address_line_1}</p>
                                      {address.address_line_2 && <p>{address.address_line_2}</p>}
                                      <p>{address.city}, {address.state} {address.postal_code}</p>
                                    </div>
                                    {address.is_default_shipping && (
                                      <span className="inline-block mt-4 px-3 py-1 bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-green-100" style={{ fontFamily: "'DM Mono', monospace" }}>
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
                  <h3 className="text-lg font-bold text-neutral-900 mb-4">Order Notes (Optional)</h3>
                  <textarea
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Any special instructions for your order"
                    rows={4}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-neutral-200 focus:border-transparent"
                  />
                </div>

                {/* Place Order Button */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={isProcessing}
                  className="w-full bg-[var(--gold)] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#9a6b2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" size={24} />
                      Processing Order...
                    </>
                  ) : (
                    <>
                      <Package size={24} />
                      Place Order - ৳{summary.total_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 🔒 ORIGINAL ORDER SUMMARY - UNCHANGED */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-4">
              <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
                <ShoppingBag className="text-neutral-900" />
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                {selectedItems.map((item: any) => {
                  const unitPrice = typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price;
                  const totalPrice = typeof item.total_price === 'string' ? parseFloat(item.total_price) : item.total_price;

                  return (
                    <div key={item.id} className="flex gap-3">
                      <img
                        src={item.images?.find((i: any) => i?.is_primary)?.image_url || (item.images?.[0] as any)?.image_url || (item.images?.[0] as any)?.url || '/placeholder-product.png'}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded"
                        onError={(e) => {
                          if (!e.currentTarget.src.includes('/placeholder-product.png')) {
                            e.currentTarget.src = '/placeholder-product.png';
                          }
                        }}
                      />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-neutral-900 line-clamp-2">
                          {item.name}
                        </h4>
                        {item.variant_options && (
                          <div className="flex gap-1 mt-1">
                            {item.variant_options.color && (
                              <span className="text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                                {item.variant_options.color}
                              </span>
                            )}
                            {item.variant_options.size && (
                              <span className="text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                                {item.variant_options.size}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm text-neutral-600">Qty: {item.quantity}</p>
                        <p className="text-sm font-semibold text-amber-600">
                          ৳{totalPrice.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pricing */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between text-neutral-700">
                  <span>Subtotal ({selectedItems.length} items)</span>
                  <span>৳{summary.subtotal.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex justify-between text-neutral-700">
                  <span>Shipping</span>
                  <span>৳{summary.shipping_charge.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
                {summary.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-৳{summary.discount_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="border-t pt-3 flex justify-between text-xl font-bold text-neutral-900">
                  <span>Total</span>
                  <span className="text-amber-600">৳{summary.total_amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Coupon Code */}
              {currentStep === 'review' && (
                <div className="mt-6">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !appliedCoupon && !couponApplyLoading) handleApplyCoupon(); }}
                      placeholder="Enter coupon code"
                      className="flex-1 px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none"
                      disabled={!!appliedCoupon || couponApplyLoading}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={!!appliedCoupon || couponApplyLoading || !couponCode.trim()}
                      className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                    >
                      {couponApplyLoading ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
                      ) : 'Apply'}
                    </button>
                  </div>

                  {/* Success banner */}
                  {couponSuccess && appliedCoupon && (
                    <div className="mt-2.5 flex items-start justify-between gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-green-700 font-medium">{couponSuccess}</p>
                      </div>
                      <button
                        onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponSuccess(null); setCouponError(null); }}
                        className="text-xs text-green-600 underline underline-offset-2 flex-shrink-0 hover:text-green-800 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Error banner */}
                  {couponError && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {couponError}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}