import axiosInstance from '@/lib/axios';
import { AxiosResponse } from 'axios';

// Types
export interface PurchaseOrderItem {
  id?: number;
  product_id: number;
  quantity_ordered: number;
  unit_cost: number;
  unit_sell_price?: number;
  tax_amount?: number;
  discount_amount?: number;
  notes?: string;
  product_name?: string;
  product_sku?: string;
  total_cost?: number;
  quantity_received?: number;
  product?: any;
  productBatch?: any;
}

export interface CreatePurchaseOrderData {
  vendor_id: number;
  store_id: number;
  expected_delivery_date?: string;
  tax_amount?: number;
  discount_amount?: number;
  shipping_cost?: number;
  notes?: string;
  terms_and_conditions?: string;
  items: PurchaseOrderItem[];
}

export interface UpdatePurchaseOrderData {
  vendor_id?: number;
  expected_delivery_date?: string;
  tax_amount?: number;
  discount_amount?: number;
  shipping_cost?: number;
  notes?: string;
  terms_and_conditions?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number;
  store_id: number;
  created_by: number;
  approved_by?: number;
  received_by?: number;
  order_date: string;
  expected_delivery_date?: string;
  status: 'draft' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_cost: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  notes?: string;
  terms_and_conditions?: string;
  approved_at?: string;
  received_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
  vendor?: any;
  store?: any;
  createdBy?: any;
  approvedBy?: any;
  receivedBy?: any;
  items?: PurchaseOrderItem[];
  payments?: any[];
}

export interface PurchaseOrderFilters {
  vendor_id?: number;
  store_id?: number;
  status?: string;
  payment_status?: string;
  search?: string;
  from_date?: string;
  to_date?: string;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface ReceiveItemData {
  item_id: number;
  quantity_received: number;
  batch_number?: string;
  manufactured_date?: string;
  expiry_date?: string;
}

export interface ReceivePurchaseOrderData {
  items: ReceiveItemData[];
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    current_page: number;
    data: T[];
    first_page_url: string;
    from: number;
    last_page: number;
    last_page_url: string;
    next_page_url: string | null;
    path: string;
    per_page: number;
    prev_page_url: string | null;
    to: number;
    total: number;
  };
}

export interface PurchaseOrderStatistics {
  total_purchase_orders: number;
  by_status: Array<{ status: string; count: number }>;
  by_payment_status: Array<{ payment_status: string; count: number }>;
  total_amount: number;
  total_paid: number;
  total_outstanding: number;
  overdue_orders: number;
  recent_orders: PurchaseOrder[];
}

class PurchaseOrderService {
  private readonly baseURL = '/purchase-orders';

