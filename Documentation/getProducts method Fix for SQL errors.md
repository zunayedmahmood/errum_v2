# `getProducts` Method Fix for SQL Errors

## 1. The Error

```
SQLSTATE[42000]: Syntax error or access violation: 1055
'errumbdc_back3.products.category_id' isn't in GROUP BY
```

**Full failing query (simplified):**
```sql
SELECT count(*) AS aggregate
FROM (
  SELECT `products`.*, MIN(product_batches.sell_price) AS min_batch_price
  FROM `products`
  LEFT JOIN `product_batches` ON ...
  WHERE ...
  GROUP BY `products`.`id`            -- ← inner GROUP BY
  HAVING SUM(product_batches.quantity) > 0
  ORDER BY `products`.`created_at` DESC
) AS filtered_products
GROUP BY `base_name`                   -- ← OUTER GROUP BY
ORDER BY `latest_created_at` DESC
```

**Why it fails:** MySQL is running with `ONLY_FULL_GROUP_BY` mode (the default since MySQL 5.7.5). The outer `GROUP BY base_name` sees the inner result-set which contains *all* `products.*` columns (id, category_id, name, sku, ....). MySQL requires every non-aggregate column in the SELECT to also be in the GROUP BY. Because `products.category_id`, `products.name`, etc. are not in `GROUP BY base_name`, MySQL throws the error.

---

## 2. Root Cause Analysis

### Previous approach (broken)

```php
// ❌ BROKEN — SELECT products.* violates ONLY_FULL_GROUP_BY in the outer query
$query = Product::with([...])->where('products.is_archived', false);
$query->select('products.*', DB::raw('MIN(product_batches.sell_price) as min_batch_price'))
      ->groupBy('products.id');   // inner: OK

// Then wraps it:
$subQuery = DB::table(DB::raw("($baseSql) as filtered_products"))
    ->select('base_name', DB::raw('MIN(min_batch_price) as ...'))
    ->groupBy('base_name');       // outer: FAILS — products.* columns not in GROUP BY
```

The outer subquery selects `base_name` plus aggregates, but the *inner* query exposes `products.*` (which contains `category_id`, `name`, `sku`, etc.). MySQL rightfully refuses to let the outer GROUP BY ignore those columns.

---

## 3. The Fix — Two-Step Architecture

### Step 1: `buildFilterQuery()` — explicit, ONLY_FULL_GROUP_BY–safe raw query

```php
$q = DB::table('products')
    ->leftJoin('product_batches', ...)
    ->select([
        'products.id',            // ← in GROUP BY
        'products.base_name',     // ← in GROUP BY
        'products.category_id',   // ← in GROUP BY
        'products.created_at',    // ← in GROUP BY
        DB::raw('MIN(product_batches.sell_price) AS min_batch_price'),   // aggregate
        DB::raw('COALESCE(SUM(product_batches.quantity), 0) AS total_qty'), // aggregate
    ])
    ->groupBy('products.id', 'products.base_name', 'products.category_id', 'products.created_at');
```

**Key rules obeyed:**
| Rule | How |
|---|---|
| No `SELECT *` on joined queries | Only explicit named columns |
| Non-aggregate columns in GROUP BY | `id, base_name, category_id, created_at` |
| Stock filtering via HAVING | `COALESCE(SUM(quantity), 0) > 0` |
| Price filtering via HAVING | `MIN(sell_price) >= ?` |
| Search without JOIN side-effects | `WHERE EXISTS (...)` correlated subqueries |

### Step 2 — Grouped path: `getGroupedProducts()`

```php
// Outer wrapper — only selects base_name + aggregates → safe
$groupQ = DB::table(DB::raw("({$baseQ->toSql()}) AS pq"))
    ->mergeBindings($baseQ)
    ->select([
        'base_name',
        DB::raw('MIN(min_batch_price) AS group_min_price'),
        DB::raw('MAX(created_at) AS latest_created_at'),
    ])
    ->groupBy('base_name');   // ONLY base_name in GROUP BY — safe!
```

