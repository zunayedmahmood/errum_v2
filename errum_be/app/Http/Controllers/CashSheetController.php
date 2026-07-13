<?php

namespace App\Http\Controllers;

use App\Models\BranchCostEntry;
use App\Models\AdminEntry;
use App\Models\OwnerEntry;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\ExpensePayment;
use App\Models\PaymentMethod;
use App\Models\Store;
use App\Models\Transaction;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CashSheetController
 *
 * Fresh monthly cash-sheet implementation.
 *
 * The monthly sheet is intentionally a live aggregation. It does not save daily
 * rows. Every reload reads source transactions again and rebuilds the month from
 * orders, order payments, split payments, refunds, exchanges, branch costs,
 * accounting expenses, admin entries, online settlements, and owner entries.
 */
class CashSheetController extends Controller
{
    private const DHAKA_TZ = 'Asia/Dhaka';

    private const BRANCH_ORDER_TYPES = ['counter', 'pos', 'offline'];
    private const ONLINE_ORDER_TYPES = ['social_commerce', 'ecommerce'];
    private const ALL_ORDER_TYPES = ['counter', 'pos', 'offline', 'social_commerce', 'ecommerce'];
    private const SALE_EXCLUDED_STATUSES = ['cancelled', 'canceled', 'refunded', 'void', 'deleted'];
    private const MONEY_PAYMENT_STATUSES = ['completed'];
    private const VIRTUAL_PAYMENT_TYPES = ['exchange_balance', 'store_credit', 'balance_carryover'];
    private const NON_MONEY_REFUND_METHODS = ['store_credit', 'gift_card'];

