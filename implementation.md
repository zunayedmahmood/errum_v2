# LazyChat Integration Implementation

## 1. Scope

This implementation adds LazyChat order creation and product change webhooks without changing the existing Errum order, product, batch, return, exchange, purchase order, or image business logic.

LazyChat integration has two responsibilities:

1. Receive order creation requests from LazyChat.
2. Send product create/update/delete webhook requests to LazyChat whenever product data that affects LazyChat changes.

Initial product sync is intentionally not implemented because it was outside the requested scope.

---

## 2. Product Identity Rule

Errum treats each `products` row as one actual sellable product or variation.

Important rule for LazyChat:

- `product.id` is the unique LazyChat product identifier.
- `sku` is only used for grouping related products/variations.
- Multiple products may share the same `sku`.
- LazyChat orders should send the sellable product row ID in `line_items[].product_id`.

---

## 3. Cost Price Visibility Rule

The existing product-detail controller method is shared by e-commerce pages and admin-side callers. Admin-side callers still need cost price, so the existing query-building and hydration logic is not removed.

The controller now checks whether the request is coming from e-commerce context and removes all `cost_price` fields from the final response only after the response body has already been built.

The e-commerce checker currently supports:

- `hide_cost_price=true` query parameter, now sent by the e-commerce product detail/cart product-detail calls.
- `include_availability=false`, which the e-commerce product detail page already uses.
- Browser `Referer` paths containing `/e-commerce/`.

This means e-commerce pages do not receive product or batch cost price, while admin routes using the same method can continue receiving cost price. LazyChat product webhooks also do not include product cost price.

---

## 4. Example Product Data Returned to E-commerce Product Detail Page

This is an example of how product data is exposed to the e-commerce product detail page after the cost-price hiding change. This is **not** the exact webhook payload sent to LazyChat. Admin/internal callers of the same backend method can still receive `cost_price`, but e-commerce callers and LazyChat-facing payloads do not need product cost price.

```json
{
  "success": true,
  "data": {
    "product": {
      "id": 748,
      "name": "Jordan 3 Retro Craft Ivory (1:1)-46",
      "base_name": "Jordan 3 Retro Craft Ivory (1:1)",
      "variation_suffix": "-46",
      "brand": null,
      "sku": "903240500",
      "description": "The Jordan 3 Retro Craft Ivory is a sophisticated blend of iconic heritage and contemporary design.",
      "selling_price": "8500.00",
      "stock_quantity": 2,
      "available_inventory": 2,
      "reserved_inventory": 0,
      "in_stock": true,
      "has_variants": true,
      "variants_count": 6,
      "category": {
        "id": 10,
        "name": "Jordan 3 Retro"
      },
      "vendor": {
        "id": 1,
        "name": null
      },
      "images": [
        {
          "id": 14128,
          "url": "https://backend.errumbd.com/storage/products/748/1778742446_rhGxNQ9R2d.webp",
          "alt_text": "Jordan 3 Retro Craft Ivory (1:1)-46",
          "is_primary": true,
          "sort_order": 0
        }
      ],
      "batches": [
        {
          "id": 193,
          "product_id": "748",
          "batch_number": "PO-20260422-000033-202",
          "quantity": 2,
          "sell_price": "8500.00",
          "tax_percentage": "0.00",
          "base_price": "8500.00",
          "tax_amount": "0.00",
          "availability": true,
          "is_active": true,
          "created_at": "2026-04-22T07:53:59.000000Z",
          "updated_at": "2026-04-22T07:53:59.000000Z"
        }
      ],
      "created_at": "2026-02-16T06:05:50.000000Z",
      "updated_at": "2026-02-16T06:05:50.000000Z"
    }
  }
}
```

---

## 5. LazyChat Product Webhook Payload Format

For product create/update, Errum sends one product object to LazyChat.

Endpoint:

```txt
POST https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/fBML0cvz4Kkq
```

Headers:

```txt
Authorization: Bearer {LAZYCHAT_PRODUCT_UPSERT_TOKEN}
X-Webhook-Topic: product/create
```

or:

```txt
Authorization: Bearer {LAZYCHAT_PRODUCT_UPSERT_TOKEN}
X-Webhook-Topic: product/update
```

Example body:

