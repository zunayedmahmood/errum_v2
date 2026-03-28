# Product Add to Order Lifecycle & Reservation Audit (28 Mar 2026)

## 1. Overview
The "Reserve Stock" system was introduced to prevent double-selling of inventory between POS (Counter) and Online (E-commerce/Social-commerce) channels. While the core architecture (using the `reserved_products` table and `pending_assignment` status) is sound, this audit has identified several critical gaps in the implementation across the lifecycle.

## 2. Identified Critical Bugs & Gaps

### A. Missing Reservation in Social Commerce Creation
- **File**: `errum_be/app/Http/Controllers/OrderController.php` (Method: `create`)
- **Issue**: Reservation logic is wrapped in an `else if ($batch)` block.
- **Problem**: When employees create Social Commerce orders via the Social Commerce page, they often do NOT select a specific batch (`batch_id: null`).
- **Result**: The order is created as `pending_assignment`, but `reserved_inventory` is NOT incremented. This allows POS to sell the stock that should have been reserved for this order.

### B. Broken Order Editing (Add/Update/Remove Item)
- **File**: `errum_be/app/Http/Controllers/OrderController.php` (Methods: `addItem`, `updateItem`, `removeItem`)
- **Issue**: These methods validate global availability but **never update** the `ReservedProduct` counts.
- **Problem**:
    - Adding an item to a `pending_assignment` order doesn't increment `reserved_inventory`.
    - Updating quantity doesn't adjust reservation.
    - Removing an item doesn't release the reservation.
- **Result**: Persistent inventory "leaks" or "phantom reservations" that never clear, causing `available_inventory` to become inaccurate over time.

### C. Legacy Code in Ecommerce Cancellation
- **File**: `errum_be/app/Http/Controllers/EcommerceOrderController.php` (Method: `cancel`)
- **Issue**: Still attempts to call `$item->product->increment('stock_quantity', $item->quantity)`.
- **Problem**: The `stock_quantity` column does not exist on the `products` table (inventory is batch-based). This code will throw an exception if executed.
- **Note**: `OrderObserver` handles reservation release, but this legacy code should be removed or refactored.

### D. Stuck Reservations on Direct Order Completion
- **File**: `errum_be/app/Http/Controllers/OrderController.php` (Method: `complete`)
- **Issue**: If an employee "completes" a `pending_assignment` order directly (bypassing Store Assignment), the batch stock is deducted, but the `reserved_inventory` is **not** decremented.
- **Result**: `available_inventory` drops double (once from batch deduction, and once because the reservation remains "stuck").

### E. Missing Observer Automation
- **File**: `errum_be/app/Observers/OrderObserver.php`
- **Issue**: Only handles `updated` event (specifically `cancelled`/`refunded`).
- **Problem**: It lacks a `created` event.
- **Solution**: Moving reservation logic to the `created` and `deleted` (for items) events would eliminate the need for manual (and buggy) logic in individual controllers.

### F. Inconsistent API "In Stock" Logic
- **File**: `errum_be/app/Http/Controllers/EcommerceCatalogController.php`
- **Issue**: `in_stock` is calculated as `stock_quantity > 0`.
- **Problem**: If 1 unit is left and it is reserved, `stock_quantity` is 1 but `available_inventory` is 0.
- **Result**: The product shows as "In Stock" on the website, but the "Add to Cart" button will be disabled or throw an error, leading to poor UX.

---

## 3. Edge Cases to Address

1.  **Pre-Orders**:
    - If a product is out of stock and a pre-order is placed, `available_inventory` should ideally go negative (e.g., -5). This represents a "backlog" that needs to be fulfilled by the next incoming batch.
    - Current logic handles this partially, but the `max(0, ...)` calls in some controllers mask this backlog.

2.  **Order Item Deletion**:
    - When a `pending_assignment` order is deleted entirely, all associated reservations must be released. Currently, only cancellation/refund is handled.

3.  **Manual Stock Adjustments**:
    - If a batch is manually adjusted or deleted, the `ProductBatchObserver` correctly syncs `total_inventory`, but it cannot know if reservations are still valid.

---

## 4. Proposed "Antigravity" Fixes

### Step 1: Centralize in Observers
- Implement `created` event in `OrderObserver`. If an order is created with `status = 'pending_assignment'`, automatically iterate through items and increment `reserved_inventory`.
- Implement `OrderItemObserver`. On `created`, `updated` (quantity change), and `deleted`, if the parent order is `pending_assignment`, adjust `reserved_inventory` accordingly.

### Step 2: Refactor OrderController
- Remove manual reservation logic from `create`, `addItem`, `updateItem`, and `removeItem`. Rely on the observers.
- Ensure `complete` and `assignOrderToStore` both trigger the reservation release correctly.

### Step 3: Fix EcommerceController
- Clean up legacy `stock_quantity` references.
- Ensure `cancel` method triggers the observer correctly by updating the status.

### Step 4: Update Catalog API
- Change `in_stock` calculation to use `available_inventory > 0`.

### Step 5: Frontend UX Polishing
- Ensure all product cards and detail pages use `available_inventory` consistently for the "In Stock" badge and "Add to Cart" button state.

---

## 5. Summary Table for Fixes

| Feature | Component | Current Status | Required Fix |
| :--- | :--- | :--- | :--- |
| **Social Commerce Order** | Backend Controller | ❌ No reservation if no batch | Move to OrderObserver `created` |
| **Order Item Add/Remove** | Backend Controller | ❌ Reservation not updated | Move to OrderItemObserver |
| **Store Assignment** | Backend Controller | ✅ Working correctly | None (Refine to match observers) |
| **POS Sale** | Backend Controller | ✅ Prevents selling reserved | None |
| **Ecommerce Cancel** | Backend Controller | ❌ Uses non-existent field | Remove legacy increment code |
| **Catalog Listing** | Backend Controller | ⚠️ Misleading `in_stock` flag | Base on `available_inventory` |
| **Product Detail Page** | Frontend Page | ✅ Uses `available_inventory` | None |
