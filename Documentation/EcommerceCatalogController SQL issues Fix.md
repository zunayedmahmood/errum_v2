# EcommerceCatalogController SQL issues Fix

## Identified Issues

The previous implementation of `getProducts` suffered from several critical SQL integrity and logic issues:

1.  **Unknown Column Errors**: Specifically `min_batch_price` in `HAVING` or `ORDER BY` clauses. This occurred because the column was either not selected in all paths or was incorrectly referenced before aggregation.
2.  **Ambiguous Column Errors**: The `id` column was ambiguous across `products` and `product_batches` when joins were performed.
3.  **SKU Grouping Duplication**: Grouping by `base_name` was failing to aggregate properly, leading to duplicated "mother" products in the feed.
4.  **Category Hierarchy**: Subcategories were not always included in the results when checking a parent category.
5.  **Stock Filtering**: The logic for `in_stock` was not accounting for the sum of quantities across multiple batches for a single product/variant.

## Implementation Details & Fixes

### 1. Robust JOIN and Aggregation
The new implementation uses a consistent `leftJoin` with `product_batches` and selects `MIN(product_batches.sell_price) as min_batch_price`.
- **Query Structure**:
  ```php
  $query->leftJoin('product_batches', function($join) {
      $join->on('products.id', '=', 'product_batches.product_id')
           ->where('product_batches.is_active', true)
           ->where('product_batches.availability', true);
  });
  $query->select('products.*', \DB::raw('MIN(product_batches.sell_price) as min_batch_price'))
        ->groupBy('products.id');
  ```
- **Fix**: By using `groupBy('products.id')`, we ensure that `min_batch_price` is correctly calculated for each specific variant before any further grouping or pagination occurs.

### 2. SKU Grouping via Subqueries
For `group_by_sku=true` (used in Products and Search pages), we now wrap the filtered query in a subquery to find unique `base_name` sets. This allows us to sort "groups" by the lowest price found within that group.
- **Representative Variant**: We pick the variant with the lowest price that is currently in stock as the "Main Variant" for the group.

### 3. Hierarchical Category Filtering
We implemented `collectCategoryAndDescendantIds` which uses the materialized `path` column in the `categories` table.
- **Behavior**: If you filter by "Clothing", the query automatically finds all products in "Men -> Shirts", "Women -> Dresses", etc.

### 4. Enhanced Search
The search query now looks into:
- Product `name` and `base_name`.
- `sku`.
- `category` titles.
- `variation_suffix` (which often contains size/color strings like "-Red-XL").
- `product_fields` (EAV system) specifically targeting "Color" and "Size" fields.

### 5. Proper Stock Logic
Instead of `whereHas`, we use `havingRaw('SUM(product_batches.quantity) > 0')` to ensure that a product is considered in stock if the total quantity across all active batches is positive.

## Edge Cases Handled

| Scenario | Handling |
| :--- | :--- |
| **Category Not Found** | Returns a successful 200 response with an empty products array and valid pagination metadata to prevent frontend crashes. |
| **Price Filter on Empty Stock** | Price filters (`min_price`, `max_price`) operate on the `min_batch_price`. If a product has no active batches, it won't have a price and will be excluded from price-filtered results. |
| **Search with no results** | Returns empty array with `filters_applied` echoing the search term. |
| **Ambiguous sorting** | Defaults to `created_at DESC` to ensure newest items appear first. |

## Parameter Support

The following URL parameters are fully supported:
- `category_id` / `category_slug` / `slug`
- `min_price` / `max_price`
- `search` / `q`
- `sort_by` (`price_asc`, `price_desc`, `newest`, `name`)
- `in_stock` (`true` / `false`)
- `group_by_sku` (`true` / `false`)
- `per_page` / `page`
