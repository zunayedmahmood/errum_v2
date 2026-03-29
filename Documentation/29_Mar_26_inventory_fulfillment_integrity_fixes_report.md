# Inventory Fulfillment and Reservation Integrity Fixes

## Date: March 29, 2026
## Status: Implemented

### Overview
This update addresses critical issues in the inventory management system related to double stock deduction, incorrect reservations for physical sales, and synchronization during the fulfillment process.

### Key Changes

#### 1. Order Lifecycle & Stock Deduction (`OrderController.php`)
- **Direct Deduction for Social Commerce**: Orders from the `social_commerce` channel that are assigned to a specific store at the time of creation now trigger immediate stock deduction. This aligns with the "immediate deduction" behavior required for direct-assigned sales.
- **Preventing Double Deduction in POS**: Added a guard clause in the `complete()` method to skip manual stock removal for `counter` orders. Since these orders already have their stock deducted during the `create()` phase (when barcodes are scanned), this change eliminates the double-deduction bug.

#### 2. Reservation Management (`OrderItemObserver.php`)
- **Exempting Physical Sales**: The observer now skips reservation replenishment (`reserved_inventory++`) for `counter` orders. For physical sales, stock is deducted immediately, making a background reservation redundant and incorrect.
- **Exempting Direct-Assigned Social Commerce**: Similarly, `social_commerce` orders with an assigned `store_id` are now excluded from the reservation logic, as their stock is already deducted directly from the batch.

#### 3. Fulfillment Scan Logic (`StoreFulfillmentController.php`)
- **Atomic Inventory Synchronization**: Updated the `scanBarcode` method to use a database transaction with `lockForUpdate` on the `ReservedProduct` record. 
- **Standardized Sequence**:
    1.  **Deduct Physical Stock**: Uses `$batch->decrement('quantity', 1)`, which triggers the `ProductBatchObserver` to update `total_inventory`.
    2.  **Release Reservation**: Decrements `reserved_inventory` on the locked record.
    3.  **Recalculate Availability**: Uses the direct formula `available_inventory = total_inventory - reserved_inventory` after a `refresh()` to ensure consistency.
- **Goal Achieved**: The available inventory remains stable during the picking/packing process because the unit moves seamlessly from "reserved" to "sold" (removed from total).

#### 4. Observer Refinement (`ProductBatchObserver.php`)
- **Standardized Availability Formula**: Refined the `syncReservedProduct` logic to always use the latest database values via `refresh()`.
- **Consistency**: The formula `available_inventory = total_inventory - reserved_inventory` is now consistently applied without manual overrides, allowing the system to naturally reflect oversold or over-reserved states if they occur.

### Technical Summary of Formula
- **Total Inventory**: Sum of all physical quantities in non-deleted batches.
- **Reserved Inventory**: Sum of quantities in pending/pending_assignment online orders (excluding direct-assigned).
- **Available Inventory**: `Total Inventory - Reserved Inventory`.

### Impact
- **Accuracy**: POS sales no longer deduct stock twice.
- **Reliability**: Online order availability is preserved accurately during fulfillment.
- **Consistency**: Social commerce orders assigned to stores behave like immediate sales, reducing inventory fragmentation.