This works because the outer query selects only `base_name` (the GROUP BY key) plus pure aggregates. No other columns are selected, so ONLY_FULL_GROUP_BY is satisfied.

After pagination, the resolved `base_names` are used to do a clean **Eloquent** query with eager-loading:
```php
Product::with(['images', 'category', 'batches'])
    ->whereIn('base_name', $baseNames)
    ->where('is_archived', false)
    ->get();
```

---

## 4. Feature Breakdown

### Parameters Supported

| Parameter | Type | Description |
|---|---|---|
| `per_page` | integer | Items per page (1–200, default 12) |
| `page` | integer | Page number |
| `group_by_sku` | boolean | Group variants by `base_name` (default `true`) |
| `category_id` | integer | Filter by category ID (includes subcategories) |
| `category_slug` / `slug` | string | Filter by category slug |
| `min_price` | decimal | Minimum batch price filter |
| `max_price` | decimal | Maximum batch price filter |
| `search` / `q` | string | Full-text search |
| `sort_by` | string | `price_asc`, `price_desc`, `newest`, `name` |
| `in_stock` | string | `true` = only in-stock, `false` = out-of-stock only |

### Category Hierarchy

Uses `collectCategoryAndDescendantIds()` which leverages the materialized `path` column on the `categories` table. Selecting "Clothing" will automatically include products from "Men > Shirts", "Women > Dresses", etc.

### Search Targets

The search query looks in:
1. `products.name`
2. `products.base_name`
3. `products.sku`
4. `products.variation_suffix` (e.g. "-Red-XL")
5. `products.description`
6. `categories.title` via correlated `WHERE EXISTS`
7. `product_fields.value` (filtered to `fields.slug` in `['color', 'size', 'colour']`) via correlated `WHERE EXISTS`

### Stock Logic

Uses `COALESCE(SUM(product_batches.quantity), 0) > 0` in HAVING. This correctly handles products with no batches at all (COALESCE prevents NULL from bypassing the check).

### SKU Grouping Response Shape

```json
{
  "success": true,
  "data": {
    "grouped_products": [
      {
        "id": 1,
        "base_name": "Blue Saree",
        "main_variant": { ... product object ... },
        "variants": [...],
        "variants_count": 3,
        "min_price": 500,
        "max_price": 750
      }
    ],
    "products": [ ... main_variant of each group ... ],
    "pagination": { "current_page": 1, "last_page": 4, "per_page": 15, "total": 60 }
  }
}
```

The `products` array is a flat list of `main_variant` objects for backward compatibility with components that don't implement grouping.

---

## 5. Edge Cases

| Scenario | Behaviour |
|---|---|
| Category not found | Returns 200 with empty products array and valid pagination |
| No in-stock products | `in_stock=true` → HAVING filters them; returns empty set |
| Product with no batches | Excluded from in-stock queries; `min_batch_price` = NULL |
| `base_name = NULL` | Filtered via `->filter()` on the base_names collection |
| Price sort on no-price products | Products with NULL `min_batch_price` float to the end in MySQL ASC or top in DESC |
| Search with special chars | `addslashes()` escapes `%`, `_`, `\` before building LIKE pattern |
| Empty search | Search block skipped entirely; all conditions apply normally |
| `in_stock` unset | Defaults to `'true'` — only in-stock products returned |

---

## 6. Data Model Reference

### `products` table columns used
- `id`, `base_name`, `variation_suffix`, `name`, `sku`, `description`
- `category_id` (FK → categories.id)
- `is_archived`, `deleted_at` (SoftDeletes)
- `created_at`

### `product_batches` table columns used
- `product_id` (FK → products.id)
- `sell_price`, `quantity`
- `is_active`, `availability`

### `categories` table columns used
- `id`, `title`, `slug`
- `parent_id`, `path` (for hierarchy resolution)

### `product_fields` / `fields` used (for color/size search)
- `product_fields.product_id`, `product_fields.field_id`, `product_fields.value`
- `fields.id`, `fields.slug` (matched against `['color', 'size', 'colour']`)
