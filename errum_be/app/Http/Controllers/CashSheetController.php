<?php

namespace App\Http\Controllers;

use App\Models\AdminEntry;
use App\Models\BranchCostEntry;
use App\Models\OwnerEntry;
use App\Models\Store;
use App\Models\Transaction;
use App\Models\PaymentMethod;
use App\Models\PaymentCommissionEntry;
use App\Models\ExpensePayment;
use App\Models\ExpenseCategory;
use App\Models\Expense;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Deshio-style monthly cash sheet rebuilt for Errum.
 *
 * The sheet is always calculated live from the current source records. No
 * calculated sale/cash/bank rows are persisted. This gives the required
 * rebalancing behaviour automatically:
 *
 * - cancelled, deleted, voided, or fully-refunded orders contribute nothing;
 * - editing order_date moves sale and every payment allocation to that date;
 * - editing a payment method or split replaces the old cash/bank allocation;
 * - changing the order store moves the complete contribution to that store;
 * - payment completion timestamps remain audit timestamps and never decide the
 *   cash-sheet day.
 */
class CashSheetController extends Controller
{
    private const DHAKA_TZ = 'Asia/Dhaka';

    private const READ_ROLES = ['super-admin', 'superadmin', 'admin', 'branch-manager', 'pos-salesman'];
    private const ADMIN_ROLES = ['super-admin', 'superadmin', 'admin'];

    private function normalizedRoleSlug(): string
    {
        $slug = (string) (Auth::guard('api')->user()?->role?->slug ?? '');
        return strtolower(str_replace('_', '-', trim($slug)));
    }

