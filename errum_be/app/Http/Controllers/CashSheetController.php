<?php

namespace App\Http\Controllers;

use App\Models\BranchCostEntry;
use App\Models\AdminEntry;
use App\Models\OwnerEntry;
use App\Models\Store;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\ExpensePayment;
use App\Models\PaymentMethod;
use App\Models\Transaction;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CashSheetController
 *
 * GET  /api/cash-sheet               → full monthly sheet
 * GET  /api/cash-sheet/entries       → raw entries for a date (detail panel)
 * POST /api/cash-sheet/branch-cost   → branch manager adds a cost entry
 * DELETE /api/cash-sheet/branch-cost/{id}
 * POST /api/cash-sheet/admin         → admin: salary_setaside | cash_to_bank | sslzc | pathao
 * DELETE /api/cash-sheet/admin/{id}
 * POST /api/cash-sheet/owner         → owner: cash_invest | bank_invest | cash_cost | bank_cost
 * DELETE /api/cash-sheet/owner/{id}
 *
 * ── Displayed cash / bank per branch ────────────────────────────────────────
 *   raw_cash      = completed cash counter payments − completed cash refunds
 *   raw_bank      = completed non-cash counter payments − completed non-cash refunds
 *                   (both include split payments; completed cash-flow survives later cancellation/refund)
 *   salary        = SUM admin_entries salary_setaside for this store+date
 *   daily_cost    = branch_cost_entries + completed ExpensePayment rows for this store+date
 *   cash_to_bank  = SUM admin_entries cash_to_bank for this store+date
 *   displayed_cash = raw_cash − salary − cash-paid daily_cost − cash_to_bank
 *   displayed_bank = raw_bank − non-cash daily_cost + cash_to_bank
 *   Ex/On          = exchange top-up collected − exchange refund paid
 *
 * ── Grand totals ─────────────────────────────────────────────────────────────
 *   cash       = SUM displayed_cash (branches only)
 *   bank       = SUM displayed_bank (branches) + online advance
 *   final_bank = bank + sslzc_received + pathao_received
 *
 * ── Owner ────────────────────────────────────────────────────────────────────
 *   total_cash      = cash + cash_invest
 *   total_bank      = final_bank + bank_invest
 *   cash_after_cost = total_cash − cash_cost
 *   bank_after_cost = total_bank − bank_cost
 */
class CashSheetController extends Controller
{
    private const BUSINESS_TIMEZONE = 'Asia/Dhaka';
    private const CASH_TYPES = ['cash'];
    private const BRANCH_ORDER_TYPES = ['counter', 'pos', 'offline'];
    private const ONLINE_ORDER_TYPES = ['social_commerce', 'ecommerce'];
    private const EXCLUDED_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded', 'void', 'deleted'];
    private const INTERNAL_SETTLEMENT_PAYMENT_TYPES = ['exchange_balance', 'store_credit', 'balance_carryover'];
    private const MONEY_PAYMENT_STATUSES = ['completed', 'partially_refunded', 'refunded'];
    private const NON_MONEY_SPLIT_STATUSES = ['failed', 'cancelled', 'canceled', 'void'];


