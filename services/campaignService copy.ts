import axiosInstance from '@/lib/axios';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://backend2.errumbd.com/api';

// Unauthenticated axios for public endpoints (no auth header injected)
const publicAxios = axios.create({ baseURL: API_BASE });

export interface Campaign {
  id: number;
  name: string;
  description?: string;
  code: string;
  type: 'percentage' | 'fixed';
  discount_value: number;
  maximum_discount?: number;
  start_date: string;
  end_date: string | null;
  applicable_products: number[] | null;
  applicable_categories: number[] | null;
  is_active: boolean;
  is_automatic: boolean;
  is_public: boolean;
  created_by?: number;
  created_at?: string;
}

export interface CampaignFormData {
  name: string;
  description?: string;
  type: 'percentage' | 'fixed';
  discount_value: number;
  maximum_discount?: number;
  applicable_products?: number[];
  applicable_categories?: number[];
  start_date: string;
  end_date?: string;
  is_active: boolean;
  is_automatic: boolean;
  is_public: boolean;
}

/** A public promotion as returned from GET /promotions/active-public */
export interface PublicPromotion {
  id: number;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'buy_x_get_y' | 'free_shipping';
  discount_value: number;
  minimum_purchase?: number | null;
  maximum_discount?: number | null;
  applicable_products: number[] | null;
  applicable_categories: number[] | null;
  start_date: string;
  end_date: string | null;
}

/** Possible error codes returned by POST /promotions/validate-coupon */
export type CouponErrorCode =
  | 'INVALID_CODE'
  | 'PROMOTION_EXPIRED'
  | 'PROMOTION_NOT_STARTED'
  | 'PROMOTION_LIMIT_REACHED'
  | 'PROMOTION_INACTIVE'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'CUSTOMER_NOT_ELIGIBLE'
  | 'MINIMUM_NOT_MET'
  | 'NO_ELIGIBLE_ITEMS'
  | 'LOGIN_REQUIRED';

export interface CouponCartItem {
  product_id: number;
  category_id?: number;
  quantity: number;
  unit_price: number;
}

export interface CouponValidationResult {
  success: boolean;
  /** Present on success */
  data?: {
    promotion: PublicPromotion;
    /** Gross discount before any cap */
    calculated_amount: number;
    /** Actual discount applied (after cap) */
    applied_amount: number;
    capped: boolean;
    max_discount?: number | null;
    eligible_product_ids: number[];
    category_scope_name?: string | null;
    message: string;
  };
  /** Present on failure */
  error_code?: CouponErrorCode;
  message?: string;
  /** For MINIMUM_NOT_MET — the required threshold */
  minimum_purchase?: number;
}

export interface ActiveCampaign {
  id: number;
  name: string;
  description?: string;
  code: string;
  type: 'percentage' | 'fixed';
  discount_value: number;
  start_date: string;
  end_date: string | null;
  applicable_products: number[];
  applicable_categories: number[];
}

export interface DiscountCalculationItem {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface DiscountResult {
  product_id: number;
  quantity: number;
  unit_price: number;
  original_price: number;
  discounted_price: number;
  discount_amount_per_unit: number;
  discount_amount_total: number;
  discount_percentage: number;
  active_campaign: ActiveCampaign | null;
}

export interface DiscountCalculationResponse {
  total_discount: number;
  items: DiscountResult[];
  campaigns_applied: ActiveCampaign[];
}

const campaignService = {
  // ─── Admin CRUD ───────────────────────────────────────────
  async getCampaigns(params?: {
    is_automatic?: boolean;
    is_active?: boolean;
    valid_only?: boolean;
    search?: string;
  }): Promise<Campaign[]> {
    const response = await axiosInstance.get('/promotions', { params });
    const payload = response.data;

    if (Array.isArray(payload)) return payload as Campaign[];
    if (Array.isArray(payload?.data)) return payload.data as Campaign[];
    if (Array.isArray(payload?.data?.data)) return payload.data.data as Campaign[];

    return [];
  },

  async getCampaign(id: number) {
    const response = await axiosInstance.get(`/promotions/${id}`);
    return response.data;
  },

  async createCampaign(data: CampaignFormData) {
    const response = await axiosInstance.post('/promotions', data);
    return response.data;
  },

  async updateCampaign(id: number, data: Partial<CampaignFormData>) {
    const response = await axiosInstance.put(`/promotions/${id}`, data);
    return response.data;
  },

  async deleteCampaign(id: number) {
    const response = await axiosInstance.delete(`/promotions/${id}`);
    return response.data;
  },

  async toggleCampaign(id: number, isActive: boolean) {
    const action = isActive ? 'activate' : 'deactivate';
    const response = await axiosInstance.post(`/promotions/${id}/${action}`);
    return response.data;
  },

  // ─── Public (no auth) ─────────────────────────────────────

  /**
   * Fetch all currently active public promotions for the storefront.
   * No auth required — used by PromotionContext to power SALE badges.
   */
  async getActivePublicPromotions(): Promise<PublicPromotion[]> {
    const response = await publicAxios.get('/promotions/active-public');
    return response.data.data as PublicPromotion[];
  },

  /**
   * Validate a private coupon code against the cart.
   * Supports guest customers (customer_id: null).
   * All errors are returned as structured CouponValidationResult (never throws).
   */
  async validateCouponCode(payload: {
    code: string;
    customer_id: number | null;
    cart_subtotal: number;
    cart_items?: CouponCartItem[];
  }): Promise<CouponValidationResult> {
    try {
      const response = await publicAxios.post('/promotions/validate-coupon', payload);
      return response.data as CouponValidationResult;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as CouponValidationResult;
      }
      return { success: false, error_code: 'INVALID_CODE', message: 'Something went wrong. Please try again.' };
    }
  },

  // ─── Legacy (kept for backward compat) ────────────────────

  async getActiveCampaigns(params?: {
    product_ids?: number[];
    category_ids?: number[];
  }) {
    const response = await axiosInstance.get('/campaigns/active', { params });
    return response.data;
  },

  async calculateDiscount(items: DiscountCalculationItem[]): Promise<DiscountCalculationResponse> {
    const response = await axiosInstance.post('/campaigns/calculate-discount', { items });
    return response.data.data;
  },

  async getProductDiscounts(productIds: number[]) {
    const response = await axiosInstance.get('/campaigns/product-discounts', {
      params: { product_ids: productIds },
    });
    return response.data;
  },
};

export default campaignService;
