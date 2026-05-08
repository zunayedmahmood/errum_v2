const LOCAL_FRONTEND_PATH_PREFIXES = [
  '/placeholder',
  '/images/',
  '/icons/',
  '/logos/',
  '/favicon',
  '/_next/',
  '/e-commerce-hero.jpg',
];

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function stripApiSegment(value: string): string {
  return value.replace(/\/api\/?$/, '');
}

/**
 * Returns backend origin URL for serving media assets.
 * Priority: NEXT_PUBLIC_API_URL -> NEXT_PUBLIC_BASE_URL.
 * If value ends with /api, it is removed.
 */
export function getBackendOrigin(): string {
  const raw = String(
    process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      ''
  ).trim();

  if (!raw) return '';

  const withoutTrailing = trimTrailingSlash(raw);
  return stripApiSegment(withoutTrailing);
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasProtocolRelativeUrl(value: string): boolean {
  return /^\/\//.test(value);
}

function shouldKeepAsLocalFrontendPath(value: string): boolean {
  return LOCAL_FRONTEND_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Normalizes legacy media paths for category images.
 *
 * We have seen these variants in API responses / DB:
 * - categories/xxx.jpg        (missing /storage)
 * - category/xxx.jpg          (legacy singular)
 * - /storage/category/xxx.jpg (wrong folder name)
 *
 * Correct public path should be:
 * - /storage/categories/xxx.jpg
 */
function normalizeLegacyAssetPath(inputPath: string): string {
  let path = inputPath;

  // If full URL was passed in, extract pathname only (we will rebuild later).
  // This function is meant to work on raw paths too.
  path = path.replace(/^['"]|['"]$/g, '');

  // Convert singular folder to plural inside /storage
  path = path.replace(/\/storage\/category\//gi, '/storage/categories/');

  // categories/...  -> /storage/categories/...
  if (/^\/?categories\//i.test(path) && !/\/storage\/categories\//i.test(path)) {
    path = path.replace(/^\/?categories\//i, '/storage/categories/');
  }

  // category/... -> /storage/categories/...
  if (/^\/?category\//i.test(path) && !/\/storage\/categories\//i.test(path)) {
    path = path.replace(/^\/?category\//i, '/storage/categories/');
  }

  return path;
}

/**
 * Converts relative media path to absolute backend asset URL.
 * Leaves data/blob URLs and local frontend assets unchanged.
 */
export function toAbsoluteAssetUrl(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Handle absolute URLs too (some APIs return full backend URLs).
  if (isAbsoluteHttpUrl(raw)) {
    try {
      const u = new URL(raw);
      const normalizedPath = normalizeLegacyAssetPath(u.pathname);
      if (normalizedPath !== u.pathname) {
        u.pathname = normalizedPath;
        return u.toString();
      }
    } catch {
      // fall through and return raw
    }
    return raw;
  }

  if (raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }

  if (hasProtocolRelativeUrl(raw)) {
    if (typeof window !== 'undefined' && window.location?.protocol) {
      return `${window.location.protocol}${raw}`;
    }
    return `https:${raw}`;
  }

  if (shouldKeepAsLocalFrontendPath(raw)) {
    return raw;
  }

  let path = normalizeLegacyAssetPath(raw);

  // Some backends return /api/storage/... for files; strip /api for direct asset access.
  if (/^\/?api\//i.test(path) && /\/storage\//i.test(path)) {
    path = path.replace(/^\/?api\//i, '/');
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) return path;

  return `${backendOrigin}${path}`;
}