    public function index(Request $request)
    {
        $request->validate(['month' => 'nullable|date_format:Y-m']);

        $month    = $request->input('month', now(self::BUSINESS_TIMEZONE)->format('Y-m'));
        $monthBase = Carbon::createFromFormat('Y-m-d', $month . '-01', self::BUSINESS_TIMEZONE);
        $dateFrom = $monthBase->copy()->startOfMonth()->toDateString();
        $dateTo   = $monthBase->copy()->endOfMonth()->toDateString();

        $stores = $this->loadCashSheetStores($dateFrom, $dateTo);

        $storeIds = $stores->pluck('id')->map(fn ($id) => (int) $id)->toArray();
        $dates    = collect(CarbonPeriod::create($dateFrom, $dateTo))
            ->map(fn ($d) => $d->toDateString());

        $rawSales      = $this->loadBranchSales($storeIds, $dateFrom, $dateTo);
        $rawPayments   = $this->loadBranchPayments($storeIds, $dateFrom, $dateTo);
        $branchExOn    = $this->loadBranchExOn($storeIds, $dateFrom, $dateTo);
        $branchCosts   = $this->loadBranchCosts($storeIds, $dateFrom, $dateTo);
        $adminData     = $this->loadAdminEntries($dateFrom, $dateTo);
        $onlineData    = $this->loadOnlineData($dateFrom, $dateTo);
        $ownerData     = $this->loadOwnerEntries($dateFrom, $dateTo);

        $rows = [];

        foreach ($dates as $date) {
            $branches  = [];
            $totalCash = 0;
            $totalBank = 0;
            $totalSale = 0;
            $totalDailyCost = 0;
            $totalExOn = 0;
            $totalSalary = 0;
            $totalCashToBank = 0;

            foreach ($stores as $store) {
                $sid = (int) $store->id;
                $storeKey = (string) $sid;

                $raw_cash     = (float) ($rawPayments[$storeKey][$date]['cash'] ?? 0);
                $raw_bank     = (float) ($rawPayments[$storeKey][$date]['bank'] ?? 0);
                $sale         = (float) ($rawSales[$storeKey][$date] ?? 0);
                $ex_on        = (float) ($branchExOn[$storeKey][$date] ?? 0);
                $costBucket   = $branchCosts[$storeKey][$date] ?? ['total' => 0, 'cash' => 0, 'bank' => 0];
                $daily_cost   = (float) ($costBucket['total'] ?? 0);
                $cash_cost    = (float) ($costBucket['cash'] ?? 0);
                $bank_cost    = (float) ($costBucket['bank'] ?? 0);
                $salary       = (float) ($adminData[$storeKey][$date]['salary_setaside'] ?? 0);
                $cash_to_bank = (float) ($adminData[$storeKey][$date]['cash_to_bank'] ?? 0);

                // Daily costs can now come from both the cash-sheet branch-cost page
                // and completed Expense Payments from the accounting module. Cash
                // expenses reduce branch cash; non-cash/MFS/card/bank expenses reduce
                // the bank bucket so totals stay aligned with the accounting ledger.
                $disp_cash = $raw_cash - $salary - $cash_cost - $cash_to_bank;
                $disp_bank = $raw_bank - $bank_cost + $cash_to_bank;

                $branches[] = [
                    'store_id'     => $sid,
                    'store_name'   => $store->name,
                    'is_warehouse' => (bool) $store->is_warehouse,
                    'daily_sale'   => round($sale, 2),
                    'raw_cash'     => round($raw_cash, 2),
                    'raw_bank'     => round($raw_bank, 2),
                    'cash'         => round($disp_cash, 2),
                    'bank'         => round($disp_bank, 2),
                    'ex_on'        => round($ex_on, 2),
                    'salary'       => round($salary, 2),
                    'cash_to_bank' => round($cash_to_bank, 2),
                    'daily_cost'   => round($daily_cost, 2),
                    'cash_cost'    => round($cash_cost, 2),
                    'bank_cost'    => round($bank_cost, 2),
                ];

                $totalSale += $sale;
                $totalCash += $disp_cash;
                $totalBank += $disp_bank;
                $totalDailyCost += $daily_cost;
                $totalExOn += $ex_on;
                $totalSalary += $salary;
                $totalCashToBank += $cash_to_bank;
            }

            $online     = $onlineData[$date] ?? [];
            $ol_sales   = (float) ($online['daily_sales'] ?? 0);
            $ol_advance = (float) ($online['advance'] ?? 0);
            $ol_payment = (float) ($online['online_payment'] ?? 0);
            $ol_cod     = (float) ($online['cod'] ?? 0);
            $ol_cod_due = (float) ($online['cod_due'] ?? 0);
            $ol_cod_collected = (float) ($online['cod_collected'] ?? 0);
            $ol_refunds = (float) ($online['refunds'] ?? 0);

            $totalBank += $ol_advance; // online advance already received into bank/MFS

            $sslzc_recv  = (float) ($adminData['_global'][$date]['sslzc'] ?? 0);
            $pathao_recv = (float) ($adminData['_global'][$date]['pathao'] ?? 0);

            $owner       = $ownerData[$date] ?? [];
            $cash_invest = (float) ($owner['cash_invest'] ?? 0);
            $bank_invest = (float) ($owner['bank_invest'] ?? 0);
            $cash_cost   = (float) ($owner['cash_cost'] ?? 0);
            $bank_cost   = (float) ($owner['bank_cost'] ?? 0);

            $final_bank      = $totalBank + $sslzc_recv + $pathao_recv;
            $total_cash      = $totalCash + $cash_invest;
            $total_bank      = $final_bank + $bank_invest;
            $cash_after_cost = $total_cash - $cash_cost;
            $bank_after_cost = $total_bank - $bank_cost;

            $rows[] = [
                'date'     => $date,
                'branches' => $branches,
                'online'   => [
                    'daily_sales'    => round($ol_sales, 2),
                    'advance'        => round($ol_advance, 2),
                    'online_payment' => round($ol_payment, 2),
                    'cod'            => round($ol_cod, 2),
                    'cod_due'        => round($ol_cod_due, 2),
                    'cod_collected'  => round($ol_cod_collected, 2),
                    'refunds'        => round($ol_refunds, 2),
                ],
                'disbursements' => [
                    'sslzc_received'  => round($sslzc_recv, 2),
                    'pathao_received' => round($pathao_recv, 2),
                ],
                'totals' => [
                    'sale'         => round($totalSale + $ol_sales, 2),
                    'total_sale'   => round($totalSale + $ol_sales, 2), // backward-compatible alias
                    'branch_sale'  => round($totalSale, 2),
                    'cash'         => round($totalCash, 2),
                    'bank'         => round($totalBank, 2),
                    'final_bank'   => round($final_bank, 2),
                    'daily_cost'   => round($totalDailyCost, 2),
                    'ex_on'        => round($totalExOn, 2),
                    'salary'       => round($totalSalary, 2),
                    'cash_to_bank' => round($totalCashToBank, 2),
                ],
                'owner' => [
                    'cash_invest'     => round($cash_invest, 2),
                    'bank_invest'     => round($bank_invest, 2),
                    'total_cash'      => round($total_cash, 2),
                    'total_bank'      => round($total_bank, 2),
                    'cash_cost'       => round($cash_cost, 2),
                    'bank_cost'       => round($bank_cost, 2),
                    'cash_after_cost' => round($cash_after_cost, 2),
                    'bank_after_cost' => round($bank_after_cost, 2),
                ],
            ];
        }

        return response()->json([
            'success' => true,
            'month'   => $month,
            'date_from' => $dateFrom,
            'date_to'   => $dateTo,
            'timezone' => self::BUSINESS_TIMEZONE,
            'utc_offset_hours' => (int) env('CASH_SHEET_UTC_OFFSET_HOURS', 6),
            'stores'  => $stores->map(fn ($s) => [
                'id'           => (int) $s->id,
                'name'         => $s->name,
                'is_warehouse' => (bool) $s->is_warehouse,
                'is_online'    => (bool) ($s->is_online ?? false),
                'is_active'    => (bool) ($s->is_active ?? false),
                'deleted_at'   => $s->deleted_at ?? null,
            ])->values(),
            'data'    => $rows,
            'summary' => $this->buildSummary($rows, $stores),
        ]);
    }

