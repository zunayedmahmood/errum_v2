import axios from '@/lib/axios';
import { ApiResponse, PaginatedResponse } from './api.types';

export interface BarcodeInfo {
  id: number;
  barcode: string;
  type: string;
  is_primary: boolean;
  is_active: boolean;
  formatted?: string;
  current_location?: string;
  movement_count?: number;
  generated_at?: string;
}

export interface ProductInfo {
  id: number;
  name: string;
  sku: string;
  description?: string;
  selling_price?: number;
  price?: number;
  category?: {
    id: number;
    name: string;
  };
  vendor?: {
    id: number;
    name: string;
  };
}

export interface LocationInfo {
  id: number;
  name: string;
  address?: string;
  phone?: string;
}

export interface BatchInfo {
  id: number;
  batch_number: string;
  quantity?: number;
  quantity_available?: number;
  cost_price?: string;
  sell_price?: string;
  status?: string;
  expiry_date?: string;
}

export interface MovementInfo {
  type: string;
  from?: string;
  to?: string;
  date: string;
  quantity: number;
}

export interface DefectiveResaleInfo {
  is_resale: boolean;
  defective_product_id: number;
  status?: string;
  suggested_selling_price?: number | string | null;
  minimum_selling_price?: number | string | null;
  resale_batch_id?: number | null;
  original_batch_id?: number | null;
  is_used_item?: boolean;
}

export interface ScanResult {
  barcode_id?: number;
  barcode: string;
  barcode_type: string;
  product: ProductInfo;
  current_location: LocationInfo | null;
  current_batch: BatchInfo | null;
  is_available: boolean;
  quantity_available: number;
  last_movement: MovementInfo | null;
  defective_resale?: DefectiveResaleInfo | null;
}

export interface GenerateBarcodePayload {
  product_id: number;
  type?: 'CODE128' | 'EAN13' | 'QR';
  make_primary?: boolean;
  quantity?: number;
}

export interface BarcodeFilters {
  product_id?: number;
  type?: string;
  is_active?: boolean;
  is_primary?: boolean;
  search?: string;
  per_page?: number;
}

export interface BatchScanResult {
  barcode: string;
  found: boolean;
  product_name?: string;
  current_location?: string;
  quantity_available?: number;
  message?: string;
}

export class BarcodeService {
  private readonly endpoint = '/barcodes';

  /**
   * Scan a barcode and get complete product information
   */
  async scanBarcode(barcode: string): Promise<ApiResponse<ScanResult>> {
    const response = await axios.post(`${this.endpoint}/scan`, { barcode });
    return response.data;
  }

  /**
   * Get barcode location history
   */
  async getBarcodeHistory(barcode: string): Promise<ApiResponse<{
    barcode: string;
    product: ProductInfo;
    movement_count: number;
    history: any[];
  }>> {
    const response = await axios.get(`${this.endpoint}/${barcode}/history`);
    return response.data;
  }

  /**
   * Get current location of a barcode
   */
  async getCurrentLocation(barcode: string): Promise<ApiResponse<{
    barcode: string;
    product: ProductInfo;
    current_location: LocationInfo | null;
    current_batch: BatchInfo | null;
  }>> {
    const response = await axios.get(`${this.endpoint}/${barcode}/location`);
    return response.data;
  }

  /**
   * List all barcodes with filters
   */
  async getBarcodes(filters?: BarcodeFilters): Promise<PaginatedResponse<BarcodeInfo>> {
    const response = await axios.get(this.endpoint, { params: filters });
    return response.data;
  }

  /**
   * Generate new barcode for a product
   */
  async generateBarcode(payload: GenerateBarcodePayload): Promise<ApiResponse<{
    product: ProductInfo;
    barcodes: BarcodeInfo[];
  }>> {
    const response = await axios.post(`${this.endpoint}/generate`, payload);
    return response.data;
  }

  /**
   * Get barcodes for a specific product
   */
  async getProductBarcodes(productId: number): Promise<ApiResponse<{
    product: ProductInfo;
    barcode_count: number;
    barcodes: BarcodeInfo[];
  }>> {
    const response = await axios.get(`/products/${productId}/barcodes`);
    return response.data;
  }

  /**
   * Make a barcode primary for its product
   */
  async makePrimary(barcodeId: number): Promise<ApiResponse<{
    barcode: string;
    product_id: number;
    is_primary: boolean;
  }>> {
    const response = await axios.patch(`${this.endpoint}/${barcodeId}/make-primary`);
    return response.data;
  }

  /**
   * Deactivate a barcode
   */
  async deactivateBarcode(barcodeId: number): Promise<ApiResponse<{ message: string }>> {
    const response = await axios.delete(`${this.endpoint}/${barcodeId}`);
    return response.data;
  }

  /**
   * Batch scan multiple barcodes
   */
  async batchScan(barcodes: string[]): Promise<ApiResponse<{
    total_scanned: number;
    found: number;
    not_found: number;
    results: BatchScanResult[];
  }>> {
    const response = await axios.post(`${this.endpoint}/batch-scan`, { barcodes });
    return response.data;
  }
}

export default new BarcodeService();