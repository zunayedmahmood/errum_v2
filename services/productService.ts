// services/productService.ts (Updated)
import axiosInstance from '@/lib/axios';

export interface Product {
  id: number;
  name: string; // display name (auto-computed server-side)
  sku: string;
  base_name?: string; // editable base name
  variation_suffix?: string; // e.g. "-red-30"
  description?: string;
  category_id: number;
  vendor_id: number;
  is_archived: boolean;
  custom_fields?: CustomField[];
  images?: ProductImage[];
  /** Gallery-safe images (SKU-core fallback merged with variant image) */
  display_images?: ProductImage[];
  variants?: any[]; // Product variants
  category?: {
    id: number;
    title: string;
  };
  vendor?: {
    id: number;
    name: string;
  };
  selling_price?: number;
  base_price?: number; // alias for selling_price
  global_available?: number; // total available from reserved_products
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  field_id: number;
  field_title: string;
  field_type: string;
  value: any;
  raw_value: string;
}

export interface ProductImage {
  id: number;
  product_id: number;
  image_path: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Field {
  id: number;
  title: string;
  type: string;
  description?: string;
  is_required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

export interface ForceDeleteSummary {
  product_id: number;
  product_name?: string;
  product_sku?: string;
  deleted_at?: string;
  // Any other counters returned by backend (batches_deleted, barcodes_deleted, etc.)
  [key: string]: any;
}

export interface ForceDeleteResponse {
  success: boolean;
  message: string;
  data: ForceDeleteSummary;
}

export interface CreateProductData {
  // Backward compatible: you may send `name` only.
  // Recommended for variations: send `base_name` + `variation_suffix` and the backend computes `name`.
  name?: string;
  /** Optional: backend will auto-generate (9-digit) if omitted/null/empty */
  sku?: string | null;
  base_name?: string;
  variation_suffix?: string;
  description?: string;
  category_id: number;
  vendor_id: number;
  custom_fields?: {
    field_id: number;
    value: any;
  }[];
}

export interface SkuGroupResponse {
  sku: string;
  base_name: string;
  total_variations: number;
  products: Product[];
}

export interface UpdateCommonInfoRequest {
  base_name: string;
  description?: string;
  category_id?: number;
  vendor_id?: number;
  brand?: string;
}

export interface CreateProductWithVariantsData extends CreateProductData {
  use_variants: boolean;
  variant_attributes?: Record<string, string[]>; // e.g., { Color: ["Red", "Blue"], Size: ["S", "M"] }
  base_price_adjustment?: number;
}

// Helper to normalize API response
function transformProduct(product: any): Product {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    base_name: product.base_name,
    variation_suffix: product.variation_suffix,
    description: product.description,
    category_id: product.category_id,
    vendor_id: product.vendor_id,
    is_archived: product.is_archived,
    custom_fields: product.custom_fields,
    images: product.images,
    display_images: product.display_images,
    variants: product.variants,
    category: product.category,
    vendor: product.vendor,
    selling_price: product.selling_price || product.base_price,
    base_price: product.base_price || product.selling_price,
    global_available: product.global_available,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

// Unwrap common backend response shapes safely
function unwrapData(result: any): any {
  // Typical shapes:
  // 1) { success: true, data: {...} }
  // 2) { success: true, data: { data: {...} } }
  // 3) { data: {...} }
  // 4) direct payload
  let cur = result;

  // Strip top-level {success, message}
  if (cur && typeof cur === 'object' && 'success' in cur && 'data' in cur) {
    cur = (cur as any).data;
  }

  // Drill into nested data a couple times if present
  for (let i = 0; i < 2; i++) {
    if (cur && typeof cur === 'object' && 'data' in cur && (cur as any).data) {
      cur = (cur as any).data;
      continue;
    }
    break;
  }
  return cur;
}

export const productService = {
  /** Get all products (with optional filters and pagination) */
  async getAll(params?: {
    page?: number;
    per_page?: number;
    category_id?: number;
    vendor_id?: number;
    search?: string;
    sort_by?: string;
    sort_direction?: 'asc' | 'desc';
    /** Proposal 1: return SKU-grouped response instead of flat variant rows */
    group_by_sku?: boolean;
    /** Proposal 2: server-side price filter (BDT) */
    min_price?: number;
    max_price?: number;
    /** NEW: stock status filter */
    stock_status?: 'all' | 'in_stock' | 'not_in_stock';
    in_stock?: string;
  }): Promise<{ data: Product[]; total: number; current_page: number; last_page: number }> {
    try {
      // Prefer employee-scoped endpoints when available; fallback keeps backward compatibility.
      let response;
      try {
        response = await axiosInstance.get('/products', { params });
      } catch (e: any) {
        if (e?.response?.status === 404) {
          response = await axiosInstance.get('/products', { params });
        } else {
          throw e;
        }
      }
      const result = response.data;

      if (!result?.success) {
        return { data: [], total: 0, current_page: 1, last_page: 1 };
      }

      // ✅ Support multiple backend response shapes:
      // 1) { success, data: { products: [...], pagination: {...} } }
      // 2) { success, data: { data: [...], total, current_page, last_page } } (Laravel paginator)
      // 3) { success, data: [...] }
      const dataRoot = result.data ?? {};

      const rawList: any[] = Array.isArray(dataRoot.products)
        ? dataRoot.products
        : Array.isArray(dataRoot.data)
          ? dataRoot.data
          : Array.isArray(dataRoot)
            ? dataRoot
            : [];

      const products = rawList.map(transformProduct);

      // Pagination (new shape — used by Proposal 1 grouped endpoint)
      const pagination = dataRoot.pagination;
      if (pagination) {
        return {
          data: products,
          total: pagination.total ?? products.length,
          current_page: pagination.current_page ?? 1,
          // Some backends use `last_page`, others use `total_pages` — support both
          last_page: pagination.last_page ?? pagination.total_pages ?? 1,
        };
      }

      // Pagination (Laravel-like)
      return {
        data: products,
        total: dataRoot.total ?? products.length,
        current_page: dataRoot.current_page ?? 1,
        last_page: dataRoot.last_page ?? 1,
      };
    } catch (error: any) {
      console.error('Get products error:', error);
      return { data: [], total: 0, current_page: 1, last_page: 1 };
    }
  },

  /**
   * Proposal 5 — Wire the advanced search controller.
   * Uses ProductSearchController (fuzzy, Bangla, phonetic) when a query is present.
   * Falls back gracefully: if the endpoint is unavailable, the caller should use getAll().
   */
  async advancedSearch(params: {
    query: string;
    category_id?: number;
    vendor_id?: number;
    per_page?: number;
    page?: number;
    enable_fuzzy?: boolean;
    stock_status?: 'all' | 'in_stock' | 'not_in_stock';
    in_stock?: string;
  }): Promise<{ data: Product[]; total: number; current_page: number; last_page: number }> {
    try {
      const response = await axiosInstance.post('/products/advanced-search', params);
      const result = response.data;
      if (!result?.success) return { data: [], total: 0, current_page: 1, last_page: 1 };

      const dataRoot = result.data ?? {};
      const rawList: any[] = Array.isArray(dataRoot.items)
        ? dataRoot.items
        : Array.isArray(dataRoot.products)
          ? dataRoot.products
          : Array.isArray(dataRoot.data)
            ? dataRoot.data
            : [];

      const products = rawList.map(transformProduct);
      const pagination = dataRoot.pagination ?? dataRoot;
      return {
        data: products,
        total: pagination.total ?? products.length,
        current_page: pagination.current_page ?? 1,
        last_page: pagination.last_page ?? pagination.total_pages ?? 1,
      };
    } catch (error: any) {
      console.error('Advanced search error:', error);
      // Surface as a typed error so caller can fall back to getAll
      throw error;
    }
  },

  /** Get single product by ID */
  async getById(id: number | string): Promise<Product> {
    try {
      let response;
      try {
        response = await axiosInstance.get(`/products/${id}`);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          response = await axiosInstance.get(`/products/${id}`);
        } else {
          throw e;
        }
      }
      const result = response.data;
      const product = result.data || result;
      return transformProduct(product);
    } catch (error: any) {
      console.error('Get product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch product');
    }
  },

  /**
   * Get all products that share the same SKU as this product (SKU group / variations group)
   * API: GET /api/products/{id}/sku-group
   */
  async getSkuGroup(id: number | string): Promise<SkuGroupResponse> {
    try {
      let response;
      try {
        response = await axiosInstance.get(`/products/${id}/sku-group`);
      } catch (e: any) {
        // Some deployments may expose this without the /employee prefix
        if (e?.response?.status === 404) {
          response = await axiosInstance.get(`/products/${id}/sku-group`);
        } else {
          throw e;
        }
      }

      const payload = unwrapData(response.data);

      const productsRaw: any[] = Array.isArray(payload?.products)
        ? payload.products
        : Array.isArray(payload?.data?.products)
          ? payload.data.products
          : [];

      const baseName = payload?.base_name ?? payload?.data?.base_name ?? '';
      const sku = payload?.sku ?? payload?.data?.sku ?? '';
      const total = payload?.total_variations ?? payload?.data?.total_variations ?? productsRaw.length ?? 0;
      return {
        sku: String(sku || ''),
        base_name: String(baseName || ''),
        total_variations: Number(total || 0),
        products: productsRaw.map(transformProduct),
      };
    } catch (error: any) {
      console.error('Get SKU group error:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch SKU group');
    }
  },

  /**
   * Magic common edit: update base_name (and optional common fields) for ALL products in a SKU group
   * API: PUT /api/products/{id}/common-info
   */
  async updateCommonInfo(id: number | string, data: UpdateCommonInfoRequest): Promise<any> {
    try {
      let response;
      try {
        response = await axiosInstance.put(`/products/${id}/common-info`, data, {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        if (e?.response?.status === 404) {
          response = await axiosInstance.put(`/products/${id}/common-info`, data, {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          throw e;
        }
      }
      return response.data;
    } catch (error: any) {
      console.error('Update common info error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update common info');
    }
  },

  /** Create product (simple or with variants) */
  async create(data: CreateProductData | CreateProductWithVariantsData): Promise<Product> {
    try {
      let response;
      try {
        response = await axiosInstance.post('/products', data, {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        if (e?.response?.status === 404) {
          response = await axiosInstance.post('/products', data, {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          throw e;
        }
      }
      const result = response.data;
      return transformProduct(result.data || result);
    } catch (error: any) {
      console.error('Create product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create product');
    }
  },

  /** Create product with variant matrix */
  async createWithVariants(
    productData: CreateProductData,
    variantAttributes: Record<string, string[]>,
    options?: {
      base_price_adjustment?: number;
      image_url?: string;
    }
  ): Promise<{ product: Product; variants: any[] }> {
    try {
      // Step 1: Create base product
      const product = await this.create(productData);

      // Step 2: Generate variant matrix
      const variantService = await import('./productVariantService');
      const variants = await variantService.default.generateMatrix(product.id, {
        attributes: variantAttributes,
        base_price_adjustment: options?.base_price_adjustment,
      });

      return { product, variants };
    } catch (error: any) {
      console.error('Create product with variants error:', error);
      throw new Error(error.response?.data?.message || 'Failed to create product with variants');
    }
  },

  /** Update product by ID */
  async update(id: number | string, data: Partial<CreateProductData>): Promise<Product> {
    try {
      let response;
      try {
        response = await axiosInstance.put(`/products/${id}`, data, {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e: any) {
        if (e?.response?.status === 404) {
          response = await axiosInstance.put(`/products/${id}`, data, {
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          throw e;
        }
      }
      const result = response.data;
      return transformProduct(result.data || result);
    } catch (error: any) {
      console.error('Update product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to update product');
    }
  },

  /** Delete product */
  async delete(id: number | string): Promise<void> {
    try {
      await axiosInstance.delete(`/products/${id}`);
    } catch (error: any) {
      console.error('Delete product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete product');
    }
  },


  /**
   * Force delete product and ALL related data (Admin only)
   * Backend spec: DELETE /api/employee/products/{id}/force-delete
   */
  async forceDelete(id: number | string): Promise<ForceDeleteResponse> {
    const candidates = [
      `/employee/products/${id}/force-delete`,
      `/products/${id}/force-delete`, // fallback for deployments without /employee prefix
    ];

    let lastErr: any = null;

    for (const url of candidates) {
      try {
        const res = await axiosInstance.delete(url);
        return res.data as ForceDeleteResponse;
      } catch (e: any) {
        lastErr = e;
        // Try next candidate only if endpoint not found
        if (e?.response?.status === 404) continue;

        console.error('Force delete product error:', e);
        throw new Error(e?.response?.data?.message || 'Failed to force delete product');
      }
    }

    console.error('Force delete endpoint not found:', candidates);
    throw new Error(lastErr?.response?.data?.message || 'Force delete endpoint not found');
  },

  /** Archive product */
  async archive(id: number | string): Promise<void> {
    try {
      await axiosInstance.patch(`/products/${id}/archive`);
    } catch (error: any) {
      console.error('Archive product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to archive product');
    }
  },

  /** Restore archived product */
  async restore(id: number | string): Promise<void> {
    try {
      await axiosInstance.patch(`/products/${id}/restore`);
    } catch (error: any) {
      console.error('Restore product error:', error);
      throw new Error(error.response?.data?.message || 'Failed to restore product');
    }
  },

  /** Fetch available product fields */
  async getAvailableFields(): Promise<Field[]> {
    try {
      const response = await axiosInstance.get('/products/available-fields');
      const result = response.data;
      return result.data || [];
    } catch (error: any) {
      console.error('Get fields error:', error);
      return [];
    }
  },

  /** Upload single image and return URL */
  async uploadImage(file: File): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axiosInstance.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result = response.data;
      return result.url || result.path || '';
    } catch (error: any) {
      console.error('Upload image error:', error);
      throw new Error(error.response?.data?.message || 'Failed to upload image');
    }
  },

  /** Add image to product */
  async addProductImage(
    productId: number,
    imageData: { image_path: string; is_primary: boolean; order: number }
  ): Promise<void> {
    try {
      await axiosInstance.post(`/products/${productId}/images`, imageData);
    } catch (error: any) {
      console.error('Add product image error:', error);
      throw new Error(error.response?.data?.message || 'Failed to add product image');
    }
  },

  /** Bulk update products */
  async bulkUpdate(data: {
    product_ids: number[];
    action: 'archive' | 'restore' | 'update_category' | 'update_vendor';
    category_id?: number;
    vendor_id?: number;
  }): Promise<{ message: string }> {
    try {
      const response = await axiosInstance.post('/products/bulk-update', data);
      const result = response.data;
      return { message: result.message || 'Bulk update successful' };
    } catch (error: any) {
      console.error('Bulk update error:', error);
      throw new Error(error.response?.data?.message || 'Failed to bulk update products');
    }
  },

  /** Get product statistics */
  async getStatistics(params?: { from_date?: string; to_date?: string }): Promise<any> {
    try {
      const response = await axiosInstance.get('/products/statistics', { params });
      const result = response.data;
      return result.data || {};
    } catch (error: any) {
      console.error('Get statistics error:', error);
      return {};
    }
  },

  /** Search products by custom field */
  async searchByCustomField(params: {
    field_id: number;
    value: any;
    operator?: '=' | 'like' | '>' | '<' | '>=' | '<=';
    per_page?: number;
  }): Promise<{ data: Product[]; total: number }> {
    try {
      const response = await axiosInstance.get('/products/search-by-field', { params });
      const result = response.data;

      if (result.success) {
        const products = (result.data.data || result.data || []).map(transformProduct);
        return {
          data: products,
          total: result.data.total || products.length,
        };
      }

      return { data: [], total: 0 };
    } catch (error: any) {
      console.error('Search by custom field error:', error);
      return { data: [], total: 0 };
    }
  },
};

export default productService;