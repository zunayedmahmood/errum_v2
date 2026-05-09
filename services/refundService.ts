import axiosInstance from '@/lib/axios';

// Types
export interface Refund {
  id: number;
  refund_number: string;
  return_id: number;
  order_id: number;
  customer_id: number;
  refund_type: RefundType;
  refund_percentage?: number;
  original_amount: number;
  refund_amount: number;
  processing_fee: number;
  refund_method: RefundMethod;
  payment_reference?: string;
  refund_method_details?: Record<string, any>;
  status: RefundStatus;
  transaction_reference?: string;
  bank_reference?: string;
  gateway_reference?: string;
  store_credit_code?: string;
  store_credit_expires_at?: string;
  customer_notes?: string;
  internal_notes?: string;
  failure_reason?: string;
  cancel_reason?: string;
  processed_at?: string;
  processed_by?: number;
  approved_at?: string;
  approved_by?: number;
  completed_at?: string;
  failed_at?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;
  returnRequest?: any;
  order?: any;
  customer?: any;
  processedBy?: any;
  approvedBy?: any;
}

export type RefundType = 
  | 'full'
  | 'percentage'
  | 'partial_amount'
  | 'exchange_refund';

export type RefundMethod = 
  | 'cash'
  | 'bank_transfer'
  | 'card_refund'
  | 'mobile_banking'
  | 'store_credit'
  | 'gift_card'
  | 'digital_wallet'
  | 'original_payment_method'
  | 'check'
  | 'other';

