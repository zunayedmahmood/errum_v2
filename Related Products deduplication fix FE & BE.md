# Related Products Deduplication Fix: Backend (BE) & Frontend (FE)

This document outlines the architectural changes implemented to ensure related products are relevant, deduplicated by mother product (base_name), and randomized for a dynamic user experience on the product detail page.

## 1. Backend: Controller Refactoring (`EcommerceCatalogController.php`)

### Problem
Previously, the `related_products` query fetched direct product matches by `category_id`. This resulted in:
- **Duplicate Styles**: Different sizes or colors of the same product SKU appearing multiple times in the related list.
- **Self-Reference**: The current product sometimes appearing in its own related products list.
- **Static Results**: Results were not randomized, leading to the same products being shown every time.

### Solution: Deduplicated Random Query
The `getProduct` method was updated to use a two-step query process:

1. **Subquery for IDs**:
   - Filter by `category_id` (matching the current product).
   - Exclude the current product's `base_name` entirely to avoid showing different variations of the same product.
   - Group by `base_name` to ensure only one representative of each product style is selected.
   - Use `MIN(id)` to pick a deterministic representative for the group.
   - Apply `inRandomOrder()` to get a fresh set of products on each request.
   - Limit the result set to 5 products.

2. **Eloquent Hydration**:
   - Fetch the full Eloquent models (including images and batches) using the resolved IDs from the subquery.

```php
// Backend logic snippet
$relatedProductIds = DB::table('products')
    ->where('category_id', $product->category_id)
    ->where('base_name', '!=', $product->base_name)
    ->where('is_archived', false)
    ->whereNull('deleted_at')
    ->whereExists(function ($query) {
        $query->select(DB::raw(1))
            ->from('product_batches')
            ->whereColumn('product_batches.product_id', 'products.id')
            ->where('product_batches.quantity', '>', 0)
            ->where('product_batches.is_active', true)
            ->where('product_batches.availability', true);
    })
    ->select(DB::raw('MIN(id) as id'))
    ->groupBy('base_name')
    ->inRandomOrder()
    ->take(5)
    ->pluck('id');
```

## 2. Frontend: UI & Logic Updates (`page.tsx`)

### Feature Consolidation
The "You May Also Like" section (general suggestions) was removed to focus the user's attention on the "Related Essentials" (category-specific recommendations), which are now more accurate and varied.

### View All Category Link
The "VIEW ALL" link next to Related Essentials was fixed. It now correctly uses the `category_id` parameter instead of the category name, allowing the search page to filter accurately.

- **Old (Incorrect)**: `/e-commerce/search?category=Air Force 1 Low`
- **New (Correct)**: `/e-commerce/search?category=8`

### Components & Handlers
- **PremiumProductCard**: Now strictly used for all related products, ensuring a high-end look with hover animations and direct add-to-cart functionality.
- **handleQuickAddToCart**: A unified handler for the cards that extracts color/size labels from the product name and adds the item to the cart instantly.

## 3. Edge Cases Handled
- **Stock Validation**: Only products with active, in-stock batches are shown in the related products list.
- **Category Loneliness**: If a product is the only item in its category, the `relatedProducts` array will be empty, and the section will gracefully hide itself on the frontend.
- **Missing Images**: The `PremiumProductCard` includes fallback logic for products without images, though the query prefers products with active data.