    public function index(Request $request)
    {
        [$month, $dateFrom, $dateTo, $dates] = $this->resolveMonthWindow($request->query('month'));
        $requestedStoreId = $this->positiveInt($request->query('store_id'));

        $branchSales = $this->loadBranchSales($dateFrom, $dateTo);
        $branchSalePresence = $this->loadBranchSalePresence($dateFrom, $dateTo);
        $branchPayments = $this->loadBranchPaymentMovements($dateFrom, $dateTo);
        $branchRefunds = $this->loadBranchRefundMovements($dateFrom, $dateTo);
        $branchCosts = $this->loadBranchCosts($dateFrom, $dateTo);
        $adminData = $this->loadAdminEntryBuckets($dateFrom, $dateTo);
        $onlineData = $this->loadOnlineBuckets($dateFrom, $dateTo);
        $onlineSalePresence = $this->loadOnlineSalePresence($dateFrom, $dateTo);
        $ownerData = $this->loadOwnerEntryBuckets($dateFrom, $dateTo);

        // Store visibility is intentionally independent from the branch money
        // buckets. Branch buckets only track POS/offline money, but the report
        // selector must still show active stores/warehouses/online stores and
        // inactive locations that had any historical activity in this month.
        $activityStoreIds = $this->loadReportStoreActivityIds($dateFrom, $dateTo);

        $stores = $this->loadReportStores($activityStoreIds, $requestedStoreId);
        $storeIds = $stores->pluck('id')->map(fn ($id) => (int) $id)->all();

        $rows = [];
        $summary = $this->emptySummary($stores);

        foreach ($dates as $date) {
            $branches = [];
            $dayCash = 0.0;
            $dayBank = 0.0;
            $dayBranchSale = 0.0;
            $dayBranchCost = 0.0;
            $dayExOn = 0.0;
            $daySalary = 0.0;
            $dayCashToBank = 0.0;
            $dayHasBranchSaleData = false;
            $dayHasCashData = false;
            $dayHasBankData = false;
            $dayHasExOnData = false;
            $dayHasSalaryData = false;
            $dayHasCostData = false;
            $dayHasCashToBankData = false;

            foreach ($stores as $store) {
                $sid = (int) $store->id;

                $sale = $this->amountAt($branchSales, $sid, $date, 'sale');
                $paymentCash = $this->amountAt($branchPayments, $sid, $date, 'cash');
                $paymentBank = $this->amountAt($branchPayments, $sid, $date, 'bank');
                $paymentExOn = $this->amountAt($branchPayments, $sid, $date, 'ex_on');

                $refundCash = $this->amountAt($branchRefunds, $sid, $date, 'cash');
                $refundBank = $this->amountAt($branchRefunds, $sid, $date, 'bank');
                $refundExOn = $this->amountAt($branchRefunds, $sid, $date, 'ex_on');

                $rawCash = $paymentCash - $refundCash;
                $rawBank = $paymentBank - $refundBank;
                $exOn = $paymentExOn - $refundExOn;

                $cashCost = $this->amountAt($branchCosts, $sid, $date, 'cash');
                $bankCost = $this->amountAt($branchCosts, $sid, $date, 'bank');
                $dailyCost = $cashCost + $bankCost;

                $salary = $this->amountAt($adminData, $sid, $date, 'salary_setaside');
                $cashToBank = $this->amountAt($adminData, $sid, $date, 'cash_to_bank');

                // Presence is tracked separately from the resulting amount. This lets
                // the UI show 0 when records existed but netted to zero (or an order was
                // later cancelled/soft-deleted), while keeping — for truly empty cells.
                $hasSaleData = $this->hasAmountAt($branchSalePresence, $sid, $date, 'sale');
                $hasCashData = $this->hasAmountAt($branchPayments, $sid, $date, 'cash')
                    || $this->hasAmountAt($branchRefunds, $sid, $date, 'cash')
                    || $this->hasAmountAt($branchCosts, $sid, $date, 'cash')
                    || $this->hasAmountAt($adminData, $sid, $date, 'salary_setaside')
                    || $this->hasAmountAt($adminData, $sid, $date, 'cash_to_bank');
                $hasBankData = $this->hasAmountAt($branchPayments, $sid, $date, 'bank')
                    || $this->hasAmountAt($branchRefunds, $sid, $date, 'bank')
                    || $this->hasAmountAt($branchCosts, $sid, $date, 'bank')
                    || $this->hasAmountAt($adminData, $sid, $date, 'cash_to_bank');
                $hasExOnData = $this->hasAmountAt($branchPayments, $sid, $date, 'ex_on')
                    || $this->hasAmountAt($branchRefunds, $sid, $date, 'ex_on');
                $hasSalaryData = $this->hasAmountAt($adminData, $sid, $date, 'salary_setaside');
                $hasCostData = $this->hasAmountAt($branchCosts, $sid, $date, 'cash')
                    || $this->hasAmountAt($branchCosts, $sid, $date, 'bank');
                $hasCashToBankData = $this->hasAmountAt($adminData, $sid, $date, 'cash_to_bank');

                // Never clamp to zero. A negative value is a real branch cash shortage.
                $cash = $rawCash - $salary - $cashCost - $cashToBank;
                $bank = $rawBank - $bankCost + $cashToBank;

                $branch = [
                    'store_id' => $sid,
                    'store_name' => (string) $store->name,
                    'daily_sale' => $this->round($sale),
                    'cash' => $this->round($cash),
                    'bank' => $this->round($bank),
                    'ex_on' => $this->round($exOn),
                    'salary' => $this->round($salary),
                    'daily_cost' => $this->round($dailyCost),
                    'cash_to_bank' => $this->round($cashToBank),
                    'raw_cash' => $this->round($rawCash),
                    'raw_bank' => $this->round($rawBank),
                    'cash_cost' => $this->round($cashCost),
                    'bank_cost' => $this->round($bankCost),
                    'cash_refunds' => $this->round($refundCash),
                    'bank_refunds' => $this->round($refundBank),
                    'has_data' => [
                        'daily_sale' => $hasSaleData,
                        'cash' => $hasCashData,
                        'bank' => $hasBankData,
                        'ex_on' => $hasExOnData,
                        'salary' => $hasSalaryData,
                        'daily_cost' => $hasCostData,
                        'cash_to_bank' => $hasCashToBankData,
                    ],
                ];

                $branches[] = $branch;

                $dayCash += $cash;
                $dayBank += $bank;
                $dayBranchSale += $sale;
                $dayBranchCost += $dailyCost;
                $dayExOn += $exOn;
                $daySalary += $salary;
                $dayCashToBank += $cashToBank;
                $dayHasBranchSaleData = $dayHasBranchSaleData || $hasSaleData;
                $dayHasCashData = $dayHasCashData || $hasCashData;
                $dayHasBankData = $dayHasBankData || $hasBankData;
                $dayHasExOnData = $dayHasExOnData || $hasExOnData;
                $dayHasSalaryData = $dayHasSalaryData || $hasSalaryData;
                $dayHasCostData = $dayHasCostData || $hasCostData;
                $dayHasCashToBankData = $dayHasCashToBankData || $hasCashToBankData;

                $summary['stores'][$sid]['daily_sale'] += $sale;
                $summary['stores'][$sid]['cash'] += $cash;
                $summary['stores'][$sid]['bank'] += $bank;
                $summary['stores'][$sid]['ex_on'] += $exOn;
                $summary['stores'][$sid]['salary'] += $salary;
                $summary['stores'][$sid]['daily_cost'] += $dailyCost;
                $summary['stores'][$sid]['cash_to_bank'] += $cashToBank;
                $summary['stores'][$sid]['raw_cash'] += $rawCash;
                $summary['stores'][$sid]['raw_bank'] += $rawBank;
                foreach ($branch['has_data'] as $key => $present) {
                    $summary['stores'][$sid]['has_data'][$key] = $summary['stores'][$sid]['has_data'][$key] || $present;
                }
            }

            $online = $this->onlineForDate($onlineData, $onlineSalePresence, $date);
            $sslzcReceived = $this->amountAt($adminData, '_global', $date, 'sslzc');
            $pathaoReceived = $this->amountAt($adminData, '_global', $date, 'pathao');

            $bankBeforeDisbursement = $dayBank + $online['advance'];
            $finalBank = $bankBeforeDisbursement + $sslzcReceived + $pathaoReceived;
            $totalSale = $dayBranchSale + $online['daily_sales'];

            $hasSslzcData = $this->hasAmountAt($adminData, '_global', $date, 'sslzc');
            $hasPathaoData = $this->hasAmountAt($adminData, '_global', $date, 'pathao');
            $hasTotalSaleData = $dayHasBranchSaleData || ($online['has_data']['daily_sales'] ?? false);
            $hasTotalBankData = $dayHasBankData || ($online['has_data']['advance'] ?? false);
            $hasFinalBankData = $hasTotalBankData || $hasSslzcData || $hasPathaoData;

            $owner = $this->ownerForDate(
                $ownerData,
                $date,
                $dayCash,
                $finalBank,
                $dayHasCashData,
                $hasFinalBankData
            );

            $row = [
                'date' => $date,
                'branches' => $branches,
                'online' => $online,
                'disbursements' => [
                    'sslzc_received' => $this->round($sslzcReceived),
                    'pathao_received' => $this->round($pathaoReceived),
                    'has_data' => [
                        'sslzc_received' => $hasSslzcData,
                        'pathao_received' => $hasPathaoData,
                    ],
                ],
                'totals' => [
                    'sale' => $this->round($totalSale),
                    'branch_sale' => $this->round($dayBranchSale),
                    'cash' => $this->round($dayCash),
                    'bank' => $this->round($bankBeforeDisbursement),
                    'final_bank' => $this->round($finalBank),
                    'daily_cost' => $this->round($dayBranchCost),
                    'ex_on' => $this->round($dayExOn),
                    'salary' => $this->round($daySalary),
                    'cash_to_bank' => $this->round($dayCashToBank),
                    'has_data' => [
                        'sale' => $hasTotalSaleData,
                        'branch_sale' => $dayHasBranchSaleData,
                        'cash' => $dayHasCashData,
                        'bank' => $hasTotalBankData,
                        'final_bank' => $hasFinalBankData,
                        'daily_cost' => $dayHasCostData,
                        'ex_on' => $dayHasExOnData,
                        'salary' => $dayHasSalaryData,
                        'cash_to_bank' => $dayHasCashToBankData,
                    ],
                ],
                'owner' => $owner,
            ];

            $rows[] = $row;

            $summary['totals']['sale'] += $totalSale;
            $summary['totals']['branch_sale'] += $dayBranchSale;
            $summary['totals']['cash'] += $dayCash;
            $summary['totals']['bank'] += $bankBeforeDisbursement;
            $summary['totals']['final_bank'] += $finalBank;
            $summary['totals']['daily_cost'] += $dayBranchCost;
            $summary['totals']['ex_on'] += $dayExOn;
            $summary['totals']['salary'] += $daySalary;
            $summary['totals']['cash_to_bank'] += $dayCashToBank;

            foreach (['daily_sales', 'advance', 'online_payment', 'cod', 'cod_due', 'cod_collected', 'cod_refunds', 'refunds'] as $key) {
                $summary['online'][$key] += $online[$key] ?? 0;
                $summary['online']['has_data'][$key] = $summary['online']['has_data'][$key] || ($online['has_data'][$key] ?? false);
            }

            $summary['disbursements']['sslzc_received'] += $sslzcReceived;
            $summary['disbursements']['pathao_received'] += $pathaoReceived;
            $summary['disbursements']['has_data']['sslzc_received'] = $summary['disbursements']['has_data']['sslzc_received'] || $hasSslzcData;
            $summary['disbursements']['has_data']['pathao_received'] = $summary['disbursements']['has_data']['pathao_received'] || $hasPathaoData;

            foreach (['sale', 'branch_sale', 'cash', 'bank', 'final_bank', 'daily_cost', 'ex_on', 'salary', 'cash_to_bank'] as $key) {
                $summary['totals']['has_data'][$key] = $summary['totals']['has_data'][$key] || ($row['totals']['has_data'][$key] ?? false);
            }

            foreach (['cash_invest', 'bank_invest', 'cash_cost', 'bank_cost', 'total_cash', 'total_bank', 'cash_after_cost', 'bank_after_cost'] as $key) {
                $summary['owner'][$key] += $owner[$key] ?? 0;
                $summary['owner']['has_data'][$key] = $summary['owner']['has_data'][$key] || ($owner['has_data'][$key] ?? false);
            }
        }

        $summary = $this->roundSummary($summary);

        return response()->json([
            'success' => true,
            'month' => $month,
            'timezone' => self::DHAKA_TZ,
            'utc_offset_hours' => (int) env('CASH_SHEET_UTC_OFFSET_HOURS', 6),
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'stores' => $stores->map(fn ($s) => [
                'id' => (int) $s->id,
                'name' => (string) $s->name,
                'is_active' => (bool) $s->is_active,
                'is_online' => (bool) $s->is_online,
                'is_warehouse' => (bool) $s->is_warehouse,
            ])->values(),
            'data' => $rows,
            'summary' => $summary,
            'rules' => [
                'model' => 'live_aggregation',
                'sales_date' => 'branch Sale uses the exact order_date day without created_at fallback or timezone shifting',
                'payment_date' => 'payment_received_date > completed_at > processed_at > created_at',
                'cash_can_be_negative' => true,
                'cancelled_order_payments_stay_visible' => true,
                'offline_sale_delete_cancels_payments' => true,
                'stores_include_warehouses_online_and_inactive_with_activity' => true,
                'branch_order_types' => self::BRANCH_ORDER_TYPES,
                'online_order_types' => self::ONLINE_ORDER_TYPES,
                'refunds_subtract_on_refund_date' => true,
            ],
        ]);
    }

