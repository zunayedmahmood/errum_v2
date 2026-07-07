import axiosInstance from '@/lib/axios';
import { EcommerceTheme } from '@/lib/ecommerceDesignSystem';

export interface ShowcaseCategory {
  category_id: number;
  subcategories: number[];
}

export interface HomepagePromotionBannerItem {
  promotion_id: number;
  timer_enabled: boolean;
  image?: string;
  override_image?: { url: string; path?: string } | null;
  promotion?: {
    id: number;
    code?: string;
    name: string;
    description?: string | null;
    type?: string;
    discount_value?: number | string;
    start_date?: string | null;
    end_date?: string | null;
    is_active?: boolean;
    is_public?: boolean;
  };
  new_image_file?: File | null;
  new_image_preview?: string | null;
}

export interface DeliveryChargeSettings {
  inside_dhaka_delivery_charge: number;
  outside_dhaka_delivery_charge: number;
  standard_delivery_charge: number;
  amount: number;
  city?: string;
  zone?: 'inside_dhaka' | 'outside_dhaka';
  currency: string;
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
  promotion_banners?: {
    enabled: boolean;
    items: HomepagePromotionBannerItem[];
  };
  section_order?: string[];
}

class SettingsService {
  /**
   * Get homepage settings for public display
   */
  async getHomepageSettings(group?: 'hero' | 'collections' | 'new_arrivals' | 'showcase' | 'bannered_collections' | 'promotion_banners' | 'global_theme'): Promise<Partial<HomepageSettings>> {
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

  private normalizeDeliveryChargePayload(data: any): DeliveryChargeSettings {
    const inside = Number(data.inside_dhaka_delivery_charge ?? data.standard_delivery_charge ?? data.amount ?? 60);
    const outside = Number(data.outside_dhaka_delivery_charge ?? 120);
    const amount = Number(data.amount ?? data.standard_delivery_charge ?? inside);

    const safeInside = Number.isFinite(inside) ? Math.max(0, inside) : 60;
    const safeOutside = Number.isFinite(outside) ? Math.max(0, outside) : 120;
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : safeInside;

    return {
      inside_dhaka_delivery_charge: safeInside,
      outside_dhaka_delivery_charge: safeOutside,
      standard_delivery_charge: safeAmount,
      amount: safeAmount,
      city: data.city,
      zone: data.zone,
      currency: data.currency ?? 'BDT',
    };
  }

  /**
   * Get ecommerce delivery charges. Pass city when you need the resolved checkout amount.
   */
  async getDeliveryCharge(city = 'Dhaka'): Promise<DeliveryChargeSettings> {
    const response = await axiosInstance.get('/settings/delivery-charge', { params: { city } });
    const data = response.data?.data ?? response.data ?? {};
    return this.normalizeDeliveryChargePayload(data);
  }

  /**
   * Update inside-Dhaka and outside-Dhaka ecommerce delivery charges.
   */
  async updateDeliveryCharge(charges: { inside_dhaka_delivery_charge: number; outside_dhaka_delivery_charge: number }): Promise<DeliveryChargeSettings> {
    const response = await axiosInstance.put('/settings/delivery-charge', charges);
    const data = response.data?.data ?? response.data ?? {};
    return this.normalizeDeliveryChargePayload(data);
  }

}

const settingsService = new SettingsService();
export default settingsService;
