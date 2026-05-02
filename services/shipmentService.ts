import axiosInstance from '@/lib/axios';

export interface Shipment {
  id: number;
  shipment_number: string;
  order_id: number;
  store_id: number;
  customer_id: number;
  recipient_name: string;
  recipient_phone: string;
  pickup_address: any;
  delivery_address: any;
  delivery_type: 'home_delivery' | 'express';
  package_weight: number;
  package_dimensions?: any;
  special_instructions?: string;
  status: 'pending' | 'pickup_requested' | 'picked_up' | 'in_transit' | 'delivered' | 'returned' | 'cancelled';
  pathao_consignment_id?: string;
  pathao_tracking_number?: string;
  pathao_status?: string;
  delivery_fee?: string;
  cod_amount?: string;
  created_at: string;
  pickup_requested_at?: string;
  delivered_at?: string;
}

export interface CreateShipmentPayload {
  order_id: number;
  delivery_type: 'home_delivery' | 'express';
  package_weight?: number;
  package_dimensions?: any;
  special_instructions?: string;
  send_to_pathao?: boolean; // true = immediate send, false = manual later
}

export interface PathaoCity {
  city_id: number;
  city_name: string;
}

export interface PathaoZone {
  zone_id: number;
  zone_name: string;
}

export interface PathaoArea {
  area_id: number;
  area_name: string;
}

export interface ShipmentStatistics {
  total_shipments: number;
  pending_shipments: number;
  in_transit_shipments: number;
  delivered_shipments: number;
  returned_shipments: number;
  cancelled_shipments: number;
  pending_pathao_submissions: number;
  in_transit_with_pathao: number;
  total_delivery_fee: string;
  total_cod_amount: string;
  average_delivery_fee: string;
}

export interface BulkSendImmediateFailure {
  shipment_id: number;
  shipment_number: string;
  reason: string;
}

export interface BulkSendSyncResult {
  success: Array<{
    shipment_id: number;
    shipment_number: string;
    pathao_consignment_id: string;
  }>;
  failed: Array<{
    shipment_id: number;
    shipment_number: string;
    reason: string;
  }>;
}

export interface BulkSendQueuedResult {
  batch_code: string;
  batch_id: number;
  queued_count: number;
  immediate_failures: BulkSendImmediateFailure[];
  status_url: string;
}

export interface BulkBatchSummary {
  batch_code: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  total: number;
  processed: number;
  success: number;
  failed: number;
  pending: number;
  progress: number;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface BulkBatchDetailedResult {
  shipment_id: number;
  shipment_number: string;
  order_number?: string | null;
  success: boolean;
  message: string;
  consignment_id?: string | null;
  processed_at?: string | null;
}

export interface BulkBatchDetails {
  summary: BulkBatchSummary;
  results: BulkBatchDetailedResult[];
}

class ShipmentService {
  /**
   * Create shipment from order
   * @param payload - Shipment creation data
   * @returns Created shipment
   */
  async create(payload: CreateShipmentPayload): Promise<Shipment> {
    try {
      const response = await axiosInstance.post('/shipments', payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to create shipment');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Create shipment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create shipment');
    }
  }

  /**
   * Send shipment to Pathao manually
   * @param shipmentId - ID of the shipment
   * @returns Updated shipment with Pathao details
   */
  async sendToPathao(shipmentId: number): Promise<Shipment> {
    try {
      const response = await axiosInstance.post(`/shipments/${shipmentId}/send-to-pathao`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to send to Pathao');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Send to Pathao error:', error);
      throw new Error(error.response?.data?.message || 'Failed to send to Pathao');
    }
  }

  /**
   * Start bulk send multiple shipments to Pathao
   * @param shipmentIds - Array of shipment IDs
   * @param options.sync - true returns immediate (old sync behavior)
   * @returns queued batch info or sync results based on mode
   */
  async startBulkSendToPathao(
    shipmentIds: number[],
    options?: { sync?: boolean }
  ): Promise<BulkSendQueuedResult | BulkSendSyncResult> {
    try {
      const response = await axiosInstance.post('/shipments/bulk-send-to-pathao', {
        shipment_ids: shipmentIds,
        ...(typeof options?.sync === 'boolean' ? { sync: options.sync } : {}),
      });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to bulk send to Pathao');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Start bulk send to Pathao error:', error);
      throw new Error(error.response?.data?.message || 'Failed to bulk send to Pathao');
    }
  }

