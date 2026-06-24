import axiosInstance from '@/lib/axios';

// Types
export interface Store {
  store_id: number;
  store_name: string;
  store_code: string;
  store_address?: string;
  quantity: number;
  batches_count?: number;
  is_warehouse?: boolean;
  is_online?: boolean;
}

export interface GlobalInventoryItem {
  product_id: number;
  category_id?: number;
  category_name?: string;
  subcategory_name?: string;
  product_name: string;
  base_name: string;
  variation_suffix?: string;
  sku: string;
  total_quantity: number;
  available_quantity?: number;
  reserved_quantity?: number;
  stores_count: number;
  stores: Store[];
  is_low_stock: boolean;
}

export interface ProductAvailability {
  product_id: number;
  category_id?: number;
  product_name: string;
  base_name: string;
  variation_suffix?: string;
  sku: string;
  total_quantity: number;
  available_quantity?: number;
  reserved_quantity?: number;
  available_in_stores: number;
  stores: Store[];
}

export interface LowStockAlert {
  batch_id: number;
  batch_number: string;
  batch_created_at?: string | null;
  product_id: number;
  product_name: string;
  sku: string;
  store_id: number;
  store_name: string;
  current_quantity: number;
  reorder_level: number;
  shortage: number;
  urgency: 'critical' | 'high' | 'medium';
}

export interface LowStockAlertsResponse {
  total_alerts: number;
  critical: number;
  high: number;
  medium: number;
  alerts: LowStockAlert[];
}

export interface StoreValue {
  store_id: number;
  store_name: string;
  store_code: string;
  total_value: number;
  products_count: number;
  batches_count: number;
}

export interface ProductValue {
  product_id: number;
  product_name: string;
  sku: string;
  total_quantity: number;
  available_quantity?: number;
  reserved_quantity?: number;
  total_value: number;
  average_unit_cost: number;
}

export interface InventoryValueResponse {
  total_inventory_value: number;
  total_products: number;
  total_batches: number;
  by_store: StoreValue[];
  top_products: ProductValue[];
}

export interface StoreSummary {
  store_id: number;
  store_name: string;
  products_count: number;
  total_quantity: number;
  total_value: number;
}

export interface StatisticsResponse {
  overview: {
    total_products: number;
    total_batches: number;
    active_batches: number;
    total_inventory_units: number;
    total_inventory_value: number;
  };
  alerts: {
    low_stock: number;
    out_of_stock: number;
    expiring_soon: number;
  };
  stores: StoreSummary[];
}

export interface StockAgingItem {
  batch_id: number;
  batch_number: string;
  product_name: string;
  store_name: string;
  quantity: number;
  days_in_stock: number;
  age_category: 'fresh' | 'medium' | 'aged';
  value: number;
}

export interface StockAgingResponse {
  fresh: StockAgingItem[];
  medium: StockAgingItem[];
  aged: StockAgingItem[];
  summary: {
    fresh_count: number;
    medium_count: number;
    aged_count: number;
  };
}

export interface GlobalInventoryParams {
  product_id?: number;
  store_id?: number;
  category_id?: number;
  low_stock?: boolean;
  skipStoreScope?: boolean;
}

export interface SearchProductParams {
  search: string;
}


export type InventoryDatePreset = 'today' | '7' | '30' | '90' | '365' | 'custom';
export type InventoryStockStatus = 'out_of_stock' | 'no_stock' | 'low' | 'normal' | 'high' | 'slow_moving';

export interface InventoryOverviewParams {
  date_preset?: InventoryDatePreset;
  start_date?: string;
  end_date?: string;
  category_id?: number;
  category_ids?: string | number[];
  subcategory_id?: number;
  subcategory_ids?: string | number[];
  size?: string;
  search?: string;
  page?: number;
  per_page?: number;
  skipStoreScope?: boolean;
}

export interface InventoryOverviewBatch {
  batch_id: number;
  batch_number: string;
  batch_created_at?: string | null;
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  store_id: number;
  store_name: string;
  po_id?: number | null;
  po_number?: string | null;
  po_order_date?: string | null;
  po_received_date?: string | null;
  po_status?: string | null;
  vendor_name?: string | null;
  original_qty: number;
  remaining_stock: number;
  cost_price: number;
  sell_price: number;
  units_sold: number;
  order_count: number;
  revenue: number;
  sell_through_pct: number;
  days_since_received?: number | null;
  velocity_per_day: number;
  days_of_stock?: number | null;
  stock_value: number;
}

export interface InventoryOverviewStoreRow {
  store_id: number;
  store_name: string;
  store_code?: string | null;
  current_stock: number;
  stock_value: number;
  batch_count: number;
  po_count: number;
  total_purchase: number;
  total_sell: number;
  sales_revenue: number;
  total_dispatch_out: number;
  total_dispatch_received: number;
  total_defect: number;
  velocity_per_day: number;
  days_of_cover?: number | null;
  stock_status: InventoryStockStatus;
  batches: InventoryOverviewBatch[];
}

