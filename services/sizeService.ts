import axiosInstance from '@/lib/axios';

export interface Size {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export const sizeService = {
  async getSizes(): Promise<Size[]> {
    const response = await axiosInstance.get('/sizes');
    return response.data.data;
  },

  async createSize(name: string): Promise<Size> {
    const response = await axiosInstance.post('/sizes', { name });
    return response.data.data;
  }
};
