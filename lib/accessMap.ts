import { RoleSlug } from '@/types/roles';

/**
 * PAGE_ACCESS is the single source of truth for route-level authorization.
 * 
 * Roles in scope:
 * - super-admin, admin: Full access to everything.
 * - branch-manager: Access to branch-level administrative tools.
 * - online-moderator: Focused on social-commerce, order management, and global inventory view.
 * - pos-salesman: Focused on branch POS and fulfillment.
 * - employee: General access for common tasks.
 */
export const PAGE_ACCESS: Record<string, RoleSlug[]> = {
  // Dashboard
  '/dashboard': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],
  '/dashboard/stores-summary': ['super-admin', 'admin'],

  // Vendor Management
  '/vendor': ['super-admin', 'admin', 'online-moderator'],
  '/purchase-order': ['super-admin', 'admin', 'online-moderator'],

  // Basic Setup
  '/store': ['super-admin', 'admin'],
  '/store-assingment': ['super-admin', 'admin', 'online-moderator'],
  '/category': ['super-admin', 'admin', 'online-moderator'],
  '/collections': ['super-admin', 'admin', 'online-moderator'],
  '/collections/create': ['super-admin', 'admin', 'online-moderator'],
  '/gallery': ['super-admin', 'admin'],

  // Products
  '/product/field': ['super-admin', 'admin', 'online-moderator'],
  '/product/list': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/product/archived': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/product/batch': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/product/add': ['super-admin', 'admin', 'online-moderator'],

  // Inventory 
  '/inventory': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],
  '/inventory/manage_stock': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/inventory/view': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/inventory/batch-price-update': ['super-admin', 'admin'],
  '/inventory/outlet-stock': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],
  '/inventory/reports': ['super-admin', 'admin'],
  '/inventory/intelligence': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],

  // Sales & Orders
  '/pos': ['super-admin', 'admin', 'branch-manager', 'pos-salesman'],
  '/purchase-history': ['super-admin', 'admin', 'branch-manager'],
  '/social-commerce': ['super-admin', 'admin', 'online-moderator'],
  '/social-commerce/package': ['super-admin', 'admin', 'branch-manager', 'pos-salesman'],
  '/social-commerce/amount-details': ['super-admin', 'admin', 'online-moderator'],
  '/social-commerce/text-import': ['super-admin', 'admin', 'online-moderator'],
  '/orders': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/preorders': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/returns': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],

  // Services
  '/services-management': ['super-admin', 'admin', 'branch-manager'],
  '/service-orders': ['super-admin', 'admin', 'branch-manager'],

  // Marketing
  '/campaigns': ['super-admin', 'admin'],

  // System & Utilities
  '/extra': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/lookup': ['super-admin', 'admin', 'branch-manager', 'pos-salesman', 'employee'],
  '/activity-logs': ['super-admin', 'admin'],
  '/transaction': ['super-admin', 'admin'],
  '/accounting': ['super-admin', 'admin'],
  '/employees': ['super-admin', 'admin'],
  '/settings': ['super-admin', 'admin'],
  '/settings/homepage': ['super-admin', 'admin', 'online-moderator'],
  '/hrm/my': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],
  '/hrm/branch': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/hrm/attendance': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/hrm/sales-targets': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/hrm/rewards-fines': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/cash-sheet': ['super-admin', 'admin'],
};

/**
 * Roles that bypass automated store scoping (skipStoreScope: true).
 * These roles have a global view across all locations.
 */
export const ROLES_SKIPPING_STORE_SCOPE: RoleSlug[] = [
  'super-admin',
  'admin',
  'online-moderator',
];
