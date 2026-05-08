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
    background_color?: string;
    text_color?: string;
    speed?: number;
  };
  hero: {
    images: { url: string; path?: string }[];
    title: string;
    show_title: boolean;
    slideshow_enabled?: boolean;
    autoplay_speed?: number;
  };
  collections: {
    id: number;
    title?: string;
    subtitle: string;
    image?: string;
    href?: string;
  }[];
  showcase?: ShowcaseCategory[];
  new_arrivals?: {
    enabled: boolean;
    product_ids: number[];
    products?: any[]; // For storefront display
  };
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