    public function entries(Request $request)
    {
        $request->validate(['date' => 'required|date']);
        $date = Carbon::parse($request->date, self::DHAKA_TZ)->toDateString();

        return response()->json([
            'success'       => true,
            'date'          => $date,
            'branch_costs'  => BranchCostEntry::with(['store:id,name,is_warehouse', 'createdBy:id,name'])
                ->whereDate('entry_date', $date)
                ->orderByDesc('created_at')
                ->get(),
            'admin_entries' => AdminEntry::with(['store:id,name,is_warehouse', 'createdBy:id,name'])
                ->whereDate('entry_date', $date)
                ->orderByDesc('created_at')
                ->get(),
            'owner_entries' => OwnerEntry::with(['createdBy:id,name'])
                ->whereDate('entry_date', $date)
                ->orderByDesc('created_at')
                ->get(),
            'accounting_expenses' => $this->loadAccountingExpenseEntries($date),
        ]);
    }

    public function storeBranchCost(Request $request)
    {
        $v = $request->validate([
            'entry_date' => 'required|date',
            'store_id'   => 'required|integer|exists:stores,id',
            'amount'     => 'required|numeric|min:0.01',
            'details'    => 'nullable|string|max:500',
        ]);

        $entry = DB::transaction(function () use ($v) {
            $entry = BranchCostEntry::create([
                ...$v,
                'entry_date' => Carbon::parse($v['entry_date'], self::DHAKA_TZ)->toDateString(),
                'created_by' => Auth::guard('api')->id(),
            ]);

            $this->createAccountingExpenseForBranchCost($entry);

            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry'   => $entry->load(['store:id,name,is_warehouse', 'createdBy:id,name']),
        ], 201);
    }

    public function destroyBranchCost(int $id)
    {
        DB::transaction(function () use ($id) {
            $entry = BranchCostEntry::findOrFail($id);
            $this->cancelAccountingExpenseForBranchCost($entry);
            $entry->delete();
        });

        return response()->json(['success' => true]);
    }

    public function storeAdmin(Request $request)
    {
        $v = $request->validate([
            'entry_date' => 'required|date',
            'type'       => 'required|in:salary_setaside,cash_to_bank,sslzc,pathao',
            'store_id'   => 'nullable|integer|exists:stores,id',
            'amount'     => 'required|numeric|min:0.01',
            'details'    => 'nullable|string|max:500',
        ]);

        if (in_array($v['type'], ['salary_setaside', 'cash_to_bank'], true) && empty($v['store_id'])) {
            return response()->json(['message' => 'store_id required for this type.'], 422);
        }

        $entry = DB::transaction(function () use ($v) {
            $entry = AdminEntry::create([
                ...$v,
                'entry_date' => Carbon::parse($v['entry_date'], self::DHAKA_TZ)->toDateString(),
                'store_id'   => in_array($v['type'], ['sslzc', 'pathao'], true) ? null : $v['store_id'],
                'created_by' => Auth::guard('api')->id(),
            ]);

            $this->createLedgerForAdminEntry($entry);

            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry'   => $entry->load(['store:id,name,is_warehouse', 'createdBy:id,name']),
        ], 201);
    }

    public function destroyAdmin(int $id)
    {
        DB::transaction(function () use ($id) {
            $entry = AdminEntry::findOrFail($id);
            $this->cancelLedgerForCashSheetEntry(AdminEntry::class, $entry->id);
            $entry->delete();
        });

        return response()->json(['success' => true]);
    }

    public function storeOwner(Request $request)
    {
        $v = $request->validate([
            'entry_date' => 'required|date',
            'type'       => 'required|in:cash_invest,bank_invest,cash_cost,bank_cost',
            'amount'     => 'required|numeric|min:0.01',
            'details'    => 'nullable|string|max:500',
        ]);

        $entry = DB::transaction(function () use ($v) {
            $entry = OwnerEntry::create([
                ...$v,
                'entry_date' => Carbon::parse($v['entry_date'], self::DHAKA_TZ)->toDateString(),
                'created_by' => Auth::guard('api')->id(),
            ]);

            $this->createLedgerForOwnerEntry($entry);

            return $entry;
        });

        return response()->json([
            'success' => true,
            'entry'   => $entry->load(['createdBy:id,name']),
        ], 201);
    }

    public function destroyOwner(int $id)
    {
        DB::transaction(function () use ($id) {
            $entry = OwnerEntry::findOrFail($id);
            $this->cancelLedgerForCashSheetEntry(OwnerEntry::class, $entry->id);
            $entry->delete();
        });

        return response()->json(['success' => true]);
    }

