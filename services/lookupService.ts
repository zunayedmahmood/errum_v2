import axios from '@/lib/axios';

// Minimal Lookup API wrapper (extendable)
export type LookupApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  errors?: any;
};

export type LookupOrder = any; // Keep flexible; backend may evolve.

const lookupService = {
  basePath: '/lookup',
  
  async getOrder(orderId: number): Promise<LookupApiResponse<LookupOrder>> {
    const res = await axios.get(`${this.basePath}/order/${orderId}`);
    return res.data;
  },

  async getOrderByNumber(orderNumber: string): Promise<LookupApiResponse<LookupOrder>> {
    const res = await axios.get(`${this.basePath}/order-number/${encodeURIComponent(orderNumber)}`);
    return res.data;
  },

  async getProductByBarcode(barcode: string): Promise<LookupApiResponse<any>> {
    const res = await axios.get(`${this.basePath}/product`, {
      params: { barcode },
    });
    return res.data;
  },
};

export default lookupService;
