import axiosInstance from '@/lib/axios';

export interface CreateOrderPayload {
  order_type: 'counter' | 'social_commerce' | 'ecommerce';
  customer_id?: number;
  customer?: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  store_id: number;
  salesman_id?: number;
  items: Array<{
    product_id: number;
    batch_id: number;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_amount?: number;
    // Only for counter orders - barcodes scanned at POS
    barcode?: string;
    // Temporary resale flow for products moved to Extra Panel as defective/used.
    is_defective?: boolean;
    defective_product_id?: string | number;
    source?: string;
  }>;
  discount_amount?: number;
  shipping_amount?: number;
  notes?: string;
  shipping_address?: any;
  payment?: {
    payment_method_id: number;
    amount: number;
    payment_type?: 'full' | 'partial' | 'installment' | 'advance';
  };
  installment_plan?: {
    total_installments: number;
    installment_amount: number;
    start_date?: string;
  };
}

export interface FulfillmentPayload {
  fulfillments: Array<{
    order_item_id: number;
    barcodes: string[];
  }>;
}

export interface OrderItem {
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
}

export interface OrderPayment {
  id: number;
  amount: string;
  payment_method: string;
  payment_type: string;
  status: string;
  processed_by?: string;
  created_at: string;
}

export interface Order {
  id: number;
  order_number: string;
  order_type: string;
  order_type_label: string;
  status: string;
  payment_status: string;
  // Intended courier marker (nullable)
  intended_courier?: string | null;
  is_preorder?: boolean;
  fulfillment_status?: string | null;
  customer: {
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
  fulfilled_by?: {
    id: number;
    name: string;
  };
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  shipping_amount: string;
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
  is_installment: boolean;

  // Installment / EMI details (present for installment orders)
  // Backend may return either installment_info (computed) or installment_plan (original plan)
  installment_info?: {
    total_installments?: number;
    paid_installments?: number;
    installment_amount?: string | number;
    next_payment_due?: string | null;
    start_date?: string | null;
  } | null;
  installment_plan?: {
    total_installments?: number;
    installment_amount?: string | number;
    start_date?: string | null;
  } | null;

  order_date: string;
  created_at: string;
  fulfilled_at?: string;
  confirmed_at?: string;
  items?: OrderItem[];
  payments?: OrderPayment[];
  notes?: string;
  shipping_address?: any;
}

export interface AvailableCourier {
  courier_name: string;
  order_count: number;
}

export interface OrderFilters {
  order_type?: string;
  order_types?: string[];
  order_source?: string;
  source_tag?: string;
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  store_id?: number;
  customer_id?: number;
  created_by?: number;
  exact_date?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  overdue?: boolean;
  installment_only?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
  skipStoreScope?: boolean;
}

export interface OrderStatistics {
  total_orders: number;
  by_type: {
    counter: number;
    social_commerce: number;
    ecommerce: number;
  };
  by_status: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  };
  by_payment_status: {
    pending: number;
    partially_paid: number;
    paid: number;
    overdue: number;
  };
  by_fulfillment_status?: {
    pending_fulfillment: number;
    fulfilled: number;
  };
  total_revenue: string;
  total_outstanding: string;
  installment_orders: number;
}

