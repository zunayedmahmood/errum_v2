<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class RolesSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Clear existing roles
        Role::query()->delete();

        // Define roles with their permissions
        $roles = [
            [
                'title' => 'Super Admin',
                'slug' => 'super-admin',
                'description' => 'Full system access with all permissions',
                'guard_name' => 'web',
                'level' => 100,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getAllPermissions(),
            ],
            [
                'title' => 'Admin',
                'slug' => 'admin',
                'description' => 'Administrative access to most system functions',
                'guard_name' => 'web',
                'level' => 90,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getAdminPermissions(),
            ],
            [
                'title' => 'Manager',
                'slug' => 'manager',
                'description' => 'Management level access for overseeing operations',
                'guard_name' => 'web',
                'level' => 80,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getManagerPermissions(),
            ],
            [
                'title' => 'Sales Representative',
                'slug' => 'sales-rep',
                'description' => 'Access for sales and customer management',
                'guard_name' => 'web',
                'level' => 60,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getSalesRepPermissions(),
            ],
            [
                'title' => 'Accountant',
                'slug' => 'accountant',
                'description' => 'Financial and accounting access',
                'guard_name' => 'web',
                'level' => 70,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getAccountantPermissions(),
            ],
            [
                'title' => 'Warehouse Staff',
                'slug' => 'warehouse-staff',
                'description' => 'Inventory and warehouse management access',
                'guard_name' => 'web',
                'level' => 50,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getWarehouseStaffPermissions(),
            ],
            [
                'title' => 'Customer Service',
                'slug' => 'customer-service',
                'description' => 'Customer support and order management access',
                'guard_name' => 'web',
                'level' => 40,
                'is_active' => true,
                'is_default' => false,
                'permissions' => $this->getCustomerServicePermissions(),
            ],
            [
                'title' => 'Viewer',
                'slug' => 'viewer',
                'description' => 'Read-only access to system data',
                'guard_name' => 'web',
                'level' => 10,
                'is_active' => true,
                'is_default' => true,
                'permissions' => $this->getViewerPermissions(),
            ],
        ];

        foreach ($roles as $roleData) {
            $permissions = $roleData['permissions'];
            unset($roleData['permissions']);

            $role = Role::create($roleData);

            // Get permission IDs by slugs
            $permissionIds = \App\Models\Permission::whereIn('slug', $permissions)->pluck('id')->toArray();
            $role->permissions()->attach($permissionIds);
        }

        $this->command->info('Created ' . count($roles) . ' roles with assigned permissions');
    }

    private function getAllPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view', 'dashboard.analytics',

            // User Management
            'employees.view', 'employees.create', 'employees.edit', 'employees.delete', 'employees.manage_roles', 'employees.view_sessions',
            'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.manage',

            // Product Management
            'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import', 'products.export', 'products.manage_images', 'products.manage_barcodes',
            'product_batches.view', 'product_batches.create', 'product_batches.edit', 'product_batches.delete',
            'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
            'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',

            // Inventory Management
            'inventory.view', 'inventory.adjust', 'inventory.view_movements',
            'product_dispatches.view', 'product_dispatches.create', 'product_dispatches.edit', 'product_dispatches.delete',
            'inventory_rebalancing.view', 'inventory_rebalancing.create', 'inventory_rebalancing.approve',

            // Customer Management
            'customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.import', 'customers.export', 'customers.view_purchase_history',

            // Order Management
            'orders.view', 'orders.create', 'orders.edit', 'orders.delete', 'orders.process', 'orders.cancel',
            'order_payments.view', 'order_payments.process', 'order_payments.refund', 'order_payments.manage_installments',
            'shipments.view', 'shipments.create', 'shipments.edit', 'shipments.delete', 'shipments.update_status',
            'product_returns.view', 'product_returns.process', 'refunds.view', 'refunds.process',

            // Service Management
            'services.view', 'services.create', 'services.edit', 'services.delete',
            'service_orders.view', 'service_orders.create', 'service_orders.edit', 'service_orders.delete', 'service_orders.process', 'service_orders.cancel',
            'service_order_payments.view', 'service_order_payments.process', 'service_order_payments.refund', 'service_order_payments.manage_installments',

            // Financial Management
            'payment_methods.view', 'payment_methods.create', 'payment_methods.edit', 'payment_methods.delete',
            'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'expenses.approve',
            'expense_categories.view', 'expense_categories.create', 'expense_categories.edit', 'expense_categories.delete',
            'transactions.view', 'accounts.view', 'accounts.manage', 'financial_reports.view',

            // Store Management
            'stores.view', 'stores.create', 'stores.edit', 'stores.delete', 'stores.manage_settings',

            // System Administration
            'system.settings.view', 'system.settings.edit',
            'fields.view', 'fields.create', 'fields.edit', 'fields.delete',
            'notes.view', 'notes.create', 'notes.edit', 'notes.delete',
            'system.migrations.run', 'system.seeders.run', 'system.cache.clear', 'system.logs.view',

            // Reporting
            'reports.sales.view', 'reports.inventory.view', 'reports.customers.view', 'reports.financial.view', 'reports.performance.view', 'reports.export', 'reports.schedule',
        ];
    }

    private function getAdminPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view', 'dashboard.analytics',

            // User Management (limited)
            'employees.view', 'employees.create', 'employees.edit', 'employees.manage_roles', 'employees.view_sessions',
            'roles.view',

            // Product Management
            'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import', 'products.export', 'products.manage_images', 'products.manage_barcodes',
            'product_batches.view', 'product_batches.create', 'product_batches.edit', 'product_batches.delete',
            'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
            'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',

            // Inventory Management
            'inventory.view', 'inventory.adjust', 'inventory.view_movements',
            'product_dispatches.view', 'product_dispatches.create', 'product_dispatches.edit', 'product_dispatches.delete',
            'inventory_rebalancing.view', 'inventory_rebalancing.create', 'inventory_rebalancing.approve',

            // Customer Management
            'customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.import', 'customers.export', 'customers.view_purchase_history',

            // Order Management
            'orders.view', 'orders.create', 'orders.edit', 'orders.delete', 'orders.process', 'orders.cancel',
            'order_payments.view', 'order_payments.process', 'order_payments.refund', 'order_payments.manage_installments',
            'shipments.view', 'shipments.create', 'shipments.edit', 'shipments.delete', 'shipments.update_status',
            'product_returns.view', 'product_returns.process', 'refunds.view', 'refunds.process',

            // Service Management
            'services.view', 'services.create', 'services.edit', 'services.delete',
            'service_orders.view', 'service_orders.create', 'service_orders.edit', 'service_orders.delete', 'service_orders.process', 'service_orders.cancel',
            'service_order_payments.view', 'service_order_payments.process', 'service_order_payments.refund', 'service_order_payments.manage_installments',

            // Financial Management
            'payment_methods.view', 'payment_methods.create', 'payment_methods.edit', 'payment_methods.delete',
            'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'expenses.approve',
            'expense_categories.view', 'expense_categories.create', 'expense_categories.edit', 'expense_categories.delete',
            'transactions.view', 'accounts.view', 'accounts.manage', 'financial_reports.view',

            // Store Management
            'stores.view', 'stores.create', 'stores.edit', 'stores.delete', 'stores.manage_settings',

            // System Administration (limited)
            'system.settings.view', 'system.settings.edit',
            'fields.view', 'fields.create', 'fields.edit', 'fields.delete',
            'notes.view', 'notes.create', 'notes.edit', 'notes.delete',
            'system.cache.clear', 'system.logs.view',

            // Reporting
            'reports.sales.view', 'reports.inventory.view', 'reports.customers.view', 'reports.financial.view', 'reports.performance.view', 'reports.export', 'reports.schedule',
        ];
    }

    private function getManagerPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view', 'dashboard.analytics',

            // User Management (view only)
            'employees.view', 'employees.view_sessions',

            // Product Management
            'products.view', 'products.create', 'products.edit', 'products.import', 'products.export',
            'product_batches.view', 'product_batches.create', 'product_batches.edit',
            'categories.view', 'categories.create', 'categories.edit',
            'vendors.view', 'vendors.create', 'vendors.edit',

            // Inventory Management
            'inventory.view', 'inventory.adjust', 'inventory.view_movements',
            'product_dispatches.view', 'product_dispatches.create', 'product_dispatches.edit',
            'inventory_rebalancing.view', 'inventory_rebalancing.create', 'inventory_rebalancing.approve',

            // Customer Management
            'customers.view', 'customers.create', 'customers.edit', 'customers.import', 'customers.export', 'customers.view_purchase_history',

            // Order Management
            'orders.view', 'orders.create', 'orders.edit', 'orders.process', 'orders.cancel',
            'order_payments.view', 'order_payments.process', 'order_payments.refund', 'order_payments.manage_installments',
            'shipments.view', 'shipments.create', 'shipments.edit', 'shipments.update_status',
            'product_returns.view', 'product_returns.process', 'refunds.view', 'refunds.process',

            // Service Management
            'services.view', 'services.create', 'services.edit',
            'service_orders.view', 'service_orders.create', 'service_orders.edit', 'service_orders.process', 'service_orders.cancel',
            'service_order_payments.view', 'service_order_payments.process', 'service_order_payments.refund', 'service_order_payments.manage_installments',

            // Financial Management
            'payment_methods.view',
            'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.approve',
            'expense_categories.view',
            'transactions.view', 'accounts.view', 'financial_reports.view',

            // Store Management
            'stores.view', 'stores.edit', 'stores.manage_settings',

            // Notes
            'notes.view', 'notes.create', 'notes.edit',

            // Reporting
            'reports.sales.view', 'reports.inventory.view', 'reports.customers.view', 'reports.financial.view', 'reports.performance.view', 'reports.export',
        ];
    }

    private function getSalesRepPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view',

            // Customer Management
            'customers.view', 'customers.create', 'customers.edit', 'customers.view_purchase_history',

            // Order Management
            'orders.view', 'orders.create', 'orders.edit',
            'order_payments.view', 'order_payments.process',
            'shipments.view', 'shipments.update_status',
            'product_returns.view',

            // Service Management
            'services.view',
            'service_orders.view', 'service_orders.create', 'service_orders.edit',
            'service_order_payments.view', 'service_order_payments.process',

            // Notes
            'notes.view', 'notes.create',

            // Reporting (limited)
            'reports.sales.view', 'reports.customers.view',
        ];
    }

    private function getAccountantPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view',

            // Financial Management
            'payment_methods.view', 'payment_methods.create', 'payment_methods.edit',
            'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'expenses.approve',
            'expense_categories.view', 'expense_categories.create', 'expense_categories.edit', 'expense_categories.delete',
            'transactions.view', 'accounts.view', 'accounts.manage', 'financial_reports.view',

            // Order/Service Payments (view and process)
            'order_payments.view', 'order_payments.process', 'order_payments.refund',
            'service_order_payments.view', 'service_order_payments.process', 'service_order_payments.refund',

            // Notes
            'notes.view', 'notes.create', 'notes.edit',

            // Reporting
            'reports.financial.view', 'reports.sales.view', 'reports.export',
        ];
    }

    private function getWarehouseStaffPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view',

            // Product Management (view only)
            'products.view', 'product_batches.view',

            // Inventory Management
            'inventory.view', 'inventory.adjust', 'inventory.view_movements',
            'product_dispatches.view', 'product_dispatches.create', 'product_dispatches.edit',
            'inventory_rebalancing.view', 'inventory_rebalancing.create',

            // Order Management (limited)
            'orders.view', 'shipments.view', 'shipments.create', 'shipments.edit', 'shipments.update_status',
            'product_returns.view', 'product_returns.process',

            // Notes
            'notes.view', 'notes.create',

            // Reporting
            'reports.inventory.view',
        ];
    }

    private function getCustomerServicePermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view',

            // Customer Management
            'customers.view', 'customers.edit', 'customers.view_purchase_history',

            // Order Management
            'orders.view', 'orders.edit', 'orders.process',
            'order_payments.view',
            'shipments.view', 'shipments.update_status',
            'product_returns.view', 'product_returns.process', 'refunds.view', 'refunds.process',

            // Service Management
            'services.view',
            'service_orders.view', 'service_orders.edit', 'service_orders.process',
            'service_order_payments.view',

            // Notes
            'notes.view', 'notes.create', 'notes.edit',

            // Reporting
            'reports.customers.view', 'reports.sales.view',
        ];
    }

    private function getViewerPermissions(): array
    {
        return [
            // Dashboard
            'dashboard.view',

            // View-only permissions for all modules
            'employees.view',
            'roles.view',
            'products.view',
            'product_batches.view',
            'categories.view',
            'vendors.view',
            'inventory.view',
            'inventory.view_movements',
            'product_dispatches.view',
            'inventory_rebalancing.view',
            'customers.view',
            'customers.view_purchase_history',
            'orders.view',
            'order_payments.view',
            'shipments.view',
            'product_returns.view',
            'refunds.view',
            'services.view',
            'service_orders.view',
            'service_order_payments.view',
            'payment_methods.view',
            'expenses.view',
            'expense_categories.view',
            'transactions.view',
            'accounts.view',
            'stores.view',
            'fields.view',
            'notes.view',

            // Reporting (view only)
            'reports.sales.view', 'reports.inventory.view', 'reports.customers.view', 'reports.financial.view', 'reports.performance.view',
        ];
    }
}