    private function resolveMonthWindow(?string $month): array
    {
        if (!$month || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            $month = CarbonImmutable::now(self::DHAKA_TZ)->format('Y-m');
        }

        $start = CarbonImmutable::createFromFormat('Y-m-d H:i:s', $month . '-01 00:00:00', self::DHAKA_TZ)->startOfMonth();
        $end = $start->endOfMonth();

        $dates = [];
        for ($d = $start; $d->lte($end); $d = $d->addDay()) {
            $dates[] = $d->toDateString();
        }

        return [$start->format('Y-m'), $start->toDateString(), $end->toDateString(), $dates];
    }

    private function loadReportStores(array $activityStoreIds, ?int $requestedStoreId)
    {
        // Do not filter out warehouses or online stores here. The cash sheet
        // should display every active location, plus inactive historical
        // locations that had any relevant source-table movement in the month.
        $query = Store::query()
            ->select('id', 'name', 'is_active', 'is_online', 'is_warehouse')
            ->orderBy('name');

        if ($requestedStoreId) {
            return $query->where('id', $requestedStoreId)->get();
        }

        return $query
            ->where(function ($q) use ($activityStoreIds) {
                $q->where('is_active', true);
                if (!empty($activityStoreIds)) {
                    $q->orWhereIn('id', $activityStoreIds);
                }
            })
            ->get();
    }

    private function loadReportStoreActivityIds(string $from, string $to): array
    {
        $ids = [];
        $remember = function ($value) use (&$ids): void {
            $id = (int) $value;
            if ($id > 0) {
                $ids[$id] = $id;
            }
        };

        $orderDateExpr = $this->businessDateSql('COALESCE(o.order_date, o.confirmed_at, o.created_at)');
        DB::table('orders as o')
            ->whereNotNull('o.store_id')
            ->whereRaw("{$orderDateExpr} BETWEEN ? AND ?", [$from, $to])
            ->pluck('o.store_id')
            ->each($remember);

        $paymentDateExpr = $this->businessDateSql('COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)');
        DB::table('order_payments as op')
            ->leftJoin('orders as o', 'o.id', '=', 'op.order_id')
            ->whereRaw("{$paymentDateExpr} BETWEEN ? AND ?", [$from, $to])
            ->whereRaw('COALESCE(op.store_id, o.store_id) IS NOT NULL')
            ->selectRaw('COALESCE(op.store_id, o.store_id) as activity_store_id')
            ->pluck('activity_store_id')
            ->each($remember);

        $splitDateExpr = $this->businessDateSql('COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)');
        DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->leftJoin('orders as o', 'o.id', '=', 'op.order_id')
            ->whereRaw("{$splitDateExpr} BETWEEN ? AND ?", [$from, $to])
            ->whereRaw('COALESCE(ps.store_id, op.store_id, o.store_id) IS NOT NULL')
            ->selectRaw('COALESCE(ps.store_id, op.store_id, o.store_id) as activity_store_id')
            ->pluck('activity_store_id')
            ->each($remember);

        $refundDateExpr = $this->businessDateSql('COALESCE(r.completed_at, r.processed_at, r.created_at)');
        DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->whereNotNull('o.store_id')
            ->whereRaw("{$refundDateExpr} BETWEEN ? AND ?", [$from, $to])
            ->pluck('o.store_id')
            ->each($remember);

        DB::table('branch_cost_entries')
            ->whereBetween('entry_date', [$from, $to])
            ->whereNotNull('store_id')
            ->pluck('store_id')
            ->each($remember);

        DB::table('admin_entries')
            ->whereBetween('entry_date', [$from, $to])
            ->whereNotNull('store_id')
            ->pluck('store_id')
            ->each($remember);

        $expenseDateExpr = $this->businessDateSql('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)');
        $expenseActivity = DB::table('expense_payments as ep')
            ->join('expenses as e', 'e.id', '=', 'ep.expense_id')
            ->whereRaw("{$expenseDateExpr} BETWEEN ? AND ?", [$from, $to])
            ->whereRaw('COALESCE(ep.store_id, e.store_id) IS NOT NULL');
        $this->whereNotCashSheetOrigin($expenseActivity, 'e');
        $expenseActivity
            ->selectRaw('COALESCE(ep.store_id, e.store_id) as activity_store_id')
            ->pluck('activity_store_id')
            ->each($remember);

        return array_values($ids);
    }

    private function loadBranchSales(string $from, string $to): array
    {
        // The branch Sale column must follow the exact order-selected business day.
        // order_date is already stored as the trusted POS/offline sale datetime, so
        // applying the cash-sheet UTC offset here can incorrectly move late orders
        // into the following date.
        $dateExpr = 'DATE(o.order_date)';

        $query = DB::table('orders as o')
            ->select('o.store_id', DB::raw("{$dateExpr} as business_date"), DB::raw('SUM(o.total_amount) as total'))
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotIn('o.status', self::SALE_EXCLUDED_STATUSES)
            ->whereNotNull('o.store_id')
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->groupBy('o.store_id', DB::raw($dateExpr));

        $this->whereNotSoftDeleted($query, 'o');
        $this->whereNotExchangeReplacement($query, 'o.metadata');

        return $query->get()->reduce(function ($out, $row) {
            $this->addAmount($out, (int) $row->store_id, $row->business_date, 'sale', (float) $row->total);
            return $out;
        }, []);
    }

