import axiosInstance from '@/lib/axios';

export interface PaymentMethod {
  id: number;
  name: string;
  type: 'cash' | 'bank_transfer' | 'card' | 'mobile_banking' | 'cheque' | 'other';
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethodsByCustomerTypeResponse {
  success: boolean;
  data: {
    customer_type: string;
    payment_methods: PaymentMethod[];
    note: string;
  };
}

class PaymentMethodService {
  private readonly baseURL = '/payment-methods';

  /**
   * Get payment methods by customer type (for counter returns)
   */
  async getMethodsByCustomerType(customerType: string = 'counter'): Promise<PaymentMethod[]> {
    try {
      const response = await axiosInstance.get<PaymentMethodsByCustomerTypeResponse>(
        this.baseURL,
        { 
          params: { customer_type: customerType } 
        }
      );
      
      if (response.data.success && response.data.data && Array.isArray(response.data.data.payment_methods)) {
        return response.data.data.payment_methods;
      }
      
      console.warn('Unexpected payment methods response format:', response.data);
      return [];
    } catch (error: any) {
      console.error('Get payment methods by customer type error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment methods');
    }
  }
  async getAll(params?: {
    type?: string;
    is_active?: boolean;
    search?: string;
    sort_by?: string;
    sort_direction?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }): Promise<PaymentMethod[]> {
    try {
      // `/payment-methods` is the public checkout endpoint and requires
      // `customer_type`. Internal/vendor-style screens must use `/all`.
      const response = await axiosInstance.get<any>(
        `${this.baseURL}/all`,
        { params }
      );
      
      // Handle different response formats
      if (response.data.success) {
        // If it's the customer type response
        if (response.data.data && response.data.data.payment_methods) {
          return response.data.data.payment_methods;
        }
        // If it's paginated response
        if (response.data.data && Array.isArray(response.data.data.data)) {
          return response.data.data.data;
        }
        // If it's direct array
        if (Array.isArray(response.data.data)) {
          return response.data.data;
        }
      }
      
      console.warn('Unexpected payment methods response format:', response.data);
      return [];
    } catch (error: any) {
      console.error('Get payment methods error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch payment methods');
    }
  }

}

const paymentMethodService = new PaymentMethodService();
export default paymentMethodService;