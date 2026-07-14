import axiosInstance from '@/lib/axios';

export interface LoyaltySettings {
  points_per_thousand: number;
  points_per_taka_discount: number;
  updated_at?: string | null;
}

export interface LoyaltyPreview {
  customer_found: boolean;
  has_loyalty_card: boolean;
  customer_id?: number | null;
  customer_name?: string | null;
  phone?: string | null;
  points_balance: number;
  points_per_thousand: number;
  points_per_taka_discount: number;
  eligible_amount: number;
  redeemable_taka: number;
  points_to_redeem: number;
  can_redeem: boolean;
}

export interface LoyaltyCustomer {
  id: number;
  customer_code?: string | null;
  customer_type: 'counter' | 'social_commerce' | 'ecommerce';
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  status: string;
  has_loyalty_card: boolean;
  loyalty_points_balance: number;
  loyalty_card_activated_at?: string | null;
  loyalty_card_activated_by?: { id: number; name: string } | null;
  total_orders?: number;
  total_purchases?: number;
  created_at?: string;
}

export interface LoyaltyTransaction {
  id: number;
  type: 'earned' | 'redeemed' | 'manual_adjustment' | string;
  points_delta: number;
  balance_after: number;
  eligible_amount: number | string;
  taka_discount: number | string;
  description?: string | null;
  created_at: string;
  order?: { id: number; order_number: string; status: string; total_amount: number | string } | null;
  created_by?: { id: number; name: string } | null;
}

type ApiResponse<T> = { success: boolean; message?: string; data: T; errors?: any };

const unwrap = <T>(response: any): T => response?.data?.data ?? response?.data;

class LoyaltyCardService {
  async previewCheckout(phone: string, eligibleAmount: number): Promise<LoyaltyPreview> {
    const response = await axiosInstance.post<ApiResponse<LoyaltyPreview>>('/loyalty-card/checkout-preview', {
      phone,
      eligible_amount: Math.max(0, Number(eligibleAmount) || 0),
    });
    return unwrap<LoyaltyPreview>(response);
  }

  async getSettings(): Promise<LoyaltySettings> {
    const response = await axiosInstance.get<ApiResponse<LoyaltySettings>>('/loyalty-card/settings');
    return unwrap<LoyaltySettings>(response);
  }

  async updateSettings(payload: LoyaltySettings): Promise<LoyaltySettings> {
    const response = await axiosInstance.put<ApiResponse<LoyaltySettings>>('/loyalty-card/settings', payload);
    return unwrap<LoyaltySettings>(response);
  }

  async listCustomers(params: { search?: string; status?: 'active' | 'inactive' | 'all'; page?: number; per_page?: number } = {}) {
    const response = await axiosInstance.get<ApiResponse<any>>('/loyalty-card/customers', { params });
    return unwrap<any>(response);
  }

  async lookup(phone: string): Promise<LoyaltyCustomer | null> {
    const response = await axiosInstance.post<ApiResponse<LoyaltyCustomer | null>>('/loyalty-card/lookup', { phone });
    return unwrap<LoyaltyCustomer | null>(response);
  }

  async activate(payload: {
    phone: string;
    name?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    customer_type?: 'counter' | 'social_commerce' | 'ecommerce';
  }): Promise<LoyaltyCustomer> {
    const response = await axiosInstance.post<ApiResponse<LoyaltyCustomer>>('/loyalty-card/activate', payload);
    return unwrap<LoyaltyCustomer>(response);
  }

  async deactivate(customerId: number): Promise<LoyaltyCustomer> {
    const response = await axiosInstance.post<ApiResponse<LoyaltyCustomer>>(`/loyalty-card/customers/${customerId}/deactivate`);
    return unwrap<LoyaltyCustomer>(response);
  }

  async transactions(customerId: number, page = 1, perPage = 50) {
    const response = await axiosInstance.get<ApiResponse<any>>(`/loyalty-card/customers/${customerId}/transactions`, {
      params: { page, per_page: perPage },
    });
    return unwrap<any>(response);
  }
}

const loyaltyCardService = new LoyaltyCardService();
export default loyaltyCardService;
