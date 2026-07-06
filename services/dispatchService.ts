import axiosInstance from '@/lib/axios';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ProductDispatch {
  id: number;
  dispatch_number: string;
  // Backend may use older (pending) or newer (draft/pending_approval) flows.
  status:
    | 'draft'
    | 'pending'
    | 'pending_approval'
    | 'approved'
    | 'in_transit'
    | 'delivered'
    | 'cancelled';
  delivery_status: string;
  source_store: {
    id: number;
    name: string;
  };
  destination_store: {
    id: number;
    name: string;
  };
  dispatch_date: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  is_overdue: boolean;
  carrier_name?: string;
  tracking_number?: string;
  total_items: number;
  total_cost: string;
  total_value: string;
  created_by?: {
    id: number;
    name: string;
  };
  approved_by?: {
    id: number;
    name: string;
  };
  approved_at?: string;
  created_at: string;
  notes?: string;
  metadata?: any;
  items?: DispatchItem[];
  customer?: any;
  order?: any;
  for_pathao_delivery?: boolean;
}

export interface DispatchItem {
  id: number;
  product: {
    id: number;
    name: string;
    sku: string;
  };
  batch: {
    id: number;
    batch_number: string;
    barcode?: string;
  };
  quantity: number;
  received_quantity?: number;
  damaged_quantity?: number;
  missing_quantity?: number;
  status: string;
  unit_cost: string;
  unit_price: string;
  total_cost: string;
  total_value: string;
  barcode_scanning?: {
    required_quantity: number;
    scanned_count: number;
    remaining_count: number;
    all_scanned: boolean;
    progress_percentage: number;
  };
}

export interface DispatchStatistics {
  total_dispatches: number;
  pending: number;
  in_transit: number;
  delivered: number;
  cancelled: number;
  overdue: number;
  expected_today: number;
  total_value_in_transit: string;
}

export interface DispatchFilters {
  status?: string;
  source_store_id?: number;
  destination_store_id?: number;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface CreateDispatchData {
  source_store_id: number;
  destination_store_id: number;
  expected_delivery_date?: string;
  carrier_name?: string;
  tracking_number?: string;
  notes?: string;
  items: AddDispatchItemData[];
  draft_scan_history?: {
    barcode: string;
    batch_id: number;
  }[];
}

export interface AddDispatchItemData {
  batch_id: number;
  quantity: number;
  unit_price?: number;
  line_value?: number;
}

export interface DeliverDispatchData {
  items: {
    item_id: number;
    received_quantity: number;
    damaged_quantity?: number;
    missing_quantity?: number;
  }[];
}

export interface CreateShipmentData {
  send_to_pathao?: boolean;
}

export interface BulkCreateShipmentData {
  dispatch_ids: number[];
  send_to_pathao?: boolean;
}

export interface ScannedBarcode {
  id: number;
  barcode: string;
  product: {
    id: number;
    name: string;
  };
  current_store: {
    id: number;
    name: string;
  };
  scanned_at: string;
  scanned_by: string;
}

export interface ScannedBarcodesResponse {
  dispatch_item_id: number;
  required_quantity: number;
  scanned_count: number;
  remaining_count: number;
  scanned_barcodes: ScannedBarcode[];
}

export interface ReceivedBarcode {
  id: number;
  barcode: string;
  received_at: string;
  received_by_id?: number;
  received_by?: string;
  current_store?: {
    id: number;
    name: string;
  };
}

export interface ReceivedBarcodesResponse {
  dispatch_item_id: number;
  total_sent: number;
  received_count: number;
  pending_count: number;
  received_barcodes: ReceivedBarcode[];
}

// ============================================================================
// DISPATCH SERVICE
// ============================================================================

class DispatchService {
  private basePath = '/dispatches';

  /**
   * Get all dispatches with optional filters
   */
  async getDispatches(filters?: DispatchFilters) {
    const response = await axiosInstance.get(this.basePath, {
      params: filters,
    });
    return response.data;
  }

  /**
   * Get specific dispatch details
   */
  async getDispatch(id: number) {
    const response = await axiosInstance.get(`${this.basePath}/${id}`);
    return response.data;
  }