  /**
   * Create a new purchase order
   */
  async create(data: CreatePurchaseOrderData): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.post(
      this.baseURL,
      data
    );
    return response.data;
  }

  /**
   * Get all purchase orders with filters and pagination
   */
  async getAll(filters?: PurchaseOrderFilters): Promise<PaginatedResponse<PurchaseOrder>> {
    // Clean up filters - remove empty values
    const cleanFilters: any = {};
    
    if (filters) {
      if (filters.vendor_id) cleanFilters.vendor_id = filters.vendor_id;
      if (filters.store_id) cleanFilters.store_id = filters.store_id;
      if (filters.status) cleanFilters.status = filters.status;
      if (filters.payment_status) cleanFilters.payment_status = filters.payment_status;
      if (filters.search) cleanFilters.search = filters.search;
      if (filters.from_date) cleanFilters.from_date = filters.from_date;
      if (filters.to_date) cleanFilters.to_date = filters.to_date;
      if (filters.sort_by) cleanFilters.sort_by = filters.sort_by;
      if (filters.sort_direction) cleanFilters.sort_direction = filters.sort_direction;
      if (filters.per_page) {
        // Different backends use different param names; send a few common ones.
        cleanFilters.per_page = filters.per_page;
        cleanFilters.perPage = filters.per_page;
        cleanFilters.limit = filters.per_page;
      }
      if (filters.page) cleanFilters.page = filters.page;
    }

    const response: AxiosResponse<any> = await axiosInstance.get(
      this.baseURL,
      { params: cleanFilters }
    );
    
    // Laravel returns: { success: true, data: { current_page, data: [...], ... } }
    return {
      success: response.data.success || true,
      data: response.data.data || { 
        data: [], 
        current_page: 1, 
        last_page: 1, 
        per_page: 15, 
        total: 0,
        from: 0,
        to: 0,
        first_page_url: '',
        last_page_url: '',
        next_page_url: null,
        prev_page_url: null,
        path: ''
      }
    };
  }

  /**
   * Get single purchase order by ID
   */
  async getById(id: number): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.get(
      `${this.baseURL}/${id}`
    );
    return response.data;
  }

  /**
   * Update purchase order (only draft status)
   */
  async update(id: number, data: UpdatePurchaseOrderData): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.put(
      `${this.baseURL}/${id}`,
      data
    );
    return response.data;
  }

  /**
   * Bulk update purchase order fields and items
   */
  async bulkUpdate(id: number, data: any): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.put(
      `${this.baseURL}/${id}/bulk-update`,
      data
    );
    return response.data;
  }

  /**
   * Add item to purchase order
   */
  async addItem(id: number, item: PurchaseOrderItem): Promise<ApiResponse<PurchaseOrderItem>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrderItem>> = await axiosInstance.post(
      `${this.baseURL}/${id}/items`,
      item
    );
    return response.data;
  }

  /**
   * Update item in purchase order
   */
  async updateItem(
    purchaseOrderId: number,
    itemId: number,
    data: Partial<PurchaseOrderItem>
  ): Promise<ApiResponse<PurchaseOrderItem>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrderItem>> = await axiosInstance.put(
      `${this.baseURL}/${purchaseOrderId}/items/${itemId}`,
      data
    );
    return response.data;
  }

  /**
   * Remove item from purchase order
   */
  async removeItem(purchaseOrderId: number, itemId: number): Promise<ApiResponse<void>> {
    const response: AxiosResponse<ApiResponse<void>> = await axiosInstance.delete(
      `${this.baseURL}/${purchaseOrderId}/items/${itemId}`
    );
    return response.data;
  }

  /**
   * Approve purchase order
   */
  async approve(id: number): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.post(
      `${this.baseURL}/${id}/approve`
    );
    return response.data;
  }

  /**
   * Receive purchase order (create product batches)
   */
  async receive(id: number, data: ReceivePurchaseOrderData): Promise<ApiResponse<PurchaseOrder>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrder>> = await axiosInstance.post(
      `${this.baseURL}/${id}/receive`,
      data
    );
    return response.data;
  }

  /**
   * Cancel purchase order
   */
  async cancel(id: number, reason?: string): Promise<ApiResponse<void>> {
    const response: AxiosResponse<ApiResponse<void>> = await axiosInstance.post(
      `${this.baseURL}/${id}/cancel`,
      { reason }
    );
    return response.data;
  }

  /**
   * Delete purchase order
   */
  async delete(id: number, password?: string): Promise<ApiResponse<void>> {
    const response: AxiosResponse<ApiResponse<void>> = await axiosInstance.delete(
      `${this.baseURL}/${id}`,
      { data: { password } }
    );
    return response.data;
  }

  /**
   * Get purchase order statistics
   */
  async getStatistics(filters?: {
    from_date?: string;
    to_date?: string;
  }): Promise<ApiResponse<PurchaseOrderStatistics>> {
    const response: AxiosResponse<ApiResponse<PurchaseOrderStatistics>> = await axiosInstance.get(
      `${this.baseURL}/stats`,
      { params: filters }
    );
    return response.data;
  }

  /**
   * Export purchase orders (optional - add if backend supports)
   */
  async export(filters?: PurchaseOrderFilters): Promise<Blob> {
    const response: AxiosResponse<Blob> = await axiosInstance.get(
      `${this.baseURL}/export`,
      {
        params: filters,
        responseType: 'blob',
      }
    );
    return response.data;
  }

  /**
   * Download purchase order PDF (optional - add if backend supports)
   */
  async downloadPDF(id: number): Promise<Blob> {
    const response: AxiosResponse<Blob> = await axiosInstance.get(
      `${this.baseURL}/${id}/pdf`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  }
}

// Export singleton instance
const purchaseOrderService = new PurchaseOrderService();
export default purchaseOrderService;