    private function loadBranchSalePresence(string $from, string $to): array
    {
        $dateExpr = 'DATE(o.order_date)';
        $query = DB::table('orders as o')
            ->select('o.store_id', DB::raw("{$dateExpr} as business_date"))
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotNull('o.store_id')
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to]);

        // Deliberately do not filter status or deleted_at: these rows establish
        // that the cell had historical data even when the live sale is now zero.
        $this->whereNotExchangeReplacement($query, 'o.metadata');

        return $query->get()->reduce(function ($out, $row) {
            $this->addAmount($out, (int) $row->store_id, $row->business_date, 'sale', 0.0);
            return $out;
        }, []);
    }

    private function loadBranchPaymentMovements(string $from, string $to): array
    {
        $out = [];

        foreach ($this->normalPaymentRows($from, $to, self::BRANCH_ORDER_TYPES) as $row) {
            $storeId = (int) $row->store_id;
            if ($storeId <= 0) {
                continue;
            }

            $bucket = $this->isCashMethod($row) ? 'cash' : 'bank';
            $this->addAmount($out, $storeId, $row->business_date, $bucket, (float) $row->amount);

            if ((string) $row->payment_type === 'exchange_surplus') {
                $this->addAmount($out, $storeId, $row->business_date, 'ex_on', (float) $row->amount);
            }
        }

        foreach ($this->splitPaymentRows($from, $to, self::BRANCH_ORDER_TYPES) as $row) {
            $storeId = (int) $row->store_id;
            if ($storeId <= 0) {
                continue;
            }

            $bucket = $this->isCashMethod($row) ? 'cash' : 'bank';
            $this->addAmount($out, $storeId, $row->business_date, $bucket, (float) $row->amount);

            if ((string) $row->payment_type === 'exchange_surplus') {
                $this->addAmount($out, $storeId, $row->business_date, 'ex_on', (float) $row->amount);
            }
        }

        return $out;
    }

    private function loadBranchRefundMovements(string $from, string $to): array
    {
        $dateExpr = $this->businessDateSql('COALESCE(r.completed_at, r.processed_at, r.created_at)');

        $rows = DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                'o.store_id',
                'r.refund_method',
                'r.refund_type',
                'r.refund_method_details',
                DB::raw("{$dateExpr} as business_date"),
                'r.refund_amount as amount'
            )
            ->where('r.status', 'completed')
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNotNull('o.store_id')
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $storeId = (int) $row->store_id;
            $amount = (float) $row->amount;
            $method = strtolower((string) ($row->refund_method ?? ''));

            if (in_array($method, self::NON_MONEY_REFUND_METHODS, true)) {
                continue;
            }

            // Decode refund split details if present
            $cashAmount = 0.0;
            $bankAmount = 0.0;
            $details = null;

            if (!empty($row->refund_method_details)) {
                $details = is_string($row->refund_method_details)
                    ? json_decode($row->refund_method_details, true)
                    : (array) $row->refund_method_details;
            }

            if (is_array($details) && (
                isset($details['cash']) || isset($details['card']) || isset($details['bkash']) || isset($details['nagad']) || isset($details['rocket']) || isset($details['bank'])
            )) {
                $cashAmount = (float) ($details['cash'] ?? 0);
                $bankAmount = (float) (
                    ($details['card'] ?? 0) + 
                    ($details['bkash'] ?? 0) + 
                    ($details['nagad'] ?? 0) + 
                    ($details['rocket'] ?? 0) + 
                    ($details['bank'] ?? 0) +
                    ($details['bank_transfer'] ?? 0)
                );
                
                // Fallback if details keys are present but sum to 0
                if ($cashAmount == 0.0 && $bankAmount == 0.0) {
                    if ($method === 'cash') {
                        $cashAmount = $amount;
                    } else {
                        $bankAmount = $amount;
                    }
                }
            } else {
                if ($method === 'cash') {
                    $cashAmount = $amount;
                } else {
                    $bankAmount = $amount;
                }
            }

            if ($cashAmount > 0.0) {
                $this->addAmount($out, $storeId, $row->business_date, 'cash', $cashAmount);
            }
            if ($bankAmount > 0.0) {
                $this->addAmount($out, $storeId, $row->business_date, 'bank', $bankAmount);
            }

            if ((string) $row->refund_type === 'exchange_refund') {
                $this->addAmount($out, $storeId, $row->business_date, 'ex_on', $amount);
            }
        }

        return $out;
    }

    private function loadBranchCosts(string $from, string $to): array
    {
        $out = [];

        $manualRows = DB::table('branch_cost_entries as bce')
            ->select('bce.store_id', 'bce.entry_date as business_date', DB::raw('SUM(bce.amount) as amount'))
            ->whereBetween('bce.entry_date', [$from, $to])
            ->groupBy('bce.store_id', 'bce.entry_date')
            ->get();

        foreach ($manualRows as $row) {
            $this->addAmount($out, (int) $row->store_id, $row->business_date, 'cash', (float) $row->amount);
        }

        $dateExpr = $this->businessDateSql('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)');
        $expenseQuery = DB::table('expense_payments as ep')
            ->join('expenses as e', 'e.id', '=', 'ep.expense_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'ep.payment_method_id')
            ->select(
                DB::raw('COALESCE(ep.store_id, e.store_id) as store_id'),
                DB::raw("{$dateExpr} as business_date"),
                'pm.type as method_type',
                'pm.code as method_code',
                'pm.name as method_name',
                DB::raw('SUM(ep.amount) as amount')
            )
            ->where('ep.status', 'completed')
            ->whereNotIn('e.status', ['cancelled', 'rejected'])
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->whereRaw('COALESCE(ep.store_id, e.store_id) IS NOT NULL')
            ->groupBy(DB::raw('COALESCE(ep.store_id, e.store_id)'), DB::raw($dateExpr), 'pm.type', 'pm.code', 'pm.name');

        $this->whereNotCashSheetOrigin($expenseQuery, 'e');

        foreach ($expenseQuery->get() as $row) {
            $bucket = $this->isCashMethod($row) ? 'cash' : 'bank';
            $this->addAmount($out, (int) $row->store_id, $row->business_date, $bucket, (float) $row->amount);
        }

        return $out;
    }

    private function loadAdminEntryBuckets(string $from, string $to): array
    {
        $rows = DB::table('admin_entries')
            ->select('store_id', 'entry_date', 'type', DB::raw('SUM(amount) as amount'))
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('store_id', 'entry_date', 'type')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $storeKey = $row->store_id === null ? '_global' : (int) $row->store_id;
            $this->addAmount($out, $storeKey, $row->entry_date, (string) $row->type, (float) $row->amount);
        }

        return $out;
    }

    private function loadOwnerEntryBuckets(string $from, string $to): array
    {
        $rows = DB::table('owner_entries')
            ->select('entry_date', 'type', DB::raw('SUM(amount) as amount'))
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('entry_date', 'type')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $this->addAmount($out, 'owner', $row->entry_date, (string) $row->type, (float) $row->amount);
        }

        return $out;
    }

    private function loadOnlineBuckets(string $from, string $to): array
    {
        $out = [];
        $orderDateExpr = $this->businessDateSql('COALESCE(o.order_date, o.confirmed_at, o.created_at)');

        $orderQuery = DB::table('orders as o')
            ->select(
                'o.id',
                'o.order_type',
                'o.payment_method',
                'o.intended_courier',
                'o.carrier_name',
                'o.metadata',
                DB::raw("{$orderDateExpr} as business_date"),
                'o.total_amount',
                'o.paid_amount',
                'o.outstanding_amount'
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNotIn('o.status', self::SALE_EXCLUDED_STATUSES)
            ->whereRaw("{$orderDateExpr} BETWEEN ? AND ?", [$from, $to]);

        $this->whereNotSoftDeleted($orderQuery, 'o');
        $this->whereNotExchangeReplacement($orderQuery, 'o.metadata');

        foreach ($orderQuery->get() as $row) {
            $date = $row->business_date;
            $total = (float) $row->total_amount;
            $this->addOnline($out, $date, 'daily_sales', $total);

            if ($this->isCodLikeOrder($row)) {
                $due = (float) ($row->outstanding_amount ?? 0);
                if ($due <= 0 && $total > 0) {
                    $due = max(0, $total - (float) ($row->paid_amount ?? 0));
                }
                if ($due > 0) {
                    $this->addOnline($out, $date, 'cod_due', $due);
                    $this->addOnline($out, $date, 'cod', $due);
                }
            }
        }

        foreach ($this->normalPaymentRows($from, $to, self::ONLINE_ORDER_TYPES) as $row) {
            $this->applyOnlinePaymentRow($out, $row);
        }
        foreach ($this->splitPaymentRows($from, $to, self::ONLINE_ORDER_TYPES) as $row) {
            $this->applyOnlinePaymentRow($out, $row);
        }

        $this->applyOnlineRefundRows($out, $from, $to);

        return $out;
    }

    private function loadOnlineSalePresence(string $from, string $to): array
    {
        $dateExpr = $this->businessDateSql('COALESCE(o.order_date, o.confirmed_at, o.created_at)');
        $query = DB::table('orders as o')
            ->select(DB::raw("{$dateExpr} as business_date"))
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to]);

        // As above, cancelled/refunded/soft-deleted orders still count as prior
        // data for display purposes, without contributing to the live amount.
        $this->whereNotExchangeReplacement($query, 'o.metadata');

        return $query->get()->reduce(function ($out, $row) {
            $this->addOnline($out, $row->business_date, 'daily_sales', 0.0);
            return $out;
        }, []);
    }

    private function normalPaymentRows(string $from, string $to, array $orderTypes)
    {
        $dateExpr = $this->businessDateSql('COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)');

        return DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->select(
                DB::raw('COALESCE(op.store_id, o.store_id) as store_id'),
                'o.order_type',
                'o.payment_method as order_payment_method',
                'o.intended_courier',
                'o.carrier_name',
                'o.metadata as order_metadata',
                'op.payment_type',
                'pm.type as method_type',
                'pm.code as method_code',
                'pm.name as method_name',
                DB::raw("{$dateExpr} as business_date"),
                'op.amount'
            )
            ->whereIn('o.order_type', $orderTypes)
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where(function ($q) {
                $q->whereNull('op.payment_type')
                    ->orWhereNotIn('op.payment_type', self::VIRTUAL_PAYMENT_TYPES);
            })
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('payment_splits as psx')
                    ->whereColumn('psx.order_payment_id', 'op.id');
            })
            ->get();
    }

    private function splitPaymentRows(string $from, string $to, array $orderTypes)
    {
        $dateExpr = $this->businessDateSql('COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)');

        return DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
            ->select(
                DB::raw('COALESCE(ps.store_id, op.store_id, o.store_id) as store_id'),
                'o.order_type',
                'o.payment_method as order_payment_method',
                'o.intended_courier',
                'o.carrier_name',
                'o.metadata as order_metadata',
                'op.payment_type',
                'pm.type as method_type',
                'pm.code as method_code',
                'pm.name as method_name',
                DB::raw("{$dateExpr} as business_date"),
                'ps.amount'
            )
            ->whereIn('o.order_type', $orderTypes)
            ->where('ps.status', 'completed')
            ->whereNotIn('op.status', ['cancelled', 'failed'])
            ->where(function ($q) {
                $q->whereNull('op.payment_type')
                    ->orWhereNotIn('op.payment_type', self::VIRTUAL_PAYMENT_TYPES);
            })
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->get();
    }

    private function applyOnlinePaymentRow(array &$out, object $row): void
    {
        $amount = (float) $row->amount;
        if ($amount == 0.0) {
            return;
        }

        if ($this->isCodLikeOrder($row)) {
            $this->addOnline($out, $row->business_date, 'cod_collected', $amount);
            $this->addOnline($out, $row->business_date, 'cod', $amount);
            return;
        }

        if ((string) $row->order_type === 'social_commerce') {
            $this->addOnline($out, $row->business_date, 'advance', $amount);
        } elseif ((string) $row->order_type === 'ecommerce') {
            $this->addOnline($out, $row->business_date, 'online_payment', $amount);
        }
    }

    private function applyOnlineRefundRows(array &$out, string $from, string $to): void
    {
        $dateExpr = $this->businessDateSql('COALESCE(r.completed_at, r.processed_at, r.created_at)');

        $rows = DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                'o.order_type',
                'o.payment_method as order_payment_method',
                'o.intended_courier',
                'o.carrier_name',
                'o.metadata as order_metadata',
                'r.refund_method',
                DB::raw("{$dateExpr} as business_date"),
                'r.refund_amount as amount'
            )
            ->where('r.status', 'completed')
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereRaw("{$dateExpr} BETWEEN ? AND ?", [$from, $to])
            ->get();

        foreach ($rows as $row) {
            $method = strtolower((string) ($row->refund_method ?? ''));
            if (in_array($method, self::NON_MONEY_REFUND_METHODS, true)) {
                continue;
            }

            $amount = (float) $row->amount;
            $this->addOnline($out, $row->business_date, 'refunds', $amount);

            if ($this->isCodLikeOrder($row)) {
                $this->addOnline($out, $row->business_date, 'cod_refunds', $amount);
                $this->addOnline($out, $row->business_date, 'cod', -$amount);
            } elseif ((string) $row->order_type === 'social_commerce') {
                $this->addOnline($out, $row->business_date, 'advance', -$amount);
            } elseif ((string) $row->order_type === 'ecommerce') {
                $this->addOnline($out, $row->business_date, 'online_payment', -$amount);
            }
        }
    }

    private function onlineForDate(array $onlineData, array $onlineSalePresence, string $date): array
    {
        $base = [
            'daily_sales' => 0.0,
            'advance' => 0.0,
            'online_payment' => 0.0,
            'cod' => 0.0,
            'cod_due' => 0.0,
            'cod_collected' => 0.0,
            'cod_refunds' => 0.0,
            'refunds' => 0.0,
        ];

        foreach ($base as $key => $value) {
            $base[$key] = $this->round((float) ($onlineData[$date][$key] ?? 0));
        }

        $base['has_data'] = [];
        foreach (array_keys($base) as $key) {
            if ($key === 'has_data') {
                continue;
            }
            $base['has_data'][$key] = $key === 'daily_sales'
                ? $this->hasOnlineAmountAt($onlineSalePresence, $date, $key)
                : $this->hasOnlineAmountAt($onlineData, $date, $key);
        }

        return $base;
    }

    private function ownerForDate(
        array $ownerData,
        string $date,
        float $branchCash,
        float $finalBank,
        bool $hasBranchCashData,
        bool $hasFinalBankData
    ): array
    {
        $cashInvest = $this->amountAt($ownerData, 'owner', $date, 'cash_invest');
        $bankInvest = $this->amountAt($ownerData, 'owner', $date, 'bank_invest');
        $cashCost = $this->amountAt($ownerData, 'owner', $date, 'cash_cost');
        $bankCost = $this->amountAt($ownerData, 'owner', $date, 'bank_cost');

        $totalCash = $branchCash + $cashInvest;
        $totalBank = $finalBank + $bankInvest;

        $hasCashInvestData = $this->hasAmountAt($ownerData, 'owner', $date, 'cash_invest');
        $hasBankInvestData = $this->hasAmountAt($ownerData, 'owner', $date, 'bank_invest');
        $hasCashCostData = $this->hasAmountAt($ownerData, 'owner', $date, 'cash_cost');
        $hasBankCostData = $this->hasAmountAt($ownerData, 'owner', $date, 'bank_cost');
        $hasTotalCashData = $hasBranchCashData || $hasCashInvestData;
        $hasTotalBankData = $hasFinalBankData || $hasBankInvestData;

        return [
            'cash_invest' => $this->round($cashInvest),
            'bank_invest' => $this->round($bankInvest),
            'cash_cost' => $this->round($cashCost),
            'bank_cost' => $this->round($bankCost),
            'total_cash' => $this->round($totalCash),
            'total_bank' => $this->round($totalBank),
            'cash_after_cost' => $this->round($totalCash - $cashCost),
            'bank_after_cost' => $this->round($totalBank - $bankCost),
            'has_data' => [
                'cash_invest' => $hasCashInvestData,
                'bank_invest' => $hasBankInvestData,
                'cash_cost' => $hasCashCostData,
                'bank_cost' => $hasBankCostData,
                'total_cash' => $hasTotalCashData,
                'total_bank' => $hasTotalBankData,
                'cash_after_cost' => $hasTotalCashData || $hasCashCostData,
                'bank_after_cost' => $hasTotalBankData || $hasBankCostData,
            ],
        ];
    }

    private function emptySummary($stores): array
    {
        $summary = [
            'totals' => [
                'sale' => 0.0,
                'branch_sale' => 0.0,
                'cash' => 0.0,
                'bank' => 0.0,
                'final_bank' => 0.0,
                'daily_cost' => 0.0,
                'ex_on' => 0.0,
                'salary' => 0.0,
                'cash_to_bank' => 0.0,
                'has_data' => [
                    'sale' => false,
                    'branch_sale' => false,
                    'cash' => false,
                    'bank' => false,
                    'final_bank' => false,
                    'daily_cost' => false,
                    'ex_on' => false,
                    'salary' => false,
                    'cash_to_bank' => false,
                ],
            ],
            'online' => [
                'daily_sales' => 0.0,
                'advance' => 0.0,
                'online_payment' => 0.0,
                'cod' => 0.0,
                'cod_due' => 0.0,
                'cod_collected' => 0.0,
                'cod_refunds' => 0.0,
                'refunds' => 0.0,
                'has_data' => [
                    'daily_sales' => false,
                    'advance' => false,
                    'online_payment' => false,
                    'cod' => false,
                    'cod_due' => false,
                    'cod_collected' => false,
                    'cod_refunds' => false,
                    'refunds' => false,
                ],
            ],
            'disbursements' => [
                'sslzc_received' => 0.0,
                'pathao_received' => 0.0,
                'has_data' => [
                    'sslzc_received' => false,
                    'pathao_received' => false,
                ],
            ],
            'owner' => [
                'cash_invest' => 0.0,
                'bank_invest' => 0.0,
                'cash_cost' => 0.0,
                'bank_cost' => 0.0,
                'total_cash' => 0.0,
                'total_bank' => 0.0,
                'cash_after_cost' => 0.0,
                'bank_after_cost' => 0.0,
                'has_data' => [
                    'cash_invest' => false,
                    'bank_invest' => false,
                    'cash_cost' => false,
                    'bank_cost' => false,
                    'total_cash' => false,
                    'total_bank' => false,
                    'cash_after_cost' => false,
                    'bank_after_cost' => false,
                ],
            ],
            'stores' => [],
        ];

        foreach ($stores as $store) {
            $summary['stores'][(int) $store->id] = [
                'store_id' => (int) $store->id,
                'store_name' => (string) $store->name,
                'daily_sale' => 0.0,
                'cash' => 0.0,
                'bank' => 0.0,
                'ex_on' => 0.0,
                'salary' => 0.0,
                'daily_cost' => 0.0,
                'cash_to_bank' => 0.0,
                'raw_cash' => 0.0,
                'raw_bank' => 0.0,
                'has_data' => [
                    'daily_sale' => false,
                    'cash' => false,
                    'bank' => false,
                    'ex_on' => false,
                    'salary' => false,
                    'daily_cost' => false,
                    'cash_to_bank' => false,
                ],
            ];
        }

        return $summary;
    }

    private function roundSummary(array $summary): array
    {
        foreach (['totals', 'online', 'disbursements', 'owner'] as $section) {
            foreach ($summary[$section] as $key => $value) {
                if (is_numeric($value)) {
                    $summary[$section][$key] = $this->round((float) $value);
                }
            }
        }

        foreach ($summary['stores'] as $sid => $storeSummary) {
            foreach ($storeSummary as $key => $value) {
                if (is_numeric($value)) {
                    $summary['stores'][$sid][$key] = $key === 'store_id' ? (int) $value : $this->round((float) $value);
                }
            }
        }

        $summary['stores'] = array_values($summary['stores']);

        return $summary;
    }

    private function collectActivityStoreIds(array ...$datasets): array
    {
        $ids = [];
        foreach ($datasets as $dataset) {
            foreach (array_keys($dataset) as $key) {
                if (is_int($key) || ctype_digit((string) $key)) {
                    $id = (int) $key;
                    if ($id > 0) {
                        $ids[$id] = $id;
                    }
                }
            }
        }
        return array_values($ids);
    }

    private function addAmount(array &$out, int|string $storeKey, string $date, string $bucket, float $amount): void
    {
        if (!isset($out[$storeKey])) {
            $out[$storeKey] = [];
        }
        if (!isset($out[$storeKey][$date])) {
            $out[$storeKey][$date] = [];
        }
        $out[$storeKey][$date][$bucket] = ($out[$storeKey][$date][$bucket] ?? 0) + $amount;
    }

    private function addOnline(array &$out, string $date, string $bucket, float $amount): void
    {
        if (!isset($out[$date])) {
            $out[$date] = [];
        }
        $out[$date][$bucket] = ($out[$date][$bucket] ?? 0) + $amount;
    }

    private function amountAt(array $out, int|string $storeKey, string $date, string $bucket): float
    {
        return (float) ($out[$storeKey][$date][$bucket] ?? 0);
    }

    private function hasAmountAt(array $out, int|string $storeKey, string $date, string $bucket): bool
    {
        return isset($out[$storeKey][$date])
            && array_key_exists($bucket, $out[$storeKey][$date]);
    }

    private function hasOnlineAmountAt(array $out, string $date, string $bucket): bool
    {
        return isset($out[$date]) && array_key_exists($bucket, $out[$date]);
    }

    private function isCashMethod(object $row): bool
    {
        $type = strtolower((string) ($row->method_type ?? ''));
        $code = strtolower((string) ($row->method_code ?? ''));
        $name = strtolower((string) ($row->method_name ?? ''));

        return $type === 'cash' || $code === 'cash' || $name === 'cash' || str_contains($name, 'cash');
    }

    private function isCodLikeOrder(object $row): bool
    {
        $haystack = strtolower(implode(' ', array_filter([
            (string) ($row->order_payment_method ?? ''),
            (string) ($row->payment_method ?? ''),
            (string) ($row->intended_courier ?? ''),
            (string) ($row->carrier_name ?? ''),
            $this->metadataToText($row->order_metadata ?? $row->metadata ?? null),
        ])));

        return str_contains($haystack, 'cod')
            || str_contains($haystack, 'cash on delivery')
            || str_contains($haystack, 'courier')
            || str_contains($haystack, 'pathao')
            || str_contains($haystack, 'steadfast')
            || str_contains($haystack, 'delivery');
    }

    private function metadataToText(mixed $metadata): string
    {
        if ($metadata === null || $metadata === '') {
            return '';
        }
        if (is_array($metadata)) {
            return strtolower(json_encode($metadata));
        }
        if (is_object($metadata)) {
            return strtolower(json_encode($metadata));
        }
        return strtolower((string) $metadata);
    }

    private function positiveInt(mixed $value): ?int
    {
        $int = (int) $value;
        return $int > 0 ? $int : null;
    }

    private function round(float $value): float
    {
        return round($value, 2);
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

    private function whereNotCashSheetOrigin($query, string $alias): void
    {
        $metadata = $alias . '.metadata';
        $json = "REPLACE(LOWER(COALESCE(" . $this->castToText($metadata) . ", '')), ' ', '')";

        $query->where(function ($q) use ($metadata, $json) {
            $q->whereNull($metadata)
                ->orWhereRaw("{$json} NOT LIKE ?", ['%"source":"cash_sheet_branch_cost"%']);
        });
    }

    private function loadAccountingExpenseEntries(string $date): array
    {
        $query = DB::table('expense_payments as ep')
            ->join('expenses as e', 'e.id', '=', 'ep.expense_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'ep.payment_method_id')
            ->leftJoin('expense_categories as ec', 'ec.id', '=', 'e.category_id')
            ->leftJoin('stores as s', 's.id', '=', DB::raw('COALESCE(ep.store_id, e.store_id)'))
            ->leftJoin('employees as emp', 'emp.id', '=', 'ep.processed_by')
            ->select(
                'ep.id',
                'ep.expense_id',
                'ep.payment_number',
                'ep.amount',
                'ep.completed_at',
                'e.expense_number',
                'e.description',
                'e.expense_date',
                'ec.name as category_name',
                'pm.name as payment_method_name',
                'pm.type as payment_method_type',
                's.id as store_id',
                's.name as store_name',
                's.is_warehouse',
                'emp.id as created_by_id',
                'emp.name as created_by_name'
            )
            ->where('ep.status', 'completed')
            ->whereNotIn('e.status', ['cancelled', 'rejected'])
            ->whereRaw($this->businessDateSql('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)') . ' = ?', [$date]);

        $this->whereNotCashSheetOrigin($query, 'e');

        return $query->orderByDesc('ep.completed_at')
            ->get()
            ->map(fn ($r) => [
                'id' => (int) $r->id,
                'expense_id' => (int) $r->expense_id,
                'payment_number' => $r->payment_number,
                'expense_number' => $r->expense_number,
                'amount' => $this->round((float) $r->amount),
                'completed_at' => $r->completed_at,
                'description' => $r->description,
                'category_name' => $r->category_name,
                'payment_method' => [
                    'name' => $r->payment_method_name,
                    'type' => $r->payment_method_type,
                ],
                'store' => [
                    'id' => (int) $r->store_id,
                    'name' => $r->store_name,
                    'is_warehouse' => (bool) $r->is_warehouse,
                ],
                'created_by' => $r->created_by_id ? [
                    'id' => (int) $r->created_by_id,
                    'name' => $r->created_by_name,
                ] : null,
            ])
            ->values()
            ->all();
    }

    private function whereNotSoftDeleted($query, string $alias): void
    {
        // Most deployments have orders.deleted_at because Order uses SoftDeletes.
        // Keeping this isolated makes the report intent explicit.
        $query->whereNull($alias . '.deleted_at');
    }

    private function whereNotExchangeReplacement($query, string $metadataColumn): void
    {
        $json = "LOWER(COALESCE(" . $this->castToText($metadataColumn) . ", ''))";
        $query->where(function ($q) use ($metadataColumn, $json) {
            $q->whereNull($metadataColumn)
                ->orWhere(function ($qq) use ($json) {
                    $qq->whereRaw("{$json} NOT LIKE ?", ['%is_exchange_replacement%'])
                       ->whereRaw("{$json} NOT LIKE ?", ['%exchange_replacement%']);
                });
        });
    }

    /**
     * Convert DB datetime columns into Errum's Bangladesh business date.
     *
     * Date-only fields (entry_date, payment_received_date) remain stable. Datetime
     * fields can be shifted by CASH_SHEET_UTC_OFFSET_HOURS. If production saves
     * local Bangladesh datetimes already, set CASH_SHEET_UTC_OFFSET_HOURS=0.
     */
    private function businessDateSql(string $expr): string
    {
        $driver = DB::connection()->getDriverName();
        $offsetHours = (int) env('CASH_SHEET_UTC_OFFSET_HOURS', 6);

        if ($offsetHours === 0) {
            return "DATE({$expr})";
        }

        $sign = $offsetHours > 0 ? '+' : '-';
        $hours = abs($offsetHours);

        if ($driver === 'sqlite') {
            return "DATE({$expr}, '{$sign}{$hours} hours')";
        }

        return "DATE(DATE_ADD({$expr}, INTERVAL {$offsetHours} HOUR))";
    }

    private function castToText(string $column): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "CAST({$column} AS TEXT)"
            : "CAST({$column} AS CHAR)";
    }
}
