"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import authService, { LoginCredentials, Employee } from '@/services/authService';
import roleService from '@/services/roleService';
import { RoleSlug } from '@/types/roles';

interface AuthContextType {
  user: Employee | null;
  role: RoleSlug | null;
  permissions: string[];
  isGlobal: boolean;
  isScoped: boolean;
  /** The employee's assigned store (single store in backend Employee model) */
  storeId?: number;
  /** If user is restricted to only their store, this equals storeId; otherwise undefined */
  scopedStoreId?: number;
  /** True if the user can switch between multiple stores in UI */
  canSelectStore: boolean;
  /**
   * True when we were able to resolve permissions from the API (or from cache).
   * If false, we avoid hiding the whole sidebar (backend will still enforce 403).
   */
  permissionsResolved: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsResolved, setPermissionsResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const SUPER_ADMIN_SLUGS = ['super-admin', 'super_admin', 'superadmin'];

  const readCachedRoleAndPermissions = () => {
    if (typeof window === 'undefined') return { roleSlug: undefined as string | undefined, perms: [] as string[] };

    const roleSlug = localStorage.getItem('userRoleSlug') || undefined;
    let perms: string[] = [];
    try {
      const raw = localStorage.getItem('userPermissions');
      perms = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(perms)) perms = [];
    } catch {
      perms = [];
    }
    return { roleSlug, perms };
  };

  /**
   * Backend reality (from the provided backend zip): GET /me returns Employee model only
   * (usually without role + permissions). We'll try to resolve role by role_id when possible.
   *
   * - Super Admin can always call /roles/{id} due to backend bypass.
   * - Other users may NOT have roles.view, so the call can 403; in that case we keep sidebar visible
   *   and rely on backend 403 for protected pages/actions.
   */
  const resolveRoleAndPermissions = async (employee: Employee) => {
    // 1) If /me already contains role + permissions, use it.
    const apiRoleSlug = employee?.role?.slug;
    const apiPerms = Array.isArray(employee?.role?.permissions) ? employee.role.permissions.map((p: any) => p.slug).filter(Boolean) : [];
    if (apiRoleSlug) {
      setPermissions(apiPerms);
      setPermissionsResolved(true);
      authService.setUserData(employee);
      return;
    }

    // 2) Use cached role/permissions if available
    const cached = readCachedRoleAndPermissions();
    if (cached.roleSlug) {
      setPermissions(cached.perms);
      setPermissionsResolved(true);
    }

    // 3) Try resolving via /roles/{role_id} (works at least for super-admin)
    const roleId = Number((employee as any)?.role_id);
    if (!Number.isFinite(roleId) || roleId <= 0) {
      return;
    }

    try {
      const res = await roleService.getRole(roleId);
      const role = res?.data;
      const roleSlug = role?.slug;
      const rolePerms = role?.permissions?.map((p) => p.slug).filter(Boolean) || [];

      const merged: Employee = {
        ...employee,
        role: {
          id: role?.id,
          title: role?.title,
          slug: roleSlug,
          permissions: role?.permissions?.map((p) => ({ id: p.id, slug: p.slug, title: p.title })) || [],
        },
      };

      setUser(merged);
      setPermissions(rolePerms);
      setPermissionsResolved(true);
      authService.setUserData(merged);
    } catch (e) {
      // If user lacks roles.view this can be 403. That's okay.
      // We keep sidebar visible by not hard-filtering when permissionsResolved is false.
    }
  };

  // Check if user is authenticated on mount and initialize token refresh
  useEffect(() => {
    checkAuth();
    // Initialize token refresh timer if user has valid session
    authService.initializeTokenRefresh();
  }, []);

  // Monitor token validity and redirect if expired
  useEffect(() => {
    // Public frontend routes that don't need authentication
    const publicRoutes = ['/login', '/forgot-password', '/e-commerce', '/catalog'];
    
    // Check if current path is public (exact match or starts with route/)
    const isPublicRoute = publicRoutes.some(route => 
      pathname === route || pathname?.startsWith(route + '/')
    );
    
    // Home page is also public
    const isHomePage = pathname === '/';
    
    // Skip auth checks for public routes, home page, or during initial load
    if (isPublicRoute || isHomePage || isLoading) {
      return;
    }

    // Check token validity periodically (every 30 seconds) for protected routes
    const interval = setInterval(() => {
      if (!authService.isAuthenticated() && user) {
        console.log('⏰ Token expired, logging out');
        logout();
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [pathname, user, isLoading]);

  const checkAuth = async () => {
    try {
      if (authService.isAuthenticated()) {
        const employee = await authService.getCurrentUser();
        setUser(employee);

        // Resolve role/permissions safely (see resolveRoleAndPermissions)
        await resolveRoleAndPermissions(employee);
      } else {
        // Token is expired or invalid
        authService.clearAuth();
        setUser(null);
        setPermissions([]);
        setPermissionsResolved(false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      authService.clearAuth();
      setUser(null);
      setPermissions([]);
      setPermissionsResolved(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      // Login handles token storage and auto-refresh setup
      await authService.login(credentials);
      const employee = await authService.getCurrentUser();
      setUser(employee);
      await resolveRoleAndPermissions(employee);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setPermissions([]);
      setPermissionsResolved(false);
      authService.clearAuth();
      router.push('/login');
    }
  };

  const refreshUser = async () => {
    try {
      const employee = await authService.getCurrentUser();
      setUser(employee);
      await resolveRoleAndPermissions(employee);
    } catch (error) {
      console.error('Refresh user error:', error);
      throw error;
    }
  };

  const role = user?.role?.slug as RoleSlug || (readCachedRoleAndPermissions().roleSlug as RoleSlug);
  const isGlobal = ['super-admin', 'admin'].includes(role);
  const isScoped = !isGlobal;
  const isSuperAdmin = !!role && SUPER_ADMIN_SLUGS.includes(role);

  const hasPermission = (permission: string) => {
    if (isSuperAdmin) return true;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: string[]) => {
    if (isSuperAdmin) return true;
    return perms.some((p) => permissions.includes(p));
  };

  const hasAllPermissions = (perms: string[]) => {
    if (isSuperAdmin) return true;
    return perms.every((p) => permissions.includes(p));
  };

  const storeId = user?.store_id ? Number(user.store_id) : undefined;
  const canSelectStore = isSuperAdmin || ['admin', 'online-moderator'].includes(role || '') || hasAnyPermission(['stores.create', 'stores.edit', 'stores.delete']);
  const scopedStoreId = canSelectStore ? undefined : storeId;

  const value: AuthContextType = {
    user,
    role,
    permissions,
    isGlobal,
    isScoped,
    storeId,
    scopedStoreId,
    canSelectStore,
    permissionsResolved,
    isLoading,
    isAuthenticated: !!user,
    isSuperAdmin,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const isRole = (slugs: RoleSlug | RoleSlug[]): boolean => {
    const userRole = context?.role;
    if (!userRole) return false;
    return Array.isArray(slugs) ? slugs.includes(userRole) : userRole === slugs;
  };

  return {
    ...context,
    isRole,
    // Named helpers
    canAccessPOS:              isRole(['super-admin', 'admin', 'branch-manager', 'pos-salesman']),
    canAccessSocialCommerce:   isRole(['super-admin', 'admin', 'online-moderator', 'pos-salesman']),
    canAccessInventory:        isRole(['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman']),
    canAccessOrders:           isRole(['super-admin', 'admin', 'branch-manager', 'online-moderator']),
    canAccessPurchaseOrders:   isRole(['super-admin', 'admin', 'online-moderator']),
    canAccessPackagePage:      isRole(['super-admin', 'admin', 'branch-manager', 'pos-salesman']),
    canAccessStoreAssignment:  isRole(['super-admin', 'admin', 'online-moderator']),
    canAccessDailyCashReport:  isRole(['super-admin', 'admin', 'branch-manager']),
  };
}