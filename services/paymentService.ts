import axiosInstance from '@/lib/axios';


export interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  type: string;
  supports_partial: boolean;
  requires_reference: boolean;
  min_amount: number | null;
  max_amount: number | null;
  fixed_fee: number;
  percentage_fee: number;
}

export interface CashDenomination {
  denomination: number;
  quantity: number;
  type: 'note' | 'coin';
}

export interface PaymentData {
  [key: string]: any;
}

// Single payment request
export interface SimplePaymentRequest {
  payment_method_id: number;
  amount: number;
  payment_type: 'full' | 'partial' | 'advance' | 'installment' | 'final';
  transaction_reference?: string;
  external_reference?: string;
  auto_complete?: boolean;
  notes?: string;
  payment_data?: PaymentData;
  payment_date?: string;
  payment_received_date?: string;
  cash_received?: CashDenomination[];
  cash_change?: CashDenomination[];
}

// Split payment request
export interface PaymentSplit {
  payment_method_id: number;
  amount: number;
  transaction_reference?: string;
  external_reference?: string;
  notes?: string;
  payment_data?: PaymentData;
  payment_date?: string;
  payment_received_date?: string;
  cash_received?: CashDenomination[];
  cash_change?: CashDenomination[];
}

export interface SplitPaymentRequest {
  total_amount: number;
  payment_type: 'full' | 'partial' | 'advance' | 'installment' | 'final';
  auto_complete?: boolean;
  notes?: string;
  payment_date?: string;
  payment_received_date?: string;
  splits: PaymentSplit[];
}

// Installment plan setup request
export interface InstallmentPlanRequest {
  total_installments: number;
  installment_amount: number;
  start_date?: string | null;
  notes?: string;
}

// Installment payment request (pay one installment)
export interface InstallmentPaymentRequest {
  payment_method_id: number;
  amount: number;
  transaction_reference?: string;
  external_reference?: string;
  auto_complete?: boolean;
  notes?: string;
  payment_data?: PaymentData;
  payment_date?: string;
  payment_received_date?: string;
}


export interface Payment {
  id: number;
  order_id: number;
  payment_method_id: number | null;  
  amount: number;
  fee_amount: number;
  net_amount: number;
  payment_type: string;
  status: string;
  transaction_reference?: string;
  external_reference?: string;
  order_balance_before: number;
  order_balance_after: number;
  payment_method: { 
    id: number;
    name: string;
    type: string;
  } | null;  
  payment_splits?: any[];
}

export interface PaymentMethodsResponse {
  success: boolean;
  data: {
    customer_type: string;
    payment_methods: PaymentMethod[];
    note: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  message: string;
  data: Payment;
}

// ===========================
// PAYMENT SERVICE
// ===========================

class PaymentService {
  /**
   * ✅ Get Available Payment Methods
   * 
   * Endpoint: GET /api/payment-methods?customer_type={type}
   * 
   * @param customerType - 'counter', 'social_commerce', or 'ecommerce'
   * @returns Array of available payment methods
   */
  async getMethods(customerType: 'counter' | 'social_commerce' | 'ecommerce' = 'counter'): Promise<PaymentMethod[]> {
    try {
      console.log('🔍 Fetching payment methods for:', customerType);
      
      // ✅ CORRECT ENDPOINT - Public API, no auth required
      const response = await axiosInstance.get<PaymentMethodsResponse>('/payment-methods', {
        params: { customer_type: customerType },
      });
      
      console.log('✅ Payment methods API response:', response.data);
      
      if (!response.data.success || !response.data.data?.payment_methods) {
        console.error('❌ Invalid payment methods response format:', response.data);
        throw new Error('Invalid payment methods response');
      }
      
      const methods = response.data.data.payment_methods;
      
      console.log('✅ Payment methods loaded:');
      methods.forEach(m => {
        console.log(`  - ${m.name} (ID: ${m.id}, Code: ${m.code}, Type: ${m.type})`);
      });
      
      if (methods.length === 0) {
        console.warn('⚠️ No payment methods available for customer type:', customerType);
      }
      
      return methods;
      
    } catch (error: any) {
      console.error('❌ Failed to fetch payment methods:', error);
      
      if (error.response) {
        console.error('❌ Response status:', error.response.status);
        console.error('❌ Response data:', error.response.data);
      }
      
      throw new Error(
        error.response?.data?.message || 
        error.message || 
        'Failed to fetch payment methods'
      );
    }
  }

