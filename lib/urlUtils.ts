/**
 * Utility to resolve relative asset URLs (from backend) to absolute ones
 * using the configured backend base URL.
 */
export const toAbsoluteAssetUrl = (value: any): string => {
  if (!value || typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';

  // Already absolute URL (http://, https://, protocol-relative, data URI)
  if (/^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw)) {
    return raw;
  }

  // Keep only known frontend-local placeholder assets untouched.
  const isFrontendPlaceholder =
    /^\/(?:images\/)?placeholder-product\.(?:png|jpe?g|webp|svg)$/i.test(raw) ||
    /^\/placeholder-product\.(?:png|jpe?g|webp|svg)$/i.test(raw);

  if (isFrontendPlaceholder) {
    return raw;
  }

  // Determine backend base URL from environment
  // Priority: NEXT_PUBLIC_BACKEND_URL -> BASE_URL -> derived from API_URL -> derived from NEXT_PUBLIC_BASE_URL
  const backendEnv = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BASE_URL || '').replace(/\/$/, '');
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  const appBase = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');

  const backendBase =
    backendEnv ||
    (apiBase ? apiBase.replace(/\/api(?:\/v\d+)?$/i, '') : '') ||
    appBase ||
    '';

  if (!backendBase) return raw;

  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${backendBase}${path}`;
};
