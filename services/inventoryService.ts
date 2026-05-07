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