    private function denyUnlessRole(array $allowed)
    {
        if (!Auth::guard('api')->check()) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        if (!in_array($this->normalizedRoleSlug(), $allowed, true)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have access to this cash-sheet operation.',
            ], 403);
        }

        return null;
    }

    private function isGlobalCashSheetUser(): bool
    {
        return in_array($this->normalizedRoleSlug(), self::ADMIN_ROLES, true);
    }

    private function authenticatedStoreId(): ?int
    {
        $storeId = Auth::guard('api')->user()?->store_id;
        return $storeId ? (int) $storeId : null;
    }
    private const BRANCH_ORDER_TYPES = ['counter', 'pos', 'offline', 'offline_sale', 'retail', 'branch'];
    private const ONLINE_ORDER_TYPES = ['social_commerce', 'ecommerce', 'online', 'web', 'website', 'lazychat'];
    private const CANCELLED_ORDER_STATUSES = ['cancelled', 'canceled', 'void', 'deleted'];
    private const EXCLUDED_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded', 'void', 'deleted'];
    private const ACTIVE_PAYMENT_STATUSES = ['completed', 'partially_refunded', 'refunded'];
    private const VIRTUAL_PAYMENT_TYPES = ['exchange_balance', 'store_credit', 'balance_carryover'];
    private const VIRTUAL_METHOD_CODES = ['exchange_balance', 'store_credit', 'balance_carryover', 'gift_card'];

    /** GET /api/cash-sheet?month=YYYY-MM&store_id=optional */
    public function index(Request $request)
    {
        if ($denied = $this->denyUnlessRole(self::READ_ROLES)) {
            return $denied;
        }

        $request->validate([
            'month' => 'nullable|date_format:Y-m',
            'store_id' => 'nullable|integer|min:1',
        ]);

        $month = $request->input('month', now('Asia/Dhaka')->format('Y-m'));
        $dateFrom = Carbon::createFromFormat('Y-m-d', $month . '-01', 'Asia/Dhaka')->startOfMonth()->toDateString();
        $dateTo = Carbon::createFromFormat('Y-m-d', $month . '-01', 'Asia/Dhaka')->endOfMonth()->toDateString();
        $requestedStoreId = $this->isGlobalCashSheetUser()
            ? ($request->filled('store_id') ? (int) $request->input('store_id') : null)
            : $this->authenticatedStoreId();

        if (!$this->isGlobalCashSheetUser() && !$requestedStoreId) {
            return response()->json([
                'success' => false,
                'message' => 'Your employee account is not assigned to a store.',
            ], 422);
        }

        $stores = $this->loadStores($dateFrom, $dateTo, $requestedStoreId);
        $storeIds = $stores->pluck('id')->map(fn ($id) => (int) $id)->all();
        $dates = collect(CarbonPeriod::create($dateFrom, $dateTo))->map(fn ($date) => $date->toDateString());

        // A full refund can be recorded in three different Errum workflows:
        // the refunds table, order_payments.refunded_amount, or split-level
        // refunded_amount. Resolve those once so every cash-sheet section applies
        // the same current-state exclusion rule.
        $fullyRefundedOrderIds = $this->loadFullyRefundedOrderIds($dateFrom, $dateTo);

        $branchSales = $this->loadBranchSales($storeIds, $dateFrom, $dateTo, $fullyRefundedOrderIds);
        [$branchPayments, $paymentRefundCoverage] = $this->loadBranchPayments($storeIds, $dateFrom, $dateTo, $fullyRefundedOrderIds);
        $branchCommissions = $this->loadBranchCommissions($storeIds, $dateFrom, $dateTo);
        $branchRefunds = $this->loadBranchRefunds($storeIds, $dateFrom, $dateTo, $paymentRefundCoverage, $fullyRefundedOrderIds);
        $branchReturns = $this->loadBranchReturns($storeIds, $dateFrom, $dateTo, $fullyRefundedOrderIds);
        $branchCosts = $this->loadBranchCosts($storeIds, $dateFrom, $dateTo);
        $adminData = $this->loadAdminEntries($dateFrom, $dateTo);
        $onlineData = $this->loadOnlineData($dateFrom, $dateTo, $fullyRefundedOrderIds);
        $ownerData = $this->loadOwnerEntries($dateFrom, $dateTo);

        // Branch-scoped users receive only their own operational sheet. Global
        // settlements, online totals, and owner finance remain admin-only.
        if (!$this->isGlobalCashSheetUser()) {
            unset($adminData['_global']);
            $onlineData = [];
            $ownerData = [];
        }

        $rows = [];

        foreach ($dates as $date) {
            $branches = [];
            $totalCash = 0.0;
            $totalBank = 0.0;
            $totalSale = 0.0;
            $totalCommission = 0.0;

            foreach ($stores as $store) {
                $storeId = (int) $store->id;
                $storeKey = (string) $storeId;

                $sale = (float) ($branchSales[$storeKey][$date] ?? 0);
                $grossCash = (float) ($branchPayments[$storeKey][$date]['cash'] ?? 0);
                $grossBank = (float) ($branchPayments[$storeKey][$date]['bank'] ?? 0);
                $grossExOn = (float) ($branchPayments[$storeKey][$date]['ex_on'] ?? 0);
                $commission = (float) ($branchCommissions[$storeKey][$date] ?? 0);
                $refundCash = (float) ($branchRefunds[$storeKey][$date]['cash'] ?? 0);
                $refundBank = (float) ($branchRefunds[$storeKey][$date]['bank'] ?? 0);
                $refundExOn = (float) ($branchRefunds[$storeKey][$date]['ex_on'] ?? 0);
                $returnValue = (float) ($branchReturns[$storeKey][$date] ?? 0);
                $dailyCost = (float) ($branchCosts[$storeKey][$date] ?? 0);
                $salary = (float) ($adminData[$storeKey][$date]['salary_setaside'] ?? 0);
                $cashToBank = (float) ($adminData[$storeKey][$date]['cash_to_bank'] ?? 0);

                $rawCash = $grossCash - $refundCash;
                $rawBank = $grossBank - $refundBank;
                $exOn = $grossExOn - $refundExOn + $returnValue;

                // Do not clamp shortages to zero. Clamping would create artificial
                // bank money when a cash-to-bank transfer exceeds available cash.
                $displayCash = $rawCash - $salary - $cashToBank;
                $displayBank = $rawBank + $cashToBank;

                $branches[] = [
                    'store_id' => $storeId,
                    'store_name' => (string) $store->name,
                    'is_warehouse' => (bool) ($store->is_warehouse ?? false),
                    'daily_sale' => round($sale, 2),
                    'raw_cash' => round($rawCash, 2),
                    'cash' => round($displayCash, 2),
                    'bank' => round($displayBank, 2),
                    'commission' => round($commission, 2),
                    'ex_on' => round($exOn, 2),
                    'salary' => round($salary, 2),
                    'cash_to_bank' => round($cashToBank, 2),
                    'daily_cost' => round($dailyCost, 2),
                ];

                $totalSale += $sale;
                $totalCash += $displayCash;
                $totalBank += $displayBank;
                $totalCommission += $commission;
            }

            $online = $onlineData[$date] ?? [];
            $onlineSales = (float) ($online['daily_sales'] ?? 0);
            $onlineAdvance = (float) ($online['advance'] ?? 0);
            $onlinePayment = (float) ($online['online_payment'] ?? 0);
            $onlineCod = (float) ($online['cod'] ?? 0);
            $onlineCommission = (float) ($online['commission'] ?? 0);
            $totalCommission += $onlineCommission;

            // Same Deshio accounting presentation: social-commerce advances are
            // treated as bank receipts; ecommerce collections are settled through
            // the explicit SSLZC entry below.
            $totalBank += $onlineAdvance;

            $sslzcReceived = (float) ($adminData['_global'][$date]['sslzc'] ?? 0);
            $pathaoReceived = (float) ($adminData['_global'][$date]['pathao'] ?? 0);

            $owner = $ownerData[$date] ?? [];
            $cashInvest = (float) ($owner['cash_invest'] ?? 0);
            $bankInvest = (float) ($owner['bank_invest'] ?? 0);
            $cashCost = (float) ($owner['cash_cost'] ?? 0);
            $bankCost = (float) ($owner['bank_cost'] ?? 0);

            $finalBank = $totalBank + $sslzcReceived + $pathaoReceived;
            $totalCashWithOwner = $totalCash + $cashInvest;
            $totalBankWithOwner = $finalBank + $bankInvest;
            $cashAfterCost = $totalCashWithOwner - $cashCost;
            $bankAfterCost = $totalBankWithOwner - $bankCost;

            $rows[] = [
                'date' => $date,
                'branches' => $branches,
                'online' => [
                    'daily_sales' => round($onlineSales, 2),
                    'advance' => round($onlineAdvance, 2),
                    'online_payment' => round($onlinePayment, 2),
                    'cod' => round($onlineCod, 2),
                    'commission' => round($onlineCommission, 2),
                ],
                'disbursements' => [
                    'sslzc_received' => round($sslzcReceived, 2),
                    'pathao_received' => round($pathaoReceived, 2),
                ],
                'totals' => [
                    'total_sale' => round($totalSale + $onlineSales, 2),
                    'cash' => round($totalCash, 2),
                    'bank' => round($totalBank, 2),
                    'commission' => round($totalCommission, 2),
                    'final_bank' => round($finalBank, 2),
                ],
                'owner' => [
                    'cash_invest' => round($cashInvest, 2),
                    'bank_invest' => round($bankInvest, 2),
                    'total_cash' => round($totalCashWithOwner, 2),
                    'total_bank' => round($totalBankWithOwner, 2),
                    'cash_cost' => round($cashCost, 2),
                    'bank_cost' => round($bankCost, 2),
                    'cash_after_cost' => round($cashAfterCost, 2),
                    'bank_after_cost' => round($bankAfterCost, 2),
                ],
            ];
        }

        return response()->json([
            'success' => true,
            'month' => $month,
            'timezone' => 'Asia/Dhaka',
            'stores' => $stores->map(fn ($store) => [
                'id' => (int) $store->id,
                'name' => (string) $store->name,
                'is_warehouse' => (bool) ($store->is_warehouse ?? false),
            ])->values(),
            'data' => $rows,
            'summary' => $this->buildSummary($rows, $stores),
            'rules' => [
                'business_date' => 'orders.order_date',
                'cancelled_orders' => 'excluded_with_all_payments',
                'deleted_orders' => 'excluded',
                'fully_refunded_orders' => 'excluded',
                'payment_edits' => 'latest_active_payment_or_split_only',
                'payment_timestamps' => 'audit_only',
                'payment_commission' => 'gross_payment_minus_effective_dated_commission_snapshot',
            ],
        ]);
    }

    /** Backward-compatible endpoint used by the previous Errum cash-sheet client. */
    public function summary(Request $request)
    {
        return $this->index($request);
    }

    public function entries(Request $request)
    {
        if ($denied = $this->denyUnlessRole(self::READ_ROLES)) {
            return $denied;
        }

        $request->validate(['date' => 'required|date']);
        $date = Carbon::parse($request->input('date'), 'Asia/Dhaka')->toDateString();
        $storeId = $this->isGlobalCashSheetUser() ? null : $this->authenticatedStoreId();

        if (!$this->isGlobalCashSheetUser() && !$storeId) {
            return response()->json([
                'success' => false,
                'message' => 'Your employee account is not assigned to a store.',
            ], 422);
        }

        $branchCosts = BranchCostEntry::with(['store:id,name,is_warehouse', 'createdBy:id,name'])
            ->whereDate('entry_date', $date)
            ->when($storeId, fn ($query) => $query->where('store_id', $storeId))
            ->orderByDesc('created_at')
            ->get();

        $adminEntries = AdminEntry::with(['store:id,name,is_warehouse', 'createdBy:id,name'])
            ->whereDate('entry_date', $date)
            ->when($storeId, fn ($query) => $query->where('store_id', $storeId))
            ->orderByDesc('created_at')
            ->get();

        $ownerEntries = $this->isGlobalCashSheetUser()
            ? OwnerEntry::with(['createdBy:id,name'])
                ->whereDate('entry_date', $date)
                ->orderByDesc('created_at')
                ->get()
            : collect();

        return response()->json([
            'success' => true,
            'date' => $date,
            'branch_costs' => $branchCosts,
            'admin_entries' => $adminEntries,
            'owner_entries' => $ownerEntries,
        ]);
    }

    public function storeBranchCost(Request $request)
    {
        if ($denied = $this->denyUnlessRole(self::READ_ROLES)) {
            return $denied;
        }

        $validated = $request->validate([
            'entry_date' => 'required|date',
            'store_id' => 'required|integer|exists:stores,id',
            'amount' => 'required|numeric|min:0.01',
            'details' => 'nullable|string|max:500',
        ]);

        if (!$this->isGlobalCashSheetUser()) {
            $validated['store_id'] = $this->authenticatedStoreId();
            if (!$validated['store_id']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your employee account is not assigned to a store.',
                ], 422);
            }
        }

        $entry = DB::transaction(function () use ($validated) {
            $entry = BranchCostEntry::create([
                ...$validated,
                'entry_date' => Carbon::parse($validated['entry_date'], 'Asia/Dhaka')->toDateString(),
                'created_by' => Auth::guard('api')->id(),
            ]);
            $this->createAccountingExpenseForBranchCost($entry);
            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry' => $entry->load(['store:id,name,is_warehouse', 'createdBy:id,name']),
        ], 201);
    }

    public function destroyBranchCost(int $id)
    {
        if ($denied = $this->denyUnlessRole(self::READ_ROLES)) {
            return $denied;
        }

        $entry = BranchCostEntry::findOrFail($id);
        if (!$this->isGlobalCashSheetUser() && (int) $entry->store_id !== (int) $this->authenticatedStoreId()) {
            return response()->json(['success' => false, "message" => "You cannot delete another store's entry."], 403);
        }

        DB::transaction(function () use ($entry) {
            $this->cancelAccountingExpenseForBranchCost($entry);
            $entry->delete();
        });
        return response()->json(['success' => true]);
    }

    public function storeAdmin(Request $request)
    {
        if ($denied = $this->denyUnlessRole(self::ADMIN_ROLES)) {
            return $denied;
        }

        $validated = $request->validate([
            'entry_date' => 'required|date',
            'type' => 'required|in:salary_setaside,cash_to_bank,sslzc,pathao',
            'store_id' => 'nullable|integer|exists:stores,id',
            'amount' => 'required|numeric|min:0.01',
            'details' => 'nullable|string|max:500',
        ]);

        if (in_array($validated['type'], ['salary_setaside', 'cash_to_bank'], true) && empty($validated['store_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'store_id is required for salary set-aside and cash-to-bank entries.',
            ], 422);
        }

        $entry = DB::transaction(function () use ($validated) {
            $entry = AdminEntry::create([
                ...$validated,
                'entry_date' => Carbon::parse($validated['entry_date'], 'Asia/Dhaka')->toDateString(),
                'store_id' => in_array($validated['type'], ['sslzc', 'pathao'], true)
                    ? null
                    : $validated['store_id'],
                'created_by' => Auth::guard('api')->id(),
            ]);
            $this->createLedgerForAdminEntry($entry);
            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry' => $entry->load(['store:id,name,is_warehouse', 'createdBy:id,name']),
        ], 201);
    }

    public function destroyAdmin(int $id)
    {
        if ($denied = $this->denyUnlessRole(self::ADMIN_ROLES)) {
            return $denied;
        }

        DB::transaction(function () use ($id) {
            $entry = AdminEntry::findOrFail($id);
            $this->cancelLedgerForCashSheetEntry(AdminEntry::class, (int) $entry->id);
            $entry->delete();
        });
        return response()->json(['success' => true]);
    }

    public function storeOwner(Request $request)
    {
        if ($denied = $this->denyUnlessRole(self::ADMIN_ROLES)) {
            return $denied;
        }

        $validated = $request->validate([
            'entry_date' => 'required|date',
            'type' => 'required|in:cash_invest,bank_invest,cash_cost,bank_cost',
            'amount' => 'required|numeric|min:0.01',
            'details' => 'nullable|string|max:500',
        ]);

        $entry = DB::transaction(function () use ($validated) {
            $entry = OwnerEntry::create([
                ...$validated,
                'entry_date' => Carbon::parse($validated['entry_date'], 'Asia/Dhaka')->toDateString(),
                'created_by' => Auth::guard('api')->id(),
            ]);
            $this->createLedgerForOwnerEntry($entry);
            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry' => $entry->load(['createdBy:id,name']),
        ], 201);
    }

    public function destroyOwner(int $id)
    {
        if ($denied = $this->denyUnlessRole(self::ADMIN_ROLES)) {
            return $denied;
        }

        DB::transaction(function () use ($id) {
            $entry = OwnerEntry::findOrFail($id);
            $this->cancelLedgerForCashSheetEntry(OwnerEntry::class, (int) $entry->id);
            $entry->delete();
        });
        return response()->json(['success' => true]);
    }

    private function loadStores(string $from, string $to, ?int $requestedStoreId)
    {
        if ($requestedStoreId) {
            return Store::withTrashed()
                ->whereKey($requestedStoreId)
                ->get(['id', 'name', 'is_warehouse', 'is_active']);
        }

        $activityStoreIds = collect();

        $activityStoreIds = $activityStoreIds->merge(
            DB::table('orders')
                ->whereNull('deleted_at')
                ->whereDate('order_date', '>=', $from)
                ->whereDate('order_date', '<=', $to)
                ->whereNotNull('store_id')
                ->pluck('store_id')
        );

        $activityStoreIds = $activityStoreIds->merge(
            DB::table('branch_cost_entries')
                ->whereBetween('entry_date', [$from, $to])
                ->whereNotNull('store_id')
                ->pluck('store_id')
        );

        $activityStoreIds = $activityStoreIds->merge(
            DB::table('admin_entries')
                ->whereBetween('entry_date', [$from, $to])
                ->whereNotNull('store_id')
                ->pluck('store_id')
        )->filter()->map(fn ($id) => (int) $id)->unique()->values();

        return Store::withTrashed()
            ->where(function ($query) use ($activityStoreIds) {
                $query->where('is_active', true);
                if ($activityStoreIds->isNotEmpty()) {
                    $query->orWhereIn('id', $activityStoreIds->all());
                }
            })
            ->orderBy('is_warehouse')
            ->orderBy('id')
            ->get(['id', 'name', 'is_warehouse', 'is_active']);
    }

    /**
     * Resolve orders whose current refundable value has reached the complete
     * order total. Errum can record refunds in the refund workflow, directly
     * against an order payment, or against individual payment splits.
     *
     * We intentionally use the greatest independently recorded total rather
     * than adding the sources together because the same refund can be mirrored
     * in more than one table. This prevents a partial refund from being treated
     * as full through double counting.
     */
    private function loadFullyRefundedOrderIds(string $from, string $to): array
    {
        $orders = DB::table('orders')
            ->select('id', 'total_amount', 'status', 'payment_status')
            ->whereNull('deleted_at')
            ->whereDate('order_date', '>=', $from)
            ->whereDate('order_date', '<=', $to)
            ->get();

        if ($orders->isEmpty()) {
            return [];
        }

        // Join back to the monthly orders instead of feeding every order id
        // into a large WHERE IN list. This remains safe for high-volume months
        // and for SQLite test environments with small parameter limits.
        $workflowRefunds = DB::table('refunds as r')
            ->join('orders as ro', 'ro.id', '=', 'r.order_id')
            ->whereNull('ro.deleted_at')
            ->whereNull('r.deleted_at')
            ->where('r.status', 'completed')
            ->whereDate('ro.order_date', '>=', $from)
            ->whereDate('ro.order_date', '<=', $to)
            ->groupBy('r.order_id')
            ->selectRaw("r.order_id, SUM(CASE WHEN r.refund_type = 'full' THEN COALESCE(r.original_amount, r.refund_amount + COALESCE(r.processing_fee, 0)) ELSE r.refund_amount END) as coverage_total")
            ->get()
            ->keyBy('order_id');

        $paymentRefunds = DB::table('order_payments as rp')
            ->join('orders as ro', 'ro.id', '=', 'rp.order_id')
            ->whereNull('ro.deleted_at')
            ->whereNull('rp.deleted_at')
            ->whereNotIn('rp.status', ['cancelled', 'failed'])
            ->whereDate('ro.order_date', '>=', $from)
            ->whereDate('ro.order_date', '<=', $to)
            ->groupBy('rp.order_id')
            ->selectRaw('rp.order_id, SUM(COALESCE(rp.refunded_amount, 0)) as total')
            ->pluck('total', 'rp.order_id');

        $splitRefunds = DB::table('payment_splits as ps')
            ->join('order_payments as rp', 'rp.id', '=', 'ps.order_payment_id')
            ->join('orders as ro', 'ro.id', '=', 'rp.order_id')
            ->whereNull('ro.deleted_at')
            ->whereNull('rp.deleted_at')
            ->whereNotIn('rp.status', ['cancelled', 'failed'])
            ->whereNotIn('ps.status', ['cancelled', 'failed'])
            ->whereDate('ro.order_date', '>=', $from)
            ->whereDate('ro.order_date', '<=', $to)
            ->groupBy('rp.order_id')
            ->selectRaw('rp.order_id, SUM(COALESCE(ps.refunded_amount, 0)) as total')
            ->pluck('total', 'rp.order_id');

        return $orders
            ->filter(function ($order) use ($workflowRefunds, $paymentRefunds, $splitRefunds) {
                // Status-flagged cancellations/refunds are already removed by every
                // report query. This list only needs refund activity that did not
                // update the order flags, which is the gap this resolver closes.
                if (in_array(strtolower((string) $order->status), self::EXCLUDED_ORDER_STATUSES, true)
                    || strtolower((string) $order->payment_status) === 'refunded') {
                    return false;
                }

                $total = round(max(0, (float) $order->total_amount), 2);
                if ($total <= 0) {
                    return false;
                }

                $workflowRefund = $workflowRefunds[$order->id] ?? null;

                // refund_type=full means the complete approved return was
                // refunded; it does not necessarily mean the entire order was
                // returned. Use original_amount as coverage for full-return
                // refunds (so a processing fee does not hide full coverage),
                // then compare the aggregate coverage with the order total.
                $largestRecordedRefund = max(
                    (float) ($workflowRefund->coverage_total ?? 0),
                    (float) ($paymentRefunds[$order->id] ?? 0),
                    (float) ($splitRefunds[$order->id] ?? 0)
                );

                return $largestRecordedRefund + 0.01 >= $total;
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    private function excludeFullyRefundedOrders($query, array $fullyRefundedOrderIds): void
    {
        if (!empty($fullyRefundedOrderIds)) {
            $query->whereNotIn('o.id', $fullyRefundedOrderIds);
        }
    }

    private function loadBranchSales(array $storeIds, string $from, string $to, array $fullyRefundedOrderIds): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];

        $query = DB::table('orders as o')
            ->select('o.store_id', DB::raw('DATE(o.order_date) as day'), DB::raw('SUM(o.total_amount) as total'))
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        $this->excludeFullyRefundedOrders($query, $fullyRefundedOrderIds);

        $query->groupBy('o.store_id', 'day')
            ->get()
            ->each(function ($row) use (&$out) {
                $out[(string) $row->store_id][$row->day] = round((float) $row->total, 2);
            });

        return $out;
    }

    /**
     * Returns [payment movements, refund coverage]. Refund coverage is used to
     * prevent a refund from being deducted twice when both order_payments and
     * refunds contain the same reversal.
     */
    private function loadBranchPayments(array $storeIds, string $from, string $to, array $fullyRefundedOrderIds): array
    {
        if (empty($storeIds)) {
            return [[], []];
        }

        $paymentQuery = DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->select(
                'op.id as payment_id',
                'op.order_id',
                'o.store_id',
                DB::raw('DATE(o.order_date) as day'),
                'op.payment_method_id',
                'op.payment_type',
                'op.amount',
                'op.commission_amount',
                'op.reversed_commission_amount',
                'op.refunded_amount',
                'op.status',
                'pm.type as method_type',
                'pm.code as method_code'
            )
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            // A refund is a real cash/bank movement even when the order is now
            // marked refunded. Only cancelled/void/deleted orders disappear
            // without a refund movement.
            ->whereNotIn('o.status', self::CANCELLED_ORDER_STATUSES)
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::ACTIVE_PAYMENT_STATUSES)
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        // Do not exclude fully refunded orders here: their gross receipt minus
        // processor commission and their actual refund must net through cash/bank.
        $payments = $paymentQuery->get();

        $paymentIds = $payments->pluck('payment_id')->map(fn ($id) => (int) $id)->all();
        $splitsByPayment = [];
        $paymentIdsWithAnySplit = [];

        if (!empty($paymentIds)) {
            $paymentIdsWithAnySplit = DB::table('payment_splits')
                ->whereIn('order_payment_id', $paymentIds)
                ->distinct()
                ->pluck('order_payment_id')
                ->map(fn ($id) => (int) $id)
                ->flip()
                ->all();

            DB::table('payment_splits as ps')
                ->join('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
                ->select(
                    'ps.order_payment_id',
                    'ps.amount',
                    'ps.commission_amount',
                    'ps.reversed_commission_amount',
                    'ps.refunded_amount',
                    'ps.status',
                    'pm.type as method_type',
                    'pm.code as method_code'
                )
                ->whereIn('ps.order_payment_id', $paymentIds)
                ->whereIn('ps.status', self::ACTIVE_PAYMENT_STATUSES)
                ->orderBy('ps.order_payment_id')
                ->orderBy('ps.split_sequence')
                ->get()
                ->each(function ($row) use (&$splitsByPayment) {
                    $splitsByPayment[(int) $row->order_payment_id][] = $row;
                });
        }

        // RefundController records the actual refund instrument in refunds,
        // while the direct payment APIs can record refunded_amount only on the
        // payment parent. For split parents, use the workflow instrument first;
        // any remaining unclassified parent refund is allocated proportionally.
        // This keeps cash + bank equal to the true net payment without counting
        // a mirrored workflow refund twice in loadBranchRefunds().
        $workflowRefundTargets = [];
        $refundTargetQuery = DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                'r.order_id',
                'r.refund_method',
                'r.refund_method_details',
                'r.refund_amount'
            )
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::CANCELLED_ORDER_STATUSES)
            ->whereNull('o.deleted_at')
            ->whereNull('r.deleted_at')
            ->where('r.status', 'completed')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        $refundTargetQuery
            ->orderBy('r.id')
            ->get()
            ->each(function ($row) use (&$workflowRefundTargets) {
                $orderId = (int) $row->order_id;
                $allocations = $this->refundAllocations(
                    (string) $row->refund_method,
                    $row->refund_method_details,
                    (float) $row->refund_amount
                );

                foreach ($allocations as $bucket => $amount) {
                    if ($amount <= 0) {
                        continue;
                    }

                    $workflowRefundTargets[$orderId][$bucket] =
                        ($workflowRefundTargets[$orderId][$bucket] ?? 0) + $amount;
                }
            });

        $out = [];
        $refundCoverage = [];

        $addMovement = function (string $storeKey, string $day, string $bucket, float $amount) use (&$out): void {
            if (abs($amount) < 0.005) {
                return;
            }
            $out[$storeKey][$day][$bucket] = ($out[$storeKey][$day][$bucket] ?? 0) + $amount;
        };

        $addCoverage = function (int $orderId, string $bucket, float $amount) use (&$refundCoverage, &$workflowRefundTargets): void {
            if ($amount <= 0) {
                return;
            }

            $refundCoverage[$orderId][$bucket] = ($refundCoverage[$orderId][$bucket] ?? 0) + $amount;

            // Mark matching workflow refunds as already represented by the
            // payment-level deduction, so loadBranchRefunds only deducts any
            // genuinely additional amount.
            $target = (float) ($workflowRefundTargets[$orderId][$bucket] ?? 0);
            if ($target > 0) {
                $workflowRefundTargets[$orderId][$bucket] = max(0, $target - min($target, $amount));
            }
        };

        foreach ($payments as $payment) {
            $storeKey = (string) $payment->store_id;
            $day = (string) $payment->day;
            $paymentId = (int) $payment->payment_id;
            $orderId = (int) $payment->order_id;
            $hasAnySplit = array_key_exists($paymentId, $paymentIdsWithAnySplit);
            $instruments = $splitsByPayment[$paymentId] ?? [];

            if (!$hasAnySplit) {
                $amount = max(0, (float) $payment->amount);
                $refunded = min($amount, max(0, (float) ($payment->refunded_amount ?? 0)));
                $bucket = $this->paymentBucket(
                    (string) ($payment->method_type ?? ''),
                    (string) ($payment->method_code ?? ''),
                    (string) ($payment->payment_type ?? '')
                );

                // A completed return/exchange refund can be mirrored both in
                // order_payments.refunded_amount and in refunds. When its saved
                // distribution differs from the original payment method (for
                // example an original bank payment refunded as cash + bank),
                // deduct only the portion belonging to this payment bucket here.
                // The other buckets are applied by loadBranchRefunds(). Any
                // refund amount without workflow metadata still follows the
                // original payment method as a safe fallback.
                $deductFromPaymentBucket = 0.0;
                $remainingPaymentRefund = $refunded;

                if ($remainingPaymentRefund > 0) {
                    $matchingWorkflowTarget = max(
                        0,
                        (float) ($workflowRefundTargets[$orderId][$bucket] ?? 0)
                    );
                    $matchingDeduction = min(
                        $remainingPaymentRefund,
                        $matchingWorkflowTarget,
                        $amount
                    );

                    if ($matchingDeduction > 0) {
                        $deductFromPaymentBucket += $matchingDeduction;
                        $remainingPaymentRefund -= $matchingDeduction;
                        $addCoverage($orderId, $bucket, $matchingDeduction);
                    }

                    $workflowAmountInOtherBuckets = array_sum(
                        array_map(
                            fn ($value) => max(0, (float) $value),
                            $workflowRefundTargets[$orderId] ?? []
                        )
                    );
                    $deferredToWorkflowBuckets = min(
                        $remainingPaymentRefund,
                        $workflowAmountInOtherBuckets
                    );
                    $remainingPaymentRefund -= $deferredToWorkflowBuckets;

                    if ($remainingPaymentRefund > 0) {
                        $unclassifiedDeduction = min(
                            $remainingPaymentRefund,
                            max(0, $amount - $deductFromPaymentBucket)
                        );
                        $deductFromPaymentBucket += $unclassifiedDeduction;
                        $addCoverage($orderId, $bucket, $unclassifiedDeduction);
                    }
                }

                $netCommission = $bucket === 'bank'
                    ? max(0, (float) ($payment->commission_amount ?? 0) - (float) ($payment->reversed_commission_amount ?? 0))
                    : 0.0;
                $addMovement(
                    $storeKey,
                    $day,
                    $bucket,
                    $amount - $netCommission - $deductFromPaymentBucket
                );
                continue;
            }

            // A split parent must never be counted as a normal bank payment.
            // Build current net values from only its active split instruments.
            $bucketNet = ['cash' => 0.0, 'bank' => 0.0, 'ex_on' => 0.0];
            $childRefundTotal = 0.0;

            foreach ($instruments as $instrument) {
                $amount = max(0, (float) ($instrument->amount ?? 0));
                $refunded = min($amount, max(0, (float) ($instrument->refunded_amount ?? 0)));
                $bucket = $this->paymentBucket(
                    (string) ($instrument->method_type ?? ''),
                    (string) ($instrument->method_code ?? ''),
                    (string) ($payment->payment_type ?? '')
                );

                $netCommission = $bucket === 'bank'
                    ? max(0, (float) ($instrument->commission_amount ?? 0) - (float) ($instrument->reversed_commission_amount ?? 0))
                    : 0.0;
                $bucketNet[$bucket] += $amount - $netCommission - $refunded;
                $childRefundTotal += $refunded;
                $addCoverage($orderId, $bucket, $refunded);
            }

            // A direct refund can be attached to the split parent instead of a
            // child split. Treat only the amount not already represented by
            // child refunds as an additional reversal.
            $parentRefundResidual = max(
                0,
                min((float) $payment->amount, (float) ($payment->refunded_amount ?? 0)) - $childRefundTotal
            );
            $parentRefundResidual = min($parentRefundResidual, array_sum(array_map(fn ($value) => max(0, $value), $bucketNet)));

            // Prefer the explicit workflow refund method when it is available.
            foreach (['cash', 'bank', 'ex_on'] as $bucket) {
                if ($parentRefundResidual <= 0) {
                    break;
                }

                $target = max(0, (float) ($workflowRefundTargets[$orderId][$bucket] ?? 0));
                $deduction = min($parentRefundResidual, $target, $bucketNet[$bucket]);
                if ($deduction <= 0) {
                    continue;
                }

                $bucketNet[$bucket] -= $deduction;
                $parentRefundResidual -= $deduction;
                $addCoverage($orderId, $bucket, $deduction);
            }

            // If the parent-level refund has no instrument metadata, allocate
            // the unresolved amount proportionally across the current split.
            // The last non-empty bucket absorbs the rounding remainder so the
            // total reversal always equals the recorded parent refund.
            if ($parentRefundResidual > 0) {
                $eligibleBuckets = array_values(array_filter(
                    ['cash', 'bank', 'ex_on'],
                    fn (string $bucket) => $bucketNet[$bucket] > 0
                ));
                $eligibleTotal = array_sum(array_map(fn (string $bucket) => $bucketNet[$bucket], $eligibleBuckets));
                $remaining = $parentRefundResidual;

                foreach ($eligibleBuckets as $index => $bucket) {
                    $isLast = $index === count($eligibleBuckets) - 1;
                    $deduction = $isLast
                        ? min($remaining, $bucketNet[$bucket])
                        : min($bucketNet[$bucket], round($parentRefundResidual * ($bucketNet[$bucket] / $eligibleTotal), 2));

                    $bucketNet[$bucket] -= $deduction;
                    $remaining -= $deduction;
                    $addCoverage($orderId, $bucket, $deduction);
                }
            }

            foreach ($bucketNet as $bucket => $amount) {
                $addMovement($storeKey, $day, $bucket, $amount);
            }
        }

        return [$out, $refundCoverage];
    }

    private function loadBranchCommissions(array $storeIds, string $from, string $to): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];
        PaymentCommissionEntry::query()
            ->join('orders as o', 'o.id', '=', 'payment_commission_entries.order_id')
            ->select(
                'payment_commission_entries.store_id',
                DB::raw('DATE(payment_commission_entries.business_date) as day'),
                DB::raw('SUM(payment_commission_entries.net_commission_amount) as total')
            )
            ->whereIn('payment_commission_entries.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereIn('payment_commission_entries.status', ['active', 'reversed'])
            ->whereNotIn('o.status', self::CANCELLED_ORDER_STATUSES)
            ->whereNull('o.deleted_at')
            ->whereDate('payment_commission_entries.business_date', '>=', $from)
            ->whereDate('payment_commission_entries.business_date', '<=', $to)
            ->groupBy('payment_commission_entries.store_id', 'day')
            ->get()
            ->each(function ($row) use (&$out) {
                $out[(string) $row->store_id][(string) $row->day] = round((float) $row->total, 2);
            });

        return $out;
    }

    private function loadBranchRefunds(array $storeIds, string $from, string $to, array $paymentRefundCoverage, array $fullyRefundedOrderIds): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];
        $coverage = $paymentRefundCoverage;

        $query = DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                'r.order_id',
                'o.store_id',
                DB::raw('DATE(o.order_date) as day'),
                'r.refund_method',
                'r.refund_method_details',
                'r.refund_amount'
            )
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::CANCELLED_ORDER_STATUSES)
            ->whereNull('o.deleted_at')
            ->whereNull('r.deleted_at')
            ->where('r.status', 'completed')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        $query->orderBy('r.id')
            ->get()
            ->each(function ($row) use (&$out, &$coverage) {
                $orderId = (int) $row->order_id;
                $storeKey = (string) $row->store_id;
                $day = (string) $row->day;
                $allocations = $this->refundAllocations(
                    (string) $row->refund_method,
                    $row->refund_method_details,
                    (float) $row->refund_amount
                );

                foreach ($allocations as $bucket => $amount) {
                    if ($amount <= 0) {
                        continue;
                    }

                    $alreadyCovered = min($amount, (float) ($coverage[$orderId][$bucket] ?? 0));
                    $coverage[$orderId][$bucket] = max(
                        0,
                        (float) ($coverage[$orderId][$bucket] ?? 0) - $alreadyCovered
                    );
                    $remaining = $amount - $alreadyCovered;

                    if ($remaining <= 0) {
                        continue;
                    }

                    $out[$storeKey][$day][$bucket] =
                        ($out[$storeKey][$day][$bucket] ?? 0) + $remaining;
                }
            });

        return $out;
    }

    private function loadBranchReturns(array $storeIds, string $from, string $to, array $fullyRefundedOrderIds): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];

        $query = DB::table('product_returns as pr')
            ->join('orders as o', 'o.id', '=', 'pr.order_id')
            ->select('o.store_id', DB::raw('DATE(o.order_date) as day'), DB::raw('SUM(pr.total_return_value) as total'))
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereIn('pr.status', ['approved', 'completed', 'refunded'])
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereNull('pr.deleted_at')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        $this->excludeFullyRefundedOrders($query, $fullyRefundedOrderIds);

        $query->groupBy('o.store_id', 'day')
            ->get()
            ->each(function ($row) use (&$out) {
                $out[(string) $row->store_id][$row->day] = (float) $row->total;
            });

        return $out;
    }

    private function loadBranchCosts(array $storeIds, string $from, string $to): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];

        BranchCostEntry::select('store_id', DB::raw('DATE(entry_date) as day'), DB::raw('SUM(amount) as total'))
            ->whereIn('store_id', $storeIds)
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('store_id', 'day')
            ->get()
            ->each(function ($row) use (&$out) {
                $out[(string) $row->store_id][$row->day] = (float) $row->total;
            });

        return $out;
    }

    /** Returns [store_id|'_global'][date][type] = amount. */
    private function loadAdminEntries(string $from, string $to): array
    {
        $out = [];

        AdminEntry::select('store_id', 'type', DB::raw('DATE(entry_date) as day'), DB::raw('SUM(amount) as total'))
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('store_id', 'type', 'day')
            ->get()
            ->each(function ($row) use (&$out) {
                $key = in_array($row->type, ['sslzc', 'pathao'], true) ? '_global' : (string) $row->store_id;
                $out[$key][$row->day][$row->type] = ($out[$key][$row->day][$row->type] ?? 0) + (float) $row->total;
            });

        return $out;
    }

    private function loadOnlineData(string $from, string $to, array $fullyRefundedOrderIds): array
    {
        $out = [];

        $query = DB::table('orders as o')
            ->select(
                'o.id',
                DB::raw('DATE(o.order_date) as day'),
                'o.order_type',
                'o.total_amount',
                'o.paid_amount',
                'o.outstanding_amount'
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to);

        $this->excludeFullyRefundedOrders($query, $fullyRefundedOrderIds);
        $orders = $query->get();
        $orderIds = $orders->pluck('id')->map(fn ($id) => (int) $id)->all();

        $commissions = empty($orderIds)
            ? collect()
            : PaymentCommissionEntry::selectRaw('order_id, SUM(net_commission_amount) as total')
                ->whereIn('order_id', $orderIds)
                ->whereIn('status', ['active', 'reversed'])
                ->groupBy('order_id')
                ->pluck('total', 'order_id');

        foreach ($orders as $row) {
            $day = (string) $row->day;
            $type = strtolower((string) $row->order_type);
            $commission = max(0, (float) ($commissions[(int) $row->id] ?? 0));
            $grossPaid = max(0, (float) $row->paid_amount);
            $netPaid = max(0, $grossPaid - $commission);

            $out[$day]['daily_sales'] = ($out[$day]['daily_sales'] ?? 0) + (float) $row->total_amount;
            $out[$day]['commission'] = ($out[$day]['commission'] ?? 0) + $commission;

            if ($type === 'social_commerce' || $type === 'lazychat') {
                $out[$day]['advance'] = ($out[$day]['advance'] ?? 0) + $netPaid;
                $out[$day]['cod'] = ($out[$day]['cod'] ?? 0) + (float) $row->outstanding_amount;
            } else {
                $out[$day]['online_payment'] = ($out[$day]['online_payment'] ?? 0) + $netPaid;
            }
        }

        return $out;
    }

    private function loadOwnerEntries(string $from, string $to): array
    {
        $out = [];

        DB::table('owner_entries')
            ->selectRaw('DATE(entry_date) as day, type, SUM(amount) as total')
            ->whereDate('entry_date', '>=', $from)
            ->whereDate('entry_date', '<=', $to)
            ->groupBy('day', 'type')
            ->get()
            ->each(function ($row) use (&$out) {
                $day = Carbon::parse($row->day, 'Asia/Dhaka')->toDateString();
                $out[$day][$row->type] = ($out[$day][$row->type] ?? 0) + (float) $row->total;
            });

        return $out;
    }

    private function paymentBucket(string $methodType, string $methodCode, string $paymentType): string
    {
        $methodType = strtolower(trim($methodType));
        $methodCode = strtolower(trim($methodCode));
        $paymentType = strtolower(trim($paymentType));

        if (in_array($paymentType, self::VIRTUAL_PAYMENT_TYPES, true)
            || in_array($methodCode, self::VIRTUAL_METHOD_CODES, true)
            || in_array($methodType, self::VIRTUAL_PAYMENT_TYPES, true)) {
            return 'ex_on';
        }

        return $methodType === 'cash' ? 'cash' : 'bank';
    }

    /**
     * Resolve a refund into the exact monthly-sheet cash/bank/exchange buckets.
     *
     * Return/exchange screens store mixed refunds (for example cash + card +
     * bKash) in refunds.refund_method_details while refund_method contains only
     * a headline/fallback method. Reading only the headline incorrectly deducts
     * every mixed refund from one bucket. This helper honours the saved
     * distribution, caps malformed totals to refund_amount, and assigns any
     * unclassified remainder to the headline method.
     *
     * @return array{cash: float, bank: float, ex_on: float}
     */
    private function refundAllocations(string $refundMethod, mixed $details, float $refundAmount): array
    {
        $total = round(max(0, $refundAmount), 2);
        $allocations = ['cash' => 0.0, 'bank' => 0.0, 'ex_on' => 0.0];

        if ($total <= 0) {
            return $allocations;
        }

        if (is_string($details) && trim($details) !== '') {
            $decoded = json_decode($details, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $details = $decoded;
            }
        } elseif (is_object($details)) {
            $details = (array) $details;
        }

        $bucketForKey = function (string $key): ?string {
            $normalized = strtolower(trim(str_replace(['-', ' '], '_', $key)));

            return match ($normalized) {
                'cash', 'cash_amount', 'cash_refund', 'cash_refund_amount' => 'cash',
                'store_credit', 'store_credit_amount', 'gift_card', 'gift_card_amount',
                'exchange_balance', 'exchange_credit' => 'ex_on',
                'bank', 'bank_amount', 'bank_transfer', 'bank_transfer_amount',
                'card', 'card_amount', 'card_refund', 'card_refund_amount',
                'bkash', 'b_kash', 'nagad', 'rocket', 'upay',
                'mobile_banking', 'digital_wallet', 'wallet', 'check', 'cheque',
                'other' => 'bank',
                default => null,
            };
        };

        $collect = function (mixed $node, ?string $hint = null) use (&$collect, &$allocations, $bucketForKey): void {
            if (is_object($node)) {
                $node = (array) $node;
            }

            if (is_numeric($node) && $hint !== null) {
                $bucket = $bucketForKey($hint);
                if ($bucket !== null) {
                    $allocations[$bucket] += max(0, (float) $node);
                }
                return;
            }

            if (!is_array($node)) {
                return;
            }

            // Support structured rows such as {method: "cash", amount: 100}.
            $method = $node['method'] ?? $node['type'] ?? $node['code'] ?? $node['name'] ?? null;
            $amount = $node['amount'] ?? $node['refund_amount'] ?? $node['value'] ?? null;
            if (is_string($method) && is_numeric($amount)) {
                $bucket = $bucketForKey($method) ?? $this->refundBucket($method);
                $allocations[$bucket] += max(0, (float) $amount);
                return;
            }

            foreach ($node as $key => $value) {
                if (is_numeric($key)) {
                    $collect($value, null);
                    continue;
                }

                $bucket = $bucketForKey((string) $key);
                if ($bucket !== null && is_numeric($value)) {
                    $allocations[$bucket] += max(0, (float) $value);
                    continue;
                }

                if (is_array($value) || is_object($value)) {
                    $collect($value, (string) $key);
                }
            }
        };

        if (is_array($details)) {
            $collect($details);
        }

        $explicitTotal = array_sum($allocations);
        if ($explicitTotal > $total + 0.009) {
            $scale = $total / $explicitTotal;
            $remaining = $total;
            $nonZeroBuckets = array_values(array_filter(
                array_keys($allocations),
                fn (string $bucket) => $allocations[$bucket] > 0
            ));

            foreach ($nonZeroBuckets as $index => $bucket) {
                $isLast = $index === count($nonZeroBuckets) - 1;
                $scaled = $isLast
                    ? $remaining
                    : round($allocations[$bucket] * $scale, 2);
                $scaled = min($remaining, max(0, $scaled));
                $allocations[$bucket] = $scaled;
                $remaining = round($remaining - $scaled, 2);
            }
        } elseif ($explicitTotal < $total - 0.009) {
            $fallbackBucket = $this->refundBucket($refundMethod);
            $allocations[$fallbackBucket] += round($total - $explicitTotal, 2);
        }

        foreach ($allocations as $bucket => $amount) {
            $allocations[$bucket] = round(max(0, $amount), 2);
        }

        return $allocations;
    }

    private function refundBucket(string $refundMethod): string
    {
        return match (strtolower(trim($refundMethod))) {
            'cash' => 'cash',
            'store_credit', 'gift_card' => 'ex_on',
            default => 'bank',
        };
    }

    private function buildSummary(array $rows, $stores): array
    {
        $summary = [
            'branches' => [],
            'online' => ['daily_sales' => 0, 'advance' => 0, 'online_payment' => 0, 'cod' => 0, 'commission' => 0],
            'disbursements' => ['sslzc_received' => 0, 'pathao_received' => 0],
            'totals' => ['total_sale' => 0, 'cash' => 0, 'bank' => 0, 'commission' => 0, 'final_bank' => 0],
            'owner' => [
                'cash_invest' => 0,
                'bank_invest' => 0,
                'total_cash' => 0,
                'total_bank' => 0,
                'cash_cost' => 0,
                'bank_cost' => 0,
                'cash_after_cost' => 0,
                'bank_after_cost' => 0,
            ],
        ];

        foreach ($stores as $store) {
            $summary['branches'][(int) $store->id] = [
                'store_id' => (int) $store->id,
                'store_name' => (string) $store->name,
                'is_warehouse' => (bool) ($store->is_warehouse ?? false),
                'daily_sale' => 0,
                'raw_cash' => 0,
                'cash' => 0,
                'bank' => 0,
                'commission' => 0,
                'ex_on' => 0,
                'salary' => 0,
                'cash_to_bank' => 0,
                'daily_cost' => 0,
            ];
        }

        foreach ($rows as $row) {
            foreach ($row['branches'] as $branch) {
                foreach (['daily_sale', 'raw_cash', 'cash', 'bank', 'commission', 'ex_on', 'salary', 'cash_to_bank', 'daily_cost'] as $field) {
                    $summary['branches'][$branch['store_id']][$field] += (float) $branch[$field];
                }
            }

            foreach (['daily_sales', 'advance', 'online_payment', 'cod', 'commission'] as $field) {
                $summary['online'][$field] += (float) $row['online'][$field];
            }

            foreach (['sslzc_received', 'pathao_received'] as $field) {
                $summary['disbursements'][$field] += (float) $row['disbursements'][$field];
            }

            foreach (['total_sale', 'cash', 'bank', 'commission', 'final_bank'] as $field) {
                $summary['totals'][$field] += (float) $row['totals'][$field];
            }

            foreach (['cash_invest', 'bank_invest', 'total_cash', 'total_bank', 'cash_cost', 'bank_cost', 'cash_after_cost', 'bank_after_cost'] as $field) {
                $summary['owner'][$field] += (float) $row['owner'][$field];
            }
        }

        array_walk_recursive($summary, function (&$value) {
            if (is_float($value) || is_int($value)) {
                $value = round((float) $value, 2);
            }
        });

        $summary['branches'] = array_values($summary['branches']);

        return $summary;
    }

    private function createAccountingExpenseForBranchCost(BranchCostEntry $entry): void
    {
        if ($this->findLinkedExpenseForBranchCost($entry)) {
            return;
        }

        $employeeId = $this->currentEmployeeId();
        $entryDate = Carbon::parse($entry->entry_date, self::DHAKA_TZ)->toDateString();
        $timestamp = Carbon::parse($entryDate, self::DHAKA_TZ)->endOfDay();
        $amount = (float) $entry->amount;
        $category = $this->resolveCashSheetExpenseCategory();
        $paymentMethod = $this->resolveCashPaymentMethod();

        $expense = Expense::create([
            'category_id' => $category->id,
            'store_id' => $entry->store_id,
            'created_by' => $employeeId,
            'approved_by' => $employeeId,
            'processed_by' => $employeeId,
            'amount' => $amount,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => $amount,
            'paid_amount' => $amount,
            'outstanding_amount' => 0,
            'status' => 'completed',
            'payment_status' => 'paid',
            'expense_date' => $entryDate,
            'approved_at' => $timestamp,
            'processed_at' => $timestamp,
            'completed_at' => $timestamp,
            'description' => $entry->details ?: 'Branch daily cost',
            'expense_type' => 'miscellaneous',
            'metadata' => [
                'source' => 'cash_sheet_branch_cost',
                'cash_sheet_branch_cost_entry_id' => (int) $entry->id,
            ],
        ]);

        ExpensePayment::create([
            'expense_id' => $expense->id,
            'payment_method_id' => $paymentMethod->id,
            'store_id' => $entry->store_id,
            'processed_by' => $employeeId,
            'amount' => $amount,
            'fee_amount' => 0,
            'net_amount' => $amount,
            'status' => 'completed',
            'processed_at' => $timestamp,
            'completed_at' => $timestamp,
            'notes' => $entry->details,
            'metadata' => [
                'source' => 'cash_sheet_branch_cost',
                'cash_sheet_branch_cost_entry_id' => (int) $entry->id,
            ],
        ]);
    }

    private function cancelAccountingExpenseForBranchCost(BranchCostEntry $entry): void
    {
        $expense = $this->findLinkedExpenseForBranchCost($entry);
        if (!$expense) {
            return;
        }

        $payments = ExpensePayment::where('expense_id', $expense->id)->get();
        foreach ($payments as $payment) {
            $payment->update(['status' => 'cancelled']);
            Transaction::byReference(ExpensePayment::class, $payment->id)
                ->update(['status' => 'cancelled']);
        }

        $expense->update([
            'status' => 'cancelled',
            'payment_status' => 'unpaid',
            'paid_amount' => 0,
            'outstanding_amount' => $expense->total_amount,
            'notes' => trim(($expense->notes ? $expense->notes . "\n" : '') . 'Cancelled because linked branch cost entry was deleted.'),
        ]);
    }

    private function findLinkedExpenseForBranchCost(BranchCostEntry $entry): ?Expense
    {
        $json = "REPLACE(LOWER(COALESCE(" . $this->castToText('metadata') . ", '')), ' ', '')";

        return Expense::whereRaw("{$json} LIKE ?", ['%"source":"cash_sheet_branch_cost"%'])
            ->where(function ($q) use ($entry, $json) {
                $q->whereRaw("{$json} LIKE ?", ['%"cash_sheet_branch_cost_entry_id":' . (int) $entry->id . '%'])
                  ->orWhereRaw("{$json} LIKE ?", ['%"cash_sheet_branch_cost_entry_id":"' . (int) $entry->id . '"%']);
            })
            ->first();
    }

    private function resolveCashSheetExpenseCategory(): ExpenseCategory
    {
        return ExpenseCategory::firstOrCreate(
            ['code' => 'CSBR'],
            [
                'name' => 'Branch Daily Cost',
                'description' => 'Operational branch costs entered from the Branch Costs page.',
                'type' => 'operational',
                'requires_approval' => false,
                'is_active' => true,
                'sort_order' => 999,
            ]
        );
    }

    private function resolveCashPaymentMethod(): PaymentMethod
    {
        $method = PaymentMethod::where('type', 'cash')->where('is_active', true)->first()
            ?: PaymentMethod::where('code', 'cash')->first();

        return $method ?: PaymentMethod::createCashMethod();
    }

    private function currentEmployeeId(): ?int
    {
        return Auth::guard('api')->id() ?? Auth::id() ?? DB::table('employees')->value('id');
    }

    private function createLedgerForAdminEntry(AdminEntry $entry): void
    {
        if (Transaction::byReference(AdminEntry::class, $entry->id)->exists()) {
            return;
        }

        $amount = (float) $entry->amount;
        if ($amount <= 0) {
            return;
        }

        $date = Carbon::parse($entry->entry_date, self::DHAKA_TZ)->toDateString();
        $storeId = $entry->store_id;
        $createdBy = $entry->created_by ?: $this->currentEmployeeId();

        match ($entry->type) {
            'salary_setaside' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getSalaryReserveAccountId(),
                Transaction::getCashAccountId($storeId),
                AdminEntry::class,
                $entry->id,
                'Admin Panel - Salary/Rent Set-aside',
                $storeId,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            'cash_to_bank' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getBankAccountId($storeId),
                Transaction::getCashAccountId($storeId),
                AdminEntry::class,
                $entry->id,
                'Admin Panel - Cash to Bank Transfer',
                $storeId,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            'sslzc' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getBankAccountId(),
                Transaction::getSSLCommerzReceivableAccountId(),
                AdminEntry::class,
                $entry->id,
                'Admin Panel - SSLCommerz Disbursement Received',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details, 'source' => 'sslcommerz_settlement']
            ),
            'pathao' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getBankAccountId(),
                Transaction::getPathaoReceivableAccountId(),
                AdminEntry::class,
                $entry->id,
                'Admin Panel - Pathao Disbursement Received',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details, 'source' => 'pathao_disbursement']
            ),
            default => null,
        };
    }

    private function createLedgerForOwnerEntry(OwnerEntry $entry): void
    {
        if (Transaction::byReference(OwnerEntry::class, $entry->id)->exists()) {
            return;
        }

        $amount = (float) $entry->amount;
        if ($amount <= 0) {
            return;
        }

        $date = Carbon::parse($entry->entry_date, self::DHAKA_TZ)->toDateString();
        $createdBy = $entry->created_by ?: $this->currentEmployeeId();
        $equityAccountId = Transaction::getOwnerEquityAccountId();
        $expenseAccountId = Transaction::getOperatingExpenseAccountId();

        match ($entry->type) {
            'cash_invest' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getCashAccountId(),
                $equityAccountId,
                OwnerEntry::class,
                $entry->id,
                'Owner Panel - Cash Investment',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            'bank_invest' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getBankAccountId(),
                $equityAccountId,
                OwnerEntry::class,
                $entry->id,
                'Owner Panel - Bank Investment',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            'cash_cost' => $this->createLedgerPair(
                $date,
                $amount,
                $expenseAccountId,
                Transaction::getCashAccountId(),
                OwnerEntry::class,
                $entry->id,
                'Owner Panel - Cash Cost',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            'bank_cost' => $this->createLedgerPair(
                $date,
                $amount,
                $expenseAccountId,
                Transaction::getBankAccountId(),
                OwnerEntry::class,
                $entry->id,
                'Owner Panel - Bank Cost',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
            ),
            default => null,
        };
    }

    private function createLedgerPair(
        string $date,
        float $amount,
        int $debitAccountId,
        int $creditAccountId,
        string $referenceType,
        int $referenceId,
        string $description,
        ?int $storeId,
        ?int $createdBy,
        array $metadata = []
    ): void {
        $groupId = (string) Str::uuid();
        $base = [
            'transaction_date' => $date,
            'amount' => $amount,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'description' => $description,
            'store_id' => $storeId,
            'created_by' => $createdBy,
            'metadata' => array_merge($metadata, [
                'source' => 'cash_sheet',
                'group_id' => $groupId,
            ]),
            'status' => 'completed',
        ];

        Transaction::create(array_merge($base, [
            'type' => 'debit',
            'account_id' => $debitAccountId,
        ]));

        Transaction::create(array_merge($base, [
            'type' => 'credit',
            'account_id' => $creditAccountId,
        ]));
    }

    private function cancelLedgerForCashSheetEntry(string $referenceType, int $referenceId): void
    {
        Transaction::byReference($referenceType, $referenceId)
            ->update(['status' => 'cancelled']);
    }

    private function castToText(string $column): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "CAST({$column} AS TEXT)"
            : "CAST({$column} AS CHAR)";
    }

}