  /**
   * Bulk send orders directly to Pathao without pre-creating shipments locally
   * @param orderIds - Array of order IDs
   */
  async bulkSendOrdersToPathao(
    orderIds: number[],
    options?: { delivery_type?: 'home_delivery' | 'express'; package_weight?: number }
  ): Promise<BulkSendQueuedResult | BulkSendSyncResult> {
    try {
      const response = await axiosInstance.post('/shipments/bulk-send-orders-to-pathao', {
        order_ids: orderIds,
        delivery_type: options?.delivery_type || 'home_delivery',
        package_weight: options?.package_weight || 1.0,
      });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to bulk send orders to Pathao');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Start bulk send orders to Pathao error:', error);
      throw new Error(error.response?.data?.message || 'Failed to bulk send orders to Pathao');
    }
  }

  /**
   * Backward-compatible sync bulk send helper
   */
  async bulkSendToPathao(shipmentIds: number[]): Promise<BulkSendSyncResult> {
    const data = await this.startBulkSendToPathao(shipmentIds, { sync: true });
    if ('success' in data && 'failed' in data) {
      return data;
    }

    return {
      success: [],
      failed: [
        {
          shipment_id: 0,
          shipment_number: data.batch_code,
          reason: 'Queued in async mode. Use bulk status APIs for progress.',
        },
      ],
    };
  }

  /**
   * Get queue batch status by batch code
   */
  async getBulkStatus(batchCode: string): Promise<BulkBatchSummary> {
    try {
      const response = await axiosInstance.get(`/shipments/bulk-status/${batchCode}`);
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch batch status');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get bulk status error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch batch status');
    }
  }

  /**
   * Get queue batch detailed results by batch code
   */
  async getBulkStatusDetails(batchCode: string): Promise<BulkBatchDetails> {
    try {
      const response = await axiosInstance.get(`/shipments/bulk-status/${batchCode}/details`);
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch batch details');
      }

      return result.data;
    } catch (error: any) {
      console.error('Get bulk status details error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch batch details');
    }
  }

  /**
   * Cancel queue batch by batch code
   */
  async cancelBulkBatch(batchCode: string): Promise<BulkBatchSummary> {
    try {
      const response = await axiosInstance.post(`/shipments/bulk-status/${batchCode}/cancel`);
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to cancel batch');
      }

      return result.data;
    } catch (error: any) {
      console.error('Cancel bulk batch error:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel batch');
    }
  }

  /**
   * List recent queue batches
   */
  async listBulkBatches(params?: {
    status?: 'pending' | 'processing' | 'completed' | 'cancelled';
    days?: number;
    per_page?: number;
    page?: number;
  }): Promise<{
    data: BulkBatchSummary[];
    total: number;
    current_page: number;
    last_page: number;
  }> {
    try {
      const response = await axiosInstance.get('/shipments/bulk-batches', { params });
      const result = response.data;

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch bulk batches');
      }

      return {
        data: result.data?.data || [],
        total: result.data?.total || 0,
        current_page: result.data?.current_page || 1,
        last_page: result.data?.last_page || 1,
      };
    } catch (error: any) {
      console.error('List bulk batches error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch bulk batches');
    }
  }

  /**
   * Sync shipment status from Pathao
   * @param shipmentId - ID of the shipment
   * @returns Updated status
   */
  async syncPathaoStatus(shipmentId: number): Promise<{
    old_status: string;
    new_status: string;
    local_status: string;
  }> {
    try {
      const response = await axiosInstance.get(`/shipments/${shipmentId}/sync-pathao-status`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to sync status');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Sync Pathao status error:', error);
      throw new Error(error.response?.data?.message || 'Failed to sync status');
    }
  }

  /**
   * Bulk sync Pathao status for multiple shipments
   * @param shipmentIds - Optional array of shipment IDs (syncs all if not provided)
   * @returns Results with success and failed lists
   */
  async bulkSyncPathaoStatus(shipmentIds?: number[]): Promise<{
    success: Array<{
      shipment_id: number;
      shipment_number: string;
      old_status: string;
      new_status: string;
    }>;
    failed: Array<{
      shipment_id: number;
      shipment_number: string;
      reason: string;
    }>;
  }> {
    try {
      const payload = shipmentIds ? { shipment_ids: shipmentIds } : {};
      const response = await axiosInstance.post('/shipments/bulk-sync-pathao-status', payload);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to bulk sync status');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Bulk sync status error:', error);
      throw new Error(error.response?.data?.message || 'Failed to bulk sync status');
    }
  }

  /**
   * Get all shipments with filters
   * @param params - Filter parameters
   * @returns Paginated shipments
   */
  async getAll(params?: {
    status?: string;
    store_id?: number;
    customer_id?: number;
    order_id?: number;
    delivery_type?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    pending_pathao?: boolean;
    per_page?: number;
    page?: number;
  }): Promise<{
    data: Shipment[];
    total: number;
    current_page: number;
    last_page: number;
  }> {
    try {
      const response = await axiosInstance.get('/shipments', { params });
      const result = response.data;

      if (result.success) {
        return {
          data: result.data.data || [],
          total: result.data.total || 0,
          current_page: result.data.current_page || 1,
          last_page: result.data.last_page || 1,
        };
      }

      return { data: [], total: 0, current_page: 1, last_page: 1 };
    } catch (error: any) {
      console.error('Get shipments error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch shipments');
    }
  }

  /**
   * Get single shipment by ID
   * @param id - Shipment ID
   * @returns Shipment details
   */
  async getById(id: number): Promise<{
    shipment: Shipment;
    products: any[];
    pickup_address_formatted: string;
    delivery_address_formatted: string;
    package_description: string;
  }> {
    try {
      const response = await axiosInstance.get(`/shipments/${id}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch shipment');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get shipment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch shipment');
    }
  }

  /**
   * Cancel shipment
   * @param shipmentId - ID of the shipment
   * @param reason - Cancellation reason
   * @returns Updated shipment
   */
  async cancel(shipmentId: number, reason?: string): Promise<Shipment> {
    try {
      const response = await axiosInstance.patch(`/shipments/${shipmentId}/cancel`, { reason });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to cancel shipment');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Cancel shipment error:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel shipment');
    }
  }

  /**
   * Get shipment statistics
   * @param storeId - Optional store ID filter
   * @returns Shipment statistics
   */
  async getStatistics(storeId?: number): Promise<ShipmentStatistics> {
    try {
      const params = storeId ? { store_id: storeId } : {};
      const response = await axiosInstance.get('/shipments/statistics', { params });
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch statistics');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get shipment statistics error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch statistics');
    }
  }

  /**
   * Get Pathao cities
   * @returns List of cities
   */
  async getPathaoCities(): Promise<PathaoCity[]> {
    try {
      const response = await axiosInstance.get('/shipments/pathao/cities');
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch cities');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get Pathao cities error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch cities');
    }
  }

  /**
   * Get Pathao zones for a city
   * @param cityId - Pathao city ID
   * @returns List of zones
   */
  async getPathaoZones(cityId: number): Promise<PathaoZone[]> {
    try {
      const response = await axiosInstance.get(`/shipments/pathao/zones/${cityId}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch zones');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get Pathao zones error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch zones');
    }
  }

  /**
   * Get Pathao areas for a zone
   * @param zoneId - Pathao zone ID
   * @returns List of areas
   */
  async getPathaoAreas(zoneId: number): Promise<PathaoArea[]> {
    try {
      const response = await axiosInstance.get(`/shipments/pathao/areas/${zoneId}`);
      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch areas');
      }
      
      return result.data;
    } catch (error: any) {
      console.error('Get Pathao areas error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch areas');
    }
  }

  /**
   * Check if order has shipment
   * @param orderId - Order ID
   * @returns Shipment if exists, null otherwise
   */
  async getByOrderId(orderId: number): Promise<Shipment | null> {
    try {
      const response = await axiosInstance.get('/shipments', {
        params: { order_id: orderId }
      });
      const result = response.data;
      
      if (result.success && result.data.data && result.data.data.length > 0) {
        return result.data.data[0];
      }
      
      return null;
    } catch (error: any) {
      console.error('Get shipment by order error:', error);
      return null;
    }
  }
}

export default new ShipmentService();