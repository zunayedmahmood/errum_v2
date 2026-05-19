# ErrumBD Custom Integration Plan: Lazychat AI

## 1. Executive Summary
This document provides a comprehensive technical guide for integrating Errum BD's Laravel-based backend with Lazychat AI. The integration aims to automate inventory synchronization and order fulfillment, allowing Lazychat's AI to act as a seamless extension of the Errum BD sales ecosystem.

By bridging the gap between Errum BD’s robust inventory management and Lazychat’s conversational AI, the business can achieve near-instantaneous synchronization of product data and automated entry of social commerce orders into the warehouse fulfillment workflow.

---

## 2. Integration Architecture Overview

The integration is divided into three major architectural phases, each designed for high reliability and data integrity:

1. **Initial Inventory Synchronization:** A bulk data feed of the entire product catalog, mapping Errum’s SKU groups and dynamic pricing to Lazychat’s product schema.
2. **Real-time Change Tracking (Webhooks):** An event-driven system using Eloquent Observers and Laravel Queues to push updates to Lazychat as they happen.
3. **Automated Order Ingestion:** A secure, idempotent API endpoint for AI-generated orders to enter Errum BD with automated customer matching and stock reservation.

---

## 3. Phase 1: Initial Inventory Synchronization

### 3.1 Overview
Lazychat requires a reliable JSON endpoint to fetch all active products. This feed will be used to train the AI on available inventory, pricing, and product attributes.

### 3.2 Endpoint Specification
- **URL:** `GET https://backend.errumbd.com/api/external/lazychat/products`
- **Method:** `GET`
- **Controller:** `App\Http\Controllers\External\LazychatIntegrationController@getProducts`
- **Middleware:** `auth:external`
- **Pagination:** Supported via `?page=X` (30 products per page default).
- **Response Format:** JSON (Paginated)

### 3.3 Data Mapping Strategy (Deep Dive)

#### 3.3.1 Core Product Information
| Lazychat Key | Errum BD Source | Transformation Logic |
| :--- | :--- | :--- |
| `id` | `Product.id` | Unique integer ID for database consistency. |
| `title` | `Product.name` | Display name (Base Name + Variation Suffix). |
| `slug` | `Product.slug` | URL-friendly identifier for SEO/Direct links. |
| `url` | `Frontend URL` | `config('app.frontend_url') . '/products/' . $product->id` |
| `description`| `Product.description`| Full HTML content from the CMS for AI training. |
| `summary` | `Str::limit(...)` | Truncated description for quick AI snippets. |
| `sku` | `Product.sku` | The primary Stock Keeping Unit for the product group. |
| `brand` | `Product.brand` | Brand name string (e.g., "Cosrx"). |
| `weight` | `Product.weight` | Numeric value (KG) for shipping calculations. |
| `published` | `!is_archived` | Boolean indicating if the product is live. |

#### 3.3.2 Categories and Hierarchy
Errum BD uses a nested category system with a materialized path (e.g., `5/12/20`). Lazychat expects a flat array of categories.
- **Source:** `Product.category` relation.
- **Logic:** We will include the immediate parent and all ancestors to provide the AI with context (e.g., "Women > Skincare > Cleansers").

#### 3.3.3 Media and Images
Images are retrieved from the `ProductImage` model, filtered by `is_active`.
- **Primary Image:** The image marked `is_primary = true` is always moved to index 0 of the array.
- **Alt Text:** `alt_text` is included to help the AI describe products visually to customers.

#### 3.3.4 Dynamic Pricing and Inventory
Prices in Errum BD are dynamic and live in `product_batches`.
- **Regular Price:** Lowest `sell_price` from all active batches across all stores.
- **Stock Status:** `true` if `SUM(batches.quantity) > 0`.
- **Available Stock:** Calculated as `Total Stock - Reserved Stock` (from `ReservedProduct` table).

---

## 4. Phase 2: Real-time Change Synchronization (Webhooks)

### 4.1 Webhook Architecture
To maintain data parity, Errum BD must "push" updates to Lazychat whenever the catalog changes. This prevents the AI from selling out-of-stock or discontinued items.

### 4.2 Observer Implementation
A dedicated `ProductObserver` will be registered to listen for lifecycle events.

```php
namespace App\Observers;

use App\Models\Product;
use App\Jobs\External\SendLazychatWebhookJob;

class ProductObserver {
    /**
     * Triggered on Product Creation.
     */
    public function created(Product $product) {
        dispatch(new SendLazychatWebhookJob($product, 'product/create'));
    }

    /**
     * Triggered on any update (price, stock, description).
     */
    public function updated(Product $product) {
        // Only trigger if critical fields change to save bandwidth
        if ($product->wasChanged(['name', 'description', 'is_archived'])) {
            dispatch(new SendLazychatWebhookJob($product, 'product/update'));
        }
    }

    /**
     * Triggered on deletion or archiving.
     */
    public function deleted(Product $product) {
        dispatch(new SendLazychatWebhookJob($product, 'product/delete'));
    }
}
```

### 4.3 Batch Stock Updates
Since inventory changes happen at the `ProductBatch` level, we will also observe the `ProductBatch` model to trigger `product/update` webhooks when stock levels fluctuate significantly.

---

## 5. Phase 3: Automated Order Creation

### 5.1 Order Ingestion Endpoint
Lazychat will push orders to Errum BD as soon as the AI confirms the customer's intent.

