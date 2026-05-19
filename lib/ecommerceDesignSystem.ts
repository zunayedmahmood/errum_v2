import type { CSSProperties } from 'react';

export interface EcommerceTheme {
  color_bg_primary: string;
  color_bg_secondary: string;
  color_text_primary: string;
  color_text_secondary: string;
  color_accent: string;
  color_accent_text: string;
  color_border: string;
  color_card_bg: string;
  font_body: string;
  font_body_weight: string;
  card_shadow_enabled: boolean;
  card_shadow_type: 'glow' | 'directional';
  card_shadow_color: string;
  card_shadow_direction: 'bottom' | 'bottom-right' | 'bottom-left';
  card_shadow_intensity: number;
}

export const ECOMMERCE_FONT_OPTIONS = [
  'Poppins',
  'Inter',
  'Roboto',
  'Lato',
  'Montserrat',
  'Raleway',
  'Nunito',
  'Playfair Display',
  'DM Sans',
  'Outfit',
];

export const ECOMMERCE_THEME_DEFAULTS: EcommerceTheme = {
  color_bg_primary: '#ffffff',
  color_bg_secondary: '#f5f5f5',
  color_text_primary: '#111111',
  color_text_secondary: '#555555',
  color_accent: '#111111',
  color_accent_text: '#ffffff',
  color_border: 'rgba(0,0,0,0.10)',
  color_card_bg: '#ffffff',
  font_body: 'Poppins',
  font_body_weight: '400',
  card_shadow_enabled: false,
  card_shadow_type: 'directional',
  card_shadow_color: 'rgba(0,0,0,0.12)',
  card_shadow_direction: 'bottom',
  card_shadow_intensity: 35,
};

export function normalizeEcommerceTheme(theme?: Partial<EcommerceTheme> | null): EcommerceTheme {
  return {
    ...ECOMMERCE_THEME_DEFAULTS,
    ...(theme || {}),
    card_shadow_enabled: Boolean(theme?.card_shadow_enabled ?? ECOMMERCE_THEME_DEFAULTS.card_shadow_enabled),
    card_shadow_intensity: Number(theme?.card_shadow_intensity ?? ECOMMERCE_THEME_DEFAULTS.card_shadow_intensity),
  };
}

export function computeEcommerceCardShadow(theme?: Partial<EcommerceTheme> | null): string {
  const normalized = normalizeEcommerceTheme(theme);
  if (!normalized.card_shadow_enabled) return 'none';

  const intensity = Math.max(0, Math.min(100, normalized.card_shadow_intensity)) / 100;
  if (intensity <= 0) return 'none';

  const blur = Math.round(10 + intensity * 28);
  const spread = Math.round(intensity * 4);
  const color = normalized.card_shadow_color || ECOMMERCE_THEME_DEFAULTS.card_shadow_color;

  if (normalized.card_shadow_type === 'glow') {
    return `0 0 ${blur}px ${spread}px ${color}`;
  }

  const offsets: Record<EcommerceTheme['card_shadow_direction'], string> = {
    bottom: `0 ${Math.round(8 + intensity * 10)}px`,
    'bottom-right': `${Math.round(6 + intensity * 8)}px ${Math.round(8 + intensity * 10)}px`,
    'bottom-left': `${-Math.round(6 + intensity * 8)}px ${Math.round(8 + intensity * 10)}px`,
  };

  return `${offsets[normalized.card_shadow_direction]} ${blur}px ${spread}px ${color}`;
}

export function buildEcommerceThemeVars(theme?: Partial<EcommerceTheme> | null): CSSProperties {
  const normalized = normalizeEcommerceTheme(theme);
  const fontFamily = `'${normalized.font_body}', ui-sans-serif, system-ui, sans-serif`;
  const cardShadow = computeEcommerceCardShadow(normalized);

  return {
    '--ec-color-bg-primary': normalized.color_bg_primary,
    '--ec-color-bg-secondary': normalized.color_bg_secondary,
    '--ec-color-text-primary': normalized.color_text_primary,
    '--ec-color-text-secondary': normalized.color_text_secondary,
    '--ec-color-accent': normalized.color_accent,
    '--ec-color-accent-text': normalized.color_accent_text,
    '--ec-color-border': normalized.color_border,
    '--ec-color-card-bg': normalized.color_card_bg,
    '--ec-font-body': fontFamily,
    '--ec-font-body-weight': normalized.font_body_weight,
    '--ec-card-shadow': cardShadow,

    '--bg-root': normalized.color_bg_primary,
    '--bg-surface': normalized.color_card_bg,
    '--bg-surface-2': normalized.color_bg_secondary,
    '--bg-depth': normalized.color_bg_secondary,
    '--bg-lifted': normalized.color_card_bg,
    '--text-primary': normalized.color_text_primary,
    '--text-secondary': normalized.color_text_secondary,
    '--text-muted': normalized.color_text_secondary,
    '--text-on-accent': normalized.color_accent_text,
    '--border-default': normalized.color_border,
    '--border-strong': normalized.color_border,
    '--cyan': normalized.color_accent,
    '--cyan-bright': normalized.color_accent,
    '--cyan-dim': normalized.color_accent,
    '--cyan-border': normalized.color_border,
    '--gold': normalized.color_accent,
    '--gold-bright': normalized.color_accent,
    '--gold-dim': normalized.color_accent,
    '--font-poppins': fontFamily,
  } as CSSProperties;
}

export function getEcommerceFontImport(theme?: Partial<EcommerceTheme> | null): string {
  const font = normalizeEcommerceTheme(theme).font_body;
  const family = font.trim().replace(/\s+/g, '+');
  return `@import url('https://fonts.googleapis.com/css2?family=${family}:wght@300;400;500;600;700;800&display=swap');`;
}
