'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/ecommerce/Navigation';
import sslcommerzService from '@/services/sslcommerzService';
import { CheckCircle2, Loader2, AlertCircle, ShoppingBag } from 'lucide-react';

type UiState = 'loading' | 'success' | 'processing' | 'failed';

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<UiState>('loading');
  const [message, setMessage] = useState<string>('Verifying your payment...');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  const intent = useMemo(() => sslcommerzService.getPaymentIntent(), []);

  const isAuthed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('auth_token');
  }, []);

  useEffect(() => {
    const fromIntent = intent?.order_number || null;

    // SSLCommerz may send order reference in value_a (depends on your integration)
    const fromQuery =
      searchParams.get('order_number') ||
      searchParams.get('value_a') ||
      null;

    const resolved = fromIntent || fromQuery;
    setOrderNumber(resolved);

    if (!resolved) {
      setState('failed');
      setMessage('Order reference not found. Please check “My Account → Orders”.');
      return;
    }

    // IMPORTANT:
    // We avoid calling protected /customer/orders/* here because guest users (or expired tokens)
    // would be redirected to login by the global axios interceptor.
    // Instead, we show a success message and send the user to a public Thank You page.
    setState('success');
    setMessage('Payment received! Your order is being confirmed.');
    setAmount(intent?.amount ?? null);
    setTimeout(() => router.replace(`/e-commerce/thank-you/${resolved}`), 900);
  }, [intent, searchParams, router]);

  return (
    <div className="ec-root ec-darkify min-h-screen">
      <Navigation />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="ec-dark-card p-6">
          <div className="flex items-start gap-3">
            {state === 'success' ? (
              <CheckCircle2 className="text-green-600 mt-1" size={28} />
            ) : state === 'failed' ? (
              <AlertCircle className="text-red-600 mt-1" size={28} />
            ) : (
              <Loader2 className="animate-spin text-red-700 mt-1" size={28} />
            )}

            <div className="flex-1">
              <h1 className="text-xl font-bold text-neutral-900">Payment Status</h1>
              <p className="text-neutral-600 mt-1">{message}</p>

              <div className="mt-4 text-sm text-neutral-700 space-y-1">
                {orderNumber && (
                  <div>
                    <span className="font-medium">Order:</span> {orderNumber}
                  </div>
                )}
                {amount !== null && !Number.isNaN(amount) && (
                  <div>
                    <span className="font-medium">Amount:</span> ৳{amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {isAuthed ? (
              <button
                type="button"
                onClick={() => router.push('/e-commerce/my-account')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800"
              >
                <ShoppingBag size={18} />
                My Orders
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/e-commerce/thank-you/' + (orderNumber || ''))}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800"
              >
                <ShoppingBag size={18} />
                View Confirmation
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push('/e-commerce')}
              className="px-4 py-2 rounded-lg border border-gray-300 text-neutral-800 hover:bg-gray-50"
            >
              Continue Shopping
            </button>
          </div>

          <div className="mt-6 text-xs text-neutral-500">
            <p>Tip: Gateway confirmation can take a few seconds. Keep your order number.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
