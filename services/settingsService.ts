import axiosInstance from '@/lib/axios';
import { EcommerceTheme } from '@/lib/ecommerceDesignSystem';

export interface ShowcaseCategory {
  category_id: number;
  subcategories: number[];
}

export interface HomepageSettings {
  global_theme?: EcommerceTheme;
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
    text_position?: string;
    text_color?: string;
    font_size?: number;
    transition_type?: 'fade' | 'slide';
  };
  collections: {
    id: number;
    type?: 'category' | 'collection';
    title?: string;
    subtitle: string;
    image?: string;
    href?: string;
    show_text?: boolean;
  }[];
  showcase?: ShowcaseCategory[];
  new_arrivals?: {
    enabled: boolean;
    product_ids: number[];
    products?: any[]; // For storefront display
  };
  bannered_collections?: {
    id: number;
    type: 'category' | 'collection';
    title?: string;
    subtitle?: string;
    show_text?: boolean;
    image?: string; // Resolved URL
    override_image?: { url: string; path?: string };
    href?: string;
  }[];
  section_order?: string[];
}

class SettingsService {
  /**
   * Get homepage settings for public display
   */
  async getHomepageSettings(group?: 'hero' | 'collections' | 'new_arrivals' | 'showcase' | 'bannered_collections' | 'global_theme'): Promise<Partial<HomepageSettings>> {
    const response = await axiosInstance.get('/catalog/homepage-settings', {
      params: group ? { group } : {}
    });
    return response.data;
  }


  /**
   * Get storefront design-system tokens for e-commerce pages.
   */
  async getGlobalTheme(): Promise<EcommerceTheme> {
    const response = await axiosInstance.get('/catalog/homepage-settings', {
      params: { group: 'global_theme' }
    });
    return response.data.global_theme;
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
