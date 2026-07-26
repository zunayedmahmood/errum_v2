import axiosInstance from '@/lib/axios';

// Types
export interface DefectiveProduct {
  id: number;
  product_barcode_id: number;
  product_id: number;
  store_id: number;
  product_batch_id?: number;
  defect_type: DefectType;
  defect_description: string;
  severity: Severity;
  status: DefectiveStatus;
  original_price: number;
  suggested_selling_price?: number;
  minimum_selling_price?: number;
  actual_selling_price?: number;
  defect_images?: string[];
  identified_at: string;
  identified_by: number;
  inspected_at?: string;
  inspected_by?: number;
  sold_at?: string;
  sold_by?: number;
  order_id?: number;
  vendor_id?: number;
  internal_notes?: string;
  sale_notes?: string;
  disposal_notes?: string;
  vendor_notes?: string;
  returned_at?: string;
  disposed_at?: string;
  created_at: string;
  updated_at: string;
  product?: any;
  barcode?: any;
  batch?: any;
  store?: any;
  identifiedBy?: any;
  inspectedBy?: any;
  soldBy?: any;
  order?: any;
  vendor?: any;
}

export type DefectType = 
  | 'physical_damage'
  | 'malfunction'
  | 'cosmetic'
  | 'missing_parts'
  | 'packaging_damage'
  | 'expired'
  | 'counterfeit'
  | 'other';

export type Severity = 'minor' | 'moderate' | 'major' | 'critical';

export type DefectiveStatus = 
  | 'identified'
  | 'inspected'
  | 'available_for_sale'
  | 'sold'
  | 'disposed'
  | 'returned_to_vendor';

export interface DefectiveProductFilters {
  status?: DefectiveStatus;
  store_id?: number;
  severity?: Severity;
  defect_type?: DefectType;
  from_date?: string;
  to_date?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface MarkDefectiveRequest {
  product_barcode_id: number;
  store_id: number;
  defect_type: DefectType;
  defect_description: string;
  severity: Severity;
  original_price: number;
  product_batch_id?: number;
  is_used_item?: boolean;
  defect_images?: File[];
  internal_notes?: string;
}

export interface InspectRequest {
  severity?: Severity;
  internal_notes?: string;
}

export interface SellDefectiveRequest {
  order_id: number;
  selling_price: number;
  sale_notes?: string;
}

export interface DisposeRequest {
  disposal_notes?: string;
}

export interface ReturnToVendorRequest {
  vendor_id: number;
  vendor_notes?: string;
}

export interface ScanBarcodeRequest {
  barcode: string;
}

export interface DefectiveStatistics {
  total_defective: number;
  by_status: {
    identified: number;
    inspected: number;
    available_for_sale: number;
    sold: number;
    disposed: number;
    returned_to_vendor: number;
  };
  by_severity: {
    minor: number;
    moderate: number;
    major: number;
    critical: number;
  };
  by_defect_type: Array<{
    defect_type: DefectType;
    count: number;
  }>;
  financial_impact: {
    total_original_value: number;
    total_suggested_selling_price: number;
    total_sold_value: number;
    total_loss: number;
  };
}

export interface AvailableForSaleFilters {
  store_id?: number;
  severity?: Severity;
  max_price?: number;
}

export interface ScanBarcodeResponse {
  is_defective: boolean;
  defective_product?: DefectiveProduct;
  can_be_sold?: boolean;
  suggested_price?: number;
  minimum_price?: number;
  discount_percentage?: number;
  barcode?: any;
  product?: any;
}

export interface ImageUploadResponse {
  id: number;
  defect_images: string[];
  image_urls: string[];
}

export interface ImageListResponse {
  id: number;
  images: Array<{
    path: string;
    url: string;
  }>;
  count: number;
}

// Service Class
class DefectiveProductService {
  private basePath = '/defective-products';

  /**
   * Get all defective products with filters and pagination
   */
  async getAll(filters?: DefectiveProductFilters) {
    const response = await axiosInstance.get(this.basePath, { params: filters });
    return response.data;
  }

