import axiosInstance from '@/lib/axios';

// Types
export interface ProductReturn {
  id: number;
  return_number: string;
  order_id: number;
  customer_id: number;
  store_id: number;
  received_at_store_id?: number;
  return_reason: 'defective_product' | 'wrong_item' | 'not_as_described' | 'customer_dissatisfaction' | 'size_issue' | 'color_issue' | 'quality_issue' | 'late_delivery' | 'changed_mind' | 'duplicate_order' | 'other';
  return_type?: 'customer_return' | 'store_return' | 'warehouse_return';
  status: ReturnStatus;
  return_date: string;
  total_return_value: number;
  total_refund_amount: number;
  processing_fee: number;
  customer_notes?: string;
  internal_notes?: string;
  quality_check_passed?: boolean;
  quality_check_notes?: string;
  rejection_reason?: string;
  return_items: ReturnItem[];
  attachments?: string[];
  received_date?: string;
  approved_date?: string;
  rejected_date?: string;
  processed_date?: string;
  completed_date?: string;
  refunded_date?: string;
  processed_by?: number;
  approved_by?: number;
  rejected_by?: number;
  created_at: string;
  updated_at: string;
  order?: any;
  customer?: any;
  store?: any;
  processedBy?: any;
  approvedBy?: any;
  rejectedBy?: any;
  refunds?: any[];
}

export type ReturnStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'processed'
  | 'completed'
  | 'refunded';

export interface ReturnItem {
  order_item_id: number;
  product_id: number;
  product_batch_id?: number;
  product_barcode_id?: number; // NEW: Added barcode ID support
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string;
}

export interface ProductReturnFilters {
  status?: ReturnStatus;
  store_id?: number;
  customer_id?: number;
  from_date?: string;
  to_date?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
  skipStoreScope?: boolean;
}

export interface CreateReturnRequest {
  order_id: number;
  received_at_store_id?: number; // ✅ ADDED: Store where return is received
  return_reason: 'defective_product' | 'wrong_item' | 'not_as_described' | 'customer_dissatisfaction' | 'size_issue' | 'color_issue' | 'quality_issue' | 'late_delivery' | 'changed_mind' | 'duplicate_order' | 'other';
  return_type?: 'customer_return' | 'store_return' | 'warehouse_return';
  items: Array<{
    order_item_id: number;
    quantity: number;
    product_barcode_id?: number; // Support barcode ID in return items
    barcode_id?: number;
    barcode?: string;
    unit_price?: number;
    total_price?: number;
    reason?: string;
  }>;
  customer_notes?: string;
  attachments?: string[];
}

export interface UpdateReturnRequest {
  quality_check_passed?: boolean;
  quality_check_notes?: string;
  internal_notes?: string;
  processing_fee?: number;
  total_refund_amount?: number;
}

export interface ApproveReturnRequest {
  total_refund_amount?: number;
  processing_fee?: number;
  internal_notes?: string;
}

export interface RejectReturnRequest {
  rejection_reason: string;
}

export interface ProcessReturnRequest {
  restore_inventory?: boolean;
}

export interface ReturnStatistics {
  total_returns: number;
  pending: number;
  approved: number;
  rejected: number;
  processing?: number;
  processed?: number;
  completed: number;
  refunded: number;
  total_return_value: number;
  total_refund_amount: number;
  total_processing_fees: number;
  by_reason: Array<{
    return_reason: string;
    count: number;
  }>;
}

export interface StatisticsFilters {
  from_date?: string;
  to_date?: string;
  store_id?: number;
  skipStoreScope?: boolean;
}

// Service Class
class ProductReturnService {
  private basePath = '/returns';

  /**
   * Get all product returns with filters and pagination
   */
  async getAll(filters?: ProductReturnFilters) {
    const { skipStoreScope, ...params } = filters || {};
    const response = await axiosInstance.get(this.basePath, { 
      params,
      skipStoreScope
    } as any);
    return response.data;
  }

  /**
   * Get a specific product return by ID
   */
  async getById(id: number) {
    const response = await axiosInstance.get(`${this.basePath}/${id}`);
    return response.data;
  }

  /**
   * Quick-complete a return (Atomic: create + QC + approve + process + complete)
   */
  async quickComplete(data: CreateReturnRequest) {
    const response = await axiosInstance.post(`${this.basePath}/quick-complete`, data);
    return response.data;
  }

  /**
   * Create a new product return
   * NOW SUPPORTS: Barcode tracking for individual unit returns
   */
  async create(data: CreateReturnRequest) {
    // Log barcode information for debugging
    console.log('📤 ProductReturnService.create() called with:', {
      order_id: data.order_id,
      return_reason: data.return_reason,
      return_type: data.return_type,
      items: data.items.map(item => ({
        order_item_id: item.order_item_id,
        quantity: item.quantity,
        product_barcode_id: item.product_barcode_id,
        has_barcode: !!item.product_barcode_id,
      })),
    });

    const response = await axiosInstance.post(this.basePath, data);
    
    console.log('✅ Return created successfully:', {
      return_id: response.data?.data?.id,
      return_number: response.data?.data?.return_number,
    });
    
    return response.data;
  }

