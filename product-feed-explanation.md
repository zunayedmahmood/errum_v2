# Product Feed — Complete Explanation

How the admin product list page (`/product/list`) works end to end, including search, filters, grouping, pagination, and price loading.

---

## Table of Contents

1. [The two-layer architecture](#1-the-two-layer-architecture)
2. [What the backend sends](#2-what-the-backend-sends)
3. [How the frontend fetches data](#3-how-the-frontend-fetches-data)
4. [SKU grouping — the client-side aggregation](#4-sku-grouping--the-client-side-aggregation)
5. [Search](#5-search)
6. [Category and vendor filters](#6-category-and-vendor-filters)
7. [Price filter](#7-price-filter)
8. [Pagination](#8-pagination)
9. [Price and stock loading (catalogService)](#9-price-and-stock-loading-catalogservice)
10. [URL state and navigation](#10-url-state-and-navigation)
11. [The product.json catalog shape (separate system)](#11-the-productjson-catalog-shape-separate-system)
12. [Known gaps and their observable effects](#12-known-gaps-and-their-observable-effects)

---

## 1. The two-layer architecture

The page has a strict two-layer design:

**Layer 1 — Server (Laravel `ProductController::index()`):** Handles pagination, text search across `name`/`sku`/`description`, category filtering, and vendor filtering. Returns a flat, paginated list of individual product variant rows — no SKU grouping.

**Layer 2 — Client (`ProductListClient.tsx`):** Receives the flat list of variants and groups them by SKU into "product groups" using a `useMemo`. Each product card on screen represents one SKU group, not one variant. The client also handles price filtering entirely in JS using separate per-product API calls.

These two layers are deliberately independent. The server knows nothing about how the client will group the variants it receives.

---

## 2. What the backend sends

**Endpoint:** `GET /api/products`

**Controller:** `ProductController::index()`

**Parameters accepted:**

| Parameter | Type | Behaviour |
|-----------|------|-----------|
| `page` | integer | Which page of the paginated result |
| `per_page` | integer | Rows per page (default: 15, admin list sends 60) |
| `search` | string | `LIKE %value%` on `name`, `sku`, `description` |
| `category_id` | integer | `WHERE category_id = ?` |
| `vendor_id` | integer | `WHERE vendor_id = ?` |
| `is_archived` | boolean | Defaults to `false` (only active products) |
| `sort_by` | string | `name`, `sku`, `created_at`, `updated_at` |
| `sort_direction` | string | `asc` or `desc` (default: `desc`) |

**Response shape:**

```json
{
  "success": true,
  "data": {
    "data": [ ...product variant objects... ],
    "total": 4848,
    "current_page": 1,
    "last_page": 81,
    "per_page": 60
  }
}
```

Each item in `data.data` is a single product variant row with its own `id`, `name`, `sku`, `variation_suffix`, `images[]`, `category`, `vendor`, and `custom_fields`. **Sibling variants are not nested inside each other here.** If a SKU group "Jordan 1 Black" has 6 size variants, all 6 appear as separate rows at the top level.

**What the backend does NOT do:**
- Group by SKU
- Include sibling variants inside each other
- Filter or sort by selling price
- Search custom field values (color, size)

---

## 3. How the frontend fetches data

`ProductListClient.tsx` calls:

```tsx
const response = await productService.getAll({
  page: pageToLoad,
  per_page: 60,           // SERVER_PAGE_SIZE constant
  search: debouncedSearchQuery || undefined,
  category_id: selectedCategory ? Number(selectedCategory) : undefined,
  vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
  // price filters are NOT sent
});
```

The response is stored as `products: Product[]` — a flat array of variant rows. The grouping happens separately in `useMemo`.

`fetchData()` is called whenever `currentPage`, `debouncedSearchQuery`, `selectedCategory`, or `selectedVendor` changes.

---

## 4. SKU grouping — the client-side aggregation

```tsx
const productGroups = useMemo((): ProductGroup[] => {
  const groups = new Map<string, ProductGroup>();

  products.forEach((product) => {
    const groupKey = sku ? String(sku).trim() : `product-${product.id}`;
    // ...
    group.variants.push({ id, name, sku, color, size, image });
  });

  groups.forEach(group => {
    group.totalVariants = group.variants.length;
    group.hasVariations = group.variants.length > 1;
  });

  return Array.from(groups.values());
}, [products, categories, vendorsById]);
```

**How grouping works step by step:**

1. Each product row is inspected for its `sku` value.
2. The first time a SKU is seen, a new `ProductGroup` is created using that first variant's name, image, and category.
3. Every subsequent variant with the same SKU is pushed into `group.variants[]`.
4. After all products are processed, `getGroupBaseName()` runs across all variant names in the group to elect the cleanest common base name.

**Example:**

Backend returns these 4 rows (all SKU `752961770`):

```
id=165  name="Jordan 1 OG Rebellionaire-na-40-us-7"  (first seen)
id=166  name="Jordan 1 OG Rebellionaire-na-41-us-8"
id=167  name="Jordan 1 OG Rebellionaire-na-42-us-85"
id=168  name="Jordan 1 OG Rebellionaire-na-43-us-95"
```

Result: One `ProductGroup` with `baseName="Jordan 1 OG Rebellionaire"`, `variants=[4 items]`, `totalVariants=4`, `hasVariations=true`.

**What the user sees:** One product card with "Jordan 1 OG Rebellionaire" and a variant selector, not four separate cards.

**Grouping key edge case:** Products with no SKU (empty string) each get their own group key `product-{id}` and are never aggregated with others.

---

## 5. Search

### What is sent to the backend

`debouncedSearchQuery` is sent as the `search` parameter after a 350ms debounce. Backend does:

```php
$this->whereAnyLike($query, ['name', 'sku', 'description'], $search);
// → WHERE (name LIKE '%query%' OR sku LIKE '%query%' OR description LIKE '%query%')
```

### What is NOT searched on the backend

The search input's placeholder reads: *"Search by name, SKU, category, vendor, color, or size..."*

However, the backend `index()` only queries `name`, `sku`, and `description`. It does not search:
- `category.title` (would require a JOIN or `whereHas`)
- `custom_fields.value` (color, size — would require a `whereHas` join)
- `vendor.name`

Searching for "Black" does not return products with a `color` custom field of "Black" unless "Black" appears in the product name.

### The advanced search controller

`ProductSearchController.php` exists and provides multi-stage fuzzy search, Bangla transliteration, phonetic variations, and custom field search. It includes an `advancedSearch` endpoint and a `quickSearch` endpoint. **This controller is not wired to `ProductListClient.tsx`.** The list page uses `productService.getAll()` → `ProductController::index()` only.

### Example

Search: `"Travis Scott"`

Backend: `WHERE name LIKE '%Travis Scott%' OR sku LIKE '%Travis Scott%' OR description LIKE '%Travis Scott%'`

This matches because "Travis Scott" appears in product names and descriptions. All 6 size variants of "Jordan 1 Travis Scott Medium Olive" match and are returned as separate rows, then grouped into one card.

Search: `"olive"` (lowercase color)

This also works because "Olive" is in the product name suffix. But if color was only stored as a custom field and not in the name, it would return nothing.

---

## 6. Category and vendor filters

### How they work

Both are sent to the backend as query parameters. The backend does:

```php
if ($request->has('category_id')) {
    $query->where('category_id', $request->category_id);
}
if ($request->has('vendor_id')) {
    $query->where('vendor_id', $request->vendor_id);
}
```

When a category or vendor is selected, `fetchData()` fires immediately (because these values are in its dependency array), fetching a fresh page from the backend with the filter applied.

### The grouping consequence

Because variants are individual DB rows, all variants in a SKU group must share the same `category_id`. In this codebase they do — all variants of one product are created under the same category. So filtering by category correctly returns complete SKU groups.

However, if any variant had a different `category_id` than its siblings, filtering by category A would only return that subset of variants. The client would show those variants as their own group, with fewer "sizes" than the full group.

### The page-scope problem

When a category is selected, the frontend re-fetches from page 1 with the category filter. **The filter only applies to the 60 variants on the current server page.** If "Sneakers" has 600 variants (100 SKU groups of 6 sizes each), selecting "Sneakers" returns the first 60 variants → ~10 groups on screen. The remaining 90 groups are on later pages. The user must navigate page by page to see all sneakers.

This is the behaviour you identified: filters do not cause a global re-fetch across all data — they apply within the paginated window.

---

## 7. Price filter

Price filtering is **entirely client-side** and operates only on the products already fetched for the current page.

**How it works:**

```tsx
// minPrice/maxPrice are NOT sent to backend

const filteredGroups = useMemo(() => {
  if (!priceFilterActive) return baseFilteredGroups;

  return baseFilteredGroups.filter((group) => {
    const id = group?.variants?.[0]?.id;
    const meta = catalogMetaById[id];  // fetched separately
    if (!meta || typeof meta.selling_price !== 'number') return false;

    const p = meta.selling_price;
    if (min !== null && p < min) return false;
    if (max !== null && p > max) return false;
    return true;
  });
}, [baseFilteredGroups, priceFilterActive, minPrice, maxPrice, catalogMetaById]);
```

**The price fetching loop:**

When a price filter is active, the code fires a loop of `catalogService.getProduct(id)` calls in chunks of 4 to get the selling price for each visible group's first variant. This is 4–15 extra API calls per page just to enable price filtering.

**The scope limitation:** Price filtering only removes groups from the currently loaded page. Groups on other pages that fall within the price range are not shown. The total count does not update.

**Example:**

Page 1 returns 10 product groups. User sets min price 8000. The code fetches prices for all 10 groups, finds 3 are below 8000, and removes them. The page now shows 7 groups. The pagination counter still shows the full total from the server (not filtered).

---

## 8. Pagination

### The numbers

```tsx
const SERVER_PAGE_SIZE = 60;
const totalPages = Math.max(1, serverLastPage);  // from backend last_page
```

The backend paginates by **variant count**, not SKU group count. `total` = 4848 means 4848 variant rows, not 4848 distinct products.

`serverLastPage` = `Math.ceil(4848 / 60)` = 81.

**What this means:** Each page contains 60 variant rows. After client-side grouping, a page of 60 variants might produce anywhere from 10 (if all are 6-size groups) to 60 (if all are standalone products) displayed cards.

### The display counter

```tsx
Showing {((currentPage - 1) * SERVER_PAGE_SIZE) + 1} to {min((currentPage - 1) * SERVER_PAGE_SIZE + paginatedGroups.length, totalProducts)} of {totalProducts} products
```

`totalProducts` is the backend's `total` — the variant count. `paginatedGroups.length` is the number of SKU cards visible. These two numbers refer to different things, making the "Showing X of Y" display misleading.

**Example:** Page 1, 10 SKU groups shown, backend total = 4848. The counter says "Showing 1 to 10 of 4848 products" — which appears to say 10 of 4848 SKUs, but actually means 10 cards representing 60 of 4848 variants.

---

## 9. Price and stock loading (catalogService)

Price and stock are not included in the main `productService.getAll()` response from the admin `ProductController`. The list page fetches them separately using `catalogService.getProduct(id)` after grouping.

**The fetch loop:**

```tsx
const run = async () => {
  const chunkSize = 4;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(id => catalogService.getProduct(id)));
    setCatalogMetaById(prev => { ...prev, ...results });
  }
};
```

Results are cached in `catalogMetaById` keyed by product ID. If the same product is on two subsequent pages, it won't be re-fetched.

**What it fetches:** Selling price, in-stock status, stock quantity — used to display the price badge and stock indicator on each product card.

**The delay:** On a fresh page load, cards render without prices, then prices appear 0.5–2 seconds later as the chunks complete.

---

## 10. URL state and navigation

All active filters are reflected in the URL query string:

| State | URL parameter |
|-------|--------------|
| `searchQuery` | `q` |
| `selectedCategory` | `category` |
| `selectedVendor` | `vendor` |
| `minPrice` | `minPrice` |
| `maxPrice` | `maxPrice` |
| `currentPage` | `page` |

This enables deep linking and back/forward navigation. When the URL changes externally (e.g. browser back), a `useEffect` reads the params and restores state.

An `isUpdatingUrlRef` guard prevents the URL-sync effect from overwriting state when the code itself just updated the URL.

---

## 11. The product.json catalog shape (separate system)

The `product.json` document (context index 40) contains a response in a different shape:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": 165,
        "name": "Jordan 1 Retro High OG Rebellionaire (1:1)-na-40-us-7",
        "has_variants": true,
        "variants_count": 6,
        "variants": [ ... ],   // sibling variants embedded
        "images": [ ... ]
      }
    ],
    "pagination": {
      "total": 4848,
      "total_base": 15,       // distinct SKU groups on this page
      "total_variants": 100   // all variants including siblings
    }
  }
}
```

This shape comes from a **separate e-commerce catalog endpoint** (not `ProductController::index()`). It performs SKU grouping server-side: each object is a base product with its sibling variants embedded in `variants[]`. The `total_base` field counts distinct SKU groups.

**The admin product list (`ProductListClient.tsx`) does not use this endpoint.** It uses `productService.getAll()` → `ProductController::index()` which returns the flat variant list. The grouping in the admin list is client-side only.

---

## 12. Known gaps and their observable effects

### Gap 1 — Category filter applies within the current page only

Selecting "Sneakers" does not fetch all sneaker products — it fetches the next 60 sneaker *variants*, which may represent only 10 SKU groups. To see all sneakers, the user must browse page by page.

**Observable effect:** Selecting a category shows far fewer cards than expected. Feels like filtering on the current page rather than re-querying the full catalog.

### Gap 2 — Price filter applies within the current page only

Setting a price range hides groups from the current page but does not pull in groups from other pages that match the range.

**Observable effect:** Price filter appears to work but the results feel incomplete. Navigating to page 2 shows different price-filtered results.

### Gap 3 — Search does not cover color, size, category name, or vendor name

The search placeholder promises `"Search by name, SKU, category, vendor, color, or size"` but the backend only searches `name`, `sku`, and `description`.

**Observable effect:** Searching "Black" with the expectation of finding black-coloured products returns nothing unless "Black" is in the product name. Searching a category name (e.g. "Sneakers") returns nothing unless it's in a product's name or description.

### Gap 4 — "Showing X of Y" counter is misleading

The counter uses variant totals for `Y` but SKU group counts for `X`, mixing two different units.

**Observable effect:** "Showing 1 to 10 of 4848 products" where 4848 is variants and 10 is SKU cards. The user can't tell how many distinct products exist.

### Gap 5 — Price fetching generates many secondary API calls

Each page load triggers up to 15 additional `catalogService.getProduct()` calls (in chunks of 4) to fetch prices. This is observable as a loading delay before prices appear on cards.

### Gap 6 — The advanced search controller (`ProductSearchController`) is unused in the admin list

A sophisticated fuzzy search system with Bangla support, phonetic variations, and custom field search exists but is not connected to the product list page.
