# 24_MAR_26 Product List Stock Filter and Backend Optimization

## Overview
This update implements a new "Stock Status" filter on the administrative Product List page. It allows users to filter products based on their real-time availability (All, In Stock, or Out of Stock). The implementation includes both frontend UI changes and backend controller updates to ensure efficient, server-side filtering.

## Key Changes

### 1. Frontend: Product List UI & Logic
- **File**: `app/product/list/ProductListClient.tsx`
- **New State**: Added `stockStatus` state (`'all' | 'in_stock' | 'not_in_stock'`).
- **URL Synchronization**: The filter state is synchronized with the URL query parameter `stockStatus`, allowing filters to persist across page refreshes and browser navigation.
- **Filter Dropdown**: Added a modern, themed selection dropdown within the "Filters" panel.
- **Active Filter Logic**: 
    - Updated `hasActiveFilters` to include the stock status.
    - Updated the filter count badge to accurately reflect the number of active filters.
    - Updated `clearFilters` to reset the stock status.
- **Dependency Optimization**: Added `sortBy` and `stockStatus` to the `fetchData` dependency array to ensure consistent updates when these filters change.

### 2. Frontend: API Service
- **File**: `services/productService.ts`
- **Updated Interfaces**: Added `stock_status` parameter to the `getAll` and `advancedSearch` method signatures.

### 3. Backend: Standard Product Listing
- **File**: `errum_be/app/Http/Controllers/ProductController.php`
- **Filter Implementation**: Added logic to the `index` method to filter by batch availability.
    - **In Stock**: Products having at least one active batch with `availability = true` and `stock_qty > 0`.
    - **Out of Stock**: Products that do not have any active, available batches with positive stock.

### 4. Backend: Advanced Search Optimization
- **File**: `errum_be/app/Http/Controllers/ProductSearchController.php`
- **Advanced Filtering**: Integrated the `stock_status` filter into the multi-stage search pipeline.
- **Affected Stages**:
    - `searchExact`
    - `searchStartsWith`
    - `searchContains`
    - `executeFuzzySearch`
- This ensures that even when using fuzzy or phonetic search, the stock status constraints are strictly respected.

## Implementation Details

### Stock Status Logic
The system defines "In Stock" based on the `ProductBatch` relationship:
```php
$query->whereHas('batches', function($q) {
    $q->where('is_active', true)
      ->where('availability', true)
      ->where('stock_qty', '>', 0);
});
```

### UI Integration
The new dropdown is placed between the Vendor and Price filters in the expandable filter panel, maintaining the premium design language of the dashboard.

## Affected Files
- `app/product/list/ProductListClient.tsx`
- `services/productService.ts`
- `errum_be/app/Http/Controllers/ProductController.php`
- `errum_be/app/Http/Controllers/ProductSearchController.php`

## Verification Steps
1. Navigate to the Product List page.
2. Open the "Filters" panel.
3. Change the "Stock Status" to "In Stock" and verify that only products with available quantities are displayed.
4. Change to "Out of Stock" and verify the opposite.
5. Refresh the page and ensure the filter persists in the URL and UI.
6. Combine with other filters (e.g., search query or category) to ensure seamless intersection.
