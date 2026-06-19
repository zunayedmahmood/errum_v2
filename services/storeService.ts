import axios from '@/lib/axios';

export interface Store {
  id: number;
  name: string;
  address: string;
  pathao_key: string;
  type: string;
  is_online: boolean;
  is_active: boolean;
  is_warehouse: boolean;
  phone?: string;
  email?: string;
  contact_person?: string;
  store_code?: string;
  description?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  capacity?: number | string | null;
  pathao_store_id?: string;
  pathao_contact_name?: string;
  pathao_contact_number?: string;
  pathao_secondary_contact?: string;
  pathao_city_id?: number | null;
  pathao_zone_id?: number | null;
  pathao_area_id?: number | null;
  pathao_registered?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreFormData {
  id?: number;
  name: string;
  address: string;

  /** Pathao store id (numeric) - kept in this UI field */
  pathao_key: string;

  /** Optional store contact info */
  phone?: string;
  email?: string;
  contact_person?: string;
  store_code?: string;
  description?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  capacity?: number | string | null;

  /** Pathao pickup/contact config */
  pathao_contact_name?: string;
  pathao_contact_number?: string;
  pathao_secondary_contact?: string;
  pathao_city_id?: number | null;
  pathao_zone_id?: number | null;
  pathao_area_id?: number | null;
  pathao_registered?: boolean;

  type: string;
  is_online: boolean;
}

class StoreService {
  private blankToNull(value: any) {
    return value === '' || value === undefined ? null : value;
  }

  // Get all stores
  async getStores(params?: {
    is_warehouse?: boolean;
    is_online?: boolean;
    is_active?: boolean;
    type?: string;
    search?: string;
    sort_by?: string;
    sort_direction?: string;
    per_page?: number;
  }, config?: import('axios').AxiosRequestConfig) {
    const response = await axios.get('/stores', { ...config, params });
    return response.data;
  }

  // Get all stores without pagination (convenience for dropdowns etc)
  async getAllStores() {
    const response = await this.getStores({ per_page: 1000, is_active: true });
    // response.data is the paginated object from Laravel, actual items are in .data
    return response.data?.data || [];
  }

  // ✅ Get all warehouse stores
  async getWarehouses() {
    const response = await axios.get('/stores', {
      params: { type: 'warehouse', is_active: true },
    });
    return response.data;
  }

  // Get single store
  async getStore(id: number) {
    const response = await axios.get(`/stores/${id}`);
    return response.data;
  }

  // Create store
  async createStore(data: StoreFormData) {
    const payload = {
      name: data.name,
      address: data.address,

      // Pathao Store ID is stored in `pathao_key` in the UI.
      // Backend expects `pathao_store_id` when creating Pathao orders.
      pathao_key: this.blankToNull(data.pathao_key),
      pathao_store_id: this.blankToNull(data.pathao_key),

      phone: data.phone,
      email: data.email,
      contact_person: data.contact_person,
      store_code: data.store_code,
      description: data.description,
      latitude: this.blankToNull(data.latitude),
      longitude: this.blankToNull(data.longitude),
      capacity: this.blankToNull(data.capacity),

      pathao_contact_name: data.pathao_contact_name,
      pathao_contact_number: data.pathao_contact_number,
      pathao_secondary_contact: data.pathao_secondary_contact,
      pathao_city_id: this.blankToNull(data.pathao_city_id),
      pathao_zone_id: this.blankToNull(data.pathao_zone_id),
      pathao_area_id: this.blankToNull(data.pathao_area_id),
      pathao_registered: data.pathao_registered ?? false,

      is_warehouse: data.type === 'warehouse',
      is_online: data.is_online,
    };
    const response = await axios.post('/stores', payload);
    return response.data;
  }

  // Update store
  async updateStore(id: number, data: StoreFormData) {
    const payload = {
      name: data.name,
      address: data.address,

      // Pathao Store ID is stored in `pathao_key` in the UI.
      // Backend expects `pathao_store_id` when creating Pathao orders.
      pathao_key: this.blankToNull(data.pathao_key),
      pathao_store_id: this.blankToNull(data.pathao_key),

      phone: data.phone,
      email: data.email,
      contact_person: data.contact_person,
      store_code: data.store_code,
      description: data.description,
      latitude: this.blankToNull(data.latitude),
      longitude: this.blankToNull(data.longitude),
      capacity: this.blankToNull(data.capacity),

      pathao_contact_name: data.pathao_contact_name,
      pathao_contact_number: data.pathao_contact_number,
      pathao_secondary_contact: data.pathao_secondary_contact,
      pathao_city_id: this.blankToNull(data.pathao_city_id),
      pathao_zone_id: this.blankToNull(data.pathao_zone_id),
      pathao_area_id: this.blankToNull(data.pathao_area_id),
      pathao_registered: data.pathao_registered ?? false,

      is_warehouse: data.type === 'warehouse',
      is_online: data.is_online,
    };
    const response = await axios.put(`/stores/${id}`, payload);
    return response.data;
  }

  // Delete store
  async deleteStore(id: number) {
    const response = await axios.delete(`/stores/${id}`);
    return response.data;
  }

  // Activate store
  async activateStore(id: number) {
    const response = await axios.patch(`/stores/${id}/activate`);
    return response.data;
  }

  // Deactivate store
  async deactivateStore(id: number) {
    const response = await axios.patch(`/stores/${id}/deactivate`);
    return response.data;
  }

  // Get store statistics
  async getStoreStats() {
    const response = await axios.get('/stores/stats');
    return response.data;
  }

  // Get store inventory
  async getStoreInventory(id: number) {
    const response = await axios.get(`/stores/${id}/inventory`);
    return response.data;
  }
}

export default new StoreService();
