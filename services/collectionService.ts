import axiosInstance from "@/lib/axios";

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'season' | 'occasion' | 'category' | 'campaign';
  season: 'Spring' | 'Summer' | 'Fall' | 'Winter' | null;
  year: number | null;
  launch_date: string | null;
  end_date: string | null;
  banner_image: string | null;
  thumbnail_image: string | null;
  banner_url: string | null;
  thumbnail_url: string | null;
  status: 'draft' | 'active' | 'archived';
  sort_order: number;
  metadata: any | null;
  created_at: string;
  updated_at: string;
  products_count?: number;
}

const collectionService = {
  getAll: async (params?: any) => {
    const response = await axiosInstance.get('/collections', { params });
    return response.data.data;
  },

  getById: async (id: number) => {
    const response = await axiosInstance.get(`/collections/${id}`);
    return response.data.data;
  },

  create: async (formData: FormData) => {
    const response = await axiosInstance.post('/collections', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  update: async (id: number, formData: FormData) => {
    // Laravel doesn't support Multipart PUT requests natively without a workaround
    // but here we can use POST with _method=PUT or just handle it if the backend supports it.
    // In this codebase, it seems we use POST with Multipart for updates in some places or standard PUT.
    // Let's check how Categories update works.
    const response = await axiosInstance.post(`/collections/${id}?_method=PUT`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  delete: async (id: number) => {
    const response = await axiosInstance.delete(`/collections/${id}`);
    return response.data;
  },

  getProducts: async (id: number, params?: any) => {
    const response = await axiosInstance.get(`/collections/${id}/products`, { params });
    return response.data.data;
  },

  addProducts: async (id: number, productIds: number[]) => {
    const response = await axiosInstance.post(`/collections/${id}/products`, { product_ids: productIds });
    return response.data;
  },

  removeProduct: async (id: number, productId: number) => {
    const response = await axiosInstance.delete(`/collections/${id}/products/${productId}`);
    return response.data;
  },

  reorderProducts: async (id: number, productOrders: { product_id: number, sort_order: number }[]) => {
    const response = await axiosInstance.patch(`/collections/${id}/products/reorder`, { product_orders: productOrders });
    return response.data;
  },

  getStats: async () => {
    const response = await axiosInstance.get('/collections/statistics');
    return response.data.data;
  }
};

export default collectionService;