export type RefundStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RefundFilters {
  status?: RefundStatus;
  refund_method?: RefundMethod;
  customer_id?: number;
  from_date?: string;
  to_date?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface CreateRefundRequest {
  return_id: number;
  order_id?: number;
  customer_id?: number;
  refund_type: RefundType;
  refund_percentage?: number;
  refund_amount?: number;
  refund_method: RefundMethod;
  payment_reference?: string;
  refund_method_details?: Record<string, any>;
  customer_notes?: string;
  internal_notes?: string;
  processing_fee?: number;
}

export interface CompleteRefundRequest {
  transaction_reference?: string;
  bank_reference?: string;
  gateway_reference?: string;
}

export interface FailRefundRequest {
  failure_reason: string;
}

export interface CancelRefundRequest {
  cancel_reason?: string;
}

export interface RefundStatistics {
  total_refunds: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total_refund_amount: number;
  total_processing_fees: number;
  by_method: Array<{
    refund_method: RefundMethod;
    count: number;
    total: number;
  }>;
}

export interface StatisticsFilters {
  from_date?: string;
  to_date?: string;
}

// Service Class
class RefundService {
  private basePath = '/refunds';

  /**
   * Get all refunds with filters and pagination
   */
  async getAll(filters?: RefundFilters) {
    const response = await axiosInstance.get(this.basePath, { params: filters });
    return response.data;
  }

  /**
   * Get a specific refund by ID
   */
  async getById(id: number) {
    const response = await axiosInstance.get(`${this.basePath}/${id}`);
    return response.data;
  }

  /**
   * Create a new refund from a product return
   */
  async create(data: CreateRefundRequest) {
    const response = await axiosInstance.post(this.basePath, data);
    return response.data;
  }

  /**
   * Process a refund (mark as processing)
   */
  async process(id: number) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/process`);
    return response.data;
  }

  /**
   * Complete a refund (money transferred)
   */
  async complete(id: number, data?: CompleteRefundRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/complete`, data || {});
    return response.data;
  }

  /**
   * Fail a refund (transaction failed)
   */
  async fail(id: number, data: FailRefundRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/fail`, data);
    return response.data;
  }

  /**
   * Cancel a refund
   */
  async cancel(id: number, data?: CancelRefundRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/cancel`, data || {});
    return response.data;
  }

  /**
   * Get refund statistics
   */
  async getStatistics(filters?: StatisticsFilters) {
    const response = await axiosInstance.get(`${this.basePath}/statistics`, {
      params: filters,
    });
    return response.data;
  }

  /**
   * Helper: Calculate refund amount based on type
   */
  calculateRefundAmount(
    refundType: RefundType,
    originalAmount: number,
    processingFee: number = 0,
    refundPercentage?: number,
    partialAmount?: number
  ): number {
    let amount = 0;

    switch (refundType) {
      case 'full':
        amount = originalAmount - processingFee;
        break;
      case 'percentage':
        if (refundPercentage === undefined) {
          throw new Error('Refund percentage is required for percentage refund type');
        }
        amount = (originalAmount * refundPercentage / 100) - processingFee;
        break;
      case 'partial_amount':
        if (partialAmount === undefined) {
          throw new Error('Partial amount is required for partial_amount refund type');
        }
        amount = partialAmount;
        break;
    }

    return Math.max(0, Number(amount.toFixed(2)));
  }

  /**
   * Helper: Calculate net refund (after processing fee)
   */
  calculateNetRefund(refundAmount: number, processingFee: number): number {
    return Math.max(0, refundAmount - processingFee);
  }

  /**
   * Helper: Calculate refund percentage from amounts
   */
  calculatePercentageFromAmount(refundAmount: number, originalAmount: number): number {
    if (originalAmount === 0) return 0;
    return Math.round((refundAmount / originalAmount) * 100 * 100) / 100;
  }

  /**
   * Helper: Get refund type label
   */
  getRefundTypeLabel(refundType: RefundType): string {
    const labels: Record<RefundType, string> = {
      full: 'Full Refund',
      percentage: 'Percentage Refund',
      partial_amount: 'Partial Refund',
    };
    return labels[refundType] || refundType;
  }

  /**
   * Helper: Get refund method label
   */
  getRefundMethodLabel(refundMethod: RefundMethod): string {
    const labels: Record<RefundMethod, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      card_refund: 'Card Refund',
      mobile_banking: 'Mobile Banking',
      store_credit: 'Store Credit',
      gift_card: 'Gift Card',
      digital_wallet: 'Digital Wallet',
      original_payment_method: 'Original Payment Method',
      check: 'Check',
      other: 'Other',
    };
    return labels[refundMethod] || refundMethod;
  }

  /**
   * Helper: Get status label
   */
  getStatusLabel(status: RefundStatus): string {
    const labels: Record<RefundStatus, string> = {
      pending: 'Pending',
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return labels[status] || status;
  }

  /**
   * Helper: Get status color for UI
   */
  getStatusColor(status: RefundStatus): string {
    const colors: Record<RefundStatus, string> = {
      pending: 'orange',
      processing: 'blue',
      completed: 'green',
      failed: 'red',
      cancelled: 'gray',
    };
    return colors[status] || 'gray';
  }

  /**
   * Helper: Check if refund can be processed
   */
  canProcess(status: RefundStatus): boolean {
    return status === 'pending';
  }

  /**
   * Helper: Check if refund can be completed
   */
  canComplete(status: RefundStatus): boolean {
    return status === 'processing';
  }

  /**
   * Helper: Check if refund can be failed
   */
  canFail(status: RefundStatus): boolean {
    return status === 'processing';
  }

  /**
   * Helper: Check if refund can be cancelled
   */
  canCancel(status: RefundStatus): boolean {
    return status === 'pending' || status === 'processing';
  }

  /**
   * Helper: Check if store credit is expiring soon (within 30 days)
   */
  isStoreCreditExpiringSoon(expiresAt?: string): boolean {
    if (!expiresAt) return false;
    const expiryDate = new Date(expiresAt);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  }

  /**
   * Helper: Check if store credit is expired
   */
  isStoreCreditExpired(expiresAt?: string): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  }

  /**
   * Helper: Format currency
   */
  formatCurrency(amount: number, currency: string = '৳'): string {
    return `${currency}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Helper: Validate refund amount
   */
  validateRefundAmount(
    refundAmount: number,
    originalAmount: number,
    alreadyRefunded: number = 0
  ): { valid: boolean; error?: string } {
    const remainingAmount = originalAmount - alreadyRefunded;

    if (refundAmount <= 0) {
      return { valid: false, error: 'Refund amount must be greater than 0' };
    }

    if (refundAmount > remainingAmount) {
      return {
        valid: false,
        error: `Refund amount (${this.formatCurrency(refundAmount)}) exceeds remaining amount (${this.formatCurrency(remainingAmount)})`,
      };
    }

    return { valid: true };
  }

  /**
   * Helper: Get refund method icon
   */
  getRefundMethodIcon(refundMethod: RefundMethod): string {
    const icons: Record<RefundMethod, string> = {
      cash: '💵',
      bank_transfer: '🏦',
      card_refund: '💳',
      mobile_banking: '📲',
      store_credit: '🎫',
      gift_card: '🎁',
      digital_wallet: '📱',
      original_payment_method: '↩️',
      check: '📝',
      other: '💰',
    };
    return icons[refundMethod] || '💰';
  }

  /**
   * Helper: Format refund details for display
   */
  formatRefundDetails(refund: Refund): string {
    const parts: string[] = [];

    parts.push(`Refund Number: ${refund.refund_number}`);
    parts.push(`Type: ${this.getRefundTypeLabel(refund.refund_type)}`);
    parts.push(`Amount: ${this.formatCurrency(refund.refund_amount)}`);
    parts.push(`Method: ${this.getRefundMethodLabel(refund.refund_method)}`);
    parts.push(`Status: ${this.getStatusLabel(refund.status)}`);

    if (refund.processing_fee > 0) {
      parts.push(`Processing Fee: ${this.formatCurrency(refund.processing_fee)}`);
    }

    if (refund.store_credit_code) {
      parts.push(`Store Credit Code: ${refund.store_credit_code}`);
    }

    return parts.join(' | ');
  }
}

// Export singleton instance
export const refundService = new RefundService();

// Export default
export default refundService;