# Slug SQL Fix and Price Issue Fixes

This document details the resolution of SQL errors, price display issues, and pagination/filtering ordering in the e-commerce catalog system.

## 1. Identified SQL Errors

### 1.1 `fields.slug` Column Not Found
**Issue**: Search queries were failing with:
`SQLSTATE[42S22]: Column not found: 1054 Unknown column 'fields.slug' in 'WHERE'`
**Root Cause**: The `fields` table migration defines the searchable field as `title`, but the code was referencing `slug`.
**Fix**: Updated the `whereExists` block in `buildFilterQuery` to use `fields.title` and match specifically against mapping-critical fields like `Color`, `Size`, and `Colour`.

### 1.2 `ONLY_FULL_GROUP_BY` Violations
**Issue**: Grouping by `base_name` or `id` while selecting all columns (`*`) caused MySQL errors in strict mode.
**Fix**: Implemented a **two-step query architecture**:
1.  **Step 1 (Filter & Group)**: Construct a raw DB query (`buildFilterQuery`) that selects only the necessary columns (`id`, `base_name`, `created_at`, `category_id`) and explicit aggregates (`MIN(sell_price)`). Every non-aggregate column is included in the `GROUP BY` clause.
2.  **Step 2 (Load Full Data)**: Use the resolved IDs or base names to load full Eloquent models (`with(['images', 'category', 'batches'])`). This ensures we have complete data for the frontend without violating SQL grouping rules.

---

## 2. Price Display Fixes

### 2.1 Missing `selling_price` Attribute
**Issue**: The `products` table does not have a `selling_price` column (prices live in `product_batches`). The frontend's `normalizeProduct` function expects a `selling_price` field at the root of the product object.
**Fix**: Introduced a private helper `formatProductForApi` in the backend controller. This method:
*   Finds the cheapest active batch.
*   Injects `selling_price` and `price` at the root of the JSON response for every product and variant.
*   Calculates `total_stock` across all batches.

### 2.2 Out-of-Stock Products Showing Price = 0
**Issue**: Several endpoints (search, featured, details) were eager-loading batches with a `where('quantity', '>', 0)` filter. If a product was out of stock, this resulted in an empty batch list, causing the calculated price to be 0.
**Fix**: Removed the inventory quantity filter from eager loads while maintaining the sorting by price. This ensures the "Reference Price" (lowest batch price) is always available even for items marked as "Out of Stock".

---

## 3. "Filter First, Then Paginate" Logic

### The Architecture
The `EcommerceCatalogController` now strictly follows the "Filter First" requirement to ensure correct pagination counts:

1.  **Base Query**: `buildFilterQuery` applies all constraints (Category, Price Range, Search, Stock Status) using `WHERE` and `HAVING` clauses.
2.  **Aggregation**: For grouped listings, the base query is wrapped in a subquery that groups by `base_name`.
3.  **Count Phase**: A clean `count(*)` is performed on the aggregate subquery to determine the *actual* number of visible groups/items.
4.  **Pagination Phase**: `offset()` and `limit()` are applied to the group query.
5.  **Data Hydration**: Finally, Eloquent models are loaded *only for the exact items* that made it into the current page's result set.

### Benefit
This approach completely avoids the "phantom products" or "empty pages" issues that occur when filtering is applied client-side or after pagination has already truncated the result set.

---

## 4. Edge Cases Handled

*   **Mixed Category Slugs/IDs**: The controller resolves both `category_slug` and `category_id` into a complete list of valid descendant IDs before querying.
*   **Case Sensitivity**: Search now uses case-insensitive `like` queries on titles, descriptions, and SKUs.
*   **Missing Images**: If a specific variant lacks images, the system propagates images from SKU siblings to ensure no card is left blank.
*   **SKU Ambiguity**: Grouping now prioritizes `base_name` but allows falling back to SKU de-duplication if names are inconsistent.

## 5. Summary of Frontend Adjustments

The `/products` and `/[slug]` pages have been updated to:
1.  Prefer the backend's `grouped_products` response if `group_by_sku: true` is set.
2.  Gracefully handle the individual `main_variant` objects which now carry the server-injected `selling_price`.
3.  Support both "id" and "slug" based category filtering seamlessly via URL parameters.
