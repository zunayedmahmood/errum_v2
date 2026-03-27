# Order Management Bug Fixes Report - March 26, 2026

## Overview
This report documents the fixes implemented to resolve critical errors during order editing, specifically addressing issues with unassigned orders (status: `pending_assignment`) and decoupled store-level inventory constraints for online orders.

## Backend Changes (`errum_be/app/Http/Controllers/OrderController.php`)

### 1. Resolved Property Access on Null & Strict Stock Control in `updateItem`
- **Issue**: Updating an item on an order without an assigned store batch caused a crash. Also, updates exceeding global availability were previously only logged.
- **Fix**: Added a conditional check for `$item->batch`.
  - If a batch is assigned, it validates against the batch quantity.
  - If no batch is assigned (null), it now checks global available inventory via the `ReservedProduct` model.
  - **Strict Blocking**: The update is now strictly blocked with an exception if the requested quantity exceeds available global stock.

### 2. Enhanced `addItem` with Strict Global Stock Control
- **Issue**: Online orders without store assignments previously lacked strict stock verification during items addition.
- **Fix**: 
  - Refactored the "Add by product_id" logic to allow additions without a `batch_id` if the order has no assigned store.
  - **Strict Blocking**: Added a mandatory global stock check using `ReservedProduct`. If global inventory is insufficient for the requested quantity, the addition is blocked with an exception.
  - Falls back to `product->base_price` if no batch price is available.

## Frontend Changes (`app/orders/OrdersClient.tsx`)

### 1. Decoupled Product Picker from Mandatory Store ID
- **Issue**: The Product Picker modal refused to open for orders without a `store_id`, displaying the error "Store information is missing for this order."
- **Fix**: 
  - Updated `openProductPicker` to skip the mandatory `storeId` check for `ecommerce` and `social_commerce` order types.
  - The picker now opens even if the order is in `pending_assignment` status.

### 2. Global Search Support in Product Picker
- **Issue**: Searching in the picker returned zero results if no `pickerStoreId` was set or if no local batches existed for a product at the selected store.
- **Fix**:
  - Modified `fetchProductResults` to allow searching products globally if the order is an online type.
  - If no local batches are found for a search result, the picker now displays the product with the label **"N/A (Warehouse/To Assign)"** and uses the `base_price`.
  - Users can now select these products, which will be added to the order with a `null` batch ID, ready for later fulfillment/assignment.

## Backward Compatibility
- All backend changes maintain the existing API signature.
- Counter/POS orders still require valid barcodes/batches as before.
- Existing logic for auto-selecting batches for store-assigned orders remains untouched.

## Verification Checklist
- [x] Edit quantity of an item on a `pending_assignment` order (No crash).
- [x] Add a product to a `pending_assignment` order via Product Picker (Allowed).
- [x] Add a product that has no stock at the current store but has global stock (Allowed for online orders).
- [x] "Pending Assignment" status visible and filtered correctly in the dashboard.
