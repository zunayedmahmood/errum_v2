// services/productImageService.ts
import axiosInstance from '@/lib/axios';

export interface ProductImage {
  id: number;
  product_id: number;
  image_path: string;
  image_url: string;
  alt_text?: string;
  is_primary: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImageStatistics {
  product_id: number;
  product_name: string;
  total_images: number;
  active_images: number;
  inactive_images: number;
  has_primary: boolean;
  primary_image_id?: number;
  total_storage_bytes: number;
  total_storage_mb: number;
}

class ProductImageService {
  private baseUrl = '/products';

  /**
   * Get all images for a product
   */
  async getProductImages(productId: number): Promise<ProductImage[]> {
    try {
      const response = await axiosInstance.get(`${this.baseUrl}/${productId}/images`);
      const result = response.data;
      return result.data || [];
    } catch (error: any) {
      console.error('Get product images error:', error);
      return [];
    }
  }

  /**
   * Get single image by ID
   */
  async getImageById(imageId: number): Promise<ProductImage | null> {
    try {
      const response = await axiosInstance.get(`/product-images/${imageId}`);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Get image error:', error);
      return null;
    }
  }

  /**
   * Get primary image for a product
   */
  async getPrimaryImage(productId: number): Promise<ProductImage | null> {
    try {
      const response = await axiosInstance.get(`${this.baseUrl}/${productId}/images/primary`);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Get primary image error:', error);
      return null;
    }
  }

  /**
   * Upload single image
   */
  async uploadImage(
    productId: number,
    file: File,
    options?: {
      alt_text?: string;
      is_primary?: boolean;
      sort_order?: number;
    }
  ): Promise<ProductImage> {
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      if (options?.alt_text) {
        formData.append('alt_text', options.alt_text);
      }
      
      // Convert boolean to '1' or '0' for Laravel validation
      if (options?.is_primary !== undefined) {
        formData.append('is_primary', options.is_primary ? '1' : '0');
      }
      
      if (options?.sort_order !== undefined) {
        formData.append('sort_order', String(options.sort_order));
      }

      const response = await axiosInstance.post(
        `${this.baseUrl}/${productId}/images`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Upload image error:', error);
      throw new Error(error.response?.data?.message || 'Failed to upload image');
    }
  }

  /**
   * Upload multiple images at once
   */
  async bulkUpload(
    productId: number,
    files: File[],
    altTexts?: string[]
  ): Promise<ProductImage[]> {
    try {
      const formData = new FormData();
      
      files.forEach((file) => {
        formData.append('images[]', file);
      });
      
      if (altTexts && altTexts.length > 0) {
        altTexts.forEach((text) => {
          formData.append('alt_texts[]', text);
        });
      }

      const response = await axiosInstance.post(
        `${this.baseUrl}/${productId}/images/bulk-upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const result = response.data;
      return result.data || [];
    } catch (error: any) {
      console.error('Bulk upload error:', error);
      throw new Error(error.response?.data?.message || 'Failed to upload images');
    }
  }

  /**
   * Update image details (alt text, sort order, active status)
   */
  async updateImage(
    imageId: number,
    data: {
      alt_text?: string;
      sort_order?: number;
      is_active?: boolean;
    }
  ): Promise<ProductImage> {
    try {
      const response = await axiosInstance.put(`/product-images/${imageId}`, data);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Update image error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update image');
    }
  }

  /**
   * Set image as primary
   */
  async makePrimary(imageId: number): Promise<ProductImage> {
    try {
      const response = await axiosInstance.patch(`/product-images/${imageId}/make-primary`);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Make primary error:', error);
      throw new Error(error.response?.data?.message || 'Failed to set primary image');
    }
  }

  /**
   * Toggle image active status
   */
  async toggleActive(imageId: number): Promise<ProductImage> {
    try {
      const response = await axiosInstance.patch(`/product-images/${imageId}/toggle-active`);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Toggle active error:', error);
      throw new Error(error.response?.data?.message || 'Failed to toggle image status');
    }
  }

  /**
   * Reorder images
   */
  async reorderImages(
    productId: number,
    imageOrders: Array<{ image_id: number; sort_order: number }>
  ): Promise<ProductImage[]> {
    try {
      const response = await axiosInstance.patch(
        `${this.baseUrl}/${productId}/images/reorder`,
        { image_orders: imageOrders }
      );
      const result = response.data;
      return result.data || [];
    } catch (error: any) {
      console.error('Reorder images error:', error);
      throw new Error(error.response?.data?.message || 'Failed to reorder images');
    }
  }

  /**
   * Delete single image
   */
  async deleteImage(imageId: number): Promise<void> {
    try {
      await axiosInstance.delete(`/product-images/${imageId}`);
    } catch (error: any) {
      console.error('Delete image error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete image');
    }
  }

  /**
   * Delete all images for a product
   */
  async deleteAllImages(productId: number): Promise<{ deleted_count: number }> {
    try {
      const response = await axiosInstance.delete(`${this.baseUrl}/${productId}/images/delete-all`);
      const result = response.data;
      return { deleted_count: result.deleted_count || 0 };
    } catch (error: any) {
      console.error('Delete all images error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete all images');
    }
  }

  /**
   * Sync images for an entire SKU group.
   *
   * Clears ALL images from ALL variants sharing the same SKU, then uploads
   * the provided files (in order) and assigns each to every variant.
   * `primaryIndex` (default 0) controls which uploaded image becomes the primary.
   *
   * This call wraps everything in a DB transaction on the backend —
   * either all variants are updated or none are.
   *
   * POST /api/products/{productId}/sync-sku-images
   */
  async syncSkuImages(
    productId: number,
    files: File[],
    existingPaths: string[] = [],
    primaryIndex = 0
  ): Promise<{
    success: boolean;
    message: string;
    variants_updated: number;
    images_synced: number;
  }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('images[]', file));
    existingPaths.forEach((path) => formData.append('existing_paths[]', path));
    formData.append('primary_index', String(primaryIndex));

    const response = await axiosInstance.post(
      `${this.baseUrl}/${productId}/sync-sku-images`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  }

  /**
   * Get image statistics
   */
  async getStatistics(productId: number): Promise<ImageStatistics> {
    try {
      const response = await axiosInstance.get(`${this.baseUrl}/${productId}/images/statistics`);
      const result = response.data;
      return result.data;
    } catch (error: any) {
      console.error('Get statistics error:', error);
      return {
        product_id: productId,
        product_name: '',
        total_images: 0,
        active_images: 0,
        inactive_images: 0,
        has_primary: false,
        total_storage_bytes: 0,
        total_storage_mb: 0,
      };
    }
  }

  /**
   * Validate image file
   */
  validateImageFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.',
      };
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File too large. Maximum size is 5MB.',
      };
    }

    return { valid: true };
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Create image preview URL from File
   */
  createPreviewUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  /**
   * Revoke preview URL to free memory
   */
  revokePreviewUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}

// Export singleton instance
const productImageService = new ProductImageService();
export default productImageService;