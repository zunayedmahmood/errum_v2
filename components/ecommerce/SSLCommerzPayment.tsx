'use client';

import React, { useState } from 'react';
import { CreditCard, Loader2, ShieldCheck, Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import sslcommerzService from '@/services/sslcommerzService';

interface SSLCommerzPaymentProps {
  shippingAddressId: number;
  billingAddressId?: number;
  orderNotes?: string;
  couponCode?: string;
  totalAmount: number;
  items?: any[];
  shippingCharge?: number;
  discount?: number;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export default function SSLCommerzPayment({
  shippingAddressId,
  billingAddressId,
  orderNotes,
  couponCode,
  totalAmount,
  items,
  shippingCharge,
  discount,
  onError,
  onCancel,
}: SSLCommerzPaymentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStage, setPaymentStage] = useState<'ready' | 'initializing' | 'redirecting'>('ready');
  const [showRedirectOverlay, setShowRedirectOverlay] = useState(false);

  const handlePayment = async () => {
    setError(null);
    setIsProcessing(true);
    setPaymentStage('initializing');

    try {
      console.log('🔐 Initializing SSLCommerz payment...');

      // Step 1: Initialize payment with backend
      const orderData = {
        shipping_address_id: shippingAddressId,
        billing_address_id: billingAddressId || shippingAddressId,
        notes: orderNotes || '',
        ...(couponCode && { coupon_code: couponCode }),
      };

      const response = await sslcommerzService.initializePayment(orderData);

      console.log('✅ Payment initialized:', response);

      if (!response.success) {
        throw new Error(response.message || 'Failed to initialize payment');
      }

      if (!response.data.payment_url) {
        throw new Error('Payment gateway URL not received');
      }

      // Step 2: Store payment intent for tracking
      sslcommerzService.storePaymentIntent({
        order_id: response.data.order.id,
        order_number: response.data.order.order_number,
        transaction_id: response.data.transaction_id,
        amount: totalAmount,
        timestamp: Date.now(),
      });

      console.log('💾 Payment intent stored');

      // Step 2.1: Store order preview for new pages
      try {
        localStorage.setItem(
          'ec_last_order',
          JSON.stringify({
            order_number: response.data.order.order_number,
            payment_method: 'sslcommerz',
            total_amount: response.data.order.total_amount,
            shipping_charge: shippingCharge || 0,
            discount: discount || 0,
            created_at: Date.now(),
            items: items?.map((it) => ({
              product_name: it.product_name || it.name,
              quantity: it.quantity,
              price: it.price || it.unit_price,
              total: it.total || it.total_price,
              product_image: it.product_image || (it.images?.[0] as any)?.image_url || '/placeholder-product.png',
              sku: it.sku || '',
            })),
          })
        );
      } catch (e) {
        console.warn('Failed to store order preview', e);
      }

      // Step 3: Clear checkout data before redirect
      localStorage.removeItem('checkout-selected-items');

      // Step 4: Show redirecting overlay
      setShowRedirectOverlay(true);
      setPaymentStage('redirecting');

      // Step 5: Redirect fallback (8 seconds)
      const timeoutId = setTimeout(() => {
        setShowRedirectOverlay((current) => {
          if (current) {
            setIsProcessing(false);
            setError('Payment gateway redirect took too long. Please try again.');
            setPaymentStage('ready');
            return false;
          }
          return current;
        });
      }, 8000);

      // Step 6: Redirect to SSLCommerz payment gateway
      setTimeout(() => {
        console.log('🔄 Redirecting to SSLCommerz...');
        sslcommerzService.redirectToPaymentGateway(response.data.payment_url);
      }, 1000);

    } catch (err: any) {
      console.error('❌ Payment initialization failed:', err);
      const errorMessage = err.message || 'Failed to initialize payment. Please try again.';
      setError(errorMessage);
      setPaymentStage('ready');
      setIsProcessing(false);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const renderPaymentStage = () => {
    switch (paymentStage) {
      case 'initializing':
        return (
          <div className="text-center py-6">
            <Loader2 className="animate-spin h-12 w-12 text-neutral-900 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Preparing Payment Gateway</h3>
            <p className="text-gray-600">Creating your order and connecting to SSLCommerz...</p>
          </div>
        );

      case 'redirecting':
        return (
          <div className="text-center py-6">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-neutral-900 mx-auto mb-4"></div>
              <CreditCard className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-neutral-900" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Redirecting to Payment Gateway</h3>
            <p className="text-gray-600">You will be redirected to SSLCommerz shortly...</p>
            <p className="text-sm text-gray-500 mt-2">Please do not close this window</p>
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                💡 <strong>Note:</strong> After payment, you'll be automatically redirected back
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (paymentStage !== 'ready') {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        {renderPaymentStage()}
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] border border-[var(--border-default)] p-8 shadow-sm">
      {/* 6.5 — SSLCommerz Redirect Overlay */}
      {showRedirectOverlay && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg-root)]/92 backdrop-blur-[8px] flex items-center justify-center p-6 text-center animate-in fade-in duration-700">
          <div className="max-w-md w-full space-y-10 ec-anim-fade-up">
            <div className="relative inline-block">
              <div className="w-24 h-24 rounded-full border-t-2 border-[var(--cyan)] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="text-[var(--status-success)]" size={40} />
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-3xl font-medium text-[var(--text-primary)]" style={{ fontFamily: "'Poppins', sans-serif" }}>Taking you to secure payment...</h2>
              <p className="text-[var(--text-secondary)] text-[12px] tracking-[0.2em] uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Encryption handshake active
              </p>
            </div>

            <div className="p-6 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-12 bg-[var(--bg-depth)] rounded-md" />
                <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">VISA</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-12 bg-[var(--bg-depth)] rounded-md" />
                <span className="text-[9px] text-[var(--text-muted)] uppercase font-bold tracking-widest">BKASH</span>
              </div>
              <div className="w-[1px] h-10 bg-[var(--border-default)]" />
              <div className="text-left">
                <p className="text-xs font-bold text-[var(--text-primary)]">Verified by SSLCommerz</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Lock size={10} className="text-[var(--status-success)]" />
                  <p className="text-[10px] text-[var(--status-success)] font-medium">Bank-level Security</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-muted)] italic">
              Please do not close this window while we secure your session
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b">
        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center">
          <CreditCard className="text-neutral-900" size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">SSLCommerz Payment Gateway</h3>
          <p className="text-sm text-gray-600">Secure online payment</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="font-semibold text-rose-900 mb-1">Payment Error</h4>
            <p className="text-neutral-900 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-neutral-900 cursor-pointer"
            type="button"
          >
            ✕
          </button>
        </div>
      )}

      {/* Payment Information */}
      <div className="mb-6 space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-700 font-medium">Total Amount</span>
            <span className="text-2xl font-bold text-neutral-900">
              ৳{totalAmount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            You will be redirected to SSLCommerz payment gateway to complete your payment securely.
          </p>
        </div>

        {/* Accepted Payment Methods */}
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Accepted Payment Methods</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xs font-medium text-gray-700">Credit Card</div>
              <div className="text-xs text-gray-500 mt-1">Visa, Master</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xs font-medium text-gray-700">Debit Card</div>
              <div className="text-xs text-gray-500 mt-1">All Banks</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xs font-medium text-gray-700">Mobile Banking</div>
              <div className="text-xs text-gray-500 mt-1">bKash, Nagad</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xs font-medium text-gray-700">Internet Banking</div>
              <div className="text-xs text-gray-500 mt-1">All Banks</div>
            </div>
          </div>
        </div>

        {/* Payment Flow Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <CheckCircle size={18} />
            Payment Process
          </h4>
          <ol className="text-sm text-blue-800 space-y-1 ml-6 list-decimal">
            <li>Your order will be created</li>
            <li>You'll be redirected to SSLCommerz secure payment page</li>
            <li>Complete your payment using your preferred method</li>
            <li>You'll be redirected back automatically</li>
            <li>View your order confirmation</li>
          </ol>
        </div>

        {/* Security Features */}
        <div className="space-y-2">
          <div className="flex items-start gap-3 text-sm">
            <ShieldCheck className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-medium text-gray-900">Secure Payment</p>
              <p className="text-gray-600">Your payment information is encrypted and secure</p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm">
            <Lock className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-medium text-gray-900">SSL Encrypted</p>
              <p className="text-gray-600">256-bit SSL certificate ensures your data safety</p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm">
            <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-medium text-gray-900">PCI DSS Compliant</p>
              <p className="text-gray-600">Meets highest security standards</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handlePayment}
          disabled={isProcessing}
          className="w-full bg-neutral-900 text-white py-3 rounded-lg font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Processing...
            </>
          ) : (
            <>
              <Lock size={20} />
              Proceed to SSLCommerz Payment
            </>
          )}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={20} />
            Back to Review
          </button>
        )}
      </div>

      {/* Terms */}
      <p className="text-xs text-gray-500 text-center mt-4">
        By proceeding, you agree to our{' '}
        <a href="/terms" className="text-neutral-900 hover:underline cursor-pointer">
          Terms & Conditions
        </a>{' '}
        and{' '}
        <a href="/privacy" className="text-neutral-900 hover:underline cursor-pointer">
          Privacy Policy
        </a>
      </p>

      {/* SSLCommerz Logo */}
      <div className="mt-6 pt-6 border-t text-center">
        <p className="text-xs text-gray-500 mb-2">Powered by</p>
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="text-green-600" size={20} />
          <span className="font-bold text-gray-700">SSLCommerz</span>
        </div>
      </div>
    </div>
  );
}