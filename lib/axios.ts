import axios from 'axios';

// NOTE:
// In local dev, NEXT_PUBLIC_API_URL is sometimes missing.
// Fallback keeps admin panels working out-of-the-box.
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Public routes that don't require authentication (NO trailing slashes)
const PUBLIC_ROUTES = [
  '/catalog',        // Matches /catalog, /catalog/products, etc.
  '/login',
  '/forgot-password',
  '/reset-password',
  // Public customer registration (no auth)
  '/customer-registration',
  '/customer-auth/register',
  '/customer-auth/login',
  '/customer-auth/password/reset-request',
  '/customer-auth/password/reset',
  '/customer-auth/email/verify',
  '/customer-auth/email/resend',
  // Guest checkout (no auth)
  '/guest-checkout',
  '/guest-orders/by-phone',
  '/payment-method',
  // Public order tracking and details
  '/customer/orders/',
];

// Helper function to check if route is public
const isPublicRoute = (url?: string): boolean => {
  if (!url) return false;
  return PUBLIC_ROUTES.some(route => url.includes(route));
};

// Helper function to check if route is for customer (e-commerce)
const isCustomerRoute = (url?: string): boolean => {
  if (!url) return false;
  const customerPaths = ['/customer-auth', '/cart', '/wishlist', '/customer/', '/profile']; // ✅ add '/profile'
  return customerPaths.some(path => url.includes(path));
};