  /**
   * Create new dispatch
   */
  async createDispatch(data: CreateDispatchData) {
    const response = await axiosInstance.post(this.basePath, data);
    return response.data;
  }

  /**
   * Add item to dispatch
   */
  async addItem(dispatchId: number, data: AddDispatchItemData) {
    const response = await axiosInstance.post(
      `${this.basePath}/${dispatchId}/items`,
      data
    );
    return response.data;
  }

  /**
   * Remove item from dispatch
   */
  async removeItem(dispatchId: number, itemId: number) {
    const response = await axiosInstance.delete(
      `${this.basePath}/${dispatchId}/items/${itemId}`
    );
    return response.data;
  }

  /**
   * Approve dispatch
   */
  async approveDispatch(id: number) {
    const response = await axiosInstance.patch(`${this.basePath}/${id}/approve`);
    return response.data;
  }

  /**
   * Mark dispatch as in transit
   */
  async markDispatched(id: number) {
    const response = await axiosInstance.patch(`${this.basePath}/${id}/dispatch`);
    return response.data;
  }

  /**
   * Mark dispatch as delivered
   */
  async markDelivered(id: number, data?: DeliverDispatchData | Record<string, any>) {
    const response = await axiosInstance.patch(
      `${this.basePath}/${id}/deliver`,
      data || {}
    );
    return response.data;
  }

  /**
   * Cancel dispatch
   */
  async cancelDispatch(id: number) {
    const response = await axiosInstance.patch(`${this.basePath}/${id}/cancel`);
    return response.data;
  }

  /**
   * Get dispatch statistics
   */
  async getStatistics(storeId?: number) {
    const response = await axiosInstance.get(`${this.basePath}/statistics`, {
      params: storeId ? { store_id: storeId } : undefined,
    });
    return response.data;
  }

  /**
   * Get dispatches pending shipment creation (for Pathao)
   */
  async getPendingShipment(warehouseId?: number) {
    const response = await axiosInstance.get(`${this.basePath}/pending-shipment`, {
      params: warehouseId ? { warehouse_id: warehouseId } : undefined,
    });
    return response.data;
  }

  /**
   * Create shipment from dispatch
   */
  async createShipment(dispatchId: number, data?: CreateShipmentData) {
    const response = await axiosInstance.post(
      `${this.basePath}/${dispatchId}/create-shipment`,
      data || {}
    );
    return response.data;
  }

  /**
   * Bulk create shipments
   */
  async bulkCreateShipment(data: BulkCreateShipmentData) {
    const response = await axiosInstance.post(
      `${this.basePath}/bulk-create-shipment`,
      data
    );
    return response.data;
  }

  /**
   * Scan barcode for dispatch item
   */
  async scanBarcode(dispatchId: number, itemId: number, barcode: string) {
    const response = await axiosInstance.post(
      `${this.basePath}/${dispatchId}/items/${itemId}/scan-barcode`,
      { barcode }
    );
    return response.data;
  }

  /**
   * Receive barcode at destination store for dispatch item
   */
  async receiveBarcode(dispatchId: number, itemId: number, barcode: string) {
    const response = await axiosInstance.post(
      `${this.basePath}/${dispatchId}/items/${itemId}/receive-barcode`,
      { barcode }
    );
    return response.data;
  }

  /**
   * Get scanned barcodes for dispatch item
   */
  async getScannedBarcodes(dispatchId: number, itemId: number) {
    const response = await axiosInstance.get(
      `${this.basePath}/${dispatchId}/items/${itemId}/scanned-barcodes`
    );
    return response.data;
  }

  /**
   * Get received barcodes (destination progress) for dispatch item
   */
  async getReceivedBarcodes(dispatchId: number, itemId: number) {
    const response = await axiosInstance.get(
      `${this.basePath}/${dispatchId}/items/${itemId}/received-barcodes`
    );
    return response.data;
  }

  /**
   * Scan barcode to automatically add an item to the dispatch (or increment existing item).
   * Used for "scan to send" flow where items aren't pre-selected.
   */
  async scanToAddItem(dispatchId: number, barcode: string) {
    const response = await axiosInstance.post(
      `${this.basePath}/${dispatchId}/scan-to-add`,
      { barcode }
    );
    return response.data;
  }
}

export const dispatchService = new DispatchService();
export default dispatchService;