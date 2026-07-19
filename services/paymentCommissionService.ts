import axiosInstance from '@/lib/axios';

export type CommissionRefundPolicy = 'keep_original' | 'reverse_proportionally';
export type CommissionEntryStatus = 'active' | 'cancelled' | 'reversed';

export interface CommissionRateHistory {
  id: number;
  channel_code: string;
  percentage_rate: number;
  effective_from: string;
  is_active: boolean;
  refund_policy: CommissionRefundPolicy;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CommissionChannelProfile {
  channel_code: string;
  channel_label: string;
  current_rate: number;
  current_refund_policy: CommissionRefundPolicy;
  current_effective_from?: string | null;
  uses_default_fallback: boolean;
}

export interface CommissionPaymentMethod {
  id: number;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
  is_cash: boolean;
  is_commissionable: boolean;
  current_rate: number;
  current_refund_policy: CommissionRefundPolicy;
  current_effective_from?: string | null;
  channel_profiles: CommissionChannelProfile[];
  rates: CommissionRateHistory[];
}

export interface CommissionSettingsResponse {
  success: boolean;
  as_of: string;
  payment_methods: CommissionPaymentMethod[];
  refund_policies: { value: CommissionRefundPolicy; label: string }[];
}

export interface CommissionSettingPayload {
  payment_method_id: number;
  channel_code: string;
  percentage_rate: number;
  effective_from: string;
  is_active: boolean;
  refund_policy: CommissionRefundPolicy;
  notes?: string;
}

export interface CommissionReportSummary {
  gross_amount: number;
  commission_amount: number;
  reversed_commission_amount: number;
  net_commission_amount: number;
  net_amount: number;
  effective_rate: number;
  entries_count: number;
}

export interface CommissionReportEntry {
  id: number;
  business_date: string;
  gross_amount: number;
  commission_rate: number;
  commission_amount: number;
  reversed_commission_amount: number;
  net_commission_amount: number;
  net_amount: number;
  refund_policy: CommissionRefundPolicy;
  status: CommissionEntryStatus;
  channel_code: string;
  source_type: string;
  source_id: number;
  order?: { id: number; order_number?: string; order_type?: string; status?: string; total_amount?: number } | null;
  store?: { id: number; name: string } | null;
  payment_method?: { id: number; code: string; name: string; type: string } | null;
  paymentMethod?: { id: number; code: string; name: string; type: string } | null;
  accounting_transaction?: { id: number; transaction_number?: string; status?: string } | null;
  accountingTransaction?: { id: number; transaction_number?: string; status?: string } | null;
  created_by?: { id: number; name: string } | null;
  createdBy?: { id: number; name: string } | null;
}

export interface CommissionMethodSummary {
  payment_method_id: number;
  channel_code: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  entries_count: number;
  payment_method?: { id: number; code: string; name: string; type: string } | null;
  paymentMethod?: { id: number; code: string; name: string; type: string } | null;
}

export interface CommissionReportResponse {
  success: boolean;
  filters: { date_from: string; date_to: string };
  summary: CommissionReportSummary;
  by_method: CommissionMethodSummary[];
  entries: {
    current_page: number;
    data: CommissionReportEntry[];
    last_page: number;
    per_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
  };
  stores: { id: number; name: string }[];
  payment_methods: { id: number; code: string; name: string; type: string }[];
}

export interface CommissionReportFilters {
  date_from?: string;
  date_to?: string;
  store_id?: number | string;
  payment_method_id?: number | string;
  channel_code?: string;
  status?: CommissionEntryStatus | 'all' | string;
  search?: string;
  page?: number;
  per_page?: number;
}

const paymentCommissionService = {
  async getSettings(asOf?: string): Promise<CommissionSettingsResponse> {
    const response = await axiosInstance.get('/accounting/payment-commissions/settings', {
      params: { ...(asOf ? { as_of: asOf } : {}), _ts: Date.now() },
    });
    return response.data;
  },

  async createSetting(payload: CommissionSettingPayload) {
    const response = await axiosInstance.post('/accounting/payment-commissions/settings', payload);
    return response.data;
  },

  async updateSetting(id: number, payload: Omit<CommissionSettingPayload, 'payment_method_id'>) {
    const response = await axiosInstance.put(`/accounting/payment-commissions/settings/${id}`, payload);
    return response.data;
  },

  async deactivateSetting(id: number) {
    const response = await axiosInstance.delete(`/accounting/payment-commissions/settings/${id}`);
    return response.data;
  },

  async getReport(filters: CommissionReportFilters): Promise<CommissionReportResponse> {
    const params = Object.fromEntries(
      Object.entries({ ...filters, _ts: Date.now() }).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    );
    const response = await axiosInstance.get('/accounting/payment-commissions/report', { params });
    return response.data;
  },
};

export default paymentCommissionService;
