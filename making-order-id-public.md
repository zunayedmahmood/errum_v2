# Making Order ID Public Documentation

This document explains the changes made to allow public access to order details and tracking information using only the order number. This is essential for guest checkouts where customers may not have an account but still need to track their orders.

## Overview

Previously, order details and tracking information were restricted to authenticated customers. We have modified both the backend and frontend to permit public access to specific order endpoints while keeping other administrative and customer-specific actions (like cancellation) protected.

## Backend Changes (Laravel)

### 1. Route Configuration (`api.php`)

Two routes have been moved from the `auth:customer` middleware group to a new public group:

- `GET /api/customer/orders/{orderNumber}` (Order Details)
- `GET /api/customer/orders/{orderNumber}/track` (Order Tracking)

The routes are now defined as follows:

```php
// E-commerce Order Management (Customer) - Public Access
Route::prefix('customer/orders')->group(function () {
    // Get order details (Public for guest tracking/confirmation)
    Route::get('/{orderNumber}', [\App\Http\Controllers\EcommerceOrderController::class, 'show']);
    
    // Track order (Public for guest tracking)
    Route::get('/{orderNumber}/track', [\App\Http\Controllers\EcommerceOrderController::class, 'track']);
});
```

### 2. Controller Logic (`EcommerceOrderController.php`)

- **Middleware Exception**: The `show` and `track` methods are now excluded from the default `auth:customer` middleware in the constructor.
- **Removed Ownership Check**: The `show` and `track` methods no longer filter by `customer_id`. They now locate the order using only the `order_number`.

```php
public function show($orderNumber): JsonResponse
{
    try {
        // Public access: find by order number without customer_id check
        $order = Order::where('order_number', $orderNumber)
            ->with(['items.product.images', 'customer', 'store', 'payments'])
            ->firstOrFail();
        // ...
    }
}
```

## Frontend Changes (Next.js)

### 1. API Client Configuration (`lib/axios.ts`)

Added `/customer/orders/` to the `PUBLIC_ROUTES` list in the `axiosInstance`. This ensures:
- No authentication token is attached to these requests by default (avoiding potential token leaks or overhead for public users).
- 401 Unauthorized responses from the backend (if they occur) do not trigger a redirect to the login page for these specific routes.

```javascript
const PUBLIC_ROUTES = [
  // ... existing routes
  '/customer/orders/', // Public order tracking and details
];
```

### 2. Service Layer (`services/checkoutService.ts`)

The existing methods in `CheckoutService` now work for both guest and authenticated users:
- `trackOrder(orderNumber)`
- `getOrderByNumber(orderNumber)`

## Usage Examples

### Tracking an Order
A guest user visits: `/e-commerce/order-tracking/ORD-231005-4321`
- The frontend calls `GET /api/customer/orders/ORD-231005-4321/track`.
- The backend identifies the order and returns the current status and tracking steps.

### Order Confirmation
After a successful purchase, a guest is redirected to: `/e-commerce/order-confirmation/ORD-231005-4321`
- The frontend calls `GET /api/customer/orders/ORD-231005-4321`.
- The backend returns the full order summary for display.

## Edge Cases and Security

- **Non-existent Order Number**: The API returns a `404 Not Found` response with a "Order not found" message.
- **Sensitive Operations**: Operations like "Cancel Order" or updating the shipping address STILL require authentication. These are protected under the `auth:customer` middleware and ensure that only the verified customer can modify their order.
- **Brute-forcing**: While order numbers are public, they are generated with a timestamp and a random component (e.g., `ORD-YYMMDD-XXXX`), making them significantly harder to guess than sequential IDs.
