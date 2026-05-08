import axiosInstance from '@/lib/axios';

export interface ShowcaseCategory {
  category_id: number;
  subcategories: number[];
}

export interface HomepageSettings {
  ticker: {
    enabled: boolean;
    mode: 'static' | 'moving';
    phrases: string[];
  };
  hero: {
    images: { url: string; path?: string }[];
    title: string;
    show_title: boolean;
  };
  collections: {
    id: number;
    title?: string;
    subtitle: string;
    image?: string;
    href?: string;
  }[];
  showcase?: ShowcaseCategory[];
}

class SettingsService {
  /**
   * Get homepage settings for public display
   */
  async getHomepageSettings(): Promise<HomepageSettings> {
    const response = await axiosInstance.get('/catalog/homepage-settings');
    return response.data;
  }

  /**
   * Get homepage settings for admin panel
   */
  async getAdminHomepageSettings(): Promise<HomepageSettings> {
    const response = await axiosInstance.get('/settings/homepage');
    return response.data;
  }

  /**
   * Update homepage settings (admin)
   */
  async updateHomepageSettings(data: FormData): Promise<{ message: string }> {
    const response = await axiosInstance.post('/settings/homepage', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
}

const settingsService = new SettingsService();
export default settingsService;