export interface InventoryOverviewVariation {
  product_id: number;
  product_name: string;
  variation_suffix?: string | null;
  /** Total live product-batch stock before reservation deduction. */
  global_available_stock?: number;
  /** Sellable stock after reservation deduction: global_available_stock - reserved_stock. */
  physical_stock?: number;
  /** Backward-compatible alias for global_available_stock. */
  current_stock: number;
  /** Backward-compatible alias for physical_stock. */
  available_stock: number;
  reserved_stock: number;
  stores: Array<{ store_id: number; store_name: string; quantity: number; batches_count: number }>;
}

export interface InventoryMovementRecommendation {
  type: 'store_transfer';
  urgency: 'urgent' | 'high' | 'medium' | 'low';
  from_store_id: number;
  from_store_name: string;
  from_store_stock: number;
  from_store_days_of_cover?: number | null;
  to_store_id: number;
  to_store_name: string;
  to_store_stock: number;
  to_store_days_of_cover?: number | null;
  suggested_quantity: number;
  reason: string;
}

export interface InventoryOverviewItem {
  group_key: string;
  sku: string;
  product_name: string;
  category_id?: number | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  /** Total live product-batch stock before reservation deduction. */
  global_available_stock?: number;
  /** Sellable stock after reservation deduction: global_available_stock - reserved_stock. */
  physical_stock?: number;
  /** Backward-compatible alias for global_available_stock. */
  current_stock: number;
  /** Backward-compatible alias for physical_stock. */
  available_stock: number;
  reserved_stock: number;
  total_purchase: number;
  total_sell: number;
  total_dispatch_out: number;
  total_dispatch_received: number;
  total_defect: number;
  po_count: number;
  batch_count: number;
  velocity_per_day: number;
  days_of_cover?: number | null;
  stock_status: InventoryStockStatus;
  stock_value: number;
  movement_recommendation?: InventoryMovementRecommendation | null;
  stores: InventoryOverviewStoreRow[];
  variations: InventoryOverviewVariation[];
}

export interface InventoryOverviewResponse {
  filters: {
    date_preset: InventoryDatePreset;
    start_date: string;
    end_date: string;
    period_days: number;
  };
  summary: {
    total_products: number;
    page_products: number;
    total_current_stock: number;
    total_available_stock: number;
    total_reserved_stock: number;
    total_purchase: number;
    total_sell: number;
    total_dispatch_out: number;
    total_dispatch_received: number;
    total_defect: number;
    total_stock_value: number;
    low_stock_count: number;
    high_stock_count: number;
    recommendation_count: number;
    generated_at?: string | null;
  };
  stores: Array<{ id: number; name: string; store_code?: string | null }>;
  items: InventoryOverviewItem[];
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

// API Response wrapper
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Inventory Service
const inventoryService = {
  /**
   * Get global inventory overview across all stores
   */
  getGlobalInventory: async (params?: GlobalInventoryParams) => {
    const { skipStoreScope, ...rest } = params || {};
    const response = await axiosInstance.get<ApiResponse<GlobalInventoryItem[]>>(
      '/catalog/inventory/global',
      { params: rest, skipStoreScope }
    );
    return response.data;
  },

  /**
   * Get combined inventory view intelligence for the inventory view page.
   * Date filters affect PO/sell/dispatch/defect/velocity counts; current stock is latest state.
   */
  getInventoryOverview: async (params?: InventoryOverviewParams) => {
    const { skipStoreScope, ...rest } = params || {};
    const response = await axiosInstance.get<ApiResponse<InventoryOverviewResponse>>(
      '/inventory/intelligence/overview',
      { params: rest, skipStoreScope }
    );
    return response.data;
  },

  /**
   * Get inventory for a specific store
   */
  getStoreInventory: async (storeId: number) => {
    const response = await axiosInstance.get<ApiResponse<GlobalInventoryItem[]>>(
      '/catalog/inventory/global',
      { params: { store_id: storeId } }
    );
    return response.data;
  },

  /**
   * Get inventory statistics and dashboard data
   */
  getStatistics: async () => {
    const response = await axiosInstance.get<ApiResponse<StatisticsResponse>>(
      '/catalog/inventory/statistics'
    );
    return response.data;
  },

  /**
   * Get inventory value report
   */
  getInventoryValue: async () => {
    const response = await axiosInstance.get<ApiResponse<InventoryValueResponse>>(
      '/catalog/inventory/value'
    );
    return response.data;
  },

  /**
   * Search product availability across all stores
   */
  searchProductAcrossStores: async (params: SearchProductParams) => {
    const response = await axiosInstance.post<ApiResponse<ProductAvailability[]>>(
      '/catalog/inventory/search',
      params
    );
    return response.data;
  },

  /**
   * Get low stock alerts across all stores
   */
  getLowStockAlerts: async () => {
    const response = await axiosInstance.get<ApiResponse<LowStockAlertsResponse>>(
      '/catalog/inventory/low-stock-alerts'
    );
    return response.data;
  },

  /**
   * Get stock aging analysis
   */
  getStockAging: async () => {
    const response = await axiosInstance.get<ApiResponse<StockAgingResponse>>(
      '/catalog/inventory/stock-aging'
    );
    return response.data;
  },
};

export default inventoryService;