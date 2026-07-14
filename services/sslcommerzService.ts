import axiosInstance from '@/lib/axios';

export interface SSLCommerzInitResponse {
  success: boolean;
  message: string;
  data: {
    order: {
      id: number;
      order_number: string;
      total_amount: number;
      status: string;
      payment_status: string;
    };
    payment_url: string;
    transaction_id: string;
  };
}

class SSLCommerzService {
  /**
   * Initialize SSLCommerz payment:
   * - Creates an order from cart
   * - Initiates SSLCommerz session
   * - Returns payment_url for redirect
   */
  async initializePayment(orderData: {
    shipping_address_id: number;
    billing_address_id?: number;
    notes?: string;
    coupon_code?: string;
    use_loyalty_points?: boolean;
    loyalty_expected_points?: number;
    loyalty_expected_discount?: number;
  }): Promise<SSLCommerzInitResponse> {
    const basePayload = {
      ...orderData,
      payment_method: 'sslcommerz',
      // Keep order unassigned for manual store assignment
      store_id: null,
      assigned_store_id: null,
    };

    const payloadVariants = [
      {
        ...basePayload,
        status: 'pending_assignment',
        order_status: 'pending_assignment',
        assignment_status: 'unassigned',
        auto_assign_store: false,
        requires_store_assignment: true,
      },
      {
        ...basePayload,
        status: 'pending_assignment',
      },
      {
        ...basePayload,
      },
    ];

    let lastError: any = null;

    for (const body of payloadVariants) {
      try {
        const response = await axiosInstance.post('/customer/orders/create-from-cart', body);
        return response.data as SSLCommerzInitResponse;
      } catch (error: any) {
        lastError = error;
        console.warn('⚠️ SSLCommerz init attempt failed, trying fallback payload...', {
          status: error?.response?.status,
          message: error?.response?.data?.message || error?.message,
        });
      }
    }

    console.error('SSLCommerz initialization failed:', lastError);
    throw {
      message: lastError?.response?.data?.message || 'Failed to initialize payment',
      errors: lastError?.response?.data?.errors || {},
    };
  }

  /**
   * Redirect customer to SSLCommerz payment gateway
   */
  redirectToPaymentGateway(paymentUrl: string): void {
    if (typeof window !== 'undefined') {
      // Store current location to return to after payment
      localStorage.setItem('sslc_return_url', window.location.pathname);

      // Redirect to payment gateway
      window.location.href = paymentUrl;
    }
  }

  /**
   * Store payment intent in localStorage before redirecting
   * Used to track payment when user returns
   */
  storePaymentIntent(data: {
    order_id: number;
    order_number: string;
    transaction_id: string;
    amount: number;
    timestamp: number;
  }): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sslc_payment_intent', JSON.stringify(data));
    }
  }

  /**
   * Get stored payment intent
   */
  getPaymentIntent(): {
    order_id: number;
    order_number: string;
    transaction_id: string;
    amount: number;
    timestamp: number;
  } | null {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem('sslc_payment_intent');
      return data ? JSON.parse(data) : null;
    }
    return null;
  }

  /**
   * Clear payment intent after processing
   */
  clearPaymentIntent(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sslc_payment_intent');
      localStorage.removeItem('sslc_return_url');
    }
  }

  /**
   * Check if currently processing a payment
   */
  isProcessingPayment(): boolean {
    const intent = this.getPaymentIntent();
    if (!intent) return false;

    // Payment intent valid for 30 minutes
    const thirtyMinutes = 30 * 60 * 1000;
    return Date.now() - intent.timestamp < thirtyMinutes;
  }

  /**
   * Check payment status after user returns from gateway.
   * IMPORTANT: Customer order lookup uses ORDER NUMBER (e.g. ORD-2024-001234).
   */
  async checkPaymentStatus(orderNumber: string): Promise<{
    success: boolean;
    order: {
      id: number;
      order_number: string;
      status: string;
      payment_status: string;
      total_amount: number;
    };
  }> {
    try {
      const response = await axiosInstance.get(`/customer/orders/${orderNumber}`);

      return {
        success: true,
        order: response.data.data.order,
      };
    } catch (error: any) {
      console.error('Failed to check payment status:', error);
      throw {
        message: error.response?.data?.message || 'Failed to verify payment status',
        errors: error.response?.data?.errors || {},
      };
    }
  }

  /**
   * Get return URL after payment
   */
  getReturnUrl(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sslc_return_url') || '/e-commerce/my-account';
    }
    return '/e-commerce/my-account';
  }
}

export default new SSLCommerzService();
