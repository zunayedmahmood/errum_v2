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
  '/vendor': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/purchase-order': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],

  // Basic Setup
  '/store': ['super-admin', 'admin'],
  '/store-assingment': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/category': ['super-admin', 'admin', 'branch-manager'],
  '/gallery': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],

  // Products
  '/product/field': ['super-admin', 'admin'],
  '/product/list': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/product/archived': ['super-admin', 'admin', 'branch-manager'],
  '/product/batch': ['super-admin', 'admin', 'branch-manager'],

  // Inventory
  '/inventory/manage_stock': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/inventory/view': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/inventory/batch-price-update': ['super-admin', 'admin', 'branch-manager'],
  '/inventory/outlet-stock': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman', 'employee'],
  '/inventory/reports': ['super-admin', 'admin', 'branch-manager'],

  // Sales & Orders
  '/pos': ['super-admin', 'admin', 'branch-manager', 'pos-salesman'],
  '/purchase-history': ['super-admin', 'admin', 'branch-manager'],
  '/social-commerce': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/social-commerce/package': ['super-admin', 'admin', 'branch-manager', 'pos-salesman'],
  '/social-commerce/amount-details': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],
  '/orders': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/preorders': ['super-admin', 'admin', 'branch-manager', 'online-moderator'],
  '/returns': ['super-admin', 'admin', 'branch-manager', 'online-moderator', 'pos-salesman'],

  // Services
  '/services-management': ['super-admin', 'admin', 'branch-manager'],
  '/service-orders': ['super-admin', 'admin', 'branch-manager'],

  // Marketing
  '/campaigns': ['super-admin', 'admin'],

  // System & Utilities
  '/extra': ['super-admin', 'admin'],
  '/lookup': ['super-admin', 'admin', 'branch-manager', 'pos-salesman', 'employee'],
  '/activity-logs': ['super-admin', 'admin'],
  '/transaction': ['super-admin', 'admin', 'branch-manager'],
  '/accounting': ['super-admin', 'admin', 'branch-manager'],
  '/employees': ['super-admin', 'admin', 'branch-manager'],
  '/settings': ['super-admin', 'admin'],

  // Access Control
  '/roles': ['super-admin', 'admin'],
  '/permissions': ['super-admin', 'admin'],
};
