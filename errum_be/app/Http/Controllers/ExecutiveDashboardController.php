<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Expense;
use App\Models\Order;
use App\Models\PaymentCommissionEntry;
use App\Models\ProductReturn;
use App\Models\PurchaseOrder;
use App\Models\Refund;
use App\Models\Store;
use App\Models\Transaction;
use App\Traits\DatabaseAgnosticSearch;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ExecutiveDashboardController extends Controller
{
    use DatabaseAgnosticSearch;

    private const INVALID_ORDER_STATUSES = ['cancelled', 'refunded', 'voided'];

    /**
     * Consolidated, role-aware dashboard endpoint.
     *
     * GET /api/dashboard/overview?period=today|week|month|quarter|year|custom
     *     &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&store_id=1&fresh=1
     */
    public function overview(Request $request)
    {
        try {
            [$startDate, $endDate, $period] = $this->resolveDateRange($request);
            [$comparisonStart, $comparisonEnd] = $this->comparisonRange($startDate, $endDate);

            $user = auth('api')->user() ?: $request->user();
            if ($user) {
                $user->loadMissing('role');
            }

            $role = (string) optional(optional($user)->role)->slug;
            $isGlobal = in_array($role, ['super-admin', 'admin'], true);
            $requestedStoreId = $request->query('store_id');
            $storeId = $isGlobal
                ? (($requestedStoreId && $requestedStoreId !== 'all') ? (int) $requestedStoreId : null)
                : (optional($user)->store_id ? (int) $user->store_id : null);

            $threshold = max(0, min(9999, (int) $request->query('low_stock_threshold', 10)));
            $cacheKey = implode(':', [
                'dashboard-overview-v3',
                $role ?: 'unknown',
                $user?->id ?: 0,
                $storeId ?: 'all',
                $period,
                $startDate->toDateString(),
                $endDate->toDateString(),
                $threshold,
            ]);

            if ($request->boolean('fresh')) {
                Cache::forget($cacheKey);
            }

            $payload = Cache::remember($cacheKey, now()->addSeconds(45), function () use (
                $startDate,
                $endDate,
                $comparisonStart,
                $comparisonEnd,
                $period,
                $storeId,
                $role,
                $isGlobal,
                $threshold
            ) {
                return $this->buildOverview(
                    $startDate,
                    $endDate,
                    $comparisonStart,
                    $comparisonEnd,
                    $period,
                    $storeId,
                    $role,
                    $isGlobal,
                    $threshold
                );
            });

            return response()->json([
                'success' => true,
                'data' => $payload,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to build the dashboard overview.',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    private function buildOverview(
        Carbon $startDate,
        Carbon $endDate,
        Carbon $comparisonStart,
        Carbon $comparisonEnd,
        string $period,
        ?int $storeId,
        string $role,
        bool $isGlobal,
        int $threshold
    ): array {
        $currentSales = $this->salesSummary($startDate, $endDate, $storeId);
        $previousSales = $this->salesSummary($comparisonStart, $comparisonEnd, $storeId);
        $currentProfit = $this->profitSummary($startDate, $endDate, $storeId, $currentSales);
        $previousProfit = $this->profitSummary($comparisonStart, $comparisonEnd, $storeId, $previousSales);
        $purchases = $this->purchaseSummary($startDate, $endDate, $storeId);
        $previousPurchases = $this->purchaseSummary($comparisonStart, $comparisonEnd, $storeId);
        $customerAging = $this->customerDueAging($endDate, $storeId);
        $supplierAging = $this->supplierDueAging($endDate, $storeId);
        $inventory = $this->inventorySummary(Carbon::today()->endOfDay(), $storeId, $threshold);
        $balances = $this->balanceSummary($endDate, $storeId);
        $operations = $this->operationsSummary($startDate, $endDate, $storeId);
        $paymentMix = $this->paymentMix($startDate, $endDate, $storeId);
        $channels = $this->salesByChannel($startDate, $endDate, $storeId);
        $dailySeries = $this->salesSeries($startDate, $endDate, $storeId);
        $topProducts = $this->topProducts($startDate, $endDate, $storeId);
        $topStores = $this->topStores($startDate, $endDate, $storeId);
        $approvals = $this->approvalSummary($storeId);

        $visibility = $this->visibilityForRole($role);
        $stores = $isGlobal
            ? Store::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'store_code', 'is_online', 'is_warehouse'])
            : Store::query()->where('id', $storeId)->get(['id', 'name', 'store_code', 'is_online', 'is_warehouse']);

        $alerts = $this->buildAlerts(
            $inventory,
            $customerAging,
            $supplierAging,
            $operations,
            $approvals,
            $currentSales,
            $currentProfit
        );

        $kpiData = [
            'gross_sales' => $this->kpi($currentSales['gross_sales'], $previousSales['gross_sales'], '/purchase-history'),
            'net_sales' => $this->kpi($currentSales['net_sales'], $previousSales['net_sales'], '/purchase-history'),
            'collections' => $this->kpi($paymentMix['total_net'], $this->paymentMix($comparisonStart, $comparisonEnd, $storeId)['total_net'], '/cash-sheet'),
            'orders' => $this->kpi($currentSales['order_count'], $previousSales['order_count'], '/orders'),
            'average_order_value' => $this->kpi($currentSales['average_order_value'], $previousSales['average_order_value'], '/orders'),
            'gross_profit' => $this->kpi($currentProfit['gross_profit'], $previousProfit['gross_profit'], '/accounting'),
            'gross_margin_percentage' => $this->kpi($currentProfit['gross_margin_percentage'], $previousProfit['gross_margin_percentage'], '/accounting'),
            'net_profit' => $this->kpi($currentProfit['net_profit'], $previousProfit['net_profit'], '/accounting'),
            'net_margin_percentage' => $this->kpi($currentProfit['net_margin_percentage'], $previousProfit['net_margin_percentage'], '/accounting'),
            'purchase_value' => $this->kpi($purchases['purchase_value'], $previousPurchases['purchase_value'], '/purchase-order'),
            'customer_due' => $this->kpi($customerAging['total'], $customerAging['total'], '/orders'),
            'supplier_due' => $this->kpi($supplierAging['total'], $supplierAging['total'], '/purchase-order'),
            'cash_balance' => $this->kpi($balances['cash_balance'], $balances['cash_balance'], '/accounting'),
            'bank_balance' => $this->kpi($balances['bank_balance'], $balances['bank_balance'], '/accounting'),
            'stock_value' => $this->kpi($inventory['stock_value'], $inventory['stock_value'], '/inventory/view-new'),
            'returns_refunds' => $this->kpi($currentSales['refund_value'], $previousSales['refund_value'], '/returns'),
            'online_sales' => $this->kpi($channels['online_sales'], 0, '/orders'),
        ];

        if (!$visibility['profitability']) {
            unset($kpiData['gross_profit'], $kpiData['gross_margin_percentage'], $kpiData['net_profit'], $kpiData['net_margin_percentage']);
        }
        if (!$visibility['receivables']) unset($kpiData['customer_due']);
        if (!$visibility['payables']) unset($kpiData['supplier_due'], $kpiData['purchase_value']);
        if (!$visibility['liquidity']) unset($kpiData['cash_balance'], $kpiData['bank_balance']);

        $visibleAlerts = array_values(array_filter($alerts, function ($alert) use ($visibility) {
            if (!$visibility['receivables'] && str_contains(strtolower($alert['title']), 'customer due')) return false;
            if (!$visibility['payables'] && str_contains(strtolower($alert['title']), 'supplier due')) return false;
            if (!$visibility['profitability'] && str_contains(strtolower($alert['title']), 'margin')) return false;
            if (!$visibility['approvals'] && str_contains(strtolower($alert['title']), 'approval')) return false;
            return true;
        }));

        $visibleBalances = ($visibility['liquidity'] || $visibility['capital']) ? $balances : null;
        if (is_array($visibleBalances) && !$visibility['capital']) {
            unset($visibleBalances['fixed_asset_value'], $visibleBalances['investment_balance'], $visibleBalances['loan_balance'], $visibleBalances['tax_liability']);
        }

        return [
            'meta' => [
                'generated_at' => now()->toIso8601String(),
                'cache_seconds' => 45,
                'currency' => 'BDT',
                'period' => $period,
                'date_from' => $startDate->toDateString(),
                'date_to' => $endDate->toDateString(),
                'comparison_from' => $comparisonStart->toDateString(),
                'comparison_to' => $comparisonEnd->toDateString(),
                'store_id' => $storeId,
                'store_scope' => $storeId ? 'single' : 'all',
                'role' => $role ?: 'employee',
                'visibility' => $visibility,
                'stores' => $stores,
                'notes' => [
                    'Balance figures are ledger balances as of the selected end date.',
                    'Inventory is the current on-hand valuation because historical inventory snapshots are not stored.',
                    'Customer and supplier aging are current outstanding balances aged as of the selected end date.',
                ],
            ],
            'kpis' => $kpiData,
            'sales' => array_merge($currentSales, [
                'series' => $dailySeries,
                'channels' => $channels['channels'],
                'online_sales' => $channels['online_sales'],
                'payment_mix' => $paymentMix,
            ]),
            'profitability' => $visibility['profitability'] ? $currentProfit : null,
            'purchases' => $visibility['payables'] ? $purchases : null,
            'liquidity' => $visibleBalances,
            'receivables' => $visibility['receivables'] ? $customerAging : null,
            'payables' => $visibility['payables'] ? $supplierAging : null,
            'inventory' => $inventory,
            'operations' => $operations,
            'performance' => [
                'top_products' => $topProducts,
                'top_stores' => $topStores,
            ],
            'approvals' => $visibility['approvals'] ? $approvals : null,
            'alerts' => $visibleAlerts,
        ];
    }

    private function resolveDateRange(Request $request): array
    {
        $period = (string) $request->query('period', 'month');
        $today = Carbon::today();

        if ($period === 'custom') {
            $start = Carbon::parse($request->query('date_from', $today->copy()->startOfMonth()))->startOfDay();
            $end = Carbon::parse($request->query('date_to', $today))->endOfDay();
        } else {
            [$start, $end] = match ($period) {
                'today' => [$today->copy()->startOfDay(), $today->copy()->endOfDay()],
                'week' => [$today->copy()->startOfWeek()->startOfDay(), $today->copy()->endOfWeek()->endOfDay()],
                'quarter' => [$today->copy()->firstOfQuarter()->startOfDay(), $today->copy()->lastOfQuarter()->endOfDay()],
                'year' => [$today->copy()->startOfYear()->startOfDay(), $today->copy()->endOfYear()->endOfDay()],
                default => [$today->copy()->startOfMonth()->startOfDay(), $today->copy()->endOfMonth()->endOfDay()],
            };
            $period = in_array($period, ['today', 'week', 'month', 'quarter', 'year'], true) ? $period : 'month';
        }

        if ($start->greaterThan($end)) {
            [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
        }

        if ($start->diffInDays($end) > 730) {
            $start = $end->copy()->subDays(730)->startOfDay();
        }

        return [$start, $end, $period];
    }

    private function comparisonRange(Carbon $startDate, Carbon $endDate): array
    {
        $days = $startDate->diffInDays($endDate) + 1;
        $comparisonEnd = $startDate->copy()->subDay()->endOfDay();
        $comparisonStart = $comparisonEnd->copy()->subDays($days - 1)->startOfDay();

        return [$comparisonStart, $comparisonEnd];
    }

    private function validOrders(Carbon $startDate, Carbon $endDate, ?int $storeId): Builder
    {
        return Order::query()
            ->whereBetween('order_date', [$startDate, $endDate])
            ->whereNotIn('status', self::INVALID_ORDER_STATUSES)
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId));
    }

    private function salesSummary(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        $aggregate = $this->validOrders($startDate, $endDate, $storeId)
            ->selectRaw('COUNT(*) as order_count')
            ->selectRaw('COALESCE(SUM(total_amount), 0) as gross_sales')
            ->selectRaw('COALESCE(SUM(paid_amount), 0) as paid_amount')
            ->selectRaw('COALESCE(SUM(outstanding_amount), 0) as outstanding_amount')
            ->first();

        $refundQuery = Refund::query()
            ->where('status', 'completed')
            ->whereBetween(DB::raw('COALESCE(completed_at, processed_at, created_at)'), [$startDate, $endDate])
            ->when($storeId, fn (Builder $query) => $query->whereHas('order', fn (Builder $order) => $order->where('store_id', $storeId)));

        $refundValue = (float) $refundQuery->sum('refund_amount');
        $refundCount = (int) (clone $refundQuery)->count();

        $returnQuery = ProductReturn::query()
            ->whereIn('status', ['approved', 'completed', 'refunded'])
            ->whereBetween(DB::raw('COALESCE(return_date, created_at)'), [$startDate, $endDate])
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId));

        $returnValue = (float) $returnQuery->sum('total_return_value');
        $returnCount = (int) (clone $returnQuery)->count();
        $grossSales = (float) ($aggregate->gross_sales ?? 0);
        $orderCount = (int) ($aggregate->order_count ?? 0);

        return [
            'gross_sales' => round($grossSales, 2),
            'refund_value' => round($refundValue, 2),
            'net_sales' => round($grossSales - $refundValue, 2),
            'paid_amount' => round((float) ($aggregate->paid_amount ?? 0), 2),
            'outstanding_amount' => round((float) ($aggregate->outstanding_amount ?? 0), 2),
            'order_count' => $orderCount,
            'average_order_value' => $orderCount > 0 ? round($grossSales / $orderCount, 2) : 0,
            'return_value' => round($returnValue, 2),
            'return_count' => $returnCount,
            'refund_count' => $refundCount,
            'return_rate_percentage' => $orderCount > 0 ? round(($returnCount / $orderCount) * 100, 2) : 0,
        ];
    }

    private function profitSummary(Carbon $startDate, Carbon $endDate, ?int $storeId, array $sales): array
    {
        $cogsQuery = DB::table('order_items as oi')
            ->join('orders as o', 'o.id', '=', 'oi.order_id')
            ->leftJoin('product_batches as pb', 'pb.id', '=', 'oi.product_batch_id')
            ->whereBetween('o.order_date', [$startDate, $endDate])
            ->whereNotIn('o.status', self::INVALID_ORDER_STATUSES)
            ->when(Schema::hasColumn('orders', 'deleted_at'), fn ($query) => $query->whereNull('o.deleted_at'))
            ->when($storeId, fn ($query) => $query->where('o.store_id', $storeId));

        $cogs = (float) $cogsQuery
            ->selectRaw('COALESCE(SUM(COALESCE(oi.cogs, pb.cost_price * oi.quantity, 0)), 0) as total_cogs')
            ->value('total_cogs');

        $expenses = (float) Expense::query()
            ->whereBetween('expense_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId))
            ->sum('total_amount');

        $commission = 0.0;
        if (Schema::hasTable('payment_commission_entries')) {
            $commission = (float) PaymentCommissionEntry::query()
                ->whereBetween('business_date', [$startDate->toDateString(), $endDate->toDateString()])
                ->where('status', 'active')
                ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId))
                ->selectRaw('COALESCE(SUM(COALESCE(net_commission_amount, commission_amount, 0)), 0) as total_commission')
                ->value('total_commission');
        }

        $grossProfit = (float) $sales['net_sales'] - $cogs;
        $netProfit = $grossProfit - $expenses - $commission;
        $netSales = (float) $sales['net_sales'];

        return [
            'cogs' => round($cogs, 2),
            'gross_profit' => round($grossProfit, 2),
            'gross_margin_percentage' => $netSales > 0 ? round(($grossProfit / $netSales) * 100, 2) : 0,
            'operating_expenses' => round($expenses, 2),
            'payment_commissions' => round($commission, 2),
            'net_profit' => round($netProfit, 2),
            'net_margin_percentage' => $netSales > 0 ? round(($netProfit / $netSales) * 100, 2) : 0,
        ];
    }

    private function purchaseSummary(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        if (!Schema::hasTable('purchase_orders')) {
            return ['purchase_value' => 0, 'purchase_count' => 0, 'received_value' => 0, 'outstanding_amount' => 0];
        }

        $query = PurchaseOrder::query()
            ->whereBetween('order_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->whereNotIn('status', ['cancelled'])
            ->when($storeId, fn (Builder $q) => $q->where('store_id', $storeId));

        $row = $query
            ->selectRaw('COUNT(*) as purchase_count')
            ->selectRaw('COALESCE(SUM(total_amount), 0) as purchase_value')
            ->selectRaw("COALESCE(SUM(CASE WHEN status IN ('received', 'completed') THEN total_amount ELSE 0 END), 0) as received_value")
            ->selectRaw('COALESCE(SUM(outstanding_amount), 0) as outstanding_amount')
            ->first();

        return [
            'purchase_value' => round((float) ($row->purchase_value ?? 0), 2),
            'purchase_count' => (int) ($row->purchase_count ?? 0),
            'received_value' => round((float) ($row->received_value ?? 0), 2),
            'outstanding_amount' => round((float) ($row->outstanding_amount ?? 0), 2),
        ];
    }

    private function customerDueAging(Carbon $asOf, ?int $storeId): array
    {
        $rows = Order::query()
            ->where('order_date', '<=', $asOf)
            ->whereNotIn('status', self::INVALID_ORDER_STATUSES)
            ->where('outstanding_amount', '>', 0)
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId))
            ->get(['id', 'order_date', 'next_payment_due', 'outstanding_amount']);

        return $this->ageRows($rows, $asOf, 'outstanding_amount', fn ($row) => $row->next_payment_due ?: $row->order_date);
    }

    private function supplierDueAging(Carbon $asOf, ?int $storeId): array
    {
        if (!Schema::hasTable('purchase_orders')) {
            return $this->emptyAging();
        }

        $rows = PurchaseOrder::query()
            ->where('order_date', '<=', $asOf->toDateString())
            ->whereNotIn('status', ['cancelled'])
            ->where('outstanding_amount', '>', 0)
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId))
            ->get(['id', 'order_date', 'payment_due_date', 'outstanding_amount']);

        return $this->ageRows($rows, $asOf, 'outstanding_amount', fn ($row) => $row->payment_due_date ?: $row->order_date);
    }

    private function ageRows($rows, Carbon $asOf, string $amountField, callable $dateResolver): array
    {
        $buckets = [
            '0_30' => ['label' => '0–30 days', 'amount' => 0.0, 'count' => 0],
            '31_60' => ['label' => '31–60 days', 'amount' => 0.0, 'count' => 0],
            '61_90' => ['label' => '61–90 days', 'amount' => 0.0, 'count' => 0],
            '90_plus' => ['label' => '90+ days', 'amount' => 0.0, 'count' => 0],
        ];

        foreach ($rows as $row) {
            $date = Carbon::parse($dateResolver($row));
            $days = max(0, $date->diffInDays($asOf, false));
            $key = $days <= 30 ? '0_30' : ($days <= 60 ? '31_60' : ($days <= 90 ? '61_90' : '90_plus'));
            $buckets[$key]['amount'] += (float) $row->{$amountField};
            $buckets[$key]['count']++;
        }

        $total = array_sum(array_column($buckets, 'amount'));
        foreach ($buckets as &$bucket) {
            $bucket['amount'] = round($bucket['amount'], 2);
            $bucket['percentage'] = $total > 0 ? round(($bucket['amount'] / $total) * 100, 2) : 0;
        }

        return [
            'total' => round($total, 2),
            'count' => $rows->count(),
            'overdue_90_plus' => round($buckets['90_plus']['amount'], 2),
            'buckets' => array_values($buckets),
        ];
    }

    private function emptyAging(): array
    {
        return [
            'total' => 0,
            'count' => 0,
            'overdue_90_plus' => 0,
            'buckets' => [
                ['label' => '0–30 days', 'amount' => 0, 'count' => 0, 'percentage' => 0],
                ['label' => '31–60 days', 'amount' => 0, 'count' => 0, 'percentage' => 0],
                ['label' => '61–90 days', 'amount' => 0, 'count' => 0, 'percentage' => 0],
                ['label' => '90+ days', 'amount' => 0, 'count' => 0, 'percentage' => 0],
            ],
        ];
    }

    private function inventorySummary(Carbon $asOf, ?int $storeId, int $threshold): array
    {
        if (!Schema::hasTable('product_batches')) {
            return [
                'stock_value' => 0, 'quantity' => 0, 'product_store_count' => 0,
                'low_stock_count' => 0, 'out_of_stock_count' => 0, 'low_stock_items' => [], 'age_buckets' => [],
            ];
        }

        $groups = DB::table('product_batches as pb')
            ->leftJoin('products as p', 'p.id', '=', 'pb.product_id')
            ->leftJoin('stores as s', 's.id', '=', 'pb.store_id')
            ->where('pb.is_active', true)
            ->when($storeId, fn ($query) => $query->where('pb.store_id', $storeId))
            ->groupBy('pb.product_id', 'pb.store_id', 'p.name', 'p.sku', 's.name')
            ->selectRaw('pb.product_id, pb.store_id, p.name as product_name, p.sku, s.name as store_name')
            ->selectRaw('COALESCE(SUM(pb.quantity), 0) as quantity')
            ->selectRaw('COALESCE(SUM(pb.quantity * pb.cost_price), 0) as stock_value')
            ->orderBy('quantity')
            ->get();

        $low = $groups->filter(fn ($row) => (float) $row->quantity > 0 && (float) $row->quantity <= $threshold);
        $out = $groups->filter(fn ($row) => (float) $row->quantity <= 0);
        $ageCutoffs = [
            ['label' => '0–30 days', 'from' => $asOf->copy()->subDays(30)],
            ['label' => '31–60 days', 'from' => $asOf->copy()->subDays(60)],
            ['label' => '61–90 days', 'from' => $asOf->copy()->subDays(90)],
        ];

        $batchRows = DB::table('product_batches')
            ->where('is_active', true)
            ->where('quantity', '>', 0)
            ->when($storeId, fn ($query) => $query->where('store_id', $storeId))
            ->get(['quantity', 'cost_price', 'created_at']);

        $ageValues = ['0–30 days' => 0.0, '31–60 days' => 0.0, '61–90 days' => 0.0, '90+ days' => 0.0];
        foreach ($batchRows as $batch) {
            $age = Carbon::parse($batch->created_at)->diffInDays($asOf);
            $label = $age <= 30 ? '0–30 days' : ($age <= 60 ? '31–60 days' : ($age <= 90 ? '61–90 days' : '90+ days'));
            $ageValues[$label] += (float) $batch->quantity * (float) $batch->cost_price;
        }
        $stockValue = (float) $groups->sum('stock_value');
        $ageBuckets = collect($ageValues)->map(fn ($amount, $label) => [
            'label' => $label,
            'amount' => round($amount, 2),
            'percentage' => $stockValue > 0 ? round(($amount / $stockValue) * 100, 2) : 0,
        ])->values()->all();

        return [
            'stock_value' => round($stockValue, 2),
            'quantity' => (int) $groups->sum('quantity'),
            'product_store_count' => $groups->count(),
            'low_stock_threshold' => $threshold,
            'low_stock_count' => $low->count(),
            'out_of_stock_count' => $out->count(),
            'low_stock_items' => $low->concat($out)->take(12)->map(fn ($row) => [
                'product_id' => (int) $row->product_id,
                'product_name' => $row->product_name ?: 'Unknown product',
                'sku' => $row->sku ?: 'N/A',
                'store_id' => (int) $row->store_id,
                'store_name' => $row->store_name ?: 'Unknown store',
                'quantity' => (float) $row->quantity,
                'status' => (float) $row->quantity <= 0 ? 'out_of_stock' : 'low_stock',
            ])->values()->all(),
            'age_buckets' => $ageBuckets,
            'snapshot_note' => 'Current on-hand inventory snapshot',
        ];
    }

    private function balanceSummary(Carbon $asOf, ?int $storeId): array
    {
        if (!Schema::hasTable('accounts') || !Schema::hasTable('transactions')) {
            return [
                'cash_balance' => 0, 'bank_balance' => 0, 'mobile_wallet_balance' => 0,
                'fixed_asset_value' => 0, 'investment_balance' => 0, 'loan_balance' => 0,
                'tax_liability' => 0, 'wallets' => [],
            ];
        }

        $accounts = Account::query()->where('is_active', true)->get(['id', 'account_code', 'name', 'type', 'sub_type']);
        $balances = $this->accountBalances($accounts->pluck('id')->all(), $asOf, $storeId);
        $balanceOf = function ($filtered) use ($balances) {
            return round($filtered->sum(fn ($account) => (float) ($balances[$account->id] ?? 0)), 2);
        };

        $cashAccounts = $accounts->filter(fn ($a) => $a->account_code === '1001' || stripos($a->name, 'cash') !== false);
        $bankAccounts = $accounts->filter(function ($a) {
            $name = strtolower($a->name);
            return $a->type === 'asset'
                && !str_contains($name, 'receivable')
                && (str_contains($name, 'bank') || str_contains($name, 'card') || str_contains($name, 'settlement'));
        });
        $walletAccounts = $accounts->filter(function ($a) {
            $name = strtolower($a->name);
            return str_contains($name, 'bkash') || str_contains($name, 'nagad') || str_contains($name, 'rocket') || str_contains($name, 'mfs');
        });
        $fixedAssets = $accounts->filter(fn ($a) => $a->sub_type === 'fixed_asset');
        $equity = $accounts->filter(fn ($a) => $a->type === 'equity');
        $loans = $accounts->filter(function ($a) {
            $name = strtolower($a->name);
            return $a->type === 'liability' && ($a->sub_type === 'long_term_liability' || str_contains($name, 'loan') || str_contains($name, 'borrow'));
        });
        $tax = $accounts->filter(function ($a) {
            $name = strtolower($a->name);
            return $a->type === 'liability' && (str_contains($name, 'tax') || str_contains($name, 'vat'));
        });

        return [
            'cash_balance' => $balanceOf($cashAccounts),
            'bank_balance' => $balanceOf($bankAccounts),
            'mobile_wallet_balance' => $balanceOf($walletAccounts),
            'fixed_asset_value' => $balanceOf($fixedAssets),
            'investment_balance' => $balanceOf($equity),
            'loan_balance' => $balanceOf($loans),
            'tax_liability' => $balanceOf($tax),
            'wallets' => $walletAccounts->map(fn ($account) => [
                'account_id' => $account->id,
                'name' => $account->name,
                'balance' => round((float) ($balances[$account->id] ?? 0), 2),
            ])->values()->all(),
            'as_of' => $asOf->toDateString(),
        ];
    }

    private function accountBalances(array $accountIds, Carbon $asOf, ?int $storeId): array
    {
        if (!$accountIds) {
            return [];
        }

        $rows = Transaction::query()
            ->whereIn('account_id', $accountIds)
            ->where('status', 'completed')
            ->where('transaction_date', '<=', $asOf->toDateString())
            ->when($storeId, fn (Builder $query) => $query->where('store_id', $storeId))
            ->selectRaw('account_id')
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as debits")
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as credits")
            ->groupBy('account_id')
            ->get()
            ->keyBy('account_id');

        $accounts = Account::whereIn('id', $accountIds)->get(['id', 'type']);
        $balances = [];
        foreach ($accounts as $account) {
            $row = $rows->get($account->id);
            $debits = (float) ($row->debits ?? 0);
            $credits = (float) ($row->credits ?? 0);
            $balances[$account->id] = in_array($account->type, ['liability', 'equity', 'income'], true)
                ? $credits - $debits
                : $debits - $credits;
        }

        return $balances;
    }

    private function paymentMix(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        if (!Schema::hasTable('order_payments') || !Schema::hasTable('payment_methods')) {
            return ['total_gross' => 0, 'total_commission' => 0, 'total_net' => 0, 'methods' => []];
        }

        $effectiveGross = 'CASE WHEN COALESCE(op.refunded_amount, 0) >= op.amount THEN 0 ELSE op.amount - COALESCE(op.refunded_amount, 0) END';
        $regularCommission = Schema::hasColumn('order_payments', 'commission_amount')
            ? 'CASE WHEN COALESCE(op.commission_amount, op.fee_amount, 0) - COALESCE(op.reversed_commission_amount, 0) < 0 THEN 0 ELSE COALESCE(op.commission_amount, op.fee_amount, 0) - COALESCE(op.reversed_commission_amount, 0) END'
            : 'COALESCE(op.fee_amount, 0)';
        $effectiveNet = "CASE WHEN ({$effectiveGross}) - ({$regularCommission}) < 0 THEN 0 ELSE ({$effectiveGross}) - ({$regularCommission}) END";
        $regular = DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->whereBetween('o.order_date', [$startDate, $endDate])
            ->whereNotIn('o.status', self::INVALID_ORDER_STATUSES)
            ->whereIn('op.status', ['completed', 'partially_refunded', 'refunded'])
            ->when(Schema::hasColumn('orders', 'deleted_at'), fn ($query) => $query->whereNull('o.deleted_at'))
            ->when(Schema::hasColumn('order_payments', 'deleted_at'), fn ($query) => $query->whereNull('op.deleted_at'))
            ->whereNotExists(fn ($query) => $query->select(DB::raw(1))->from('payment_splits as psx')->whereColumn('psx.order_payment_id', 'op.id'))
            ->when($storeId, fn ($query) => $query->where('o.store_id', $storeId))
            ->groupBy('pm.id', 'pm.name', 'pm.code', 'pm.type')
            ->selectRaw("pm.id, COALESCE(pm.name, 'Unspecified') as method_name, COALESCE(pm.code, 'unspecified') as method_code, COALESCE(pm.type, 'other') as method_type")
            ->selectRaw("COALESCE(SUM({$effectiveGross}), 0) as gross_amount")
            ->selectRaw("COALESCE(SUM({$regularCommission}), 0) as commission_amount")
            ->selectRaw("COALESCE(SUM({$effectiveNet}), 0) as net_amount")
            ->get();

        $splitRows = collect();
        if (Schema::hasTable('payment_splits')) {
            $splitGross = 'CASE WHEN COALESCE(ps.refunded_amount, 0) >= ps.amount THEN 0 ELSE ps.amount - COALESCE(ps.refunded_amount, 0) END';
            $splitCommission = Schema::hasColumn('payment_splits', 'commission_amount')
                ? 'CASE WHEN COALESCE(ps.commission_amount, ps.fee_amount, 0) - COALESCE(ps.reversed_commission_amount, 0) < 0 THEN 0 ELSE COALESCE(ps.commission_amount, ps.fee_amount, 0) - COALESCE(ps.reversed_commission_amount, 0) END'
                : 'COALESCE(ps.fee_amount, 0)';
            $splitNet = "CASE WHEN ({$splitGross}) - ({$splitCommission}) < 0 THEN 0 ELSE ({$splitGross}) - ({$splitCommission}) END";
            $splitRows = DB::table('payment_splits as ps')
                ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
                ->join('orders as o', 'o.id', '=', 'op.order_id')
                ->leftJoin('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
                ->whereBetween('o.order_date', [$startDate, $endDate])
                ->whereNotIn('o.status', self::INVALID_ORDER_STATUSES)
                ->whereIn('ps.status', ['completed', 'partially_refunded', 'refunded'])
                ->when(Schema::hasColumn('orders', 'deleted_at'), fn ($query) => $query->whereNull('o.deleted_at'))
                ->when(Schema::hasColumn('order_payments', 'deleted_at'), fn ($query) => $query->whereNull('op.deleted_at'))
                ->when($storeId, fn ($query) => $query->where('o.store_id', $storeId))
                ->groupBy('pm.id', 'pm.name', 'pm.code', 'pm.type')
                ->selectRaw("pm.id, COALESCE(pm.name, 'Unspecified') as method_name, COALESCE(pm.code, 'unspecified') as method_code, COALESCE(pm.type, 'other') as method_type")
                ->selectRaw("COALESCE(SUM({$splitGross}), 0) as gross_amount")
                ->selectRaw("COALESCE(SUM({$splitCommission}), 0) as commission_amount")
                ->selectRaw("COALESCE(SUM({$splitNet}), 0) as net_amount")
                ->get();
        }

        $merged = $regular->concat($splitRows)
            ->groupBy(fn ($row) => $row->method_code ?: $row->method_name)
            ->map(function ($rows) {
                $first = $rows->first();
                return [
                    'payment_method_id' => $first->id ? (int) $first->id : null,
                    'name' => $first->method_name,
                    'code' => $first->method_code,
                    'type' => $first->method_type,
                    'gross_amount' => round((float) $rows->sum('gross_amount'), 2),
                    'commission_amount' => round((float) $rows->sum('commission_amount'), 2),
                    'net_amount' => round((float) $rows->sum('net_amount'), 2),
                ];
            })
            ->sortByDesc('net_amount')
            ->values();

        return [
            'total_gross' => round((float) $merged->sum('gross_amount'), 2),
            'total_commission' => round((float) $merged->sum('commission_amount'), 2),
            'total_net' => round((float) $merged->sum('net_amount'), 2),
            'methods' => $merged->all(),
        ];
    }

    private function salesByChannel(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        $rows = $this->validOrders($startDate, $endDate, $storeId)
            ->selectRaw('order_type, COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as total_sales')
            ->groupBy('order_type')
            ->get();

        $total = (float) $rows->sum('total_sales');
        $channels = $rows->map(fn ($row) => [
            'channel' => $row->order_type ?: 'unknown',
            'label' => match ($row->order_type) {
                'counter' => 'POS / Counter',
                'ecommerce' => 'E-commerce',
                'social_commerce' => 'Social Commerce',
                default => ucwords(str_replace('_', ' ', (string) $row->order_type)),
            },
            'sales' => round((float) $row->total_sales, 2),
            'orders' => (int) $row->order_count,
            'percentage' => $total > 0 ? round(((float) $row->total_sales / $total) * 100, 2) : 0,
        ])->sortByDesc('sales')->values();

        $onlineSales = (float) $rows->whereIn('order_type', ['ecommerce', 'social_commerce'])->sum('total_sales');

        return ['channels' => $channels->all(), 'online_sales' => round($onlineSales, 2)];
    }

    private function salesSeries(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        $days = $startDate->diffInDays($endDate) + 1;
        $granularity = $days > 93 ? 'month' : 'day';
        $dateSql = $this->getDateFormatSql('order_date', $granularity);

        $salesRows = $this->validOrders($startDate, $endDate, $storeId)
            ->selectRaw("{$dateSql} as period_key")
            ->selectRaw('COALESCE(SUM(total_amount), 0) as sales')
            ->selectRaw('COUNT(*) as orders')
            ->groupBy(DB::raw($dateSql))
            ->get()
            ->keyBy('period_key');

        $refundDateSql = $this->getDateFormatSql('COALESCE(completed_at, processed_at, created_at)', $granularity);
        $refundRows = Refund::query()
            ->where('status', 'completed')
            ->whereBetween(DB::raw('COALESCE(completed_at, processed_at, created_at)'), [$startDate, $endDate])
            ->when($storeId, fn (Builder $query) => $query->whereHas('order', fn (Builder $order) => $order->where('store_id', $storeId)))
            ->selectRaw("{$refundDateSql} as period_key")
            ->selectRaw('COALESCE(SUM(refund_amount), 0) as refunds')
            ->groupBy(DB::raw($refundDateSql))
            ->get()
            ->keyBy('period_key');

        $series = [];
        if ($granularity === 'month') {
            $cursor = $startDate->copy()->startOfMonth();
            while ($cursor <= $endDate) {
                $key = $cursor->format('Y-m');
                $sales = (float) optional($salesRows->get($key))->sales;
                $refunds = (float) optional($refundRows->get($key))->refunds;
                $series[] = [
                    'key' => $key,
                    'label' => $cursor->format('M Y'),
                    'sales' => round($sales, 2),
                    'refunds' => round($refunds, 2),
                    'net_sales' => round($sales - $refunds, 2),
                    'orders' => (int) optional($salesRows->get($key))->orders,
                ];
                $cursor->addMonth();
            }
        } else {
            foreach (CarbonPeriod::create($startDate->copy()->startOfDay(), $endDate->copy()->startOfDay()) as $date) {
                $key = $date->format('Y-m-d');
                $sales = (float) optional($salesRows->get($key))->sales;
                $refunds = (float) optional($refundRows->get($key))->refunds;
                $series[] = [
                    'key' => $key,
                    'label' => $date->format('d M'),
                    'sales' => round($sales, 2),
                    'refunds' => round($refunds, 2),
                    'net_sales' => round($sales - $refunds, 2),
                    'orders' => (int) optional($salesRows->get($key))->orders,
                ];
            }
        }

        return $series;
    }

    private function topProducts(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        return DB::table('order_items as oi')
            ->join('orders as o', 'o.id', '=', 'oi.order_id')
            ->leftJoin('products as p', 'p.id', '=', 'oi.product_id')
            ->whereBetween('o.order_date', [$startDate, $endDate])
            ->whereNotIn('o.status', self::INVALID_ORDER_STATUSES)
            ->when(Schema::hasColumn('orders', 'deleted_at'), fn ($query) => $query->whereNull('o.deleted_at'))
            ->when($storeId, fn ($query) => $query->where('o.store_id', $storeId))
            ->groupBy('oi.product_id', 'oi.product_name', 'p.name', 'p.sku')
            ->selectRaw('oi.product_id, COALESCE(oi.product_name, p.name) as product_name, p.sku')
            ->selectRaw('COALESCE(SUM(oi.quantity), 0) as quantity')
            ->selectRaw('COALESCE(SUM(oi.total_amount), 0) as revenue')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($row, $index) => [
                'rank' => $index + 1,
                'product_id' => (int) $row->product_id,
                'product_name' => $row->product_name ?: 'Unknown product',
                'sku' => $row->sku ?: 'N/A',
                'quantity' => (float) $row->quantity,
                'revenue' => round((float) $row->revenue, 2),
            ])->all();
    }

    private function topStores(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        return $this->validOrders($startDate, $endDate, $storeId)
            ->leftJoin('stores', 'stores.id', '=', 'orders.store_id')
            ->groupBy('orders.store_id', 'stores.name')
            ->selectRaw('orders.store_id, COALESCE(stores.name, ?) as store_name', ['Unknown store'])
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(orders.total_amount), 0) as sales')
            ->orderByDesc('sales')
            ->limit(10)
            ->get()
            ->map(fn ($row, $index) => [
                'rank' => $index + 1,
                'store_id' => (int) $row->store_id,
                'store_name' => $row->store_name,
                'orders' => (int) $row->orders,
                'sales' => round((float) $row->sales, 2),
            ])->all();
    }

    private function operationsSummary(Carbon $startDate, Carbon $endDate, ?int $storeId): array
    {
        $rows = $this->validOrders($startDate, $endDate, $storeId)
            ->selectRaw('status, COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as value')
            ->groupBy('status')
            ->get();

        $pipeline = $rows->map(fn ($row) => [
            'status' => $row->status ?: 'unknown',
            'label' => ucwords(str_replace('_', ' ', (string) $row->status)),
            'orders' => (int) $row->orders,
            'value' => round((float) $row->value, 2),
        ])->sortByDesc('orders')->values();

        $pendingStatuses = ['pending', 'confirmed', 'assigned_to_store', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery'];
        $pending = $pipeline->whereIn('status', $pendingStatuses)->sum('orders');

        return [
            'total_orders' => (int) $pipeline->sum('orders'),
            'pending_unfulfilled' => (int) $pending,
            'delivered' => (int) $pipeline->where('status', 'delivered')->sum('orders'),
            'pipeline' => $pipeline->all(),
        ];
    }

    private function approvalSummary(?int $storeId): array
    {
        $purchaseOrders = Schema::hasTable('purchase_orders')
            ? PurchaseOrder::query()->whereIn('status', ['draft', 'pending', 'pending_approval'])->when($storeId, fn (Builder $q) => $q->where('store_id', $storeId))->count()
            : 0;
        $expenses = Schema::hasTable('expenses')
            ? Expense::query()->whereIn('status', ['draft', 'pending', 'submitted'])->when($storeId, fn (Builder $q) => $q->where('store_id', $storeId))->count()
            : 0;
        $returns = Schema::hasTable('product_returns')
            ? ProductReturn::query()->whereIn('status', ['requested', 'pending', 'received'])->when($storeId, fn (Builder $q) => $q->where('store_id', $storeId))->count()
            : 0;

        return [
            'purchase_orders' => $purchaseOrders,
            'expenses' => $expenses,
            'returns' => $returns,
            'total' => $purchaseOrders + $expenses + $returns,
        ];
    }

    private function buildAlerts(array $inventory, array $receivables, array $payables, array $operations, array $approvals, array $sales, array $profit): array
    {
        $alerts = [];
        if ($inventory['out_of_stock_count'] > 0) {
            $alerts[] = ['severity' => 'critical', 'title' => 'Products out of stock', 'message' => $inventory['out_of_stock_count'] . ' product/store combinations have no stock.', 'value' => $inventory['out_of_stock_count'], 'href' => '/inventory/view-new'];
        }
        if ($inventory['low_stock_count'] > 0) {
            $alerts[] = ['severity' => 'warning', 'title' => 'Low-stock exposure', 'message' => $inventory['low_stock_count'] . ' product/store combinations are below the threshold.', 'value' => $inventory['low_stock_count'], 'href' => '/inventory/view-new'];
        }
        if ($receivables['overdue_90_plus'] > 0) {
            $alerts[] = ['severity' => 'critical', 'title' => 'Customer dues older than 90 days', 'message' => 'Long-overdue receivables require collection follow-up.', 'value' => $receivables['overdue_90_plus'], 'href' => '/orders'];
        }
        if ($payables['overdue_90_plus'] > 0) {
            $alerts[] = ['severity' => 'warning', 'title' => 'Supplier dues older than 90 days', 'message' => 'Review vendor payment commitments.', 'value' => $payables['overdue_90_plus'], 'href' => '/purchase-order'];
        }
        if ($operations['pending_unfulfilled'] > 0) {
            $alerts[] = ['severity' => 'info', 'title' => 'Pending or unfulfilled orders', 'message' => $operations['pending_unfulfilled'] . ' orders remain in the fulfilment pipeline.', 'value' => $operations['pending_unfulfilled'], 'href' => '/orders'];
        }
        if ($approvals['total'] > 0) {
            $alerts[] = ['severity' => 'info', 'title' => 'Approvals waiting', 'message' => $approvals['total'] . ' purchase, expense, or return actions are waiting.', 'value' => $approvals['total'], 'href' => '/activity-logs'];
        }
        if ($sales['gross_sales'] > 0 && $profit['net_margin_percentage'] < 0) {
            $alerts[] = ['severity' => 'critical', 'title' => 'Negative net margin', 'message' => 'The selected period is currently loss-making after expenses.', 'value' => $profit['net_margin_percentage'], 'href' => '/accounting'];
        }

        return array_slice($alerts, 0, 10);
    }

    private function kpi(float|int $current, float|int $previous, string $href): array
    {
        $change = $this->percentageChange((float) $current, (float) $previous);
        return [
            'value' => round((float) $current, 2),
            'previous_value' => round((float) $previous, 2),
            'change_percentage' => $change,
            'direction' => $change > 0 ? 'up' : ($change < 0 ? 'down' : 'flat'),
            'href' => $href,
        ];
    }

    private function percentageChange(float $current, float $previous): float
    {
        if (abs($previous) < 0.00001) {
            return abs($current) < 0.00001 ? 0 : 100;
        }

        return round((($current - $previous) / abs($previous)) * 100, 2);
    }

    private function visibilityForRole(string $role): array
    {
        return match ($role) {
            'super-admin', 'admin' => [
                'sales' => true, 'profitability' => true, 'liquidity' => true, 'receivables' => true,
                'payables' => true, 'inventory' => true, 'capital' => true, 'approvals' => true,
            ],
            'branch-manager' => [
                'sales' => true, 'profitability' => true, 'liquidity' => true, 'receivables' => true,
                'payables' => false, 'inventory' => true, 'capital' => false, 'approvals' => true,
            ],
            'online-moderator' => [
                'sales' => true, 'profitability' => false, 'liquidity' => false, 'receivables' => true,
                'payables' => false, 'inventory' => true, 'capital' => false, 'approvals' => false,
            ],
            'pos-salesman' => [
                'sales' => true, 'profitability' => false, 'liquidity' => false, 'receivables' => false,
                'payables' => false, 'inventory' => true, 'capital' => false, 'approvals' => false,
            ],
            default => [
                'sales' => true, 'profitability' => false, 'liquidity' => false, 'receivables' => false,
                'payables' => false, 'inventory' => true, 'capital' => false, 'approvals' => false,
            ],
        };
    }
}