// Request interceptor to add auth token (skip for public routes)
axiosInstance.interceptors.request.use(
  (config) => {
    // Skip adding token for public routes
    if (isPublicRoute(config.url)) {
      console.log('🌐 Public route detected, skipping auth:', config.url);
      return config;
    }

    // Get token from localStorage for protected routes
    if (typeof window !== 'undefined') {
      // Determine which token to use based on route
      if (isCustomerRoute(config.url)) {
        // E-commerce customer routes - use customer token
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('🔒 Customer route, adding customer auth:', config.url);
        }
      } else {
        // Admin/Store routes - use admin token
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('🔒 Admin route, adding admin auth:', config.url);
        }
      }

      // -----------------------------
      // Store-scoped access
      // -----------------------------
      // Branch roles should only operate within their assigned store_id.
      // Admin/Super Admin can see all stores.
      // We enforce this by automatically injecting `store_id` into requests
      // for store-scoped resources when the user is scoped.
      try {
        const url = String(config.url || '');
        const method = String(config.method || 'get').toLowerCase();

        // Only apply to admin/store routes (NOT customer routes) and non-public routes.
        if (!isCustomerRoute(url) && !isPublicRoute(url)) {
          const roleSlug = localStorage.getItem('userRoleSlug') || '';

          // Super admin + admin are global (can see all stores)
          const GLOBAL_ROLE_SLUGS = ['super-admin', 'super_admin', 'superadmin', 'admin', 'administrator'];
          const isGlobalRole = GLOBAL_ROLE_SLUGS.includes(roleSlug);

          // If role slug missing, fall back to permissions heuristic.
          let perms: string[] = [];
          try {
            const raw = localStorage.getItem('userPermissions');
            perms = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(perms)) perms = [];
          } catch {
            perms = [];
          }

          const hasAny = (p: string[]) => p.some((x) => perms.includes(x));
          const canSelectStore = isGlobalRole || hasAny(['stores.create', 'stores.edit', 'stores.delete']);
          const storeIdRaw = localStorage.getItem('storeId');
          const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;
          const scopedStoreId = (!canSelectStore && storeId && Number.isFinite(storeId)) ? storeId : undefined;

          // Only inject into these store-scoped resources.
          const STORE_SCOPED_PREFIXES = [
            '/orders',
            '/purchase-orders',
            '/transactions',
            '/accounts',
            '/expenses',
            '/business-history',
          ];

          const isStoreScopedEndpoint = STORE_SCOPED_PREFIXES.some((p) => url.startsWith(p));

          if (scopedStoreId && isStoreScopedEndpoint) {
            // GET/DELETE: inject via query params
            if (method === 'get' || method === 'delete') {
              config.params = { ...(config.params || {}), store_id: scopedStoreId };
            }

            // POST/PATCH/PUT: inject into body (also keep params for safety)
            if (method === 'post' || method === 'put' || method === 'patch') {
              const data: any = config.data && typeof config.data === 'string'
                ? (() => {
                    try { return JSON.parse(config.data as any); } catch { return {}; }
                  })()
                : (config.data || {});

              // Never allow branch users to override store_id to another store.
              data.store_id = scopedStoreId;

              config.data = typeof config.data === 'string' ? JSON.stringify(data) : data;
              config.params = { ...(config.params || {}), store_id: scopedStoreId };
            }
          }
        }
      } catch {
        // no-op
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Token refresh state (separate for admin and customer)
let isRefreshingCustomer = false;
let customerFailedQueue: any[] = [];

const processCustomerQueue = (error: any, token: string | null = null) => {
  customerFailedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  customerFailedQueue = [];
};

// Response interceptor to handle errors
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // -----------------------------
    // 403 Forbidden (Permission denied)
    // Backend now enforces role-based permissions.
    // We surface a friendly toast globally and still reject for local handlers.
    // -----------------------------
    if (error.response?.status === 403) {
      const message =
        error.response?.data?.message ||
        'You do not have permission to perform this action';

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('global-toast', {
            detail: {
              message,
              type: 'error',
              meta: {
                required_permissions: error.response?.data?.required_permissions || [],
              },
            },
          })
        );
      }

      if (error.response?.data?.required_permissions) {
        console.warn('Required permissions:', error.response.data.required_permissions);
      }

      return Promise.reject(error);
    }

    // Don't handle public route errors
    if (isPublicRoute(originalRequest?.url)) {
      if (error.response?.status === 401) {
        console.error('⚠️ PUBLIC route returned 401 - check backend middleware:', originalRequest?.url);
      }
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      const isCustomer = isCustomerRoute(originalRequest?.url);
      
      console.log(`🚫 401 error on ${isCustomer ? 'customer' : 'admin'} route:`, originalRequest?.url);

      // CUSTOMER TOKEN REFRESH
      if (isCustomer) {
        // If already refreshing customer token, queue this request
        if (isRefreshingCustomer) {
          return new Promise((resolve, reject) => {
            customerFailedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return axiosInstance(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshingCustomer = true;

        try {
          const token = localStorage.getItem('auth_token');
          
          if (!token) {
            throw new Error('No customer token available');
          }

          console.log('🔄 Attempting to refresh customer token...');

          // Try to refresh customer token
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/customer-auth/refresh`,
            {},
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (response.data.success) {
            const { token: newToken, expires_in } = response.data.data;
            
            console.log('✅ Customer token refreshed successfully');
            
            // Update stored token
            localStorage.setItem('auth_token', newToken);
            localStorage.setItem('token_expires_in', expires_in.toString());
            
            // Update request header
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            
            // Process queued requests
            processCustomerQueue(null, newToken);
            
            isRefreshingCustomer = false;
            
            // Retry original request
            return axiosInstance(originalRequest);
          } else {
            throw new Error('Customer token refresh failed');
          }
        } catch (refreshError) {
          console.error('❌ Customer token refresh failed, logging out customer');
          
          // Refresh failed - logout customer
          processCustomerQueue(refreshError, null);
          isRefreshingCustomer = false;
          
          // Clear only customer auth data (preserve admin auth)
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('customer_user');
            localStorage.removeItem('token_expires_in');
            
            // Dispatch logout event for customer
            window.dispatchEvent(new Event('customer-auth-changed'));
            window.dispatchEvent(new Event('cart-updated'));
            
            // Redirect to customer login page if on e-commerce routes
            const currentPath = window.location.pathname;
            if (currentPath.startsWith('/e-commerce')) {
              window.location.href = '/e-commerce/login';
            }
          }
          
          return Promise.reject(refreshError);
        }
      } 
      // ADMIN 401 HANDLING (No auto-refresh for admin)
      else {
        console.log('🚫 401 error on admin route, clearing admin auth');
        
        // Clear admin auth data (preserve customer auth)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userRole');
          localStorage.removeItem('userId');
          localStorage.removeItem('userName');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('storeId');
          localStorage.removeItem('storeName');
          localStorage.removeItem('platforms');
          
          // Redirect to admin login page if not already there
          const currentPath = window.location.pathname;
          const publicPages = ['/login', '/signup', '/e-commerce', '/catalog', '/'];
          
          if (!publicPages.some(page => currentPath.startsWith(page))) {
            window.location.href = '/login';
          }
        }
        
        return Promise.reject(error);
      }
    }
    
    return Promise.reject(error);
  }
);

export default axiosInstance;