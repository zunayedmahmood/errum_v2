# Workplan: Shifting Stock Deduction from Store Assignment to Scanning/Fulfillment

## 1. Objective
Shift the physical stock deduction of `ProductBatch` for online orders (E-commerce and Social Commerce) from the Store Assignment phase to the Scanning/Fulfillment phase. This ensures that stock is only physically deducted when it is picked or when the order is finalized for shipment.

---

## 2. Core Architectural Changes

### A. Store Assignment Phase (Validation & Reservation)
- **Controller**: `OrderManagementController::assignOrderToStore`
- **Change**: Stop calling `$batch->save()` to deduct quantity. Instead, only validate availability and assign `store_id` to the order and `product_batch_id` to the items.
- **State**: The item remains in `reserved_inventory` (via `ReservedProduct`). No physical stock is removed from `ProductBatch`.

### B. Scanning Phase (Physical Deduction)
- **Controller**: `StoreFulfillmentController::scanBarcode`
- **Change**: When a barcode is scanned, perform the physical deduction from the corresponding `ProductBatch`. Decrement `ReservedProduct->reserved_inventory` and increment `available_inventory` (or re-sync).

### C. Finalization Fail-Safe (Automatic Deduction)
- **Controller**: `StoreFulfillmentController::markReadyForShipment`
- **Change**: For any items that were NOT scanned (e.g., non-barcode items or skipped scans), perform automatic FIFO deduction from the assigned store's batches. This ensures inventory is always accurate before shipment.

---

## 3. Implementation Steps

### Phase 1: Clean Up & Centralize Reservations (Observers)
1. **Update `OrderObserver`**:
   - Add `created` event: If `status` is `pending_assignment`, loop through items and increment `reserved_inventory`.
   - Add `deleted` event: Release all reservations for the order's items.
2. **Refactor Controllers**:
   - Remove manual `ReservedProduct` logic from `EcommerceOrderController::createFromCart`, `GuestCheckoutController::checkout`, and `OrderController::create`. Let the observers handle it automatically.

### Phase 2: Refactor Store Assignment
1. **Modify `OrderManagementController::assignOrderToStore`**:
   - **KEEP**: Inventory availability validation (ensure the store has enough stock).
   - **KEEP**: Assignment of `order->store_id` and `order_item->product_batch_id`.
   - **KEEP**: Order status transition to `pending` (or `assigned_to_store`).
   - **REMOVE**: The loop that decrements `$batch->quantity` and saves it.
   - **REMOVE**: Manual decrement of `reserved_inventory`. The reservation must persist until fulfillment.

### Phase 3: Implement Deduction in Scanning
1. **Modify `StoreFulfillmentController::scanBarcode`**:
   - After successfully validating the barcode, add logic to:
     1. Find the `ProductBatch` associated with the barcode.
     2. Call `$batch->removeStock($quantity)` (physical deduction).
     3. Decrement `ReservedProduct->reserved_inventory` for the product.
     4. Update `OrderItem` with the actual `product_batch_id` from the barcode (if different from assigned).

### Phase 4: Implement Fail-Safe Completion
1. **Modify `StoreFulfillmentController::markReadyForShipment`**:
   - Add a loop to check for `OrderItems` that still have `reserved_inventory` (i.e., weren't scanned).
   - For each un-scanned item:
     1. Find available batches in the assigned store (FIFO).
     2. Deduct the required quantity from those batches.
     3. Release the corresponding `reserved_inventory`.

### Phase 5: POS & General Completion
1. **Modify `OrderController::complete`**:
   - Ensure that if an order is completed without going through scanning (e.g., POS or manual override), it releases any remaining reservations for its items.
   - Fix legacy `stock_quantity` references.

### Phase 6: Catalog & Search API
1. **Modify `EcommerceCatalogController` & `InventoryController`**:
   - Ensure `in_stock` flag is strictly based on `available_inventory > 0` (Total - Reserved).

---

## 4. Code Dependencies & Files to Update

| File Path | Methods to Update | Impact |
| :--- | :--- | :--- |
| `app/Observers/OrderObserver.php` | `created`, `updated`, `deleted` | Automatic reservation management |
| `app/Http/Controllers/OrderManagementController.php` | `assignOrderToStore` | Stop physical deduction here |
| `app/Http/Controllers/StoreFulfillmentController.php` | `scanBarcode`, `markReadyForShipment` | **Primary deduction logic moves here** |
| `app/Http/Controllers/OrderController.php` | `create`, `complete`, `addItem`, etc. | Remove redundant reservation code; add release on complete |
| `app/Http/Controllers/EcommerceOrderController.php` | `createFromCart`, `cancel` | Remove manual reservation logic; fix legacy fields |
| `app/Http/Controllers/GuestCheckoutController.php` | `checkout` | Remove manual reservation logic |
| `app/Http/Controllers/EcommerceCatalogController.php` | `getProducts`, `getProduct`, `formatProductForApi` | Fix `in_stock` logic |

---

## 5. Verification Plan
1. **Test Reservation**: Create a Social Commerce order (no batch). Verify `ReservedProduct` increments.
2. **Test Assignment**: Assign the order to a store. Verify `ProductBatch` quantity does NOT change.
3. **Test Scanning**: Scan a barcode for the order. Verify `ProductBatch` quantity decrements and `ReservedProduct` reservation releases.
4. **Test Fail-Safe**: Create an order with 2 items. Scan only 1. Mark as "Ready for Shipment". Verify both items are correctly deducted from batches.
5. **Test Cancellation**: Cancel a pending order. Verify all reservations are released.
