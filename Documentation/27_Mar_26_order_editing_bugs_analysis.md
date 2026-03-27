# Order Editing Bugs Analysis & Resolution Plan
**Date:** March 27, 2026  
**Status:** Analysis Complete

## 1. Bug: "Attempt to read property 'quantity' on null"

### 1.1 Technical Root Cause
The error occurs in `App\Http\Controllers\OrderController::updateItem`. When updating the quantity of an order item, the system attempts to validate stock availability against the assigned batch:

```php
if ($request->filled('quantity')) {
    // Validate stock
    if ($item->batch->quantity < $request->quantity) { // <--- CRASHES HERE
        throw new \Exception("Insufficient stock. Available: {$item->batch->quantity}");
    }
    $item->updateQuantity($request->quantity);
}
```

For **E-commerce** and **Social Commerce** orders that are `pending_assignment` or `pending_fulfillment`, the `order_items` records are created without a `product_batch_id`. In these cases, `$item->batch` returns `null`, leading to the PHP error.

### 1.2 Proposed Fix
Update the validation logic to check if a batch is assigned. If not, validate against global availability (ReservedProduct) or allow the update since stock will be validated during the fulfillment/scanning phase anyway.

```php
if ($request->filled('quantity')) {
    if ($item->batch) {
        if ($item->batch->quantity < $request->quantity) {
            throw new \Exception("Insufficient stock. Available: {$item->batch->quantity}");
        }
    } else {
        // Fallback for unassigned items: Check global availability
        $reserved = \App\Models\ReservedProduct::where('product_id', $item->product_id)->first();
        $available = $reserved ? $reserved->available_inventory : 0;
        // Logic depends on whether we want to strict-block here
    }
    $item->updateQuantity($request->quantity);
}
```

---

## 2. Bug: "Store information is missing for this order"

### 2.1 Technical Root Cause
This is a frontend logic constraint in `app/orders/OrdersClient.tsx`. The `openProductPicker` function requires a `storeId` to function because the product picker is designed to show store-specific batches:

```typescript
const openProductPicker = () => {
  if (!editableOrder?.storeId && !pickerStoreId) {
    alert('Store information is missing for this order.');
    return;
  }
  const storeId = editableOrder?.storeId || pickerStoreId;
  // ...
  fetchBatchesForStore(storeId);
};
```

When an order is in `pending_assignment` status (no `store_id`), and the manager tries to add items, the picker fails. This is especially problematic if the manager removes all existing items, as they lose the ability to add anything back.

### 2.2 Proposed Fix
1. **Frontend**: Modify `openProductPicker` to allow opening without a store ID for `ecommerce` and `social_commerce` orders.
2. **Product Picker**: If no store is selected, the picker should search products globally via `productService.advancedSearch` and skip the batch-filtering logic.
3. **Backend Integration**: Ensure `OrderController::addItem` can handle `product_id` additions without a `batch_id` for these order types.

---

## 3. Implementation Steps

1. **Surgical Backend Fix**: Patch `OrderController.php` to handle null batches in `updateItem`.
2. **Frontend UI Update**: Refactor `OrdersClient.tsx` to decouple the Product Picker from a mandatory `storeId` for online order types.
3. **Validation**: Test editing an unassigned e-commerce order by adding/removing items and changing quantities.
