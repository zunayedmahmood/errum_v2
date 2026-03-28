import axiosInstance from '@/lib/axios';

// Types for checkout and orders
export interface Address {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  postal_code?: string;
  country: string;
  landmark?: string;
  delivery_instructions?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
  type?: 'shipping' | 'billing' | 'both';
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  price?: number;
  unit_price?: number;
  total?: number;
  total_amount?: number;
  product_image?: string;
  image_url?: string;
  sku?: string;
  product_sku?: string;
  color?: string;
  size?: string;
  variant_options?: any;
  product?: {
    images?: Array<{
      image_url?: string;
      url?: string;
      is_primary?: boolean | number;
    }>;
  };
}

export interface OrderSummary {
  subtotal: number;
  shipping_charge: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
}

export interface CreateOrderRequest {
  payment_method: string; // Changed to string to accept any payment method code
  shipping_address_id: number;
  billing_address_id?: number;
  notes?: string;
  coupon_code?: string;
  delivery_preference?: 'standard' | 'express' | 'scheduled';
  scheduled_delivery_date?: string;
  // Keep unassigned so warehouse/store-assignment can assign later
  store_id?: number | null;

  // Extra hints for backends that support explicit assignment workflow
  // (ignored safely by most APIs if unsupported)
  assigned_store_id?: number | null;
  status?: string;
  order_status?: string;
  assignment_status?: string;
  auto_assign_store?: boolean;
  requires_store_assignment?: boolean;
}

export interface Order {
  id: number;
  order_number: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'pending_assignment';
  payment_status: 'pending' | 'paid' | 'failed' | 'unpaid';
  payment_method: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  shipping_amount: number;
  discount_amount: number;
  created_at: string;
  estimated_delivery?: string;
  items: OrderItem[];
  shipping_address: Address;
  billing_address?: Address;
  delivery_address?: Address;
  summary?: {
    total_items: number;
    total_amount: number;
    status_label: string;
    can_cancel: boolean;
    can_return: boolean;
    tracking_available?: boolean;
  };
}

// ✅ FIXED: Match actual backend PaymentMethod model
export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  description: string | null;
  type: 'cash' | 'card' | 'bank_transfer' | 'online_banking' | 'mobile_banking' | 'digital_wallet' | 'other';
  allowed_customer_types: string[];
  is_active: boolean;
  requires_reference: boolean;
  supports_partial: boolean;
  min_amount: number | null;
  max_amount: number | null;
  processor: string | null;
  processor_config: any;
  icon: string | null;
  fixed_fee: number;
  percentage_fee: number;
  sort_order: number;
}

export interface TrackingStep {
  status: string;
  label: string;
  completed: boolean;
  date: string | null;
}

export interface OrderTracking {
  order_number: string;
  current_status: string;
  tracking_number?: string;
  estimated_delivery?: string;
  steps: TrackingStep[];
  last_updated: string;
}