const orderService = {
  /** Create new order */
  async create(payload: CreateOrderPayload): Promise<Order> {
    try {
      const response = await axiosInstance.post('/orders', payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create order');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Create order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create order');
    }
  },

  /** Get all orders with filters and pagination */
  async getAll(paramsObj?: OrderFilters): Promise<{
    data: Order[];
    total: number;
    current_page: number;
    last_page: number;
  }> {
    try {
      const { skipStoreScope, ...params } = paramsObj || {};
      const response = await axiosInstance.get('/orders', { 
        params,
        skipStoreScope 
      } as any);
      const result = response.data;

      if (result.success) {
        return {
          data: result.data.data || [],
          total: result.data.total || 0,
          current_page: result.data.current_page || 1,
          last_page: result.data.last_page || 1,
        };
      }

      return { data: [], total: 0, current_page: 1, last_page: 1 };
    } catch (error: any) {
      console.error('Get orders error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch orders');
    }
  },

  /** Get single order by ID */
  async getById(id: number, skipStoreScope?: boolean): Promise<Order> {
    try {
      const response = await axiosInstance.get(`/orders/${id}`, { 
        skipStoreScope 
      } as any);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch order');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch order');
    }
  },

  /** 
   * Fulfill order by scanning barcodes (warehouse operation)
   * This is for social_commerce and ecommerce orders only
   */
  async fulfill(orderId: number, payload: FulfillmentPayload): Promise<{
    order_number: string;
    fulfillment_status: string;
    fulfilled_at: string;
    fulfilled_by: string;
    fulfilled_items: Array<{
      item_id: number;
      product_name: string;
      original_quantity?: number;
      barcodes: string[];
    }>;
    next_step: string;
  }> {
    try {
      const response = await axiosInstance.patch(`/orders/${orderId}/fulfill`, payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fulfill order');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Fulfill order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fulfill order');
    }
  },

  /** Complete order and reduce inventory */
  async complete(orderId: number): Promise<Order> {
    try {
      const response = await axiosInstance.patch(`/orders/${orderId}/complete`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to complete order');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Complete order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to complete order');
    }
  },

  /** Cancel order */
  async cancel(orderId: number, reason?: string): Promise<Order> {
    try {
      const response = await axiosInstance.patch(`/orders/${orderId}/cancel`, { reason });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to cancel order');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Cancel order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel order');
    }
  },

  /** Add item to order using barcode (for counter orders at POS) */
  async addItem(
    orderId: number,
    payload: {
      barcode?: string;
      barcodes?: string[];
      unit_price?: number;
      discount_amount?: number;
      tax_amount?: number;
    }
  ): Promise<{
    item: {
      id: number;
      product_name: string;
      quantity: number;
      unit_price: string;
      total: string;
    };
    order_totals: {
      subtotal: string;
      total_amount: string;
      outstanding_amount: string;
    };
  }> {
    try {
      const response = await axiosInstance.post(`/orders/${orderId}/items`, payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to add item');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Add item to order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to add item');
    }
  },

  /** Update order item */
  async updateItem(
    orderId: number,
    itemId: number,
    payload: {
      quantity?: number;
      unit_price?: number;
      discount_amount?: number;
    }
  ): Promise<{
    item: {
      id: number;
      quantity: number;
      unit_price: string;
      total: string;
    };
    order_totals: {
      total_amount: string;
    };
  }> {
    try {
      const response = await axiosInstance.put(`/orders/${orderId}/items/${itemId}`, payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to update item');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Update order item error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update item');
    }
  },

  /** Remove item from order */
  async removeItem(orderId: number, itemId: number): Promise<{
    order_totals: {
      total_amount: string;
      outstanding_amount: string;
    };
  }> {
    try {
      const response = await axiosInstance.delete(`/orders/${orderId}/items/${itemId}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to remove item');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Remove order item error:', error);
      throw new Error(error.response?.data?.message || 'Failed to remove item');
    }
  },

  /** Get order statistics */
  async getStatistics(params?: {
    date_from?: string;
    date_to?: string;
    store_id?: number;
    created_by?: number;
  }): Promise<OrderStatistics> {
    try {
      const response = await axiosInstance.get('/orders/statistics', { params });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch statistics');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get statistics error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch statistics');
    }
  },

  /** Get orders pending fulfillment (for warehouse) */
  async getPendingFulfillment(params?: {
    store_id?: number;
    per_page?: number;
    order_type?: 'social_commerce' | 'ecommerce';
    order_types?: string[];
  }): Promise<{
    data: Order[];
    total: number;
  }> {
    try {
      const response = await axiosInstance.get('/orders', {
        params: {
          ...params,
          fulfillment_status: 'pending_fulfillment',
        }
      });
      const result = response.data;

      if (result.success) {
        return {
          data: result.data.data || [],
          total: result.data.total || 0
        };
      }

      return { data: [], total: 0 };
    } catch (error: any) {
      console.error('Get pending fulfillment orders error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch orders');
    }
  },

  /**
   * Set / update intended courier marker for an order
   * PATCH /api/orders/{id}/set-courier
   */
  async setIntendedCourier(orderId: number, intended_courier: string | null): Promise<{
    order_id: number;
    order_number: string;
    intended_courier: string | null;
    status?: string;
    updated_at?: string;
  }> {
    try {
      const response = await axiosInstance.patch(`/orders/${orderId}/set-courier`, {
        intended_courier,
      });
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to set courier');
      }

      return result.data;
    } catch (error: any) {
      console.error('Set intended courier error:', error);
      throw new Error(error.response?.data?.message || 'Failed to set courier');
    }
  },

  /**
   * Lookup courier marker for a single order
   * GET /api/orders/lookup-courier/{orderId}
   */
  async lookupOrderCourier(orderId: number): Promise<{
    order_id: number;
    order_number: string;
    intended_courier: string | null;
    status?: string;
    customer_name?: string;
    customer_phone?: string;
    store_name?: string;
    total_amount?: string;
    order_date?: string;
  }> {
    try {
      const response = await axiosInstance.get(`/orders/lookup-courier/${orderId}`);
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to lookup courier');
      }

      return result.data;
    } catch (error: any) {
      console.error('Lookup order courier error:', error);
      throw new Error(error.response?.data?.message || 'Failed to lookup courier');
    }
  },

  /**
   * Bulk lookup courier markers for multiple orders (max 100)
   * POST /api/orders/bulk-lookup-courier
   */
  async bulkLookupCouriers(order_ids: number[]): Promise<{
    total_found: number;
    total_requested: number;
    orders: Array<{
      order_id: number;
      order_number?: string;
      intended_courier: string | null;
      status?: string;
      customer_name?: string;
      customer_phone?: string;
      store_name?: string;
      total_amount?: string;
    }>;
  }> {
    try {
      const ids = (Array.isArray(order_ids) ? order_ids : [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);

      if (ids.length === 0) {
        return { total_found: 0, total_requested: 0, orders: [] };
      }

      const limited = ids.slice(0, 100);
      const response = await axiosInstance.post('/orders/bulk-lookup-courier', {
        order_ids: limited,
      });
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to bulk lookup couriers');
      }

      const data = result.data || {};
      return {
        total_found: Number(data.total_found || 0),
        total_requested: Number(data.total_requested || limited.length),
        orders: Array.isArray(data.orders) ? data.orders : [],
      };
    } catch (error: any) {
      console.error('Bulk lookup couriers error:', error);
      throw new Error(error.response?.data?.message || 'Failed to bulk lookup couriers');
    }
  },

  /**
   * Get list of available couriers with order counts
   * GET /api/orders/available-couriers
   */
  async getAvailableCouriers(): Promise<AvailableCourier[]> {
    try {
      const response = await axiosInstance.get('/orders/available-couriers');
      const result = response.data;

      if (!result.success) {
        return [];
      }

      return Array.isArray(result.data) ? result.data : [];
    } catch (error: any) {
      console.error('Get available couriers error:', error);
      return [];
    }
  },

  /** Validate barcode for fulfillment */
  async validateBarcode(params: {
    barcode: string;
    product_id: number;
    batch_id: number;
    store_id: number;
  }): Promise<{
    valid: boolean;
    barcode_id?: number;
    message?: string;
  }> {
    try {
      const response = await axiosInstance.post('/orders/validate-barcode', params);
      const result = response.data;
      
      return {
        valid: result.success,
        barcode_id: result.data?.barcode_id,
        message: result.message
      };
    } catch (error: any) {
      console.error('Validate barcode error:', error);
      return {
        valid: false,
        message: error.response?.data?.message || 'Invalid barcode'
      };
    }
  },

  /** Bulk export orders as CSV */
  async bulkExport(order_ids: number[]): Promise<Blob> {
    try {
      const response = await axiosInstance.post('/orders/bulk-export', { order_ids }, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error: any) {
      console.error('Bulk export error:', error);
      throw new Error(error.response?.data?.message || 'Failed to export orders');
    }
  }
};

export default orderService;