import axios from '@/lib/axios';

export interface ResellSummary {
  vendors: number;
  products: number;
  open_purchase_orders: number;
  stock_on_hand: number;
  stock_cost_value: number;
  net_units_sold: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  vendor_earned: number;
  paid_amount: number;
  outstanding: number;
  vendor_due: number;
  overpaid_amount: number;
}

export interface ResellVendorProfile {
  id: number;
  vendor_id: number;
  vendor: any;
  is_active: boolean;
  notes?: string | null;
  marked_by?: any;
  product_count: number;
  po_count: number;
  po_value: number;
  received_quantity: number;
  stock_on_hand: number;
  stock_cost_value: number;
  net_units_sold: number;
  vendor_earned: number;
  paid_amount: number;
  outstanding_amount: number;
  vendor_due: number;
  overpaid_amount: number;
  created_at: string;
  updated_at: string;
}

export interface ResellProductTag {
  id: number;
  product_id: number;
  resell_vendor_id: number;
  product: any;
  resell_vendor: ResellVendorProfile;
  marked_by?: any;
  notes?: string | null;
  is_active: boolean;
  received_quantity: number;
  stock_on_hand: number;
  stock_cost_value: number;
  net_units_sold: number;
  net_sales: number;
  vendor_earned: number;
}

export interface ResellReportProduct {
  resell_product_id: number;
  resell_vendor_id: number;
  vendor_id: number;
  vendor_name: string;
  product_id: number;
  product_name: string;
  sku?: string | null;
  brand?: string | null;
  category?: string | null;
  is_active: boolean;
  ordered_quantity: number;
  received_quantity: number;
  received_cost: number;
  stock_on_hand: number;
  stock_cost_value: number;
  order_count: number;
  gross_units_sold: number;
  gross_sales: number;
  gross_cogs: number;
  returned_quantity: number;
  returned_sales: number;
  returned_cogs: number;
  net_units_sold: number;
  net_sales: number;
  net_cogs: number;
  vendor_earned?: number;
  gross_profit: number;
  margin_percent: number;
  sell_through_percent: number;
  last_received_at?: string | null;
  last_sale_at?: string | null;
}

export interface ResellReportVendor {
  vendor_id: number;
  resell_vendor_id: number;
  vendor_name: string;
  product_count: number;
  received_quantity: number;
  received_cost: number;
  stock_on_hand: number;
  stock_cost_value: number;
  gross_units_sold: number;
  returned_quantity: number;
  net_units_sold: number;
  net_sales: number;
  net_cogs: number;
  vendor_earned: number;
  gross_profit: number;
  po_count: number;
  total_po_value: number;
  paid_amount: number;
  outstanding_amount: number;
  vendor_due: number;
  overpaid_amount: number;
}

export interface ResellReport {
  summary: {
    vendors: number;
    products: number;
    received_quantity: number;
    stock_on_hand: number;
    stock_cost_value: number;
    gross_units_sold: number;
    returned_quantity: number;
    net_units_sold: number;
    net_sales: number;
    net_cogs: number;
    vendor_earned: number;
    paid_amount: number;
    gross_profit: number;
    outstanding_amount: number;
    vendor_due: number;
    overpaid_amount: number;
  };
  vendors: ResellReportVendor[];
  products: ResellReportProduct[];
  rules: Record<string, string>;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

const resellService = {
  async getSummary(params?: Record<string, any>): Promise<ResellSummary> {
    return unwrap(await axios.get('/resell/summary', { params }));
  },

  async getVendorCandidates(search = ''): Promise<any[]> {
    return unwrap(await axios.get('/resell/vendor-candidates', { params: { search } }));
  },

  async getVendors(params?: Record<string, any>): Promise<ResellVendorProfile[]> {
    return unwrap(await axios.get('/resell/vendors', { params }));
  },

  async markVendor(data: { vendor_id: number; notes?: string }): Promise<ResellVendorProfile> {
    return unwrap(await axios.post('/resell/vendors', data));
  },

  async unmarkVendor(id: number): Promise<void> {
    await axios.delete(`/resell/vendors/${id}`);
  },

  async getProducts(params?: Record<string, any>): Promise<any> {
    return unwrap(await axios.get('/resell/products', { params: { per_page: 100, ...(params || {}) } }));
  },

  async markProduct(data: { product_id: number; resell_vendor_id: number; notes?: string }): Promise<ResellProductTag> {
    return unwrap(await axios.post('/resell/products', data));
  },

  async unmarkProduct(id: number): Promise<void> {
    await axios.delete(`/resell/products/${id}`);
  },

  async getPurchaseOrders(params?: Record<string, any>): Promise<any> {
    return unwrap(await axios.get('/resell/purchase-orders', { params: { per_page: 100, ...(params || {}) } }));
  },

  async createPurchaseOrder(data: any): Promise<any> {
    return unwrap(await axios.post('/resell/purchase-orders', data));
  },

  async getPayments(params?: Record<string, any>): Promise<any> {
    return unwrap(await axios.get('/resell/payments', { params: { per_page: 100, ...(params || {}) } }));
  },

  async createPayment(data: any): Promise<any> {
    return unwrap(await axios.post('/resell/payments', data));
  },

  async getReport(params?: Record<string, any>): Promise<ResellReport> {
    return unwrap(await axios.get('/resell/report', { params }));
  },
};

export default resellService;
