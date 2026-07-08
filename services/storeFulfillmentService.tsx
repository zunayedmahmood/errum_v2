import axiosInstance from '@/lib/axios';

export interface AssignedOrder {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  total_amount: string | number;
  created_at: string;
  customer: {
    id: number;
    name: string;
    phone: string;
    email?: string;
  };
  items: OrderItem[];
  fulfillment_progress: {
    total_items: number;
    fulfilled_items: number;
    pending_items: number;
    percentage: number;
    is_complete: boolean;
  };
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: string | number;
  product_barcode_id: number | null;
  scan_status: 'scanned' | 'pending';
  available_barcodes_count: number;
  product: {
    id: number;
    name: string;
    sku: string;
    images?: Array<{ image_url: string }>;
    barcodes?: Array<{
      id: number;
      barcode: string;
      status: string;
      current_store_id: number;
    }>;
  };
  barcode?: {
    id: number;
    barcode: string;
    status: string;
  };
}

export interface OrderDetails {
  order: AssignedOrder;
  fulfillment_status: {
    total_items: number;
    fulfilled_items: number;
    pending_items: number;
    percentage: number;
    is_complete: boolean;
    can_ship: boolean;
  };
}

export interface ScanBarcodePayload {
  barcode: string;
  order_item_id: number;
}

export interface ScanBarcodeResponse {
  order_item: OrderItem;
  scanned_barcode: {
    id: number;
    barcode: string;
    product_id: number;
    batch_id: number;
    current_status: string;
  };
  order_status: string;
  fulfillment_progress: {
    fulfilled_items: number;
    total_items: number;
    percentage: number;
    is_complete: boolean;
  };
}

class StoreFulfillmentService {
  /**
   * Get orders assigned to employee's store
   */
  async getAssignedOrders(params?: {
    status?: string; // 'assigned_to_store' by default
    per_page?: number;
  }): Promise<{
    store: {
      id: number;
      name: string;
      address: string;
    };
    orders: AssignedOrder[];
    pagination: {
      current_page: number;
      total_pages: number;
      per_page: number;
      total: number;
    };
    summary: {
      total_orders: number;
      assigned_to_store_count: number;
      picking_count: number;
      ready_for_shipment_count: number;
    };
  }> {
    try {
      console.log('📦 Fetching assigned orders for store...');
      
      const response = await axiosInstance.get('/store/fulfillment/orders/assigned', {
        params: params || { status: 'assigned_to_store', per_page: 15 }
      });

      console.log('✅ Assigned orders loaded:', response.data.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Failed to fetch assigned orders:', error);
      
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Employee is not assigned to a store');
      }
      
      throw new Error(error.response?.data?.message || 'Failed to fetch assigned orders');
    }
  }

  /**
   * Get specific order details for fulfillment
   */
  async getOrderDetails(orderId: number): Promise<OrderDetails> {
    try {
      console.log('📋 Fetching order details:', orderId);
      
      const response = await axiosInstance.get(`/store/fulfillment/orders/${orderId}`);

      console.log('✅ Order details loaded:', response.data.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Failed to fetch order details:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch order details');
    }
  }

  /**
   * Scan barcode to fulfill order item
   */
  async scanBarcode(orderId: number, payload: ScanBarcodePayload): Promise<ScanBarcodeResponse> {
    try {
      console.log('🔍 Scanning barcode:', { orderId, ...payload });
      
      const response = await axiosInstance.post(
        `/store/fulfillment/orders/${orderId}/scan-barcode`,
        payload
      );

      console.log('✅ Barcode scanned successfully:', response.data.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Barcode scan failed:', error);
      
      // Handle specific error cases
      if (error.response?.status === 422) {
        throw new Error(error.response.data.message || 'Validation failed');
      }
      
      if (error.response?.status === 400) {
        // Item already scanned or barcode mismatch
        throw new Error(error.response.data.message || 'Barcode scan error');
      }
      
      if (error.response?.status === 404) {
        throw new Error('Barcode not found or not available in this store');
      }
      
      throw new Error(error.response?.data?.message || 'Failed to scan barcode');
    }
  }

  /**
   * Mark order as ready for shipment
   */
  async markReadyForShipment(orderId: number): Promise<any> {
    try {
      console.log('📦 Marking order as ready for shipment:', orderId);
      
      const response = await axiosInstance.post(
        `/store/fulfillment/orders/${orderId}/ready-for-shipment`
      );

      console.log('✅ Order marked as ready for shipment:', response.data.data);

      return response.data.data.order;
    } catch (error: any) {
      console.error('❌ Failed to mark as ready for shipment:', error);
      
      if (error.response?.status === 400) {
        throw new Error(error.response.data.message || 'Cannot mark as ready for shipment');
      }
      
      throw new Error(error.response?.data?.message || 'Failed to mark order as ready for shipment');
    }
  }
}

export default new StoreFulfillmentService();