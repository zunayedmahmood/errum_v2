# Documentation: Centralising Stock Deduction & Return System Refinement
Date: 1 Apr 2026

## Overview
This document details the major architectural changes made to centralise stock deduction logic and refine the Return/Exchange system in Errum V2.

## 1. Centralised Stock Deduction
Previously, stock was being deducted at multiple points (Order Creation, POS Scanning, Social Commerce Packaging), leading to duplicate selling issues. We have refactored the system to use a **Reservation-First** model.

### Key Changes:
- **`OrderController@create`**: Removed immediate stock deduction for `counter` (POS) orders. All orders now start by reserving stock.
- **`StoreFulfillmentController@scanBarcode`**: Removed stock deduction during the scanning process in Social Commerce and E-commerce fulfillment.
- **`OrderController@complete`**: This is now the **single source of truth** for physical stock deduction. It handles:
  1. Releasing the global reservation for the items.
  2. Deducting physical stock from the assigned store's batch.
  3. Recording the transaction.
- **`OrderItemObserver`**: Updated to handle reservations for ALL order types (including `counter` and `social_commerce`) and across more statuses (`assigned_to_store`, `ready_for_pickup`, etc.), ensuring inventory integrity from order inception to completion.

## 2. Atomic Return & Exchange System
The Return and Exchange system in the `/lookup` page has been overhauled to be robust, role-restricted, and atomic.

### Key Changes:
- **Atomic Processing (`ProductReturnController@quickComplete`)**: A new backend endpoint was implemented to handle the multi-step return process (Create Return -> Receive Items -> Restore Inventory -> Complete Return) in a single database transaction. This prevents partial data states on network failure.
- **Refined Inventory Restoration**:
    - Returns now correctly restore physical stock while automatically releasing any accidental reservations.
    - **Cross-Store Returns**: When an item is returned to a store different from its original sale store, a new batch is created with a naming convention: `POid-RTN-RTNid` (e.g., `123-RTN-456`). This preserves the audit trail back to the original Purchase Order.
- **Role-Based Initiation**: Only `admins`, `branch-manager`, and `POS` users can now initiate returns or exchanges from the `/lookup` page.
- **UI Integration**: The `/lookup` page now invokes the standard, robust `ReturnProductModal` and `ExchangeProductModal` components, ensuring a consistent and reliable user experience across the application.
- **Universal Lookup**: The `/lookup` page now correctly bypasses automated `store_id` scoping (using `X-Skip-Store-Scope: true`), allowing cross-store order and product tracking.

## 3. Data Integrity & Sync
- **`ProductBatchObserver`**: Enhanced to ensure that any change to physical stock in a batch (including returns) automatically triggers a synchronization of `ReservedProduct` values.
- **Internal API Fixes**: Resolved issues where "Assign to Warehouse" in Social Commerce was being misidentified as a store assignment due to automatic `store_id` injection in the frontend HTTP client.

---
*Note: These changes ensure that the system remains scalable and consistent even during high-volume sales periods.*