- **URL:** `POST https://backend.errumbd.com/api/external/lazychat/orders`
- **Method:** `POST`
- **Auth:** Bearer Token

### 5.2 Ingestion Workflow (Step-by-Step)

#### Step 1: Request Validation
The system validates the incoming JSON against the required schema (Customer details, Line Items, Total Price).

#### Step 2: Customer Identity Resolution
- Search `Customer` table by phone number (normalized to E.164 format).
- If found, link the order to the existing profile to preserve loyalty history.
- If not found, create a new record with `customer_type: 'social_commerce'`.

#### Step 3: Order Initialization
- `order_type`: Set to `social_commerce`.
- `status`: Set to `pending_assignment`.
- `order_number`: Auto-generated using the `ORD-YYYYMMDD-XXXXXX` format.

#### Step 4: Intelligent Batch Selection
The system will attempt to auto-assign the order to an available `ProductBatch`:
1. Filter batches by `product_id` and `quantity > 0`.
2. Prioritize batches with the earliest `expiry_date` (FEFO).
3. Fallback to earliest `created_at` (FIFO).

#### Step 5: Global Stock Reservation
To prevent overselling while the order is pending, the system will increment the `reserved_inventory` in the `ReservedProduct` table for each SKU in the order.

#### Step 6: Confirmation Response
Errum BD returns the internal `order_number` and `id` to Lazychat for customer tracking.

---

## 6. Technical Specifications & Payload Examples

### 6.1 Product Sync Payload (Initial & Webhook)
```json
{
  "id": 6001,
  "title": "Classic Cotton T-Shirt",
  "slug": "classic-cotton-tshirt",
  "sku": "TSHIRT-CLASSIC",
  "brand": "EcoWear",
  "description": "<p>Premium organic cotton.</p>",
  "categories": [
    { "id": 20, "title": "Shirts", "slug": "shirts" }
  ],
  "images": [
    { "url": "https://cdn.errumbd.com/p/tshirt-red.jpg", "is_primary": true }
  ],
  "pricing": {
    "regular_price": "24.99"
  },
  "inventory": {
    "stock_status": true,
    "total_quantity": 85
  },
  "variations": [
    {
      "id": 6002,
      "title": "Small / Red",
      "sku": "TSHIRT-S-RED",
      "pricing": { "regular_price": "24.99" },
      "inventory": { "stock_status": true, "stocks": [{ "quantity": 50 }] }
    }
  ]
}
```

### 6.2 Order Ingestion Payload (Incoming from Lazychat)
```json
{
  "id": "LZ-ORD-71",
  "deliveryCharge": "100",
  "contact": {
    "name": "Zunayed Mahmood",
    "phone": "01700000000",
    "address": "Gulshan 2, Dhaka, 1212"
  },
  "total_price": 1298,
  "note": "AI Order: Please confirm before 2 PM.",
  "payment_method": "cash_on_delivery",
  "payment_status": "unpaid",
  "line_items": [
    {
      "product_id": "2930",
      "sku": "3916",
      "name": "Cosrx Cleanser",
      "price": 599,
      "quantity": 2
    }
  ]
}
```

---

## 7. Security and Reliability

### 7.1 Authentication (Bearer Token)
All integration endpoints are protected by a static Bearer token shared between Errum BD and Lazychat. This is validated via a custom Laravel Middleware.

```php
public function handle(Request $request, Closure $next) {
    $token = $request->bearerToken();
    if ($token !== config('services.lazychat.token')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }
    return $next($request);
}
```

### 7.2 Idempotency
To prevent duplicate orders due to network retries, the system will use the `LZ-ORD-ID` as an idempotency key. If a second request arrives with the same external ID, the system will return the original order data without creating a duplicate.

### 7.3 Logging & Audit Trail
Every integration event is logged in the `activity_logs` table:
- `subject_type`: `Order` / `Product`
- `description`: "Lazychat Order Ingested" or "Product Sync Webhook Sent"
- `properties`: Full request/response body for debugging.

---

## 8. Multi-Store Fulfillment Logic
Errum BD supports multi-store operations. When a Lazychat order enters the system:
- It initially lands with `store_id = NULL`.
- Warehouse managers use the "Multi-Store Assignment" dashboard to select the branch closest to the customer with available stock.
- This manual step ensures that local stock levels are verified before the order is "Confirmed" and inventory is physically deducted.

---

## 9. Development Timeline

1. **Phase 1 Implementation (Days 1-2):**
   - Create `External` controller namespace.
   - Implement `api/external/lazychat/products` with pagination.
2. **Phase 2 Implementation (Days 3-4):**
   - Implement `ProductObserver` and `ProductBatchObserver`.
   - Setup Queue Job `SendLazychatWebhookJob`.
3. **Phase 3 Implementation (Days 5-7):**
   - Create `POST api/external/lazychat/orders`.
   - Implement Customer matching and Order creation logic.
   - Implement Stock Reservation logic.
4. **Testing & QA (Days 8-10):**
   - End-to-end integration testing with Lazychat team.
   - Performance tuning for bulk product sync.

---

## 10. Conclusion
This integration plan provides a robust, scalable, and secure framework for connecting Errum BD with Lazychat AI. By strictly following the data mapping and security protocols outlined here, the business can leverage AI automation to drive sales while maintaining absolute control over inventory and fulfillment.

For further technical inquiries, please contact the Errum BD Engineering Lead.

---
*End of Document*
*Total Estimated Length: 320+ Lines*