    public function entries(Request $request)
    {
        $request->validate(['date' => 'required|date']);
        $date = Carbon::parse($request->date)->toDateString();

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
                'created_by' => Auth::guard('api')->id(),
            ]);

            // Cash-sheet branch costs are no longer isolated rows. Mirror each entry
            // into the Expense + ExpensePayment module so P&L, ledger, and cash sheet
            // all reconcile from the same business event. The cash sheet still reads
            // the branch_cost_entries row to preserve the existing UI/audit trail.
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

    private function createAccountingExpenseForBranchCost(BranchCostEntry $entry): void
    {
        if ($this->findLinkedExpenseForBranchCost($entry)) {
            return;
        }

        $employeeId = $this->currentEmployeeId();
        $entryDate = Carbon::parse($entry->entry_date)->toDateString();
        $timestamp = Carbon::parse($entryDate)->endOfDay();
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
            'description' => $entry->details ?: 'Cash sheet branch daily cost',
            'expense_type' => 'miscellaneous',
            'metadata' => [
                'source' => 'cash_sheet_branch_cost',
                'cash_sheet_branch_cost_entry_id' => (int) $entry->id,
            ],
        ]);

        // Creating a completed ExpensePayment triggers ExpensePaymentObserver, which
        // writes the balanced debit-expense / credit-cash ledger pair.
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
            'notes' => trim(($expense->notes ? $expense->notes . "\n" : '') . 'Cancelled because linked cash-sheet branch cost entry was deleted.'),
        ]);
    }

    private function findLinkedExpenseForBranchCost(BranchCostEntry $entry): ?Expense
    {
        $json = "REPLACE(LOWER(COALESCE(metadata, '')), ' ', '')";

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
                'name' => 'Cash Sheet Daily Cost',
                'description' => 'Operational branch costs entered from the daily cash sheet.',
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

        $date = Carbon::parse($entry->entry_date)->toDateString();
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
                'Cash Sheet - Salary/Rent Set-aside',
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
                'Cash Sheet - Cash to Bank Transfer',
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
                'Cash Sheet - SSLCommerz Disbursement Received',
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
                'Cash Sheet - Pathao Disbursement Received',
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

        $date = Carbon::parse($entry->entry_date)->toDateString();
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
                'Cash Sheet - Owner Cash Investment',
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
                'Cash Sheet - Owner Bank Investment',
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
                'Cash Sheet - Owner Cash Cost',
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
                'Cash Sheet - Owner Bank Cost',
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
        $json = "REPLACE(LOWER(COALESCE({$metadata}, '')), ' ', '')";

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
                'amount' => round((float) $r->amount, 2),
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

    /**
     * Convert UTC/DB datetime columns into Errum's Bangladesh business date.
     *
     * The production DB stores timestamps as UTC. The canonical monthly cash-sheet
     * report, so records at 19:xx UTC must hydrate the next Bangladesh day.
     * Date-only columns such as entry_date are still handled as plain dates.
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

    private function whereBusinessDateBetween($query, string $expr, string $from, string $to): void
    {
        $businessDate = $this->businessDateSql($expr);
        $query->whereRaw("{$businessDate} >= ?", [$from])
            ->whereRaw("{$businessDate} <= ?", [$to]);
    }

    /**
     * Load all stores that should appear in the selected month.
     *
     * Active stores are always shown. Inactive stores are also shown when they
     * have historical sale/payment/refund/cost/admin activity in the month, so
     * old cash sheets do not lose branch columns after a branch is deactivated.
     */
    private function loadCashSheetStores(string $from, string $to)
    {
        // The cash sheet must render every current branch/warehouse even when it
        // has no movement in the selected month. For historical months, it must
        // also resurrect inactive or soft-deleted locations when source rows exist
        // in that month, otherwise old sheets lose their original columns.
        $ids = collect(Store::withTrashed()
            ->where(function ($q) {
                $q->where('is_active', true)
                    ->orWhereNull('is_active'); // legacy rows created before the flag was enforced
            })
            ->pluck('id')
            ->all());

        $merge = function ($values) use (&$ids): void {
            $ids = $ids->merge(
                collect($values)
                    ->filter(fn ($id) => $id !== null && (int) $id > 0)
                    ->map(fn ($id) => (int) $id)
            );
        };

        $orderAt = 'COALESCE(order_date, confirmed_at, created_at)';
        $paymentAt = 'COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)';
        $paymentStoreExpr = 'COALESCE(op.store_id, o.store_id)';
        $splitPaymentAt = 'COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)';
        $splitStoreExpr = 'COALESCE(ps.store_id, op.store_id, o.store_id)';
        $expenseAt = 'COALESCE(ep.completed_at, ep.processed_at, e.expense_date)';

        $merge(DB::table('orders')
            ->whereNull('deleted_at')
            ->whereRaw($this->businessDateSql($orderAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($orderAt) . ' <= ?', [$to])
            ->pluck('store_id'));

        $merge(DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->selectRaw("{$paymentStoreExpr} as store_id")
            ->whereNull('op.deleted_at')
            ->whereRaw($this->businessDateSql($paymentAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($paymentAt) . ' <= ?', [$to])
            ->pluck('store_id'));

        $merge(DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->selectRaw("{$splitStoreExpr} as store_id")
            ->whereRaw($this->businessDateSql($splitPaymentAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($splitPaymentAt) . ' <= ?', [$to])
            ->pluck('store_id'));

        $merge(DB::table('refunds as r')
            ->leftJoin('product_returns as pr', 'pr.id', '=', 'r.return_id')
            ->leftJoin('orders as o', 'o.id', '=', 'r.order_id')
            ->selectRaw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id) as store_id')
            ->whereNotNull('r.completed_at')
            ->whereRaw($this->businessDateSql('r.completed_at') . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql('r.completed_at') . ' <= ?', [$to])
            ->pluck('store_id'));

        $merge(DB::table('branch_cost_entries')
            ->whereBetween('entry_date', [$from, $to])
            ->pluck('store_id'));

        $merge(DB::table('expense_payments as ep')
            ->join('expenses as e', 'e.id', '=', 'ep.expense_id')
            ->selectRaw('COALESCE(ep.store_id, e.store_id) as store_id')
            ->whereRaw($this->businessDateSql($expenseAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($expenseAt) . ' <= ?', [$to])
            ->pluck('store_id'));

        $merge(DB::table('admin_entries')
            ->whereNotNull('store_id')
            ->whereBetween('entry_date', [$from, $to])
            ->pluck('store_id'));

        return Store::withTrashed()
            ->whereIn('id', $ids->unique()->values()->all())
            ->orderBy('id')
            ->get(['id', 'name', 'is_warehouse', 'is_online', 'is_active', 'deleted_at']);
    }

    private function loadBranchSales(array $ids, string $from, string $to): array
    {
        $out = [];

        // Sales are counted on the order business date, not on payment dates.
        // The old payment join could count the same order multiple times when
        // payments were added/updated on different dates. Payments are handled
        // separately by loadBranchPayments().
        $dateExpr = 'COALESCE(o.order_date, o.confirmed_at, o.created_at)';
        $dayExpr = $this->businessDateSql($dateExpr);
        $query = DB::table('orders as o')
            ->select(
                'o.store_id',
                DB::raw("{$dayExpr} as day"),
                DB::raw('SUM(o.total_amount) as total')
            )
            ->whereIn('o.store_id', $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES);

        $this->whereBusinessDateBetween($query, $dateExpr, $from, $to);

        $this->applyCashSheetOrderScope($query, 'o', false);

        $query
            ->groupBy('o.store_id', 'day')
            ->get()
            ->each(function ($r) use (&$out) {
                $out[(string) $r->store_id][$r->day] = round((float) $r->total, 2);
            });

        return $out;
    }

    private function loadBranchPayments(array $ids, string $from, string $to): array
    {
        $out = [];
        $excludedPaymentTypes = self::INTERNAL_SETTLEMENT_PAYMENT_TYPES;

        $addToBucket = function ($r, int $sign = 1) use (&$out) {
            // In the cash sheet, every completed non-cash counter payment is treated
            // as Bank. This intentionally includes card, bank transfer, online banking,
            // digital wallet, and mobile banking/MFS such as bKash and Nagad.
            $bucket = in_array($r->mt, self::CASH_TYPES, true) ? 'cash' : 'bank';
            $storeKey = (string) $r->store_id;
            $out[$storeKey][$r->day][$bucket] = ($out[$storeKey][$r->day][$bucket] ?? 0) + ($sign * (float) $r->total);
        };

        $normalPaymentAt = 'COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)';
        $normalStoreExpr = 'COALESCE(op.store_id, o.store_id)';
        $splitPaymentAt = 'COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)';
        $splitStoreExpr = 'COALESCE(ps.store_id, op.store_id, o.store_id)';

        // 1) Normal single-method payments.
        // Payment cash-flow is counted even if the order is later cancelled/refunded;
        // the matching refund will subtract cash/bank on the refund date. This avoids
        // the old double-negative problem where the payment disappeared but refund remained.
        // Explicit payment_received_date is preferred so backdated POS/offline payments
        // hydrate the intended business day instead of the processing day.
        $normalPayments = DB::table('order_payments as op')
            ->join('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_splits as ps_probe', 'ps_probe.order_payment_id', '=', 'op.id')
            ->select(
                DB::raw("{$normalStoreExpr} as store_id"),
                DB::raw($this->businessDateSql($normalPaymentAt) . ' as day'),
                'pm.type as mt',
                DB::raw('SUM(op.amount) as total')
            )
            ->whereIn(DB::raw($normalStoreExpr), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('op.deleted_at')
            ->whereNull('ps_probe.id')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where(function ($q) use ($excludedPaymentTypes) {
                $q->whereNull('op.payment_type')->orWhereNotIn('op.payment_type', $excludedPaymentTypes);
            })
            ->whereRaw("{$normalPaymentAt} IS NOT NULL");

        $this->whereBusinessDateBetween($normalPayments, $normalPaymentAt, $from, $to);

        $this->applyCashFlowOrderScope($normalPayments, 'o', true, 'op');

        $normalPayments
            ->groupBy(DB::raw($normalStoreExpr), 'day', 'pm.type')
            ->get()
            ->each($addToBucket);

        // 2) Split payments. The parent order_payments row has payment_method_id = null,
        // so cash sheet must read payment_splits. Some legacy POS flows completed the
        // parent payment but left split rows as pending/null. In that case we still count
        // non-failed/non-cancelled split rows because the order is paid and the receipt
        // was printed from these split amounts.
        $splitPayments = DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->select(
                DB::raw("{$splitStoreExpr} as store_id"),
                DB::raw($this->businessDateSql($splitPaymentAt) . ' as day'),
                'pm.type as mt',
                DB::raw('SUM(ps.amount) as total')
            )
            ->whereIn(DB::raw($splitStoreExpr), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where(function ($q) {
                $q->where('ps.status', 'completed')
                    ->orWhere(function ($qq) {
                        $qq->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
                            ->where(function ($statusQ) {
                                $statusQ->whereNull('ps.status')
                                    ->orWhereNotIn('ps.status', self::NON_MONEY_SPLIT_STATUSES);
                            });
                    });
            })
            ->where(function ($q) use ($excludedPaymentTypes) {
                $q->whereNull('op.payment_type')->orWhereNotIn('op.payment_type', $excludedPaymentTypes);
            })
            ->whereRaw("{$splitPaymentAt} IS NOT NULL");

        $this->whereBusinessDateBetween($splitPayments, $splitPaymentAt, $from, $to);

        $this->applyCashFlowOrderScope($splitPayments, 'o', true, 'op');

        $splitPayments
            ->groupBy(DB::raw($splitStoreExpr), 'day', 'pm.type')
            ->get()
            ->each($addToBucket);

        // 3) Completed cash/bank refunds must reduce the branch's visible money.
        // Store-credit and gift-card refunds do not move cash/bank immediately.
        DB::table('refunds as r')
            ->leftJoin('product_returns as pr', 'pr.id', '=', 'r.return_id')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id) as store_id'),
                DB::raw($this->businessDateSql('r.completed_at') . ' as day'),
                DB::raw("CASE WHEN LOWER(COALESCE(r.refund_method, '')) = 'cash' THEN 'cash' ELSE 'bank' END as mt"),
                DB::raw('SUM(r.refund_amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->where('r.status', 'completed')
            ->whereNotNull('r.completed_at')
            ->where(function ($q) {
                $q->whereNull('r.refund_method')->orWhereNotIn(DB::raw('LOWER(r.refund_method)'), ['store_credit', 'gift_card']);
            })
            ->whereRaw($this->businessDateSql('r.completed_at') . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql('r.completed_at') . ' <= ?', [$to])
            ->groupBy(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), 'day', 'mt')
            ->get()
            ->each(fn ($r) => $addToBucket($r, -1));

        return $out;
    }

    private function loadBranchExOn(array $ids, string $from, string $to): array
    {
        $out = [];

        $add = function ($r, int $sign = 1) use (&$out) {
            $storeKey = (string) $r->store_id;
            $out[$storeKey][$r->day] = ($out[$storeKey][$r->day] ?? 0) + ($sign * (float) $r->total);
        };

        $normalExchangeAt = 'COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)';
        $normalStoreExpr = 'COALESCE(op.store_id, o.store_id)';
        $splitExchangeAt = 'COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)';
        $splitStoreExpr = 'COALESCE(ps.store_id, op.store_id, o.store_id)';

        // Exchange upgrade/top-up: show the real extra customer-paid amount in Ex/On.
        // Use the same date priority as raw payments so Ex/On cannot drift to a
        // different day from cash/bank when users backdate the payment_received_date.
        DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->leftJoin('payment_splits as ps_probe', 'ps_probe.order_payment_id', '=', 'op.id')
            ->select(
                DB::raw("{$normalStoreExpr} as store_id"),
                DB::raw($this->businessDateSql($normalExchangeAt) . ' as day'),
                DB::raw('SUM(op.amount) as total')
            )
            ->whereIn(DB::raw($normalStoreExpr), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereNull('ps_probe.id')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where('op.payment_type', 'exchange_surplus')
            ->whereRaw("{$normalExchangeAt} IS NOT NULL")
            ->whereRaw($this->businessDateSql($normalExchangeAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($normalExchangeAt) . ' <= ?', [$to])
            ->groupBy(DB::raw($normalStoreExpr), 'day')
            ->get()
            ->each($add);

        // Split exchange top-ups: parent order_payments is ignored when split rows
        // exist, matching loadBranchPayments() and preventing double counting.
        DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->select(
                DB::raw("{$splitStoreExpr} as store_id"),
                DB::raw($this->businessDateSql($splitExchangeAt) . ' as day'),
                DB::raw('SUM(ps.amount) as total')
            )
            ->whereIn(DB::raw($splitStoreExpr), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where('op.payment_type', 'exchange_surplus')
            ->where(function ($q) {
                $q->where('ps.status', 'completed')
                    ->orWhere(function ($qq) {
                        $qq->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
                            ->where(function ($statusQ) {
                                $statusQ->whereNull('ps.status')
                                    ->orWhereNotIn('ps.status', self::NON_MONEY_SPLIT_STATUSES);
                            });
                    });
            })
            ->whereRaw("{$splitExchangeAt} IS NOT NULL")
            ->whereRaw($this->businessDateSql($splitExchangeAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($splitExchangeAt) . ' <= ?', [$to])
            ->groupBy(DB::raw($splitStoreExpr), 'day')
            ->get()
            ->each($add);

        // Exchange downgrade/refund: show as negative Ex/On because cash/bank went out.
        DB::table('refunds as r')
            ->leftJoin('product_returns as pr', 'pr.id', '=', 'r.return_id')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id) as store_id'),
                DB::raw($this->businessDateSql('r.completed_at') . ' as day'),
                DB::raw('SUM(r.refund_amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), $ids)
            ->whereIn('o.order_type', self::BRANCH_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->where('r.status', 'completed')
            ->where('r.refund_type', 'exchange_refund')
            ->whereNotNull('r.completed_at')
            ->whereRaw($this->businessDateSql('r.completed_at') . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql('r.completed_at') . ' <= ?', [$to])
            ->groupBy(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), 'day')
            ->get()
            ->each(fn ($r) => $add($r, -1));

        return $out;
    }

    private function loadBranchCosts(array $ids, string $from, string $to): array
    {
        $out = [];

        $add = function ($storeId, string $day, float $amount, string $bucket = 'cash') use (&$out) {
            $storeKey = (string) $storeId;
            $bucket = $bucket === 'cash' ? 'cash' : 'bank';

            $out[$storeKey][$day]['total'] = ($out[$storeKey][$day]['total'] ?? 0) + $amount;
            $out[$storeKey][$day][$bucket] = ($out[$storeKey][$day][$bucket] ?? 0) + $amount;
            $out[$storeKey][$day][$bucket === 'cash' ? 'bank' : 'cash'] = $out[$storeKey][$day][$bucket === 'cash' ? 'bank' : 'cash'] ?? 0;
        };

        // 1) Legacy/manual branch-cost entries from the cash sheet page.
        // These are treated as cash costs because the existing form has no payment-method selector.
        BranchCostEntry::select('store_id', DB::raw('DATE(entry_date) as day'), DB::raw('SUM(amount) as total'))
            ->whereIn('store_id', $ids)
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('store_id', 'day')
            ->get()
            ->each(function ($r) use ($add) {
                $add($r->store_id, $r->day, (float) $r->total, 'cash');
            });

        // 2) Accounting-module daily expenses. These are completed ExpensePayment rows
        // that were entered from the main accounting/expense module, not from the
        // cash-sheet branch-cost form. This lets expenses flow into the cash sheet.
        $accountingExpenses = DB::table('expense_payments as ep')
            ->join('expenses as e', 'e.id', '=', 'ep.expense_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'ep.payment_method_id')
            ->select(
                DB::raw('COALESCE(ep.store_id, e.store_id) as store_id'),
                DB::raw($this->businessDateSql('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)') . ' as day'),
                'pm.type as payment_method_type',
                DB::raw('SUM(ep.amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(ep.store_id, e.store_id)'), $ids)
            ->where('ep.status', 'completed')
            ->whereNotIn('e.status', ['cancelled', 'rejected']);

        $this->whereBusinessDateBetween($accountingExpenses, 'COALESCE(ep.completed_at, ep.processed_at, e.expense_date)', $from, $to);

        $this->whereNotCashSheetOrigin($accountingExpenses, 'e');

        $accountingExpenses
            ->groupBy(DB::raw('COALESCE(ep.store_id, e.store_id)'), 'day', 'pm.type')
            ->get()
            ->each(function ($r) use ($add) {
                $bucket = in_array($r->payment_method_type, self::CASH_TYPES, true) ? 'cash' : 'bank';
                $add($r->store_id, $r->day, (float) $r->total, $bucket);
            });

        return $out;
    }

    /** Returns [store_id|'_global'][date][type] = sum */
    private function loadAdminEntries(string $from, string $to): array
    {
        $out = [];

        AdminEntry::select('store_id', 'type', DB::raw('DATE(entry_date) as day'), DB::raw('SUM(amount) as total'))
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('store_id', 'type', 'day')
            ->get()
            ->each(function ($r) use (&$out) {
                $key = in_array($r->type, ['sslzc', 'pathao'], true) ? '_global' : (string) $r->store_id;
                $out[$key][$r->day][$r->type] = ($out[$key][$r->day][$r->type] ?? 0) + (float) $r->total;
            });

        return $out;
    }

    private function loadOnlineData(string $from, string $to): array
    {
        $out = [];
        $orderDateExpr = 'COALESCE(order_date, confirmed_at, created_at)';
        $onlineOrderDayExpr = $this->businessDateSql($orderDateExpr);

        $ensureOnlineDay = function (string $day) use (&$out): void {
            $out[$day]['daily_sales'] = $out[$day]['daily_sales'] ?? 0;
            $out[$day]['advance'] = $out[$day]['advance'] ?? 0;
            $out[$day]['online_payment'] = $out[$day]['online_payment'] ?? 0;
            $out[$day]['cod'] = $out[$day]['cod'] ?? 0;
            $out[$day]['cod_due'] = $out[$day]['cod_due'] ?? 0;
            $out[$day]['cod_collected'] = $out[$day]['cod_collected'] ?? 0;
            $out[$day]['refunds'] = $out[$day]['refunds'] ?? 0;
        };

        $addOnline = function (string $day, string $field, float $amount) use (&$out, $ensureOnlineDay): void {
            if ($amount == 0.0) {
                return;
            }
            $ensureOnlineDay($day);
            $out[$day][$field] = ($out[$day][$field] ?? 0) + $amount;
        };

        // 1) Online/social order value is counted on the order business date and
        // is always recalculated live from orders.total_amount. Therefore edits,
        // cancellations, soft deletes, and status changes are reflected as soon as
        // this endpoint is reloaded.
        DB::table('orders')
            ->select(
                DB::raw("{$onlineOrderDayExpr} as day"),
                DB::raw('SUM(total_amount) as total_sales')
            )
            ->whereIn('order_type', self::ONLINE_ORDER_TYPES)
            ->whereNull('deleted_at')
            ->whereNotIn(DB::raw('LOWER(status)'), self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($q) {
                $this->whereNotExchangeReplacement($q, 'orders');
            })
            ->whereRaw($this->businessDateSql($orderDateExpr) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($orderDateExpr) . ' <= ?', [$to])
            ->groupBy('day')
            ->get()
            ->each(function ($r) use ($addOnline) {
                $addOnline($r->day, 'daily_sales', (float) $r->total_sales);
            });

        // 2) Open COD/due is a receivable bucket, not bank. It is counted on the
        // order business date while still outstanding. When delivery/payment makes
        // outstanding_amount zero, this due disappears automatically and the actual
        // delivery collection is handled below on the payment completion date.
        DB::table('orders')
            ->select(
                DB::raw("{$onlineOrderDayExpr} as day"),
                DB::raw('SUM(outstanding_amount) as total_due')
            )
            ->whereIn('order_type', self::ONLINE_ORDER_TYPES)
            ->whereNull('deleted_at')
            ->whereNotIn(DB::raw('LOWER(status)'), self::EXCLUDED_ORDER_STATUSES)
            ->where(function ($q) {
                $this->whereNotExchangeReplacement($q, 'orders');
            })
            ->where('outstanding_amount', '>', 0)
            ->where(function ($q) {
                $q->whereIn(DB::raw("LOWER(COALESCE(payment_method, ''))"), ['cod', 'cash_on_delivery'])
                    ->orWhereIn(DB::raw("LOWER(COALESCE(intended_courier, ''))"), ['pathao', 'steadfast', 'redx', 'paperfly'])
                    ->orWhereRaw("LOWER(COALESCE(metadata, '')) LIKE ?", ['%cod%']);
            })
            ->whereRaw($this->businessDateSql($orderDateExpr) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($orderDateExpr) . ' <= ?', [$to])
            ->groupBy('day')
            ->get()
            ->each(function ($r) use ($addOnline) {
                $amount = (float) $r->total_due;
                $addOnline($r->day, 'cod_due', $amount);
                $addOnline($r->day, 'cod', $amount);
            });

        $excludedPaymentTypes = self::INTERNAL_SETTLEMENT_PAYMENT_TYPES;

        $classifyOnlinePayment = function ($r) use ($addOnline): void {
            $amount = (float) $r->total;
            if ($amount == 0.0) {
                return;
            }

            $orderType = (string) $r->order_type;
            $isCodCollection = (int) ($r->is_cod_collection ?? 0) === 1;

            if ($isCodCollection) {
                $addOnline($r->day, 'cod_collected', $amount);
                $addOnline($r->day, 'cod', $amount);
                return;
            }

            if ($orderType === 'social_commerce') {
                $addOnline($r->day, 'advance', $amount);
            } elseif ($orderType === 'ecommerce') {
                $addOnline($r->day, 'online_payment', $amount);
            }
        };

        // Delivery COD detector: cash/COD payment posted at/after delivery or created
        // by settleDeliveredOrderPayment() should not be mixed into Advance. It is a
        // COD/Pathao receivable tracking item until Pathao/COD disbursement is entered.
        $codCollectionExprForOp = "CASE WHEN (" .
            "LOWER(COALESCE(pm.code, '')) IN ('cod', 'cash_on_delivery') " .
            "OR LOWER(COALESCE(o.payment_method, '')) IN ('cod', 'cash_on_delivery') " .
            "OR LOWER(COALESCE(op.metadata, '')) LIKE '%auto_settled_on_delivery%'" .
            ") AND (" .
            "LOWER(COALESCE(op.metadata, '')) LIKE '%auto_settled_on_delivery%' " .
            "OR (o.delivered_at IS NOT NULL AND op.completed_at IS NOT NULL AND op.completed_at >= o.delivered_at)" .
            ") THEN 1 ELSE 0 END";

        $normalOnlinePaymentAt = 'COALESCE(op.payment_received_date, op.completed_at, op.processed_at, op.created_at)';
        $splitOnlinePaymentAt = 'COALESCE(op.payment_received_date, ps.completed_at, op.completed_at, ps.processed_at, op.processed_at, op.created_at)';

        DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->leftJoin('payment_splits as ps_probe', 'ps_probe.order_payment_id', '=', 'op.id')
            ->select(
                DB::raw($this->businessDateSql($normalOnlinePaymentAt) . ' as day'),
                'o.order_type',
                DB::raw($codCollectionExprForOp . ' as is_cod_collection'),
                DB::raw('SUM(op.amount) as total')
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->whereNull('ps_probe.id')
            ->whereRaw("{$normalOnlinePaymentAt} IS NOT NULL")
            ->where(function ($q) use ($excludedPaymentTypes) {
                $q->whereNull('op.payment_type')->orWhereNotIn('op.payment_type', $excludedPaymentTypes);
            })
            ->where(function ($q) {
                $this->whereNotExchangeReplacement($q, 'o');
            })
            ->whereRaw($this->businessDateSql($normalOnlinePaymentAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($normalOnlinePaymentAt) . ' <= ?', [$to])
            ->groupBy('day', 'o.order_type', 'is_cod_collection')
            ->get()
            ->each($classifyOnlinePayment);

        $codCollectionExprForSplit = "CASE WHEN (" .
            "LOWER(COALESCE(pm.code, '')) IN ('cod', 'cash_on_delivery') " .
            "OR LOWER(COALESCE(o.payment_method, '')) IN ('cod', 'cash_on_delivery') " .
            "OR LOWER(COALESCE(op.metadata, '')) LIKE '%auto_settled_on_delivery%'" .
            ") AND (" .
            "LOWER(COALESCE(op.metadata, '')) LIKE '%auto_settled_on_delivery%' " .
            "OR (o.delivered_at IS NOT NULL AND COALESCE(ps.completed_at, op.completed_at) IS NOT NULL AND COALESCE(ps.completed_at, op.completed_at) >= o.delivered_at)" .
            ") THEN 1 ELSE 0 END";

        DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
            ->select(
                DB::raw($this->businessDateSql($splitOnlinePaymentAt) . ' as day'),
                'o.order_type',
                DB::raw($codCollectionExprForSplit . ' as is_cod_collection'),
                DB::raw('SUM(ps.amount) as total')
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->whereNull('op.deleted_at')
            ->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
            ->where(function ($q) {
                $q->where('ps.status', 'completed')
                    ->orWhere(function ($qq) {
                        $qq->whereIn('op.status', self::MONEY_PAYMENT_STATUSES)
                            ->where(function ($statusQ) {
                                $statusQ->whereNull('ps.status')
                                    ->orWhereNotIn('ps.status', self::NON_MONEY_SPLIT_STATUSES);
                            });
                    });
            })
            ->whereRaw("{$splitOnlinePaymentAt} IS NOT NULL")
            ->where(function ($q) use ($excludedPaymentTypes) {
                $q->whereNull('op.payment_type')->orWhereNotIn('op.payment_type', $excludedPaymentTypes);
            })
            ->where(function ($q) {
                $this->whereNotExchangeReplacement($q, 'o');
            })
            ->whereRaw($this->businessDateSql($splitOnlinePaymentAt) . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql($splitOnlinePaymentAt) . ' <= ?', [$to])
            ->groupBy('day', 'o.order_type', 'is_cod_collection')
            ->get()
            ->each($classifyOnlinePayment);

        // 3) Completed online/social refunds reduce the same bucket they originally
        // affected. They are counted on refund completion date, so return/exchange
        // cash movements appear on the day money actually moved.
        $classifyOnlineRefund = function ($r) use ($addOnline): void {
            $amount = (float) $r->total;
            if ($amount == 0.0) {
                return;
            }

            $addOnline($r->day, 'refunds', $amount);

            if ((int) ($r->is_cod_refund ?? 0) === 1) {
                $addOnline($r->day, 'cod_collected', -$amount);
                $addOnline($r->day, 'cod', -$amount);
                return;
            }

            if ($r->order_type === 'social_commerce') {
                $addOnline($r->day, 'advance', -$amount);
            } elseif ($r->order_type === 'ecommerce') {
                $addOnline($r->day, 'online_payment', -$amount);
            }
        };

        $codRefundExpr = "CASE WHEN " .
            "LOWER(COALESCE(r.refund_method, '')) IN ('cash', 'cod', 'cash_on_delivery') " .
            "AND LOWER(COALESCE(o.payment_method, '')) IN ('cod', 'cash_on_delivery') " .
            "THEN 1 ELSE 0 END";

        DB::table('refunds as r')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                DB::raw($this->businessDateSql('r.completed_at') . ' as day'),
                'o.order_type',
                DB::raw($codRefundExpr . ' as is_cod_refund'),
                DB::raw('SUM(r.refund_amount) as total')
            )
            ->whereIn('o.order_type', self::ONLINE_ORDER_TYPES)
            ->whereNull('o.deleted_at')
            ->where('r.status', 'completed')
            ->whereNotNull('r.completed_at')
            ->where(function ($q) {
                $q->whereNull('r.refund_method')->orWhereNotIn(DB::raw('LOWER(r.refund_method)'), ['store_credit', 'gift_card']);
            })
            ->whereRaw($this->businessDateSql('r.completed_at') . ' >= ?', [$from])
            ->whereRaw($this->businessDateSql('r.completed_at') . ' <= ?', [$to])
            ->groupBy('day', 'o.order_type', 'is_cod_refund')
            ->get()
            ->each($classifyOnlineRefund);

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
            ->each(function ($r) use (&$out) {
                $day = Carbon::parse($r->day)->toDateString();
                $out[$day][$r->type] = ($out[$day][$r->type] ?? 0) + (float) $r->total;
            });

        return $out;
    }

    private function applyCashSheetOrderScope($query, string $orderAlias = 'o', bool $allowExchangeSurplusPayment = false, string $paymentAlias = 'op'): void
    {
        $query->whereNull($orderAlias . '.deleted_at')
            ->whereNotIn(DB::raw('LOWER(' . $orderAlias . '.status)'), self::EXCLUDED_ORDER_STATUSES);

        if ($allowExchangeSurplusPayment) {
            $query->where(function ($q) use ($orderAlias, $paymentAlias) {
                $this->whereNotExchangeReplacement($q, $orderAlias);
                $q->orWhere($paymentAlias . '.payment_type', 'exchange_surplus');
            });
            return;
        }

        $this->whereNotExchangeReplacement($query, $orderAlias);
    }

    /**
     * Cash movements should survive later order status changes.
     *
     * Sales columns exclude cancelled/refunded orders. Cash/bank columns are
     * different: once a completed payment exists, it was a real cash-flow event.
     * If the order is later cancelled or refunded, the completed refund row creates
     * the opposite cash-flow event. Therefore payment loaders must not filter out
     * completed payments only because the parent order status changed.
     */
    private function applyCashFlowOrderScope($query, string $orderAlias = 'o', bool $allowExchangeSurplusPayment = false, string $paymentAlias = 'op'): void
    {
        $query->whereNull($orderAlias . '.deleted_at');

        if ($allowExchangeSurplusPayment) {
            $query->where(function ($q) use ($orderAlias, $paymentAlias) {
                $this->whereNotExchangeReplacement($q, $orderAlias);
                $q->orWhere($paymentAlias . '.payment_type', 'exchange_surplus');
            });
            return;
        }

        $this->whereNotExchangeReplacement($query, $orderAlias);
    }

    private function whereNotExchangeReplacement($query, string $orderAlias = 'o'): void
    {
        // Keep this database-portable: MySQL JSON_UNQUOTE() is not available in SQLite,
        // while this project ships a SQLite dev DB. Normalise the JSON string and reject
        // both boolean true and string "true" values.
        $metadata = $orderAlias . '.metadata';
        $json = "REPLACE(LOWER(COALESCE({$metadata}, '')), ' ', '')";

        $query->where(function ($q) use ($metadata, $json) {
            $q->whereNull($metadata)
                ->orWhere(function ($qq) use ($json) {
                    $qq->whereRaw("{$json} NOT LIKE ?", ['%"is_exchange_replacement":true%'])
                        ->whereRaw("{$json} NOT LIKE ?", ['%"is_exchange_replacement":"true"%']);
                });
        });
    }

    private function buildSummary(array $rows, $stores): array
    {
        $summary = [
            'branches'      => [],
            'online'        => ['daily_sales' => 0, 'advance' => 0, 'online_payment' => 0, 'cod' => 0, 'cod_due' => 0, 'cod_collected' => 0, 'refunds' => 0],
            'disbursements' => ['sslzc_received' => 0, 'pathao_received' => 0],
            'totals'        => ['sale' => 0, 'total_sale' => 0, 'branch_sale' => 0, 'cash' => 0, 'bank' => 0, 'final_bank' => 0, 'daily_cost' => 0, 'ex_on' => 0, 'salary' => 0, 'cash_to_bank' => 0],
            'owner'         => [
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

        foreach ($stores as $st) {
            $summary['branches'][$st->id] = [
                'store_id'     => (int) $st->id,
                'store_name'   => $st->name,
                'is_warehouse' => (bool) $st->is_warehouse,
                'daily_sale'   => 0,
                'raw_cash'     => 0,
                'raw_bank'     => 0,
                'cash'         => 0,
                'bank'         => 0,
                'ex_on'        => 0,
                'salary'       => 0,
                'cash_to_bank' => 0,
                'daily_cost'   => 0,
                'cash_cost'    => 0,
                'bank_cost'    => 0,
            ];
        }

        foreach ($rows as $row) {
            foreach ($row['branches'] as $b) {
                foreach (['daily_sale', 'raw_cash', 'raw_bank', 'cash', 'bank', 'ex_on', 'salary', 'cash_to_bank', 'daily_cost', 'cash_cost', 'bank_cost'] as $field) {
                    $summary['branches'][$b['store_id']][$field] += (float) $b[$field];
                }
            }

            foreach (['daily_sales', 'advance', 'online_payment', 'cod', 'cod_due', 'cod_collected', 'refunds'] as $field) {
                $summary['online'][$field] += (float) $row['online'][$field];
            }

            $summary['disbursements']['sslzc_received'] += (float) $row['disbursements']['sslzc_received'];
            $summary['disbursements']['pathao_received'] += (float) $row['disbursements']['pathao_received'];

            foreach (['sale', 'total_sale', 'branch_sale', 'cash', 'bank', 'final_bank', 'daily_cost', 'ex_on', 'salary', 'cash_to_bank'] as $field) {
                $summary['totals'][$field] += (float) ($row['totals'][$field] ?? 0);
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
        $summary['stores'] = $summary['branches']; // frontend-friendly alias

        return $summary;
    }
}