```json
{
  "id": 748,
  "sku": "903240500",
  "base_name": "Jordan 3 Retro Craft Ivory (1:1)",
  "variation_suffix": "-46",
  "name": "Jordan 3 Retro Craft Ivory (1:1)-46",
  "brand": null,
  "category": {
    "id": 10,
    "title": "Jordan 3 Retro",
    "slug": "jordan-3-retro"
  },
  "vendor": {
    "id": 1,
    "name": null
  },
  "description": "The Jordan 3 Retro Craft Ivory is a sophisticated blend of iconic heritage and contemporary design.",
  "weight": null,
  "selling_price": 8500,
  "price": 8500,
  "lowest_batch_price": 8500,
  "highest_batch_price": 8500,
  "average_batch_price": 8500,
  "stock_quantity": 2,
  "reserved_inventory": 0,
  "available_inventory": 2,
  "in_stock": true,
  "stock": {
    "total_physical_stock": 2,
    "reserved_stock": 0,
    "available_stock": 2,
    "in_stock": true
  },
  "branch_stock": [
    {
      "store_id": 1,
      "store_name": "Main Store",
      "store_address": "Mirpur, Dhaka",
      "quantity": 2,
      "available_quantity": 2
    }
  ],
  "images": [
    {
      "id": 14128,
      "product_id": 748,
      "url": "https://backend.errumbd.com/storage/products/748/1778742446_rhGxNQ9R2d.webp",
      "alt_text": "Jordan 3 Retro Craft Ivory (1:1)-46",
      "is_primary": true,
      "sort_order": 0
    }
  ],
  "batches": [
    {
      "id": 193,
      "batch_number": "PO-20260422-000033-202",
      "store_id": 1,
      "store_name": "Main Store",
      "quantity": 2,
      "sell_price": 8500,
      "availability": true,
      "is_active": true,
      "manufactured_date": null,
      "expiry_date": null
    }
  ],
  "barcodes": [],
  "is_archived": false,
  "created_at": "2026-02-16T06:05:50+00:00",
  "updated_at": "2026-02-16T06:05:50+00:00"
}
```

For product delete, Errum sends only the product ID.

Endpoint:

```txt
POST https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/FXfUG5jBNVc0
```

Headers:

```txt
Authorization: Bearer {LAZYCHAT_PRODUCT_DELETE_TOKEN}
X-Webhook-Topic: product/delete
```

Body:

```json
{
  "product_id": 748
}
```

---

## 6. Places Where Errum Sends LazyChat Webhook Requests

All webhook requests are sent through the queued job:

```php
App\Jobs\SendLazyChatProductWebhook
```

The job catches LazyChat failures and logs warnings instead of breaking Errum flows.

### 6.1 Product create/update/delete

Observer:

```php
App\Observers\LazyChatProductObserver
```

Observed model:

```php
App\Models\Product
```

Webhook behavior:

| Errum event | LazyChat topic | Body format |
|---|---|---|
| Product created | `product/create` | Full product JSON |
| Product updated | `product/update` | Full product JSON |
| Product deleted | `product/delete` | `{ "product_id": id }` |
| Product restored | `product/update` | Full product JSON |

This covers direct product changes such as name, SKU, category, vendor, brand, description, variation suffix, and archive-related product updates.

### 6.2 Batch create/update/delete

Observer:

```php
App\Observers\ProductBatchObserver
```

Observed model:

```php
App\Models\ProductBatch
```

Webhook behavior:

| Errum event | LazyChat topic | Body format |
|---|---|---|
| Batch created | `product/update` | Full product JSON |
| Batch updated | `product/update` | Full product JSON |
| Batch deleted | `product/update` | Full product JSON |

This is the most important observer for price and stock changes because LazyChat price and stock are calculated from active product batches.

Covered flows:

- Batch price update page changing `sell_price`.
- Batch price update page changing `cost_price` still triggers a product update, but `cost_price` is not sent to LazyChat.
- Product batch creation from product/batch page.
- Product batch quantity changes.
- Return restock that increments batch quantity.
- Exchange replacement sale that removes stock from batch.
- Exchange returned product restock that increments batch quantity.
- Purchase order receiving if it creates or updates product batches.
- Batch delete/deactivation if the batch row is deleted.

### 6.3 Reserved inventory changes

Observer:

```php
App\Observers\LazyChatReservedProductObserver
```

Observed model:

```php
App\Models\ReservedProduct
```

Webhook behavior:

| Errum event | LazyChat topic | Body format |
|---|---|---|
| Reserved inventory row saved | `product/update` | Full product JSON |

Covered flows:

- Order creation/reservation updates.
- Order item observer updates to reserved inventory.
- Batch observer stock sync updates to `total_inventory` and `available_inventory`.
- Exchange flow updates to reserved inventory after replacement product sale.

### 6.4 Product image create/update/delete

Observer:

```php
App\Observers\LazyChatProductImageObserver
```

Observed model:

```php
App\Models\ProductImage
```

Webhook behavior:

| Errum event | LazyChat topic | Body format |
|---|---|---|
| Product image created | `product/update` | Full product JSON |
| Product image updated | `product/update` | Full product JSON |
| Product image deleted | `product/update` | Full product JSON |

Covered flows:

- Single product image upload.
- Product image delete.
- Product image primary status change.
- Product image reorder.
- Image sync across SKU variants, because the sync process deletes/recreates `ProductImage` rows for every product sharing that SKU.

---

## 7. LazyChat Order Creation Endpoint

LazyChat sends order creation requests to Errum using this public endpoint:

```txt
POST https://backend.errumbd.com/api/order/create
```

Controller:

```php
App\Http\Controllers\LazyChatOrderController@store
```

The route is intentionally unauthenticated because LazyChat will call it as a webhook/API endpoint.

Example request from LazyChat:

```json
{
  "id": 71,
  "deliveryCharge": "0",
  "contact": {
    "name": "Customer Name",
    "phone": "01700000000",
    "address": "Gulshan, Dhaka"
  },
  "total_price": 1198,
  "note": "This order was placed by LazyChat AI. Please, review and reconfirm order details before processing.",
  "payment_method": "cash_on_delivery",
  "payment_status": "unpaid",
  "line_items": [
    {
      "product_id": "2930",
      "sku": "3916",
      "variation_id": "2930",
      "name": "Cosrx Salicylic Acid Daily Gentle Cleanser (50ml)",
      "price": 599,
      "quantity": 2,
      "image": "https://backend.errumbd.com/storage/products/748/1778742446_rhGxNQ9R2d.jpg"
    }
  ]
}
```

Expected response on success:

```json
{
  "success": true,
  "message": "LazyChat order created successfully.",
  "data": {
    "order_id": 1001,
    "order_number": "ORD-20260518-ABC123",
    "lazychat_order_id": "71",
    "total_amount": 1198,
    "status": "pending_assignment"
  }
}
```

Important behavior:

- `line_items[].product_id` is treated as the Errum `products.id`.
- The order is created using the same general logic as e-commerce checkout.
- The order is saved as a pending assignment order.
- LazyChat source metadata is stored on the order.
- Duplicate LazyChat order IDs are blocked using `metadata->lazychat_order_id`.

---

## 8. Configuration

LazyChat settings are stored in:

```php
config/lazychat.php
```

Environment variables:

```env
LAZYCHAT_ENABLED=true
LAZYCHAT_TIMEOUT=5
LAZYCHAT_PRODUCT_UPSERT_URL=https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/fBML0cvz4Kkq
LAZYCHAT_PRODUCT_UPSERT_TOKEN=...
LAZYCHAT_PRODUCT_DELETE_URL=https://flow.lazychat.io/api/exec/flows/6a02dcadf00b1c2c40678385/FXfUG5jBNVc0
LAZYCHAT_PRODUCT_DELETE_TOKEN=...
```

---

## 9. Verification Notes

Checked webhook coverage against the requested flows:

| Flow | Covered? | Why |
|---|---:|---|
| Change selling price from batch-price-update page | Yes | Updates `ProductBatch.sell_price`, triggering `ProductBatchObserver` → `product/update` |
| Change cost price from batch-price-update page | Yes | Updates `ProductBatch.cost_price`, triggering `ProductBatchObserver` → `product/update`; the outgoing LazyChat payload still omits `cost_price` |
| Return restock | Yes | Restock increments `ProductBatch.quantity`, triggering `ProductBatchObserver` → `product/update` |
| Exchange replacement sale | Yes | Replacement sale calls batch stock removal and reserved inventory sync, triggering product update webhooks |
| Exchange returned product restock | Yes | Restock increments/creates `ProductBatch`, triggering `ProductBatchObserver` → `product/update` |
| Image changes | Yes | `ProductImage` saved/deleted triggers `LazyChatProductImageObserver` → `product/update` |
| Image sync across SKU | Yes | Sync deletes/recreates image rows for every SKU sibling product, triggering image observer per product |
| Receiving PO | Yes, if receiving creates/updates `ProductBatch` rows | Batch creation/update triggers `ProductBatchObserver` → `product/update` |
| Creating batch from product/batch page | Yes | `ProductBatch::create()` triggers `ProductBatchObserver` → `product/update` |

---

## 10. Tradeoff / Known Behavior

Some flows may dispatch more than one `product/update` for the same product because a single business action can update both `ProductBatch` and `ReservedProduct`. This is intentional for safety and simplicity. LazyChat should treat product upsert webhooks as idempotent updates keyed by `product.id`.

The implementation avoids changing existing Errum business logic. It only observes the already-existing model changes and sends LazyChat updates from those changes.
