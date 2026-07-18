<?php

namespace App\Http\Controllers;

use App\Models\AdminEntry;
use App\Models\BranchCostEntry;
use App\Models\OwnerEntry;
use App\Models\Store;
use App\Models\Transaction;
use App\Models\PaymentMethod;
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

        $branchSales = $this->loadBranchSales($storeIds, $dateFrom, $dateTo);
        [$branchPayments, $paymentRefundCoverage] = $this->loadBranchPayments($storeIds, $dateFrom, $dateTo);
        $branchRefunds = $this->loadBranchRefunds($storeIds, $dateFrom, $dateTo, $paymentRefundCoverage);
        $branchReturns = $this->loadBranchReturns($storeIds, $dateFrom, $dateTo);
        $branchCosts = $this->loadBranchCosts($storeIds, $dateFrom, $dateTo);
        $adminData = $this->loadAdminEntries($dateFrom, $dateTo);
        $onlineData = $this->loadOnlineData($dateFrom, $dateTo);
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

            foreach ($stores as $store) {
                $storeId = (int) $store->id;
                $storeKey = (string) $storeId;

                $sale = (float) ($branchSales[$storeKey][$date] ?? 0);
                $grossCash = (float) ($branchPayments[$storeKey][$date]['cash'] ?? 0);
                $grossBank = (float) ($branchPayments[$storeKey][$date]['bank'] ?? 0);
                $grossExOn = (float) ($branchPayments[$storeKey][$date]['ex_on'] ?? 0);
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
                    'ex_on' => round($exOn, 2),
                    'salary' => round($salary, 2),
                    'cash_to_bank' => round($cashToBank, 2),
                    'daily_cost' => round($dailyCost, 2),
                ];

                $totalSale += $sale;
                $totalCash += $displayCash;
                $totalBank += $displayBank;
            }

            $online = $onlineData[$date] ?? [];
            $onlineSales = (float) ($online['daily_sales'] ?? 0);
            $onlineAdvance = (float) ($online['advance'] ?? 0);
            $onlinePayment = (float) ($online['online_payment'] ?? 0);
            $onlineCod = (float) ($online['cod'] ?? 0);

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
                ],
                'disbursements' => [
                    'sslzc_received' => round($sslzcReceived, 2),
                    'pathao_received' => round($pathaoReceived, 2),
                ],
                'totals' => [
                    'total_sale' => round($totalSale + $onlineSales, 2),
                    'cash' => round($totalCash, 2),
                    'bank' => round($totalBank, 2),
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

    private function loadBranchSales(array $storeIds, string $from, string $to): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];

        DB::table('orders as o')
            ->select('o.store_id', DB::raw('DATE(o.order_date) as day'), DB::raw('SUM(o.total_amount) as total'))
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to)
            ->groupBy('o.store_id', 'day')
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
    private function loadBranchPayments(array $storeIds, string $from, string $to): array
    {
        if (empty($storeIds)) {
            return [[], []];
        }

        $payments = DB::table('order_payments as op')
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
                'op.refunded_amount',
                'op.status',
                'pm.type as method_type',
                'pm.code as method_code'
            )
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::ACTIVE_PAYMENT_STATUSES)
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to)
            ->get();

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

        $out = [];
        $refundCoverage = [];

        foreach ($payments as $payment) {
            $storeKey = (string) $payment->store_id;
            $day = (string) $payment->day;
            $paymentId = (int) $payment->payment_id;
            $hasAnySplit = array_key_exists($paymentId, $paymentIdsWithAnySplit);
            $instruments = $splitsByPayment[$paymentId] ?? [];

            // A split parent must never be counted as a normal bank payment. If
            // split rows exist, only the currently active split rows contribute.
            if (!$hasAnySplit) {
                $instruments = [$payment];
            }

            foreach ($instruments as $instrument) {
                $amount = max(0, (float) ($instrument->amount ?? 0));
                $refunded = min($amount, max(0, (float) ($instrument->refunded_amount ?? 0)));
                $net = max(0, $amount - $refunded);
                $bucket = $this->paymentBucket(
                    (string) ($instrument->method_type ?? ''),
                    (string) ($instrument->method_code ?? ''),
                    (string) ($payment->payment_type ?? '')
                );

                $out[$storeKey][$day][$bucket] = ($out[$storeKey][$day][$bucket] ?? 0) + $net;

                if ($refunded > 0) {
                    $orderId = (int) $payment->order_id;
                    $refundCoverage[$orderId][$bucket] = ($refundCoverage[$orderId][$bucket] ?? 0) + $refunded;
                }
            }
        }

        return [$out, $refundCoverage];
    }

    private function loadBranchRefunds(array $storeIds, string $from, string $to, array $paymentRefundCoverage): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];
        $coverage = $paymentRefundCoverage;

        DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                'r.order_id',
                'o.store_id',
                DB::raw('DATE(o.order_date) as day'),
                'r.refund_method',
                'r.refund_amount'
            )
            ->whereIn('o.store_id', $storeIds)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereNull('r.deleted_at')
            ->where('r.status', 'completed')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to)
            ->orderBy('r.id')
            ->get()
            ->each(function ($row) use (&$out, &$coverage) {
                $bucket = $this->refundBucket((string) $row->refund_method);
                $orderId = (int) $row->order_id;
                $amount = max(0, (float) $row->refund_amount);
                $alreadyCovered = min($amount, (float) ($coverage[$orderId][$bucket] ?? 0));
                $coverage[$orderId][$bucket] = max(0, (float) ($coverage[$orderId][$bucket] ?? 0) - $alreadyCovered);
                $remaining = $amount - $alreadyCovered;

                if ($remaining <= 0) {
                    return;
                }

                $storeKey = (string) $row->store_id;
                $day = (string) $row->day;
                $out[$storeKey][$day][$bucket] = ($out[$storeKey][$day][$bucket] ?? 0) + $remaining;
            });

        return $out;
    }

    private function loadBranchReturns(array $storeIds, string $from, string $to): array
    {
        if (empty($storeIds)) {
            return [];
        }

        $out = [];

        DB::table('product_returns as pr')
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
            ->whereDate('o.order_date', '<=', $to)
            ->groupBy('o.store_id', 'day')
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

    private function loadOnlineData(string $from, string $to): array
    {
        $out = [];

        DB::table('orders as o')
            ->select(
                DB::raw('DATE(o.order_date) as day'),
                'o.order_type',
                DB::raw('SUM(o.total_amount) as total_sales'),
                DB::raw('SUM(o.paid_amount) as paid'),
                DB::raw('SUM(o.outstanding_amount) as outstanding')
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNotIn('o.status', self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($query) {
                $query->whereNull('o.payment_status')->orWhere('o.payment_status', '!=', 'refunded');
            })
            ->whereNull('o.deleted_at')
            ->whereDate('o.order_date', '>=', $from)
            ->whereDate('o.order_date', '<=', $to)
            ->groupBy('day', 'o.order_type')
            ->get()
            ->each(function ($row) use (&$out) {
                $day = (string) $row->day;
                $type = strtolower((string) $row->order_type);
                $out[$day]['daily_sales'] = ($out[$day]['daily_sales'] ?? 0) + (float) $row->total_sales;

                if ($type === 'social_commerce' || $type === 'lazychat') {
                    $out[$day]['advance'] = ($out[$day]['advance'] ?? 0) + (float) $row->paid;
                    $out[$day]['cod'] = ($out[$day]['cod'] ?? 0) + (float) $row->outstanding;
                } else {
                    $out[$day]['online_payment'] = ($out[$day]['online_payment'] ?? 0) + (float) $row->paid;
                }
            });

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
            'online' => ['daily_sales' => 0, 'advance' => 0, 'online_payment' => 0, 'cod' => 0],
            'disbursements' => ['sslzc_received' => 0, 'pathao_received' => 0],
            'totals' => ['total_sale' => 0, 'cash' => 0, 'bank' => 0, 'final_bank' => 0],
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
                'ex_on' => 0,
                'salary' => 0,
                'cash_to_bank' => 0,
                'daily_cost' => 0,
            ];
        }

        foreach ($rows as $row) {
            foreach ($row['branches'] as $branch) {
                foreach (['daily_sale', 'raw_cash', 'cash', 'bank', 'ex_on', 'salary', 'cash_to_bank', 'daily_cost'] as $field) {
                    $summary['branches'][$branch['store_id']][$field] += (float) $branch[$field];
                }
            }

            foreach (['daily_sales', 'advance', 'online_payment', 'cod'] as $field) {
                $summary['online'][$field] += (float) $row['online'][$field];
            }

            foreach (['sslzc_received', 'pathao_received'] as $field) {
                $summary['disbursements'][$field] += (float) $row['disbursements'][$field];
            }

            foreach (['total_sale', 'cash', 'bank', 'final_bank'] as $field) {
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
