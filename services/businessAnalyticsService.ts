import axiosInstance from '@/lib/axios';

export interface ReportingFilters {
  from?: string;
  to?: string;
  store_id?: number | string;
  sku?: string;
  product_id?: number | string;
  category_id?: number | string;
  interval?: string;
}

export interface KPIBlock {
  total_orders: number;
  total_units: number;
  gross_sales: number;
  net_sales: number;
  total_discount: number;
  avg_order_value: number;
  gross_profit: number;
  margin_pct: number;
  return_count: number;
  refund_amount: number;
  inventory_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  repeat_customers: number;
  repeat_customer_rate: number;
}

export interface TrendPoint {
  date: string;
  orders: number;
  units?: number;
  net_sales: number;
  gross_profit: number;
}

export interface NamedValue {
  label: string;
  value: number;
  rank?: number;
  category_id?: number | null;
  units?: number;
  orders?: number;
  gross_profit?: number;
  margin_pct?: number;
  stock_on_hand?: number;
}

export interface TopProductRow {
  product_id: number;
  rank?: number;
  name: string;
  sku: string;
  category?: string;
  category_id?: number | null;
  orders?: number;
  units: number;
  revenue: number;
  gross_profit: number;
  margin_pct?: number;
  stock_on_hand: number;
}

export interface StockWatchRow {
  product_id: number;
  name: string;
  sku: string;
  available_quantity: number;
  reorder_level: number;
  shortage: number;
  revenue_30d: number;
  age_days: number;
}

export interface StorePerformanceRow {
  store_id: number;
  store_name: string;
  orders: number;
  units?: number;
  net_sales: number;
  profit: number;
  margin_pct: number;
}

export interface CommandCenterResponse {
  success: boolean;
  data: {
    period: { from: string; to: string };
    kpis: KPIBlock;
    sales_trend: TrendPoint[];
    order_type_mix: NamedValue[];
    payment_status_mix: NamedValue[];
    status_mix: NamedValue[];
    category_performance: NamedValue[];
    payment_method_mix: NamedValue[];
    top_products: TopProductRow[];
    stock_watchlist: StockWatchRow[];
    branch_performance: StorePerformanceRow[];
    today_hourly_orders: NamedValue[];
    insights: string[];
  };
}

const businessAnalyticsService = {
  getCommandCenter(params: ReportingFilters & { interval?: string } = {}) {
    return axiosInstance.get<CommandCenterResponse>('/reporting/command-center', { params }).then(r => r.data);
  },
  getSalesTrend(params: ReportingFilters & { interval?: string } = {}) {
    return axiosInstance.get<{ success: boolean; data: TrendPoint[] }>('/reporting/sales-trend', { params }).then(r => r.data);
  },
  getTopProducts(params: ReportingFilters & { category_id?: number | string; min_price?: number; max_price?: number; page?: number; per_page?: number; sort_by?: string; sort_direction?: 'asc' | 'desc' } = {}) {
    return axiosInstance.get<{ success: boolean; data: TopProductRow[]; meta?: { current_page: number; last_page: number; per_page: number; total: number; from: number; to: number } }>('/reporting/top-products', { params }).then(r => r.data);
  },
  getStockWatchlist(params: ReportingFilters = {}) {
    return axiosInstance.get<{ success: boolean; data: StockWatchRow[] }>('/reporting/stock-watchlist', { params }).then(r => r.data);
  },
  getBranchPerformance(params: ReportingFilters = {}) {
    return axiosInstance.get<{ success: boolean; data: StorePerformanceRow[] }>('/reporting/branch-performance', { params }).then(r => r.data);
  },
  getLiveBestSellers(params: ReportingFilters = {}) {
    return axiosInstance.get('/reporting/live-best-sellers', { params }).then(r => r.data);
  },
  getBranchComparison(params: ReportingFilters = {}) {
    return axiosInstance.get('/reporting/branch-comparison', { params }).then(r => r.data);
  },
  exportSummary(params: ReportingFilters = {}) {
    return axiosInstance.get('/reporting/export-summary', {
      params,
      responseType: 'blob',
    });
  },
};

export default businessAnalyticsService;
