# Product Feed — Change Proposals

All proposed changes to fix the gaps identified in the product feed. Each proposal is self-contained and independently deployable. They are ordered by impact.

---

## Table of Contents

1. [Proposal 1 — Server-side SKU grouping (core fix)](#proposal-1--server-side-sku-grouping-core-fix)
2. [Proposal 2 — Server-side price filter](#proposal-2--server-side-price-filter)
3. [Proposal 3 — Expand search to category, vendor, and custom fields](#proposal-3--expand-search-to-category-vendor-and-custom-fields)
4. [Proposal 4 — Fix the "Showing X of Y" counter](#proposal-4--fix-the-showing-x-of-y-counter)
5. [Proposal 5 — Wire the advanced search controller](#proposal-5--wire-the-advanced-search-controller)
6. [Backwards compatibility summary](#backwards-compatibility-summary)

---

## Proposal 1 — Server-side SKU grouping (core fix)

### Problem

The backend returns a flat list of variant rows. The client groups them by SKU in a `useMemo`. This means:

- Pagination is by variant count, not SKU group count. 60 variants → 10 displayed cards (if products have 6 sizes each).
- Selecting a category or vendor shows only as many SKU groups as fit in the current 60-variant page, not all groups matching the filter.
- The client cannot know how many total SKU groups exist, so pagination is misleading.

### What changes

**Backend: `ProductController::index()`**

The index method is modified to accept a new parameter `group_by_sku=true`. When this is present, the response shifts from a flat variant list to a base-product-grouped structure, computing `total_base` (distinct SKU count), embedding sibling variants, and paginating by base product count.

The existing flat response (without `group_by_sku`) is **unchanged** — this is purely additive.

```php
public function index(Request $request)
{
    $query = Product::with(['category', 'vendor', 'productFields.field', 'images' => function($q) {
        $q->where('is_active', true)->orderBy('is_primary', 'desc')->orderBy('sort_order');
    }]);

    // ... existing filters (category_id, vendor_id, is_archived, search) unchanged ...

    // ── NEW: SKU-group mode ──────────────────────────────────────────────
    if ($request->boolean('group_by_sku')) {
        return $this->indexGroupedBySku($request, $query);
    }
    // ── End new code ─────────────────────────────────────────────────────

    // ... rest of existing method unchanged ...
}

private function indexGroupedBySku(Request $request, $query)
{
    // Find the lowest-ID product per SKU group (the "base" product)
    // that matches the current filters. Pagination is over distinct SKUs.
    $perPage = (int) $request->get('per_page', 15);
    $page    = (int) $request->get('page', 1);

    // Step 1: Get the paginated set of distinct base_product_ids
    // (lowest ID per SKU among filtered results)
    $baseIdsQuery = clone $query;
    $baseIds = $baseIdsQuery
        ->select(DB::raw('MIN(id) as base_id'), 'sku')
        ->groupBy('sku')
        ->orderBy('base_id', 'desc')   // newest SKU group first
        ->paginate($perPage, ['*'], 'page', $page);

    $totalSkuGroups = $baseIds->total();
    $lastPage       = $baseIds->lastPage();
    $baseProductIds = collect($baseIds->items())->pluck('base_id');

    if ($baseProductIds->isEmpty()) {
        return response()->json([
            'success' => true,
            'data' => [
                'products' => [],
                'pagination' => [
                    'current_page' => $page,
                    'last_page'    => 1,
                    'per_page'     => $perPage,
                    'total'        => 0,
                ],
            ],
        ]);
    }

    // Step 2: Load all variants for these SKU groups (not paginated — we want all siblings)
    $skus = Product::whereIn('id', $baseProductIds)->pluck('sku');

    $allVariants = Product::with([
        'category', 'vendor', 'productFields.field',
        'images' => function($q) {
            $q->where('is_active', true)->orderBy('is_primary', 'desc')->orderBy('sort_order');
        },
    ])
        ->whereIn('sku', $skus)
        ->where('is_archived', false)
        ->orderBy('id', 'asc')
        ->get();

    // Step 3: Group variants by SKU
    $grouped = $allVariants->groupBy('sku');

    // Step 4: Build response ordered by base_id (newest first to match page order)
    $skuOrder = Product::whereIn('id', $baseProductIds)
        ->orderBy('id', 'desc')
        ->pluck('sku');

    $products = $skuOrder->map(function($sku) use ($grouped) {
        $variants = $grouped->get($sku, collect());
        $base     = $variants->firstWhere('id', $variants->min('id'));

        if (!$base) return null;

        $base->custom_fields     = $this->formatCustomFields($base);
        $base->has_variants      = $variants->count() > 1;
        $base->variants_count    = $variants->count();
        $base->variants          = $variants->filter(fn($v) => $v->id !== $base->id)
            ->map(fn($v) => [
                'id'               => $v->id,
                'name'             => $v->name,
                'variation_suffix' => $v->variation_suffix,
                'sku'              => $v->sku,
                'selling_price'    => null,   // filled by catalog endpoint if needed
                'stock_quantity'   => null,
                'in_stock'         => null,
                'images'           => $v->images->map(fn($img) => [
                    'id'         => $img->id,
                    'url'        => $img->image_url,
                    'is_primary' => $img->is_primary,
                ])->values(),
            ])->values();

        return $base;
    })->filter()->values();

    foreach ($products as $product) {
        $product->custom_fields = $this->formatCustomFields($product);
    }

    return response()->json([
        'success' => true,
        'data' => [
            'products'   => $products,
            'pagination' => [
                'current_page' => $page,
                'last_page'    => $lastPage,
                'per_page'     => $perPage,
                'total'        => $totalSkuGroups,   // SKU group count, not variant count
            ],
        ],
    ]);
}
```

**Frontend: `productService.ts` — add `group_by_sku` to `getAll`**

```ts
async getAll(params?: {
  page?: number;
  per_page?: number;
  category_id?: number;
  vendor_id?: number;
  search?: string;
  is_archived?: boolean;
  group_by_sku?: boolean;   // ← NEW
}): Promise<{ data: Product[]; total: number; current_page: number; last_page: number }>
```

Pass `group_by_sku: true` in the `fetchData` call inside `ProductListClient.tsx`:

```tsx
const response = await productService.getAll({
  page: pageToLoad,
  per_page: SERVER_PAGE_SIZE,
  search: debouncedSearchQuery || undefined,
  category_id: selectedCategory ? Number(selectedCategory) : undefined,
  vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
  group_by_sku: true,   // ← NEW
});
```

**Frontend: `ProductListClient.tsx` — simplify `productGroups` `useMemo`**

When `group_by_sku=true` the server already returns base products with `variants[]` embedded. The `productGroups` useMemo can directly map the response instead of building the groups itself:

```tsx
const productGroups = useMemo((): ProductGroup[] => {
  return products.map((product) => {
    // product.variants[] now comes from the server
    const allVariants = [
      { id: product.id, name: product.name, sku: product.sku,
        color: getColorAndSize(product).color,
        size: getColorAndSize(product).size,
        image: getImageUrl(product.images?.[0]?.image_path) },
      ...(product.variants || []).map(v => ({
        id: v.id, name: v.name, sku: v.sku,
        color: undefined, size: undefined,   // siblings have minimal info
        image: getImageUrl(v.images?.[0]?.url),
      })),
    ];

    return {
      sku: product.sku,
      baseName: (product as any).base_name || product.name,
      totalVariants: allVariants.length,
      variants: allVariants,
      primaryImage: getImageUrl(product.images?.[0]?.image_path),
      categoryPath: getCategoryPath(product.category_id),
      category_id: product.category_id,
      hasVariations: allVariants.length > 1,
      vendorId: product.vendor_id,
      vendorName: vendorsById[product.vendor_id] ?? null,
    };
  });
}, [products, categories, vendorsById]);
```

The fallback (when `group_by_sku` is not sent) keeps the old useMemo logic intact.

### Before and after

**Before:** User selects "Sneakers" category. Backend returns first 60 sneaker variants → client groups into ~10 cards. 90 more SKU groups exist but are hidden behind pagination.

**After:** User selects "Sneakers" category. Backend returns first 15 base-product rows (each with embedded variants), representing 15 SKU groups. Pagination is now over 100 SKU groups (if that's the total). Every page shows exactly 15 complete cards.

### Example with real data

SKU group "Jordan 1 OG Rebellionaire" has 6 variants (ids 165–171).

**Before — flat response, page 1:**
```
Row 1: id=165 (-na-40-us-7)
Row 2: id=166 (-na-41-us-8)
Row 3: id=167 (-na-42-us-85)
...
```
Client groups these 6 into 1 card. 54 of the 60 rows are used by other SKUs.

**After — grouped response, page 1:**
```json
{
  "id": 165,
  "name": "Jordan 1 OG Rebellionaire-na-40-us-7",
  "has_variants": true,
  "variants_count": 6,
  "variants": [
    { "id": 166, "variation_suffix": "-na-41-us-8", ... },
    { "id": 167, "variation_suffix": "-na-42-us-85", ... },
    ...
  ]
}
```
Page 1 holds 15 full SKU groups. Pagination counts SKU groups, not variants.

### Edge cases

**SKU group split across filter results:** If only some variants in a SKU group match the search (e.g. one variant's name contains the query but others don't), the base product (lowest ID) must match or be included. In the grouped approach, `MIN(id)` per SKU is selected from the filtered query, so the group only appears if at least one variant matches. All siblings are then loaded regardless of whether they individually matched.

**Standalone products:** Products with unique SKUs form groups of 1. They appear normally. `has_variants=false`, `variants_count=1`.

**Per-page count:** With `per_page=15` and grouped mode, page 1 always shows exactly 15 cards (or fewer on the last page) regardless of how many variants each card has.

---

## Proposal 2 — Server-side price filter

### Problem

Price filtering is JS-only, operates on the current page only, and requires extra API calls to fetch prices before filtering can run.

### What changes

**Backend: `ProductController::index()` — add `min_price`/`max_price` params**

The `product_batches` table holds selling prices. Add a join to filter by price:

```php
// In index(), after existing filters:
$minPrice = $request->input('min_price');
$maxPrice = $request->input('max_price');

if ($minPrice !== null || $maxPrice !== null) {
    $query->whereHas('batches', function($bq) use ($minPrice, $maxPrice) {
        $bq->where('quantity', '>', 0);   // only available batches
        if ($minPrice !== null) {
            $bq->where('sell_price', '>=', $minPrice);
        }
        if ($maxPrice !== null) {
            $bq->where('sell_price', '<=', $maxPrice);
        }
    });
}
```

This is additive — existing behaviour when params are absent is unchanged.

In the grouped SKU mode (Proposal 1), the filter applies to the base product's batches. This is correct because all variants in a SKU group share category/vendor and typically share price range.

**Frontend: `productService.ts` — add price params**

```ts
async getAll(params?: {
  // ... existing params ...
  min_price?: number;   // ← NEW
  max_price?: number;   // ← NEW
})
```

**Frontend: `ProductListClient.tsx` — send price to backend, remove JS price filter**

```tsx
// In fetchData():
const response = await productService.getAll({
  page: pageToLoad,
  per_page: SERVER_PAGE_SIZE,
  search: debouncedSearchQuery || undefined,
  category_id: selectedCategory ? Number(selectedCategory) : undefined,
  vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
  group_by_sku: true,
  min_price: minPrice ? Number(minPrice) : undefined,   // ← NEW
  max_price: maxPrice ? Number(maxPrice) : undefined,   // ← NEW
});
```

The `filteredGroups` useMemo that does JS price filtering, and the `catalogMetaById` price-fetch loop that serves it, can be simplified or removed.

The `catalogService.getProduct()` calls for price info on visible cards remain, but they are no longer needed for filtering — only for displaying the price badge. Over time these can be removed if selling price is included in the main response.

### Before and after

**Before:** User sets min price 9000. JS hides 3 of the 15 currently visible groups. Groups on other pages that have price ≥ 9000 are not shown. Counter still says "4848 products".

**After:** User sets min price 9000. A new backend request fetches groups with at least one batch at price ≥ 9000. Counter reflects filtered total. All matching groups across all pages are accessible.

### Edge cases

**Product with multiple batches at different prices:** `whereHas('batches', ...)` matches if any batch is within range. A product that has both a 7000 BDT batch and a 10000 BDT batch would be included in both "min 8000" and "max 8000" queries. This is correct — you want to show that the product is available at some price in range.

**Product with no batches (out of stock):** Would not match any price filter. Add `orWhereDoesntHave('batches')` if you want to include "unpriced" products regardless.

---

## Proposal 3 — Expand search to category, vendor, and custom fields

### Problem

The search placeholder promises color, size, category, and vendor search but the backend only searches `name`, `sku`, `description`.

### What changes

**Backend: `ProductController::index()` — expand the search clause**

```php
if ($request->has('search')) {
    $search = $request->search;

    $query->where(function($q) use ($search) {
        // Existing
        $this->whereAnyLike($q, ['name', 'sku', 'description'], $search);

        // ── NEW: category name ──
        $q->orWhereHas('category', function($catQ) use ($search) {
            $this->whereLike($catQ, 'title', $search);
        });

        // ── NEW: vendor name ──
        $q->orWhereHas('vendor', function($venQ) use ($search) {
            $this->whereLike($venQ, 'name', $search);
        });

        // ── NEW: custom field values (color, size, etc.) ──
        $q->orWhereHas('productFields', function($fieldQ) use ($search) {
            $this->whereLike($fieldQ, 'value', $search);
        });

        // ── NEW: base_name (allows searching by the group name only) ──
        $this->orWhereLike($q, 'base_name', $search);
    });
}
```

This is additive. The existing search behaviour is preserved and extended.

### Before and after

**Before:** Search "Black" returns nothing unless "Black" appears in a product name, SKU, or description.

**After:** Search "Black" also matches products with a `color` custom field of "Black", or products in a category named "Black Edition", or products from a vendor named "Black Label".

**Before:** Search "Sneakers" returns nothing (it's a category name, not in product names/descriptions).

**After:** Search "Sneakers" matches all products in the "Sneakers" category.

### Edge cases

**Performance:** Adding `orWhereHas` clauses increases query complexity. For a large catalog (4848+ products), this may be slower than the current narrow search. Mitigations: add indexes on `product_fields.value` and `categories.title` if not present, and limit `productFields` search to indexed columns. In practice the debounce (350ms) already throttles requests; the query should still complete in under 500ms for most catalogs.

**Overmatching on custom fields:** If a custom field named "notes" contains common words, search may return many unintended results. This can be scoped by only searching custom fields whose `field.type` is a searchable type (text, select):

```php
$q->orWhereHas('productFields', function($fieldQ) use ($search) {
    $fieldQ->whereHas('field', fn($f) => $f->whereIn('type', ['text', 'select', 'radio']))
           ->where('value', 'LIKE', "%{$search}%");
});
```

---

## Proposal 4 — Fix the "Showing X of Y" counter

### Problem

`total` from the backend is a variant count. `paginatedGroups.length` is a SKU group count. The counter mixes units.

### What changes

**Backend (Proposal 1 already fixes this):** When `group_by_sku=true`, the response returns `total` as SKU group count, not variant count. The pagination block becomes:

```json
"pagination": {
  "total": 100,            // 100 distinct SKU groups (not 600 variants)
  "per_page": 15,
  "current_page": 1,
  "last_page": 7
}
```

**Frontend: `ProductListClient.tsx` — update counter display**

```tsx
// totalProducts is now SKU group count (from Proposal 1 backend)
// paginatedGroups.length is the current page's group count

// BEFORE (misleading)
Showing {((currentPage - 1) * SERVER_PAGE_SIZE) + 1} to
{min((currentPage - 1) * SERVER_PAGE_SIZE + paginatedGroups.length, totalProducts)} of
{totalProducts} products

// AFTER (accurate)
Showing {((currentPage - 1) * SERVER_PAGE_SIZE) + 1} to
{min(currentPage * SERVER_PAGE_SIZE, totalProducts)} of
{totalProducts} product groups
// (or just "products" depending on your UI language)
```

**Standalone (without Proposal 1):** Add a `total_base` field to the existing flat response:

```php
// In ProductController::index(), before return:
$distinctSkuCount = (clone $query)->distinct('sku')->count('sku');

return response()->json([
    'success' => true,
    'data' => [
        ...$products->toArray(),
        'total_base' => $distinctSkuCount,   // distinct SKU groups
    ]
]);
```

Then use `total_base` in the counter instead of `total`.

### Before and after

**Before:** "Showing 1 to 10 of 4848 products" (10 cards visible, 4848 = variant count)

**After:** "Showing 1 to 15 of 810 product groups" (15 cards visible, 810 = SKU group count)

---

## Proposal 5 — Wire the advanced search controller

### Problem

`ProductSearchController.php` provides fuzzy search, Bangla transliteration, phonetic variations, and multi-field search. It is not used by the admin list page.

### What changes

**Frontend: `ProductListClient.tsx` — use advanced search when query is present**

```tsx
const fetchData = useCallback(async (pageOverride?: number) => {
  setIsLoading(true);
  try {
    const pageToLoad = pageOverride ?? currentPage;

    let response;

    if (debouncedSearchQuery.trim().length >= 2) {
      // Use the advanced search endpoint
      response = await productService.advancedSearch({
        query: debouncedSearchQuery,
        category_id: selectedCategory ? Number(selectedCategory) : undefined,
        vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
        per_page: SERVER_PAGE_SIZE,
        page: pageToLoad,
        enable_fuzzy: true,
      });
      // advancedSearch returns { items, pagination }
      setProducts(response.data?.items || []);
      setTotalProducts(response.data?.pagination?.total || 0);
      setServerLastPage(response.data?.pagination?.last_page || 1);
    } else {
      // Use the standard grouped endpoint
      response = await productService.getAll({
        page: pageToLoad,
        per_page: SERVER_PAGE_SIZE,
        category_id: selectedCategory ? Number(selectedCategory) : undefined,
        vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
        group_by_sku: true,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
      });
      setProducts(response.data || []);
      setTotalProducts(response.total || 0);
      setServerLastPage(response.last_page || 1);
    }
  } catch (err) {
    // ...
  } finally {
    setIsLoading(false);
  }
}, [currentPage, debouncedSearchQuery, selectedCategory, selectedVendor, minPrice, maxPrice, updateQueryParams]);
```

**Frontend: `productService.ts` — add `advancedSearch` method**

```ts
async advancedSearch(params: {
  query: string;
  category_id?: number;
  vendor_id?: number;
  per_page?: number;
  page?: number;
  enable_fuzzy?: boolean;
}): Promise<{ data: any; total: number }> {
  const response = await axiosInstance.post('/products/advanced-search', params);
  return response.data;
}
```

### Before and after

**Before:** Search "jamdani" — only matches if spelled exactly as in product names. Typos ("jamadhani", "jomdany") return nothing.

**After:** Search "jamadhani" — `ProductSearchController` recognises it as a variation of "jamdani", expands to all aliases, runs multi-stage matching (exact → starts-with → contains), then fuzzy matching if needed. Returns all jamdani products.

**Before:** Search "শাড়ি" (Bangla) — matches only if Bangla script appears in product names (it usually doesn't).

**After:** Search "শাড়ি" — transliterated to "sharee", then matched against English product names. Saree products are found.

### Edge cases

**Query length minimum:** The advanced search requires `min:2` characters. For single-character queries, fall back to the standard endpoint.

**Fuzzy search performance:** `executeFuzzySearch()` loads all products matching the base filters and runs PHP-side string similarity calculations. On a 4848-product catalog this can be slow (hundreds of milliseconds). The controller already guards with `if (count($results) < 10)` before firing fuzzy — ensure this threshold is appropriate for your catalog size.

---

## Backwards compatibility summary

| Proposal | Backend change | Frontend change | Existing API consumers affected? |
|----------|---------------|-----------------|----------------------------------|
| 1 (SKU grouping) | New `group_by_sku` param; existing flat response unchanged | Pass `group_by_sku: true`; simplify useMemo | No — existing param-less calls still work |
| 2 (price filter) | New `min_price`/`max_price` params; ignored when absent | Pass price to backend; remove JS price filter | No |
| 3 (search expansion) | Wider WHERE clause when `search` is present | No change | No — more results returned, never fewer |
| 4 (counter fix) | Add `total_base` field to response | Read `total_base` instead of `total` | No — `total` still present |
| 5 (advanced search) | Existing controller already deployed | Call different endpoint for text queries | No — standard endpoint still used for no-query requests |

All proposals are additive. No existing API contracts are broken. The flat `GET /api/products` endpoint continues to work exactly as before when `group_by_sku` is not present.

---

## Recommended deployment order

1. **Proposal 1** (server-side SKU grouping) — foundational, fixes the core page-count and filter-scope problems
2. **Proposal 4** (counter fix) — depends on Proposal 1's `total` change, or can be done standalone with `total_base`
3. **Proposal 2** (server-side price filter) — depends on Proposal 1's grouped endpoint for best results
4. **Proposal 3** (expanded search) — independent, can be deployed any time
5. **Proposal 5** (advanced search wiring) — depends on Proposals 1+3 being stable first