  /**
   * Get a specific defective product by ID
   */
  async getById(id: number) {
    const response = await axiosInstance.get(`${this.basePath}/${id}`);
    return response.data;
  }

  /**
   * Mark a product barcode as defective
   */
  async markAsDefective(data: MarkDefectiveRequest) {
    const formData = new FormData();
    
    // Append all required fields
    formData.append('product_barcode_id', data.product_barcode_id.toString());
    formData.append('store_id', data.store_id.toString());
    formData.append('defect_type', data.defect_type);
    formData.append('defect_description', data.defect_description);
    formData.append('severity', data.severity);
    formData.append('original_price', data.original_price.toString());
    
    // Append optional fields
    if (data.product_batch_id) {
      formData.append('product_batch_id', data.product_batch_id.toString());
    }
    
    if (data.internal_notes) {
      formData.append('internal_notes', data.internal_notes);
    }

    if (typeof data.is_used_item === 'boolean') {
      formData.append('is_used_item', data.is_used_item ? '1' : '0');
    }
    
    // Append images if present
    if (data.defect_images && data.defect_images.length > 0) {
      data.defect_images.forEach((image, index) => {
        formData.append(`defect_images[${index}]`, image);
      });
    }
    
    const response = await axiosInstance.post(
      `${this.basePath}/mark-defective`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  }

  /**
   * Inspect a defective product
   */
  async inspect(id: number, data: InspectRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/inspect`, data);
    return response.data;
  }

  /**
   * Make defective product available for sale
   */
  async makeAvailableForSale(id: number) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/make-available`);
    return response.data;
  }

  /**
   * Sell a defective product
   */
  async sell(id: number, data: SellDefectiveRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/sell`, data);
    return response.data;
  }

  /**
   * Dispose a defective product
   */
  async dispose(id: number, data?: DisposeRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/dispose`, data || {});
    return response.data;
  }

  /**
   * Unmark used item status on barcode
   */
  async unmarkUsed(id: number) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/unmark-used`);
    return response.data;
  }

  /**
   * Unmark defective status on barcode and restore to active stock
   */
  async unmarkDefective(id: number) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/unmark-defective`);
    return response.data;
  }

  /**
   * Return defective product to vendor
   */
  async returnToVendor(id: number, data: ReturnToVendorRequest) {
    const response = await axiosInstance.post(`${this.basePath}/${id}/return-to-vendor`, data);
    return response.data;
  }

  /**
   * Get defective products available for sale
   */
  async getAvailableForSale(filters?: AvailableForSaleFilters) {
    const response = await axiosInstance.get(`${this.basePath}/available-for-sale`, {
      params: filters,
    });
    return response.data;
  }

  /**
   * Get statistics for defective products
   */
  async getStatistics(filters?: {
    from_date?: string;
    to_date?: string;
    store_id?: number;
  }) {
    const response = await axiosInstance.get(`${this.basePath}/statistics`, {
      params: filters,
    });
    return response.data;
  }

  /**
   * Scan barcode and get defective product info
   */
  async scanBarcode(data: ScanBarcodeRequest) {
    const response = await axiosInstance.post(`${this.basePath}/scan`, data);
    return response.data;
  }

  /**
   * Upload additional images for a defective product
   */
  async uploadImages(id: number, images: File[]) {
    const formData = new FormData();
    
    images.forEach((image, index) => {
      formData.append(`images[${index}]`, image);
    });
    
    const response = await axiosInstance.post<{ success: boolean; data: ImageUploadResponse }>(
      `${this.basePath}/${id}/images`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  }

  /**
   * Get images for a defective product
   */
  async getImages(id: number) {
    const response = await axiosInstance.get<{ success: boolean; data: ImageListResponse }>(
      `${this.basePath}/${id}/images`
    );
    return response.data;
  }

  /**
   * Delete an image from defective product
   */
  async deleteImage(id: number, imagePath: string) {
    const response = await axiosInstance.delete(
      `${this.basePath}/${id}/images`,
      {
        data: { image_path: imagePath },
      }
    );
    return response.data;
  }
}

// Export singleton instance
export const defectiveProductService = new DefectiveProductService();

// Export default
export default defectiveProductService;