export interface OrderStatistics {
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  cancelled_orders: number;
  total_spent: number;
  average_order_value: number;
  last_order_date: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginationParams {
  per_page?: number;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface OrdersListResponse {
  orders: Order[];
  pagination: {
    current_page: number;
    total_pages: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
  filters: {
    status?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
  };
}

class CheckoutService {
  /**
   * Get available payment methods for e-commerce customers
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        customer_type: string;
        payment_methods: PaymentMethod[];
        note: string;
      }>>('/payment-methods', {
        params: {
          customer_type: 'ecommerce',
        },
      });
      return response.data.data.payment_methods;
    } catch (error: any) {
      console.error('Failed to fetch payment methods:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment methods');
    }
  }

  /**
   * Check if payment method is online/requires gateway
   */
  isOnlinePaymentMethod(paymentMethod: PaymentMethod): boolean {
    // Online payment methods that require payment gateway
    const onlineTypes = ['card', 'online_banking', 'mobile_banking', 'digital_wallet'];
    const onlineProcessors = ['sslcommerz', 'stripe', 'paypal', 'bkash', 'nagad'];
    
    return (
      onlineTypes.includes(paymentMethod.type) ||
      (paymentMethod.processor && onlineProcessors.includes(paymentMethod.processor.toLowerCase())) ||
      paymentMethod.code === 'sslcommerz' ||
      paymentMethod.name.toLowerCase().includes('sslcommerz') ||
      paymentMethod.name.toLowerCase().includes('online payment')
    );
  }

  /**
   * ✅ FIXED: Create order from cart
   * POST /customer/orders/create-from-cart (matches backend route)
   */
  async createOrderFromCart(orderData: CreateOrderRequest): Promise<{
    order: Order;
    order_summary: {
      order_number: string;
      total_items: number;
      subtotal: number;
      tax: number;
      shipping: number;
      discount: number;
      total_amount: number;
      payment_method: string;
      status: string;
      status_description: string;
    };
    payment_url?: string; // For SSLCommerz
    transaction_id?: string; // For SSLCommerz
  }> {
    const basePayload: CreateOrderRequest = {
      ...orderData,
      // enforce "not assigned" at order creation
      store_id: null,
      assigned_store_id: null,
    };

    // Try explicit pending-assignment hints first; fall back gracefully
    // so checkout never breaks on strict validators.
    const payloadVariants: CreateOrderRequest[] = [
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

    for (const payload of payloadVariants) {
      try {
        console.log('📦 Creating order from cart...');
        console.log('📋 Order payload:', payload);

        const response = await axiosInstance.post<ApiResponse<{
          order: Order;
          order_summary: any;
          payment_url?: string;
          transaction_id?: string;
        }>>('/customer/orders/create-from-cart', payload);

        console.log('✅ Order created successfully:', response.data);

        return response.data.data;
      } catch (error: any) {
        lastError = error;
        console.warn('⚠️ create-from-cart attempt failed, trying fallback payload...', {
          status: error?.response?.status,
          message: error?.response?.data?.message || error?.message,
          errors: error?.response?.data?.errors,
        });
      }
    }

    console.error('❌ Failed to create order - Full error details:');
    console.error('Status:', lastError?.response?.status);
    console.error('Status Text:', lastError?.response?.statusText);
    console.error('Data:', lastError?.response?.data);
    console.error('Message:', lastError?.message);

    throw new Error(lastError?.response?.data?.message || 'Failed to create order');
  }

  /**
   * Get customer orders with pagination and filters
   * GET /customer/orders
   */
  async getOrders(params?: PaginationParams): Promise<OrdersListResponse> {
    try {
      const response = await axiosInstance.get<ApiResponse<OrdersListResponse>>(
        '/customer/orders',
        { params }
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch orders');
    }
  }

  /**
   * Get order by order number
   * GET /customer/orders/{orderNumber}
   */
  async getOrderByNumber(orderNumber: string): Promise<Order> {
    try {
      const response = await axiosInstance.get<ApiResponse<{ order: Order }>>(
        `/customer/orders/${orderNumber}`
      );
      return response.data.data.order;
    } catch (error: any) {
      console.error('Failed to fetch order:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch order');
    }
  }

  /**
   * Cancel order (within 24 hours)
   * POST /customer/orders/{orderNumber}/cancel
   */
  async cancelOrder(orderNumber: string): Promise<Order> {
    try {
      const response = await axiosInstance.post<ApiResponse<{ order: Order }>>(
        `/customer/orders/${orderNumber}/cancel`
      );
      return response.data.data.order;
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel order');
    }
  }

  /**
   * Track order
   * GET /customer/orders/{orderNumber}/track
   */
  async trackOrder(orderNumber: string): Promise<{
    order: Order;
    tracking: OrderTracking;
  }> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        order: Order;
        tracking: OrderTracking;
      }>>(`/customer/orders/${orderNumber}/track`);
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to track order:', error);
      throw new Error(error.response?.data?.message || 'Failed to track order');
    }
  }

  /**
   * Get order statistics
   * GET /customer/orders/stats/summary
   */
  async getOrderStatistics(): Promise<{
    statistics: OrderStatistics;
    recent_orders: Order[];
  }> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        statistics: OrderStatistics;
        recent_orders: Order[];
      }>>('/customer/orders/stats/summary');
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to fetch order statistics:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch order statistics');
    }
  }

  // ============================================================================
  // ADDRESS MANAGEMENT
  // ============================================================================

  /**
   * Get all customer addresses
   * GET /customer/addresses
   */
  async getAddresses(type?: 'shipping' | 'billing' | 'both'): Promise<{
    addresses: Address[];
    default_shipping: Address | null;
    default_billing: Address | null;
    total: number;
  }> {
    try {
      const params = type ? { type } : undefined;
      const response = await axiosInstance.get<ApiResponse<{
        addresses: Address[];
        default_shipping: Address | null;
        default_billing: Address | null;
        total: number;
      }>>('/customer/addresses', { params });
      
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to fetch addresses:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch addresses');
    }
  }

  /**
   * Get single address
   * GET /customer/addresses/{id}
   */
  async getAddress(id: number): Promise<{
    address: Address;
    formatted_address: string;
    full_address: string;
  }> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        address: Address;
        formatted_address: string;
        full_address: string;
      }>>(`/customer/addresses/${id}`);
      
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to fetch address:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch address');
    }
  }

  /**
   * Create new address
   * POST /customer/addresses
   */
  async createAddress(addressData: Omit<Address, 'id'>): Promise<{
    address: Address;
    formatted_address: string;
  }> {
    try {
      const response = await axiosInstance.post<ApiResponse<{
        address: Address;
        formatted_address: string;
      }>>('/customer/addresses', addressData);
      
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to create address:', error);
      throw new Error(error.response?.data?.message || 'Failed to create address');
    }
  }

  /**
   * Update address
   * PUT /customer/addresses/{id}
   */
  async updateAddress(id: number, addressData: Partial<Address>): Promise<{
    address: Address;
    formatted_address: string;
  }> {
    try {
      const response = await axiosInstance.put<ApiResponse<{
        address: Address;
        formatted_address: string;
      }>>(`/customer/addresses/${id}`, addressData);
      
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to update address:', error);
      throw new Error(error.response?.data?.message || 'Failed to update address');
    }
  }

  /**
   * Delete address
   * DELETE /customer/addresses/{id}
   */
  async deleteAddress(id: number): Promise<void> {
    try {
      await axiosInstance.delete(`/customer/addresses/${id}`);
    } catch (error: any) {
      console.error('Failed to delete address:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete address');
    }
  }

  /**
   * Set default shipping address
   * PATCH /customer/addresses/{id}/set-default-shipping
   */
  async setDefaultShipping(id: number): Promise<Address> {
    try {
      const response = await axiosInstance.patch<ApiResponse<{ address: Address }>>(
        `/customer/addresses/${id}/set-default-shipping`
      );
      return response.data.data.address;
    } catch (error: any) {
      console.error('Failed to set default shipping address:', error);
      throw new Error(error.response?.data?.message || 'Failed to set default shipping address');
    }
  }

  /**
   * Set default billing address
   * PATCH /customer/addresses/{id}/set-default-billing
   */
  async setDefaultBilling(id: number): Promise<Address> {
    try {
      const response = await axiosInstance.patch<ApiResponse<{ address: Address }>>(
        `/customer/addresses/${id}/set-default-billing`
      );
      return response.data.data.address;
    } catch (error: any) {
      console.error('Failed to set default billing address:', error);
      throw new Error(error.response?.data?.message || 'Failed to set default billing address');
    }
  }

  /**
   * Validate delivery area
   * POST /customer/addresses/validate
   */
  async validateDeliveryArea(city: string, state: string, postal_code: string): Promise<{
    is_delivery_available: boolean;
    estimated_delivery_days: string | null;
    delivery_charge: number;
    message: string;
  }> {
    try {
      const response = await axiosInstance.post<ApiResponse<{
        is_delivery_available: boolean;
        estimated_delivery_days: string | null;
        delivery_charge: number;
        message: string;
      }>>('/customer/addresses/validate', {
        city,
        state,
        postal_code,
      });
      
      return response.data.data;
    } catch (error: any) {
      console.error('Failed to validate delivery area:', error);
      throw new Error(error.response?.data?.message || 'Failed to validate delivery area');
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate order summary (client-side calculation)
   */
  calculateOrderSummary(
    items: OrderItem[],
    shippingCharge: number = 60,
    couponDiscount: number = 0
  ): OrderSummary {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax_amount = 0; // VAT is already included in product prices
    const discount_amount = couponDiscount;
    const total_amount = subtotal + shippingCharge - discount_amount;

    return {
      subtotal,
      shipping_charge: shippingCharge,
      tax_amount,
      discount_amount,
      total_amount,
    };
  }

  /**
   * Validate coupon code (client-side - matches backend logic)
   */
  validateCoupon(couponCode: string, subtotal: number): {
    valid: boolean;
    discount: number;
    message: string;
  } {
    const coupons: Record<string, { type: 'percentage' | 'fixed'; value: number; min_amount: number }> = {
      'WELCOME10': { type: 'percentage', value: 10, min_amount: 1000 },
      'SAVE50': { type: 'fixed', value: 50, min_amount: 500 },
      'NEWUSER': { type: 'percentage', value: 15, min_amount: 2000 },
    };

    const coupon = coupons[couponCode.toUpperCase()];

    if (!coupon) {
      return {
        valid: false,
        discount: 0,
        message: 'Invalid coupon code',
      };
    }

    if (subtotal < coupon.min_amount) {
      return {
        valid: false,
        discount: 0,
        message: `Minimum order amount of ৳${coupon.min_amount} required`,
      };
    }

    const discount = coupon.type === 'percentage' 
      ? (subtotal * coupon.value) / 100 
      : coupon.value;

    return {
      valid: true,
      discount,
      message: `Coupon applied! You saved ৳${discount.toFixed(2)}`,
    };
  }

  /**
   * Calculate delivery charge based on city (matches backend logic)
   */
  calculateDeliveryCharge(city: string): number {
    const cityLower = city.toLowerCase();
    
    if (cityLower.includes('dhaka')) {
      return 60.00;
    } else if (['chittagong', 'sylhet', 'rajshahi', 'khulna', 'chattogram'].some(c => cityLower.includes(c))) {
      return 120.00;
    } else {
      return 150.00;
    }
  }

  /**
   * Format order status for display
   */
  formatOrderStatus(status: string): string {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Check if order can be cancelled (within 24 hours)
   */
  canCancelOrder(order: Order): boolean {
    const validStatuses = ['pending', 'processing', 'pending_assignment'];
    const orderDate = new Date(order.created_at);
    const hoursSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60);
    
    return validStatuses.includes(order.status) && hoursSinceOrder <= 24;
  }

  /**
   * Check if order can be returned (within 7 days of delivery)
   */
  canReturnOrder(order: Order): boolean {
    if (order.status !== 'delivered') return false;
    
    const deliveryDate = new Date(order.created_at);
    const daysSinceDelivery = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceDelivery <= 7;
  }

  /**
   * Format address for display
   */
  formatAddress(address: Address): string {
    const parts = [
      address.address_line_1,
      address.address_line_2,
      address.city,
      address.state,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }
}

const checkoutService = new CheckoutService();
export default checkoutService;