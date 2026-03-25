# 25_Mar_26 Product List Page stock_status Filter Fix

## Overview
This update fixes the non-functional `stock_status` filter on the Administrative Product List page (`/product/list`). The core issue was a mismatch between the frontend query parameter naming (`stockStatus`) and the backend's expected filtering logic. Additionally, the system was moved towards a more standard boolean-like representation (`in_stock=true/false`) to align with the public e-commerce catalog API.

## Implementation Details

### 1. Backend Synchronization
Both [ProductController](file:///home/zunayed-mahmood-tahsin/storage/Fullstack-Laravel-Next/errum_v2/errum_be/app/Http/Controllers/ProductController.php#16-1010) and [ProductSearchController](file:///home/zunayed-mahmood-tahsin/storage/Fullstack-Laravel-Next/errum_v2/errum_be/app/Http/Controllers/ProductSearchController.php#12-1110) have been updated to support the new `in_stock` parameter while maintaining backward compatibility for `stock_status`.

- **Supported Parameters**: `in_stock` (preferred) and `stock_status` (legacy fallback).
- **Supported Values**:
    - **In Stock**: `'true'`, `'in_stock'`, or boolean `true`.
    - **Out of Stock**: `'false'`, `'not_in_stock'`, or boolean `false`.
    - **All**: `'all'` or omission of the parameter.

The filtering logic performs a `whereHas` or `whereDoesntHave` on the `product_batches` relationship, specifically checking for:
- `is_active = true`
- `availability = true`
- `stock_qty > 0`

### 2. Frontend Updates
The `ProductListClient` was refactored to use the new parameter naming and value mapping.

- **URL Synchronization**: The URL now uses `?in_stock=true` or `?in_stock=false`.
- **API Requests**: Both the standard listing (`productService.getAll`) and the Advanced Search (`productService.advancedSearch`) now send the `in_stock` parameter with stringified boolean values.
- **State Persistence**: The local `stockStatus` state remains for UI management but is correctly hydrated from the `in_stock` URL parameter upon page load or browser navigation.

## Examples and Behavior

### Example: Filtering for In-Stock Items
1. User selects "In Stock" from the dropdown.
2. URL updates to: `/product/list?page=1&in_stock=true`.
3. Frontend sends payload to `/api/products`: `{ in_stock: 'true', page: 1, ... }`.
4. Backend filters products that have at least one active, available batch with quantity > 0.

### Example: Filtering for Out-of-Stock Items
1. User selects "Out of Stock" from the dropdown.
2. URL updates to: `/product/list?page=1&in_stock=false`.
3. Frontend sends payload to `/api/products`: `{ in_stock: 'false', page: 1, ... }`.
4. Backend filters products that have NO active, available batches with quantity > 0.

## Edge Cases

| Scenario | Behavior |
| :------- | :------- |
| **Manual URL Entry** | If a user manually types `?stockStatus=in_stock` (legacy), the backend will still process it correctly, but the frontend will normalize it to the default 'all' state unless the legacy parameter is explicitly handled (Currently, the frontend only reads `in_stock`). |
| **Mixed Parameters** | If both `in_stock` and `stock_status` are sent, the backend prioritizes `stock_status` if it exists in the request object (standard Laravel `$request->get('stock_status', $request->get('in_stock'))` logic). |
| **Advanced Search Fallback** | If the Advanced Search controller fails or is bypassed (less than 2 chars), the standard listing endpoint correctly applies the same `in_stock` logic. |

## Verification
The changes ensure that:
1. Refreshing the page with a filter active persists the filter state.
2. Navigating back/forward updates the UI and triggers a fresh data fetch with correct params.
3. The "Clear Filters" button correctly removes the `in_stock` parameter from the URL.
