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
 *                   (both include split payments and ignore cancelled/deleted orders)
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
    private const CASH_TYPES = ['cash'];
    private const EXCLUDED_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded', 'void', 'deleted'];
    private const INTERNAL_SETTLEMENT_PAYMENT_TYPES = ['exchange_balance', 'store_credit', 'balance_carryover'];


    public function index(Request $request)
    {
        $request->validate(['month' => 'nullable|date_format:Y-m']);

        $month    = $request->input('month', now()->format('Y-m'));
        $dateFrom = Carbon::parse($month . '-01')->startOfMonth()->toDateString();
        $dateTo   = Carbon::parse($month . '-01')->endOfMonth()->toDateString();

        $stores = Store::where('is_active', true)
            ->orderBy('is_warehouse')
            ->orderBy('id')
            ->get(['id', 'name', 'is_warehouse']);

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
                $disp_cash = max(0, $raw_cash - $salary - $cash_cost - $cash_to_bank);
                $disp_bank = $raw_bank - $bank_cost + $cash_to_bank;

                $branches[] = [
                    'store_id'     => $sid,
                    'store_name'   => $store->name,
                    'is_warehouse' => (bool) $store->is_warehouse,
                    'daily_sale'   => round($sale, 2),
                    'raw_cash'     => round($raw_cash, 2),
                    'cash'         => round($disp_cash, 2),
                    'bank'         => round($disp_bank, 2),
                    'ex_on'        => round($ex_on, 2),
                    'salary'       => round($salary, 2),
                    'cash_to_bank' => round($cash_to_bank, 2),
                    'daily_cost'   => round($daily_cost, 2),
                ];

                $totalSale += $sale;
                $totalCash += $disp_cash;
                $totalBank += $disp_bank;
            }

            $online     = $onlineData[$date] ?? [];
            $ol_sales   = (float) ($online['daily_sales'] ?? 0);
            $ol_advance = (float) ($online['advance'] ?? 0);
            $ol_payment = (float) ($online['online_payment'] ?? 0);
            $ol_cod     = (float) ($online['cod'] ?? 0);

            $totalBank += $ol_advance; // online advance → bank

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
                ],
                'disbursements' => [
                    'sslzc_received'  => round($sslzc_recv, 2),
                    'pathao_received' => round($pathao_recv, 2),
                ],
                'totals' => [
                    'total_sale' => round($totalSale + $ol_sales, 2),
                    'cash'       => round($totalCash, 2),
                    'bank'       => round($totalBank, 2),
                    'final_bank' => round($final_bank, 2),
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
            'stores'  => $stores->map(fn ($s) => [
                'id'           => (int) $s->id,
                'name'         => $s->name,
                'is_warehouse' => (bool) $s->is_warehouse,
            ]),
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
            'sslzc', 'pathao' => $this->createLedgerPair(
                $date,
                $amount,
                Transaction::getBankAccountId(),
                Transaction::getAccountsReceivableAccountId(),
                AdminEntry::class,
                $entry->id,
                'Cash Sheet - ' . strtoupper($entry->type) . ' Disbursement Received',
                null,
                $createdBy,
                ['cash_sheet_type' => $entry->type, 'details' => $entry->details]
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
            ->whereDate(DB::raw('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)'), $date);

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

    private function loadBranchSales(array $ids, string $from, string $to): array
    {
        $out = [];

        $query = DB::table('orders as o')
            ->join('order_payments as op', 'op.order_id', '=', 'o.id')
            ->select(
                'op.store_id',
                DB::raw('DATE(COALESCE(op.completed_at, o.created_at)) as day'),
                'o.id as order_id',
                'o.total_amount'
            )
            ->whereIn('op.store_id', $ids)
            ->where('o.order_type', 'counter')
            ->where('op.status', 'completed')
            ->whereNotNull('op.completed_at')
            ->whereDate(DB::raw('COALESCE(op.completed_at, o.created_at)'), '>=', $from)
            ->whereDate(DB::raw('COALESCE(op.completed_at, o.created_at)'), '<=', $to);

        $this->applyCashSheetOrderScope($query, 'o', false);

        $rows = $query
            ->groupBy('op.store_id', 'day', 'o.id', 'o.total_amount')
            ->get();

        $grouped = [];
        foreach ($rows as $r) {
            $storeKey = (string) $r->store_id;
            $day = $r->day;
            $grouped[$storeKey][$day] = ($grouped[$storeKey][$day] ?? 0) + (float) $r->total_amount;
        }

        foreach ($grouped as $storeId => $days) {
            foreach ($days as $day => $total) {
                $out[$storeId][$day] = round($total, 2);
            }
        }

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

        // 1) Normal single-method payments.
        // Cancelled/refunded orders are excluded, but exchange_surplus is kept because
        // that is real extra money collected during an upgrade exchange.
        $normalPayments = DB::table('order_payments as op')
            ->join('payment_methods as pm', 'pm.id', '=', 'op.payment_method_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->select(
                'op.store_id',
                DB::raw('DATE(op.completed_at) as day'),
                'pm.type as mt',
                DB::raw('SUM(op.amount) as total')
            )
            ->whereIn('op.store_id', $ids)
            ->where('o.order_type', 'counter')
            ->whereDate('op.completed_at', '>=', $from)
            ->whereDate('op.completed_at', '<=', $to)
            ->where('op.status', 'completed')
            ->whereNotIn('op.payment_type', $excludedPaymentTypes)
            ->whereNotNull('op.completed_at');

        $this->applyCashSheetOrderScope($normalPayments, 'o', true, 'op');

        $normalPayments
            ->groupBy('op.store_id', 'day', 'pm.type')
            ->get()
            ->each($addToBucket);

        // 2) Split payments. The parent order_payments row has payment_method_id = null,
        // so the old query skipped all split parts. That made bKash/Nagad/card portions
        // disappear from Bank even though the sale total was counted.
        $splitPayments = DB::table('payment_splits as ps')
            ->join('order_payments as op', 'op.id', '=', 'ps.order_payment_id')
            ->join('payment_methods as pm', 'pm.id', '=', 'ps.payment_method_id')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->select(
                'ps.store_id',
                DB::raw('DATE(COALESCE(ps.completed_at, op.completed_at)) as day'),
                'pm.type as mt',
                DB::raw('SUM(ps.amount) as total')
            )
            ->whereIn('ps.store_id', $ids)
            ->where('o.order_type', 'counter')
            ->where('op.status', 'completed')
            ->where('ps.status', 'completed')
            ->whereNotIn('op.payment_type', $excludedPaymentTypes)
            ->whereNotNull('op.completed_at')
            ->whereDate(DB::raw('COALESCE(ps.completed_at, op.completed_at)'), '>=', $from)
            ->whereDate(DB::raw('COALESCE(ps.completed_at, op.completed_at)'), '<=', $to);

        $this->applyCashSheetOrderScope($splitPayments, 'o', true, 'op');

        $splitPayments
            ->groupBy('ps.store_id', 'day', 'pm.type')
            ->get()
            ->each($addToBucket);

        // 3) Completed cash/bank refunds must reduce the branch's visible money.
        // Store-credit and gift-card refunds do not move cash/bank immediately.
        DB::table('refunds as r')
            ->join('product_returns as pr', 'pr.id', '=', 'r.return_id')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id) as store_id'),
                DB::raw('DATE(r.completed_at) as day'),
                DB::raw("CASE WHEN r.refund_method = 'cash' THEN 'cash' ELSE 'bank' END as mt"),
                DB::raw('SUM(r.refund_amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), $ids)
            ->where('o.order_type', 'counter')
            ->whereNull('o.deleted_at')
            ->where('r.status', 'completed')
            ->whereNotNull('r.completed_at')
            ->whereNotIn('r.refund_method', ['store_credit', 'gift_card'])
            ->whereDate('r.completed_at', '>=', $from)
            ->whereDate('r.completed_at', '<=', $to)
            ->groupBy('store_id', 'day', 'mt')
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

        // Exchange upgrade/top-up: old item value was used as exchange balance and
        // only the extra customer-paid amount should appear in Ex/On.
        DB::table('order_payments as op')
            ->join('orders as o', 'o.id', '=', 'op.order_id')
            ->select(
                'op.store_id',
                DB::raw('DATE(op.completed_at) as day'),
                DB::raw('SUM(op.amount) as total')
            )
            ->whereIn('op.store_id', $ids)
            ->where('o.order_type', 'counter')
            ->whereNull('o.deleted_at')
            ->whereNotIn(DB::raw('LOWER(o.status)'), self::EXCLUDED_ORDER_STATUSES)
            ->where('op.status', 'completed')
            ->where('op.payment_type', 'exchange_surplus')
            ->whereNotNull('op.completed_at')
            ->whereDate('op.completed_at', '>=', $from)
            ->whereDate('op.completed_at', '<=', $to)
            ->groupBy('op.store_id', 'day')
            ->get()
            ->each($add);

        // Exchange downgrade/refund: show as negative Ex/On because cash/bank went out.
        DB::table('refunds as r')
            ->join('product_returns as pr', 'pr.id', '=', 'r.return_id')
            ->join('orders as o', 'o.id', '=', 'r.order_id')
            ->select(
                DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id) as store_id'),
                DB::raw('DATE(r.completed_at) as day'),
                DB::raw('SUM(r.refund_amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(pr.received_at_store_id, pr.store_id, o.store_id)'), $ids)
            ->where('o.order_type', 'counter')
            ->whereNull('o.deleted_at')
            ->where('r.status', 'completed')
            ->where('r.refund_type', 'exchange_refund')
            ->whereNotNull('r.completed_at')
            ->whereDate('r.completed_at', '>=', $from)
            ->whereDate('r.completed_at', '<=', $to)
            ->groupBy('store_id', 'day')
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
                DB::raw('DATE(COALESCE(ep.completed_at, ep.processed_at, e.expense_date)) as day'),
                'pm.type as payment_method_type',
                DB::raw('SUM(ep.amount) as total')
            )
            ->whereIn(DB::raw('COALESCE(ep.store_id, e.store_id)'), $ids)
            ->where('ep.status', 'completed')
            ->whereNotIn('e.status', ['cancelled', 'rejected'])
            ->whereDate(DB::raw('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)'), '>=', $from)
            ->whereDate(DB::raw('COALESCE(ep.completed_at, ep.processed_at, e.expense_date)'), '<=', $to);

        $this->whereNotCashSheetOrigin($accountingExpenses, 'e');

        $accountingExpenses
            ->groupBy('store_id', 'day', 'pm.type')
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

        DB::table('orders')
            ->select(
                DB::raw('DATE(created_at) as day'),
                DB::raw('SUM(total_amount) as ts'),
                DB::raw('SUM(paid_amount) as adv'),
                DB::raw('SUM(outstanding_amount) as cod')
            )
            ->where('order_type', 'social_commerce')
            ->whereNull('deleted_at')
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->whereNotIn(DB::raw('LOWER(status)'), self::EXCLUDED_ORDER_STATUSES)
            ->groupBy('day')
            ->get()
            ->each(function ($r) use (&$out) {
                $out[$r->day]['daily_sales'] = ($out[$r->day]['daily_sales'] ?? 0) + (float) $r->ts;
                $out[$r->day]['advance']     = ($out[$r->day]['advance'] ?? 0) + (float) $r->adv;
                $out[$r->day]['cod']         = ($out[$r->day]['cod'] ?? 0) + (float) $r->cod;
            });

        DB::table('orders')
            ->select(
                DB::raw('DATE(created_at) as day'),
                DB::raw('SUM(total_amount) as ts'),
                DB::raw('SUM(paid_amount) as op')
            )
            ->where('order_type', 'ecommerce')
            ->whereNull('deleted_at')
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->whereNotIn(DB::raw('LOWER(status)'), self::EXCLUDED_ORDER_STATUSES)
            ->groupBy('day')
            ->get()
            ->each(function ($r) use (&$out) {
                $out[$r->day]['daily_sales']    = ($out[$r->day]['daily_sales'] ?? 0) + (float) $r->ts;
                $out[$r->day]['online_payment'] = ($out[$r->day]['online_payment'] ?? 0) + (float) $r->op;
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
            'online'        => ['daily_sales' => 0, 'advance' => 0, 'online_payment' => 0, 'cod' => 0],
            'disbursements' => ['sslzc_received' => 0, 'pathao_received' => 0],
            'totals'        => ['total_sale' => 0, 'cash' => 0, 'bank' => 0, 'final_bank' => 0],
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
                'cash'         => 0,
                'bank'         => 0,
                'ex_on'        => 0,
                'salary'       => 0,
                'cash_to_bank' => 0,
                'daily_cost'   => 0,
            ];
        }

        foreach ($rows as $row) {
            foreach ($row['branches'] as $b) {
                foreach (['daily_sale', 'cash', 'bank', 'ex_on', 'salary', 'cash_to_bank', 'daily_cost'] as $field) {
                    $summary['branches'][$b['store_id']][$field] += (float) $b[$field];
                }
            }

            foreach (['daily_sales', 'advance', 'online_payment', 'cod'] as $field) {
                $summary['online'][$field] += (float) $row['online'][$field];
            }

            $summary['disbursements']['sslzc_received'] += (float) $row['disbursements']['sslzc_received'];
            $summary['disbursements']['pathao_received'] += (float) $row['disbursements']['pathao_received'];

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
}
