// services/vendorPaymentService.ts
import axiosInstance from '@/lib/axios';

export interface VendorPayment {
  id: number;
  payment_number: string;
  reference_number?: string;
  vendor_id: number;
  payment_method_id: number;
  account_id?: number;
  employee_id: number;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  payment_type: 'purchase_order' | 'advance' | 'refund' | 'adjustment';
  transaction_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  bank_name?: string;
  payment_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorPaymentItem {
  id: number;
  vendor_payment_id: number;
  purchase_order_id: number;
  amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderWithPayment {
  id: number;
  po_number: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: 'unpaid' | 'partial' | 'partially_paid' | 'paid';
  status: string;
  created_at: string;
}

export interface OutstandingResponse {
  total_outstanding: number;
  advance_payments_available: number;
  net_outstanding: number;
  purchase_orders: PurchaseOrderWithPayment[];
}

export interface CreatePaymentRequest {
  vendor_id: number;
  payment_method_id: number;
  account_id?: number;
  amount: number;
  payment_date: string;
  payment_type: 'purchase_order' | 'advance' | 'refund' | 'adjustment';
  reference_number?: string;
  transaction_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  bank_name?: string;
  notes?: string;
  allocations?: {
    purchase_order_id: number;
    amount: number;
    notes?: string;
  }[];
}

export interface PaymentStatistics {
  total_payments: number;
  total_amount_paid: number;
  by_status: Array<{
    status: string;
    count: number;
    total: number;
  }>;
  by_payment_type: Array<{
    payment_type: string;
    count: number;
    total: number;
  }>;
  advance_payments: number;
  recent_payments: VendorPayment[];
}

export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  description: string;
  type: string;
  is_active: boolean;
  requires_reference?: boolean;
  supports_partial?: boolean;
  min_amount?: number;
  max_amount?: number;
  fixed_fee?: number;
  percentage_fee?: number;
  icon?: string;
  sort_order?: number;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export const vendorPaymentService = {
  /**
   * Get all payment methods
   */
  async getAllPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        payment_methods: PaymentMethod[];
        total_count: number;
        note: string;
      }>>('/payment-methods/all');
      return response.data.data.payment_methods;
    } catch (error: any) {
      console.error('Get payment methods error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment methods');
    }
  },

  /**
   * Create a new vendor payment
   * Supports partial payments
   */
  async create(data: CreatePaymentRequest): Promise<VendorPayment> {
    try {
      const response = await axiosInstance.post<ApiResponse<VendorPayment>>(
        '/vendor-payments',
        data
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Create vendor payment error:', error);
      const message = error.response?.data?.message || 'Failed to create payment';
      const errors = error.response?.data?.errors;
      if (errors) {
        const errorMessages = Object.values(errors).flat().join(', ');
        throw new Error(errorMessages);
      }
      throw new Error(message);
    }
  },

  /**
   * Get all vendor payments with filters
   */
  async getAll(params?: {
    vendor_id?: number;
    status?: string;
    payment_type?: string;
    search?: string;
    from_date?: string;
    to_date?: string;
    sort_by?: string;
    sort_direction?: 'asc' | 'desc';
    per_page?: number;
  }): Promise<PaginatedResponse<VendorPayment>> {
    try {
      const response = await axiosInstance.get<ApiResponse<PaginatedResponse<VendorPayment>>>(
        '/vendor-payments',
        { params }
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Get vendor payments error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payments');
    }
  },

  /**
   * Get single vendor payment with details
   */
  async getById(id: number): Promise<VendorPayment> {
    try {
      const response = await axiosInstance.get<ApiResponse<VendorPayment>>(
        `/vendor-payments/${id}`
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Get vendor payment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment');
    }
  },

  /**
   * Get payments for a specific purchase order
   */
  async getByPurchaseOrder(purchaseOrderId: number): Promise<{
    purchase_order: PurchaseOrderWithPayment;
    payments: VendorPayment[];
  }> {
    try {
      const response = await axiosInstance.get<ApiResponse<{
        purchase_order: PurchaseOrderWithPayment;
        payments: VendorPayment[];
      }>>(`/vendor-payments/purchase-order/${purchaseOrderId}`);
      return response.data.data;
    } catch (error: any) {
      console.error('Get payments by purchase order error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch purchase order payments');
    }
  },

  /**
   * Get outstanding payments for a vendor
   */
  async getOutstanding(vendorId: number): Promise<OutstandingResponse> {
    try {
      const response = await axiosInstance.get<ApiResponse<OutstandingResponse>>(
        `/vendor-payments/outstanding/${vendorId}`
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Get outstanding payments error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch outstanding payments');
    }
  },

  /**
   * Allocate advance payment to purchase orders
   */
  async allocateAdvance(
    paymentId: number,
    allocations: {
      purchase_order_id: number;
      amount: number;
      notes?: string;
    }[]
  ): Promise<VendorPayment> {
    try {
      const response = await axiosInstance.post<ApiResponse<VendorPayment>>(
        `/vendor-payments/${paymentId}/allocate-advance`,
        { allocations }
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Allocate advance payment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to allocate advance payment');
    }
  },

  /**
   * Cancel a vendor payment
   */
  async cancel(id: number): Promise<VendorPayment> {
    try {
      const response = await axiosInstance.post<ApiResponse<VendorPayment>>(
        `/vendor-payments/${id}/cancel`
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Cancel vendor payment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel payment');
    }
  },

  /**
   * Refund a vendor payment
   */
  async refund(id: number): Promise<VendorPayment> {
    try {
      const response = await axiosInstance.post<ApiResponse<VendorPayment>>(
        `/vendor-payments/${id}/refund`
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Refund vendor payment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to refund payment');
    }
  },

  /**
   * Get vendor payment statistics
   */
  async getStatistics(params?: {
    from_date?: string;
    to_date?: string;
    vendor_id?: number;
  }): Promise<PaymentStatistics> {
    try {
      const response = await axiosInstance.get<ApiResponse<PaymentStatistics>>(
        '/vendor-payments/statistics',
        { params }
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Get payment statistics error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment statistics');
    }
  },

  /**
   * Get advance payments (unallocated)
   */
  async getAdvancePayments(vendorId?: number): Promise<VendorPayment[]> {
    try {
      const response = await axiosInstance.get<ApiResponse<VendorPayment[]>>(
        '/vendor-payments/advance',
        { params: { vendor_id: vendorId } }
      );
      return response.data.data;
    } catch (error: any) {
      console.error('Get advance payments error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch advance payments');
    }
  },

  /**
   * Export vendor payments to CSV/Excel
   */
  async export(params?: {
    vendor_id?: number;
    from_date?: string;
    to_date?: string;
    status?: string;
    format?: 'csv' | 'xlsx';
  }): Promise<Blob> {
    try {
      const response = await axiosInstance.get('/vendor-payments/export', {
        params,
        responseType: 'blob'
      });
      return response.data;
    } catch (error: any) {
      console.error('Export vendor payments error:', error);
      throw new Error(error.response?.data?.message || 'Failed to export payments');
    }
  },

  /**
   * Get payment receipt/invoice
   */
  async getReceipt(id: number): Promise<Blob> {
    try {
      const response = await axiosInstance.get(`/vendor-payments/${id}/receipt`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error: any) {
      console.error('Get payment receipt error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch receipt');
    }
  },
};