  /**
   * Update return (for receiving and quality check)
   */
  async update(id: number, data: UpdateReturnRequest) {
    console.log(`⏳ Updating return ${id}:`, data);
    const response = await axiosInstance.patch(`${this.basePath}/${id}`, data);
    console.log(`✅ Return ${id} updated successfully`);
    return response.data;
  }

  /**
   * Approve a return
   */
  async approve(id: number, data?: ApproveReturnRequest) {
    console.log(`✅ Approving return ${id}:`, data);
    const response = await axiosInstance.post(`${this.basePath}/${id}/approve`, data || {});
    console.log(`✅ Return ${id} approved successfully`);
    return response.data;
  }

  /**
   * Reject a return
   */
  async reject(id: number, data: RejectReturnRequest) {
    console.log(`❌ Rejecting return ${id}:`, data);
    const response = await axiosInstance.post(`${this.basePath}/${id}/reject`, data);
    console.log(`✅ Return ${id} rejected successfully`);
    return response.data;
  }

  /**
   * Process a return (restore inventory)
   * IMPORTANT: This will restore inventory based on barcode tracking
   * - If barcode_id exists: Reactivates the specific barcode
   * - If no barcode_id: Just increases batch quantity
   */
  async process(id: number, data?: ProcessReturnRequest) {
    console.log(`⚙️ Processing return ${id}:`, data);
    const response = await axiosInstance.post(`${this.basePath}/${id}/process`, data || {});
    console.log(`✅ Return ${id} processed successfully (inventory restored)`);
    return response.data;
  }

  /**
   * Complete a return (final step before refund)
   */
  async complete(id: number) {
    console.log(`🏁 Completing return ${id}`);
    const response = await axiosInstance.post(`${this.basePath}/${id}/complete`);
    console.log(`✅ Return ${id} completed successfully`);
    return response.data;
  }

  /**
   * Get return statistics
   */
  async getStatistics(filters?: StatisticsFilters) {
    const { skipStoreScope, ...params } = filters || {};
    const response = await axiosInstance.get(`${this.basePath}/statistics`, {
      params,
      skipStoreScope
    } as any);
    return response.data;
  }

  /**
   * Helper: Calculate total refund after processing fee
   */
  calculateNetRefund(totalRefundAmount: number, processingFee: number): number {
    return Math.max(0, totalRefundAmount - processingFee);
  }

  /**
   * Helper: Calculate refund percentage
   */
  calculateRefundPercentage(refundAmount: number, originalValue: number): number {
    if (originalValue === 0) return 0;
    return Math.round((refundAmount / originalValue) * 100);
  }

  /**
   * Helper: Format return number for display
   */
  formatReturnNumber(returnNumber: string): string {
    return returnNumber;
  }

  /**
   * Helper: Get return reason label
   */
  getReturnReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      defective_product: 'Defective Product',
      wrong_item: 'Wrong Item',
      not_as_described: 'Not As Described',
      customer_dissatisfaction: 'Customer Dissatisfaction',
      size_issue: 'Size Issue',
      color_issue: 'Color Issue',
      quality_issue: 'Quality Issue',
      late_delivery: 'Late Delivery',
      changed_mind: 'Changed Mind',
      duplicate_order: 'Duplicate Order',
      other: 'Other',
    };
    return labels[reason] || reason;
  }

  /**
   * Helper: Get return type label
   */
  getReturnTypeLabel(returnType?: string): string {
    if (!returnType) return 'N/A';
    const labels: Record<string, string> = {
      customer_return: 'Customer Return',
      store_return: 'Store Return',
      warehouse_return: 'Warehouse Return',
    };
    return labels[returnType] || returnType;
  }

  /**
   * Helper: Get status label
   */
  getStatusLabel(status: ReturnStatus): string {
    const labels: Record<ReturnStatus, string> = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      processing: 'Processing',
      processed: 'Processed',
      completed: 'Completed',
      refunded: 'Refunded',
    };
    return labels[status] || status;
  }

  /**
   * Helper: Get status color for UI
   */
  getStatusColor(status: ReturnStatus): string {
    const colors: Record<ReturnStatus, string> = {
      pending: 'orange',
      approved: 'blue',
      rejected: 'red',
      processing: 'purple',
      processed: 'purple',
      completed: 'green',
      refunded: 'green',
    };
    return colors[status] || 'gray';
  }

  /**
   * Helper: Check if return can be edited
   */
  canEdit(status: ReturnStatus): boolean {
    return status === 'pending' || status === 'approved';
  }

  /**
   * Helper: Check if return can be approved
   */
  canApprove(status: ReturnStatus, qualityCheckPassed?: boolean): boolean {
    return status === 'pending' && qualityCheckPassed === true;
  }

  /**
   * Helper: Check if return can be rejected
   */
  canReject(status: ReturnStatus): boolean {
    return status === 'pending' || status === 'approved';
  }

  /**
   * Helper: Check if return can be processed
   */
  canProcess(status: ReturnStatus): boolean {
    return status === 'approved';
  }

  /**
   * Helper: Check if return can be completed
   */
  canComplete(status: ReturnStatus): boolean {
    return status === 'processing' || status === 'processed';
  }
}

// Export singleton instance
export const productReturnService = new ProductReturnService();

// Export default
export default productReturnService;