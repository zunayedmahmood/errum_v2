<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductBatch;
use App\Models\ProductReturn;
use App\Models\Refund;
use App\Models\Store;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BusinessAnalyticsController extends Controller
{
    public function commandCenter(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));

        $orders = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with([
                'items' => function ($q) use ($sku, $productId, $categoryIds) {
                    $this->applyItemFilters($q, $sku, $productId, $categoryIds);
                    $q->with(['product.category', 'store']);
                },
                'customer',
                'store',
            ])
            ->get();

        $returns = $this->baseReturnsQuery($from, $to, $storeId)->get();
        $refunds = $this->baseRefundsQuery($from, $to, $storeId)->get();
        $expenses = $this->baseExpensesQuery($from, $to, $storeId)->get();
        $inventoryBatches = $this->baseInventoryQuery($storeId, $categoryIds, $productId, $sku)->with(['product.category', 'store'])->get();

        $orderItems = $orders->flatMap->items;

        $salesTrend = $this->buildSalesTrend($orders, $from, $to, $request->query('interval', 'day'), $sku, $productId, $categoryIds);
        $allProductRows = $this->buildProductRows($orderItems, $inventoryBatches, $request);
        $topProducts = $allProductRows->take(20)->values();
        $stockWatchlist = $this->buildStockWatchlist($inventoryBatches, $orderItems);
        $branchPerformance = $this->buildBranchPerformance($orders, $expenses, $sku, $productId, $categoryIds);
        $categoryPerformance = $this->buildCategoryPerformance($orderItems, $inventoryBatches);

        $grossSales = $orderItems->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_price);
        $netSales = $orderItems->sum('total_amount');
        $discount = $orderItems->sum('discount_amount');

        // When no item-level report filter is active, keep legacy order-level totals so old reports stay familiar.
        if (!$sku && !$productId && $categoryIds->isEmpty()) {
            $grossSales = $orders->sum('subtotal');
            $netSales = $orders->sum('total_amount');
            $discount = $orders->sum('discount_amount');
        }

        $kpis = [
            'total_orders' => $orders->count(),
            'total_units' => (int) $orderItems->sum('quantity'),
            'gross_sales' => round((float) $grossSales, 2),
            'net_sales' => round((float) $netSales, 2),
            'total_discount' => round((float) $discount, 2),
            'avg_order_value' => round((float) ($orders->count() ? $netSales / $orders->count() : 0), 2),
            'gross_profit' => round((float) ($orderItems->sum('total_amount') - $orderItems->sum('cogs')), 2),
            'margin_pct' => round((float) (($orderItems->sum('total_amount') > 0) ? (($orderItems->sum('total_amount') - $orderItems->sum('cogs')) / $orderItems->sum('total_amount')) * 100 : 0), 2),
            'return_count' => $returns->count(),
            'refund_amount' => round((float) $refunds->sum('refund_amount'), 2),
            'inventory_value' => round((float) $inventoryBatches->sum(fn ($b) => ((float) $b->cost_price) * ((int) $b->quantity)), 2),
            'low_stock_count' => $inventoryBatches->filter(fn ($b) => (int) $b->quantity > 0 && (int) $b->quantity <= 5)->count(),
            'out_of_stock_count' => $inventoryBatches->filter(fn ($b) => (int) $b->quantity <= 0)->count(),
            'repeat_customers' => $orders->pluck('customer_id')->filter()->countBy()->filter(fn ($count) => $count > 1)->count(),
            'repeat_customer_rate' => round((float) ($orders->pluck('customer_id')->filter()->unique()->count() ? ($orders->pluck('customer_id')->filter()->countBy()->filter(fn ($count) => $count > 1)->count() / $orders->pluck('customer_id')->filter()->unique()->count()) * 100 : 0), 2),
        ];

        $paymentMethodMix = $orders
            ->groupBy(fn ($order) => $order->payment_method ?: 'unknown')
            ->map(fn ($group, $label) => ['label' => (string) $label, 'value' => round((float) $group->sum('total_amount'), 2)])
            ->sortByDesc('value')
            ->values();

        $statusMix = $orders
            ->groupBy(fn ($order) => $order->status ?: 'unknown')
            ->map(fn ($group, $label) => ['label' => (string) $label, 'value' => $group->count()])
            ->values();

        $paymentStatusMix = $orders
            ->groupBy(fn ($order) => $order->payment_status ?: 'unknown')
            ->map(fn ($group, $label) => ['label' => (string) $label, 'value' => $group->count()])
            ->values();

        $orderTypeMix = $orders
            ->groupBy(fn ($order) => $order->order_type ?: 'unknown')
            ->map(fn ($group, $label) => ['label' => (string) $label, 'value' => $group->count()])
            ->values();

        $todayHourly = collect(range(0, 23))->map(function ($hour) use ($orders) {
            $count = $orders->filter(function ($order) use ($hour) {
                return optional($order->order_date)->isToday() && optional($order->order_date)->hour === $hour;
            })->count();
            return ['label' => str_pad((string) $hour, 2, '0', STR_PAD_LEFT) . ':00', 'value' => $count];
        });

        $insights = $this->buildInsights($kpis, $topProducts, $stockWatchlist, $branchPerformance, $returns, $refunds);

        return response()->json([
            'success' => true,
            'data' => [
                'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
                'kpis' => $kpis,
                'sales_trend' => $salesTrend,
                'order_type_mix' => $orderTypeMix,
                'payment_status_mix' => $paymentStatusMix,
                'status_mix' => $statusMix,
                'category_performance' => $categoryPerformance,
                'payment_method_mix' => $paymentMethodMix,
                'top_products' => $topProducts,
                'stock_watchlist' => $stockWatchlist,
                'branch_performance' => $branchPerformance,
                'today_hourly_orders' => $todayHourly,
                'insights' => $insights,
            ],
        ]);
    }

    public function salesTrend(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));
        $interval = $request->query('interval', 'day');
        $orders = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with(['items' => function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
            }])
            ->get();

        return response()->json([
            'success' => true,
            'data' => $this->buildSalesTrend($orders, $from, $to, $interval, $sku, $productId, $categoryIds),
        ]);
    }

    public function topProducts(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));

        $orders = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with(['items' => function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
                $q->with(['product.category', 'store']);
            }])
            ->get();
        $inventoryBatches = $this->baseInventoryQuery($storeId, $categoryIds, $productId, $sku)->get();
        $items = $orders->flatMap->items;

        $rows = $this->buildProductRows($items, $inventoryBatches, $request)->values();
        $perPage = max(1, min(200, (int) $request->query('per_page', 25)));
        $page = max(1, (int) $request->query('page', 1));
        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $pageRows = $rows->slice(($page - 1) * $perPage, $perPage)->values();

        return response()->json([
            'success' => true,
            'data' => $pageRows,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
                'from' => $total ? (($page - 1) * $perPage) + 1 : 0,
                'to' => min($page * $perPage, $total),
            ],
        ]);
    }

    public function stockWatchlist(Request $request)
    {
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));
        $inventoryBatches = $this->baseInventoryQuery($storeId, $categoryIds, $productId, $sku)->with('product')->get();

        $from = Carbon::now()->subDays(30);
        $to = Carbon::now();
        $items = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with(['items' => function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
            }])
            ->get()
            ->flatMap->items;

        return response()->json([
            'success' => true,
            'data' => $this->buildStockWatchlist($inventoryBatches, $items),
        ]);
    }

    public function branchPerformance(Request $request)
    {
        [$from, $to] = $this->resolveDateRange($request);
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));
        $orders = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with(['items' => function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
            }])
            ->get();
        $expenses = $this->baseExpensesQuery($from, $to, $storeId)->get();

        return response()->json([
            'success' => true,
            'data' => $this->buildBranchPerformance($orders, $expenses, $sku, $productId, $categoryIds),
        ]);
    }

    public function liveBestSellers(Request $request)
    {
        $from = Carbon::today();
        $to = Carbon::now();
        $storeId = $request->query('store_id');
        $sku = $request->query('sku');
        $productId = $request->query('product_id');
        $categoryIds = $this->resolveCategoryIds($request->query('category_id'));
        $orders = $this->baseOrdersQuery($from, $to, $storeId, $sku, $productId, $categoryIds)
            ->with(['items' => function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
                $q->with('product');
            }])
            ->get();
        $inventoryBatches = $this->baseInventoryQuery($storeId, $categoryIds, $productId, $sku)->get();
        $items = $orders->flatMap->items;

        return response()->json([
            'success' => true,
            'data' => $this->buildProductRows($items, $inventoryBatches, $request)->take(8)->values(),
        ]);
    }

    public function branchComparison(Request $request)
    {
        return $this->branchPerformance($request);
    }

    public function exportSummary(Request $request): StreamedResponse
    {
        $payload = $this->commandCenter($request)->getData(true);
        $data = $payload['data'];
        $filename = 'command-center-' . now()->format('Ymd_His') . '.csv';

        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename={$filename}",
        ];

        return response()->stream(function () use ($data) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Metric', 'Value']);
            foreach ($data['kpis'] as $key => $value) {
                fputcsv($out, [$key, $value]);
            }
            fputcsv($out, []);
            fputcsv($out, ['Branch Performance']);
            fputcsv($out, ['Store', 'Orders', 'Net Sales', 'Profit', 'Margin %']);
            foreach ($data['branch_performance'] as $row) {
                fputcsv($out, [$row['store_name'], $row['orders'], $row['net_sales'], $row['profit'], $row['margin_pct']]);
            }
            fputcsv($out, []);
            fputcsv($out, ['Category Ranking']);
            fputcsv($out, ['Rank', 'Category', 'Units', 'Orders', 'Revenue', 'Gross Profit', 'Stock On Hand']);
            foreach ($data['category_performance'] as $row) {
                fputcsv($out, [$row['rank'] ?? '', $row['label'], $row['units'] ?? 0, $row['orders'] ?? 0, $row['value'], $row['gross_profit'] ?? 0, $row['stock_on_hand'] ?? 0]);
            }
            fputcsv($out, []);
            fputcsv($out, ['Product Performance']);
            fputcsv($out, ['Rank', 'Name', 'SKU', 'Category', 'Units', 'Orders', 'Revenue', 'Gross Profit', 'Stock On Hand']);
            foreach ($data['top_products'] as $row) {
                fputcsv($out, [$row['rank'] ?? '', $row['name'], $row['sku'], $row['category'] ?? '', $row['units'], $row['orders'] ?? 0, $row['revenue'], $row['gross_profit'], $row['stock_on_hand']]);
            }
            fclose($out);
        }, 200, $headers);
    }

    private function resolveDateRange(Request $request): array
    {
        $from = $request->query('from') ? Carbon::parse($request->query('from'))->startOfDay() : now()->subDays(29)->startOfDay();
        $to = $request->query('to') ? Carbon::parse($request->query('to'))->endOfDay() : now()->endOfDay();
        return [$from, $to];
    }

    private function resolveCategoryIds($categoryId): Collection
    {
        if (!$categoryId) {
            return collect();
        }

        $categoryId = (int) $categoryId;
        if ($categoryId <= 0) {
            return collect();
        }

        return Category::query()
            ->where('id', $categoryId)
            ->orWhere('path', (string) $categoryId)
            ->orWhere('path', 'like', $categoryId . '/%')
            ->orWhere('path', 'like', '%/' . $categoryId)
            ->orWhere('path', 'like', '%/' . $categoryId . '/%')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    private function applyItemFilters($query, $sku = null, $productId = null, ?Collection $categoryIds = null): void
    {
        if ($sku) {
            $query->where('product_sku', $sku);
        }

        if ($productId) {
            $query->where('product_id', (int) $productId);
        }

        if ($categoryIds && $categoryIds->isNotEmpty()) {
            $ids = $categoryIds->all();
            $query->whereHas('product', fn ($productQuery) => $productQuery->whereIn('category_id', $ids));
        }
    }

    private function baseOrdersQuery(Carbon $from, Carbon $to, $storeId = null, $sku = null, $productId = null, ?Collection $categoryIds = null)
    {
        $query = Order::query()->whereBetween('order_date', [$from, $to]);

        if ($storeId) {
            $query->where(function ($q) use ($storeId) {
                $q->where('store_id', $storeId)
                    ->orWhereHas('items', fn ($itemQuery) => $itemQuery->where('store_id', $storeId));
            });
        }

        if ($sku || $productId || ($categoryIds && $categoryIds->isNotEmpty())) {
            $query->whereHas('items', function ($q) use ($sku, $productId, $categoryIds) {
                $this->applyItemFilters($q, $sku, $productId, $categoryIds);
            });
        }

        return $query;
    }

    private function baseReturnsQuery(Carbon $from, Carbon $to, $storeId = null)
    {
        $query = ProductReturn::query()->whereBetween('return_date', [$from->toDateString(), $to->toDateString()]);
        if ($storeId) {
            $query->where('store_id', $storeId);
        }
        return $query;
    }

    private function baseRefundsQuery(Carbon $from, Carbon $to, $storeId = null)
    {
        $query = Refund::query()->whereBetween('created_at', [$from, $to]);
        if ($storeId) {
            $query->whereHas('order', fn ($q) => $q->where('store_id', $storeId));
        }
        return $query;
    }

    private function baseExpensesQuery(Carbon $from, Carbon $to, $storeId = null)
    {
        $query = Expense::query()->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()]);
        if ($storeId) {
            $query->where('store_id', $storeId);
        }
        return $query;
    }

    private function baseInventoryQuery($storeId = null, ?Collection $categoryIds = null, $productId = null, $sku = null)
    {
        $query = ProductBatch::query()->with('product.category');
        if ($storeId) {
            $query->where('store_id', $storeId);
        }
        if ($productId) {
            $query->where('product_id', (int) $productId);
        }
        if ($sku) {
            $query->whereHas('product', fn ($productQuery) => $productQuery->where('sku', $sku));
        }
        if ($categoryIds && $categoryIds->isNotEmpty()) {
            $ids = $categoryIds->all();
            $query->whereHas('product', fn ($productQuery) => $productQuery->whereIn('category_id', $ids));
        }
        return $query;
    }

    private function categoryName($category): string
    {
        if (!$category) {
            return 'Uncategorized';
        }

        return (string) ($category->title ?? $category->name ?? ('Category ' . $category->id));
    }

    private function categoryPath($category): string
    {
        if (!$category) {
            return 'Uncategorized';
        }

        if (method_exists($category, 'getFullPath')) {
            return (string) ($category->getFullPath() ?: $this->categoryName($category));
        }

        return $this->categoryName($category);
    }

    private function buildSalesTrend(Collection $orders, Carbon $from, Carbon $to, $interval = 'day', $sku = null, $productId = null, ?Collection $categoryIds = null): Collection
    {
        $dates = collect();
        $curr = $from->copy()->startOfDay();
        $end = $to->copy()->endOfDay();

        while ($curr->lte($end)) {
            $label = '';
            $next = $curr->copy();

            switch ($interval) {
                case 'year':
                    $label = $curr->format('Y');
                    $next->addYear();
                    break;
                case 'month':
                    $label = $curr->format('M Y');
                    $next->addMonth();
                    break;
                case 'week':
                    $label = 'W' . $curr->weekOfYear . ' ' . $curr->format('M');
                    $next->addWeek();
                    break;
                default:
                    $label = $curr->format('Y-m-d');
                    $next->addDay();
                    break;
            }

            $periodOrders = $orders->filter(fn ($o) => $o->order_date >= $curr && $o->order_date < $next);
            $items = $periodOrders->flatMap->items;
            $filteredMode = $sku || $productId || ($categoryIds && $categoryIds->isNotEmpty());

            $dates->push([
                'date' => $label,
                'orders' => $periodOrders->count(),
                'net_sales' => round((float) ($filteredMode ? $items->sum('total_amount') : $periodOrders->sum('total_amount')), 2),
                'gross_profit' => round((float) ($items->sum('total_amount') - $items->sum('cogs')), 2),
            ]);

            $curr = $next;
        }

        return $dates->values();
    }

    private function buildProductRows(Collection $items, Collection $inventoryBatches, Request $request): Collection
    {
        $minPrice = $request->query('min_price');
        $maxPrice = $request->query('max_price');
        $sortBy = $request->query('sort_by', 'revenue');
        $sortDirection = strtolower((string) $request->query('sort_direction', 'desc')) === 'asc' ? 'asc' : 'desc';

        $filteredItems = $items;
        if ($minPrice !== null && $minPrice !== '') {
            $filteredItems = $filteredItems->filter(fn ($i) => (float) $i->unit_price >= (float) $minPrice);
        }
        if ($maxPrice !== null && $maxPrice !== '') {
            $filteredItems = $filteredItems->filter(fn ($i) => (float) $i->unit_price <= (float) $maxPrice);
        }

        $stockByProduct = $inventoryBatches->groupBy('product_id')->map(fn ($rows) => (int) $rows->sum('quantity'));

        $rows = $filteredItems
            ->groupBy('product_id')
            ->map(function (Collection $productItems, $productId) use ($stockByProduct) {
                $first = $productItems->first();
                $product = $first->product;
                $revenue = (float) $productItems->sum('total_amount');
                $grossProfit = $revenue - (float) $productItems->sum('cogs');
                return [
                    'product_id' => (int) $productId,
                    'name' => (string) ($first->product_name ?: optional($product)->name ?: 'Unknown Product'),
                    'sku' => (string) ($first->product_sku ?: optional($product)->sku ?: ''),
                    'category' => $this->categoryPath(optional($product)->category),
                    'category_id' => optional($product)->category_id,
                    'orders' => $productItems->pluck('order_id')->unique()->count(),
                    'units' => (int) $productItems->sum('quantity'),
                    'revenue' => round($revenue, 2),
                    'gross_profit' => round($grossProfit, 2),
                    'margin_pct' => round((float) ($revenue > 0 ? ($grossProfit / $revenue) * 100 : 0), 2),
                    'stock_on_hand' => (int) ($stockByProduct[$productId] ?? 0),
                ];
            });

        // Include inventory-only products as zero-sales rows so owners can see slow/non-moving stock.
        $inventoryProducts = $inventoryBatches->groupBy('product_id');
        foreach ($inventoryProducts as $productId => $batches) {
            if ($rows->has($productId)) {
                continue;
            }
            $firstBatch = $batches->first();
            $product = $firstBatch->product;
            if (!$product) {
                continue;
            }
            $rows->put($productId, [
                'product_id' => (int) $productId,
                'name' => (string) $product->name,
                'sku' => (string) $product->sku,
                'category' => $this->categoryPath($product->category),
                'category_id' => $product->category_id,
                'orders' => 0,
                'units' => 0,
                'revenue' => 0,
                'gross_profit' => 0,
                'margin_pct' => 0,
                'stock_on_hand' => (int) $batches->sum('quantity'),
            ]);
        }

        $allowedSorts = ['units', 'revenue', 'gross_profit', 'margin_pct', 'stock_on_hand', 'orders', 'name'];
        $sortKey = in_array($sortBy, $allowedSorts, true) ? $sortBy : 'revenue';
        $rows = $sortDirection === 'asc' ? $rows->sortBy($sortKey) : $rows->sortByDesc($sortKey);

        return $rows->values()->map(function ($row, $index) {
            $row['rank'] = $index + 1;
            return $row;
        });
    }

    private function buildCategoryPerformance(Collection $items, Collection $inventoryBatches): Collection
    {
        $stockByCategory = $inventoryBatches
            ->groupBy(fn ($batch) => optional(optional($batch)->product)->category_id ?: 'uncategorized')
            ->map(fn ($rows) => (int) $rows->sum('quantity'));

        $rows = $items
            ->groupBy(fn ($item) => optional(optional($item)->product)->category_id ?: 'uncategorized')
            ->map(function (Collection $categoryItems, $categoryId) use ($stockByCategory) {
                $category = optional(optional($categoryItems->first())->product)->category;
                $revenue = (float) $categoryItems->sum('total_amount');
                $grossProfit = $revenue - (float) $categoryItems->sum('cogs');

                return [
                    'category_id' => $categoryId === 'uncategorized' ? null : (int) $categoryId,
                    'label' => $category ? $this->categoryPath($category) : 'Uncategorized',
                    'value' => round($revenue, 2),
                    'units' => (int) $categoryItems->sum('quantity'),
                    'orders' => $categoryItems->pluck('order_id')->unique()->count(),
                    'gross_profit' => round($grossProfit, 2),
                    'margin_pct' => round((float) ($revenue > 0 ? ($grossProfit / $revenue) * 100 : 0), 2),
                    'stock_on_hand' => (int) ($stockByCategory[$categoryId] ?? 0),
                ];
            });

        // Include categories that currently have stock but no sales in the selected period.
        foreach ($inventoryBatches->groupBy(fn ($batch) => optional(optional($batch)->product)->category_id ?: 'uncategorized') as $categoryId => $batches) {
            if ($rows->has($categoryId)) {
                continue;
            }
            $category = optional(optional($batches->first())->product)->category;
            $rows->put($categoryId, [
                'category_id' => $categoryId === 'uncategorized' ? null : (int) $categoryId,
                'label' => $category ? $this->categoryPath($category) : 'Uncategorized',
                'value' => 0,
                'units' => 0,
                'orders' => 0,
                'gross_profit' => 0,
                'margin_pct' => 0,
                'stock_on_hand' => (int) $batches->sum('quantity'),
            ]);
        }

        return $rows
            ->sortByDesc('value')
            ->values()
            ->map(function ($row, $index) {
                $row['rank'] = $index + 1;
                return $row;
            });
    }

    private function buildStockWatchlist(Collection $inventoryBatches, Collection $items): Collection
    {
        $revenue30ByProduct = $items->groupBy('product_id')->map(fn ($rows) => round((float) $rows->sum('total_amount'), 2));

        return $inventoryBatches
            ->groupBy('product_id')
            ->map(function (Collection $batches, $productId) use ($revenue30ByProduct) {
                $first = $batches->first();
                $available = (int) $batches->sum('quantity');
                $reorder = max(5, (int) ceil($batches->avg('quantity') ?: 5));
                $oldestBatchDate = $batches->min('created_at');
                $ageDays = $oldestBatchDate ? Carbon::parse($oldestBatchDate)->diffInDays(Carbon::now()) : 0;

                return [
                    'product_id' => (int) $productId,
                    'name' => (string) optional($first->product)->name,
                    'sku' => (string) optional($first->product)->sku,
                    'available_quantity' => $available,
                    'reorder_level' => $reorder,
                    'shortage' => max(0, $reorder - $available),
                    'revenue_30d' => (float) ($revenue30ByProduct[$productId] ?? 0),
                    'age_days' => (int) $ageDays,
                ];
            })
            ->filter(fn ($row) => $row['available_quantity'] <= $row['reorder_level'])
            ->sortByDesc('revenue_30d')
            ->take(12)
            ->values();
    }

    private function buildBranchPerformance(Collection $orders, Collection $expenses, $sku = null, $productId = null, ?Collection $categoryIds = null): Collection
    {
        $stores = Store::query()->select(['id', 'name'])->get()->keyBy('id');
        $expenseByStore = $expenses->groupBy('store_id')->map(fn ($rows) => (float) $rows->sum('total_amount'));
        $filteredMode = $sku || $productId || ($categoryIds && $categoryIds->isNotEmpty());

        $rows = collect();
        foreach ($orders as $order) {
            $items = collect($order->items ?? []);
            if ($items->isEmpty()) {
                $rows->push([
                    'store_id' => $order->store_id ?: 'unassigned',
                    'order_id' => $order->id,
                    'units' => 0,
                    'sales' => (float) $order->total_amount,
                    'gross_profit' => 0,
                ]);
                continue;
            }

            foreach ($items->groupBy(fn ($item) => $item->store_id ?: $order->store_id ?: 'unassigned') as $storeId => $storeItems) {
                $rows->push([
                    'store_id' => $storeId,
                    'order_id' => $order->id,
                    'units' => (int) $storeItems->sum('quantity'),
                    'sales' => (float) ($filteredMode ? $storeItems->sum('total_amount') : ($storeItems->sum('total_amount') ?: $order->total_amount)),
                    'gross_profit' => (float) ($storeItems->sum('total_amount') - $storeItems->sum('cogs')),
                ]);
            }
        }

        return $rows
            ->groupBy('store_id')
            ->map(function (Collection $storeRows, $storeId) use ($stores, $expenseByStore, $filteredMode) {
                $sales = (float) $storeRows->sum('sales');
                $profitBeforeExpense = (float) $storeRows->sum('gross_profit');
                $netProfit = $profitBeforeExpense - (float) ($filteredMode ? 0 : ($expenseByStore[$storeId] ?? 0));

                return [
                    'store_id' => is_numeric($storeId) ? (int) $storeId : null,
                    'store_name' => (string) (is_numeric($storeId) ? ($stores[$storeId]->name ?? ('Store ' . $storeId)) : 'Unassigned'),
                    'orders' => $storeRows->pluck('order_id')->unique()->count(),
                    'units' => (int) $storeRows->sum('units'),
                    'net_sales' => round($sales, 2),
                    'profit' => round($netProfit, 2),
                    'margin_pct' => round((float) ($sales > 0 ? ($netProfit / $sales) * 100 : 0), 2),
                ];
            })
            ->sortByDesc('net_sales')
            ->values();
    }

    private function buildInsights(array $kpis, Collection $topProducts, Collection $stockWatchlist, Collection $branchPerformance, Collection $returns, Collection $refunds): array
    {
        $insights = [];

        if ($topProducts->isNotEmpty()) {
            $leader = $topProducts->first();
            $insights[] = $leader['name'] . ' is the current hero SKU with ' . $leader['units'] . ' units sold and revenue of ' . round($leader['revenue']) . '.';
        }

        if ($stockWatchlist->isNotEmpty()) {
            $risk = $stockWatchlist->first();
            $insights[] = $risk['name'] . ' is under reorder pressure. Only ' . $risk['available_quantity'] . ' units remain against a reorder mark of ' . $risk['reorder_level'] . '.';
        }

        if ($branchPerformance->isNotEmpty()) {
            $best = $branchPerformance->sortByDesc('net_sales')->first();
            $insights[] = $best['store_name'] . ' is leading branch performance with net sales of ' . round($best['net_sales']) . ' and margin of ' . round($best['margin_pct'], 1) . '%.';
        }

        if ($kpis['repeat_customer_rate'] > 0) {
            $insights[] = 'Repeat customer rate stands at ' . round($kpis['repeat_customer_rate'], 1) . '%, showing how much of revenue is coming from retained buyers.';
        }

        if ($returns->count() > 0 || $refunds->sum('refund_amount') > 0) {
            $insights[] = 'Returns and refunds need attention: ' . $returns->count() . ' return cases and refund amount of ' . round($refunds->sum('refund_amount')) . ' during this period.';
        }

        return array_slice($insights, 0, 5);
    }
}