  /**
   * ✅ Process Single Payment Method
   * 
   * Endpoint: POST /api/orders/{order}/payments/simple
   * 
   * @param orderId - Order ID
   * @param paymentData - Payment details
   * @returns Payment object
   */
  async processSimple(orderId: number, paymentData: SimplePaymentRequest): Promise<Payment> {
    try {
      console.log('💳 Processing single payment for order:', orderId);
      console.log('💳 Payment data:', JSON.stringify(paymentData, null, 2));
      
      // Validate payment method ID
      if (!paymentData.payment_method_id || paymentData.payment_method_id <= 0) {
        throw new Error('Invalid payment method ID');
      }
      
      // Validate amount
      if (!paymentData.amount || paymentData.amount <= 0) {
        throw new Error('Invalid payment amount');
      }
      
      const response = await axiosInstance.post<PaymentResponse>(
        `/orders/${orderId}/payments/simple`,
        paymentData
      );
      
      console.log('✅ Payment processed:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Payment processing failed');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Payment processing failed:', error);
      console.error('❌ Error response:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || error.message || 'Failed to process payment';
      throw new Error(errorMessage);
    }
  }

  /**
   * ✅ Process Split Payment (Multiple Methods)
   * 
   * Endpoint: POST /api/orders/{order}/payments/split
   * 
   * @param orderId - Order ID
   * @param paymentData - Split payment details
   * @returns Payment object with splits
   */
  async processSplit(orderId: number, paymentData: SplitPaymentRequest): Promise<Payment> {
    try {
      console.log('💳💳 Processing split payment for order:', orderId);
      console.log('💳💳 Split data:', JSON.stringify(paymentData, null, 2));
      
      // Validate total amount
      if (!paymentData.total_amount || paymentData.total_amount <= 0) {
        throw new Error('Invalid total payment amount');
      }
      
      // Validate splits exist
      if (!paymentData.splits || paymentData.splits.length < 2) {
        throw new Error('Split payment requires at least 2 payment methods');
      }
      
      // Validate each split
      for (let i = 0; i < paymentData.splits.length; i++) {
        const split = paymentData.splits[i];
        
        if (!split.payment_method_id || split.payment_method_id <= 0) {
          throw new Error(`Split ${i + 1}: Invalid payment method ID`);
        }
        
        if (!split.amount || split.amount <= 0) {
          throw new Error(`Split ${i + 1}: Invalid amount`);
        }
      }
      
      // Validate total matches sum of splits (with tolerance)
      const splitsTotal = paymentData.splits.reduce((sum, split) => sum + split.amount, 0);
      const difference = Math.abs(splitsTotal - paymentData.total_amount);
      
      if (difference > 0.10) { // 10 cent tolerance
        console.warn('⚠️ Split payment amount mismatch:', {
          total: paymentData.total_amount,
          splits_sum: splitsTotal,
          difference
        });
        
        if (difference > 1.00) { // Only fail if difference > $1
          throw new Error(
            `Total split amount (${splitsTotal.toFixed(2)}) does not match total payment amount (${paymentData.total_amount.toFixed(2)})`
          );
        }
      }
      
      const response = await axiosInstance.post<PaymentResponse>(
        `/orders/${orderId}/payments/split`,
        paymentData
      );
      
      console.log('✅ Split payment processed:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Split payment processing failed');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Split payment processing failed:', error);
      console.error('❌ Error response:', error.response?.data);
      
      const errorMessage = error.response?.data?.message || error.message || 'Failed to process split payment';
      throw new Error(errorMessage);
    }
  }



  /**
   * ✅ Setup Installment Plan (EMI)
   *
   * Endpoint: POST /api/orders/{order}/payments/installment/setup
   */
  async setupInstallmentPlan(orderId: number, payload: SetupInstallmentPlanRequest): Promise<any> {
    try {
      const response = await axiosInstance.post(`/orders/${orderId}/payments/installment/setup`, payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to setup installment plan');
      }
      return response.data.data;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Failed to setup installment plan';
      throw new Error(msg);
    }
  }

  /**
   * ✅ Add Installment Payment (EMI)
   *
   * Endpoint: POST /api/orders/{order}/payments/installment
   */
  async addInstallmentPayment(orderId: number, payload: InstallmentPaymentRequest): Promise<Payment> {
    try {
      const response = await axiosInstance.post<PaymentResponse>(
        `/orders/${orderId}/payments/installment`,
        payload
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to add installment payment');
      }

      return response.data.data;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Failed to add installment payment';
      throw new Error(msg);
    }
  }
  /**
   * Legacy method - redirects to processSimple for backward compatibility
   * @deprecated Use processSimple instead
   */
  async process(orderId: number, paymentData: SimplePaymentRequest): Promise<Payment> {
    console.warn('⚠️ Using deprecated process() method. Use processSimple() instead.');
    return this.processSimple(orderId, paymentData);
  }

  /**
   * Helper: Calculate Change
   * 
   * Endpoint: POST /api/payment-utils/calculate-change
   * 
   * @param amountDue - Amount customer needs to pay
   * @param amountReceived - Amount customer actually paid
   * @returns Suggested change denominations
   */
  async calculateChange(amountDue: number, amountReceived: number): Promise<{
    change_amount: number;
    suggested_denominations: CashDenomination[];
  }> {
    try {
      const response = await axiosInstance.post('/payment-utils/calculate-change', {
        amount_due: amountDue,
        amount_received: amountReceived,
      });
      
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Failed to calculate change:', error);
      
      // Fallback: Calculate manually if API fails
      const changeAmount = amountReceived - amountDue;
      if (changeAmount < 0) {
        throw new Error('Amount received is less than amount due');
      }
      
      return {
        change_amount: changeAmount,
        suggested_denominations: this.calculateChangeDenominations(changeAmount),
      };
    }
  }

  /**
   * Helper: Calculate optimal change denominations
   * @private
   */
  private calculateChangeDenominations(amount: number): CashDenomination[] {
    const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
    const result: CashDenomination[] = [];
    let remaining = amount;
    
    for (const denom of denominations) {
      if (remaining >= denom) {
        const quantity = Math.floor(remaining / denom);
        result.push({
          denomination: denom,
          quantity,
          type: 'note',
        });
        remaining -= quantity * denom;
      }
    }
    
    return result;
  }
}

// Export singleton instance
const paymentService = new PaymentService();
export default paymentService;