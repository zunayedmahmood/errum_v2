<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\AdminEntry;
use App\Models\BranchCostEntry;
use App\Models\Expense;
use App\Models\ExpensePayment;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\OwnerEntry;
use App\Models\ProductReturn;
use App\Models\PurchaseOrder;
use App\Models\Refund;
use App\Models\ServiceOrderPayment;
use App\Models\Transaction;
use App\Models\VendorPayment;
use App\Models\VendorPaymentItem;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Throwable;

class AccountingIntegrityCheck extends Command
{
    protected $signature = 'accounting:integrity-check
                            {--from= : Optional start date, YYYY-MM-DD}
                            {--to= : Optional end date, YYYY-MM-DD}
                            {--store_id= : Optional store id. Use global for NULL store ledgers}
                            {--fix-status : Safely sync ledger statuses when the source document is completed/cancelled/failed}
                            {--json= : Optional file path to save the full JSON report}
                            {--fail-on-warning : Return failure code when warnings exist, not only critical errors}';

    protected $description = 'Run a full operational integrity check of the accounting ledger, source documents, AP/PO, expenses, returns, and cash-sheet links.';

    private const EPSILON = 0.01;
    private const NON_CASH_ORDER_PAYMENT_TYPES = [
        'exchange_balance',
        'store_credit',
        'balance_carryover',
        'exchange_surplus',
    ];

    private array $issues = [];
    private array $summary = [];
    private int $fixedRows = 0;

    public function handle(): int
    {
        $from = $this->option('from') ? Carbon::parse($this->option('from'))->toDateString() : null;
        $to = $this->option('to') ? Carbon::parse($this->option('to'))->toDateString() : null;
        $storeId = $this->option('store_id');
        $fixStatus = (bool) $this->option('fix-status');

        if ($from && $to && $from > $to) {
            $this->error('--from cannot be after --to');
            return Command::FAILURE;
        }

        $this->summary = [
            'checked_at' => now()->toDateTimeString(),
            'period' => ['from' => $from, 'to' => $to],
            'store_id' => $storeId,
            'fix_status' => $fixStatus,
            'transactions_scanned' => 0,
            'source_documents_scanned' => 0,
            'fixed_rows' => 0,
        ];

        $this->info('Running accounting integrity check...');
        $this->line('Scope: ' . ($from || $to ? (($from ?: 'beginning') . ' → ' . ($to ?: 'today')) : 'all dates') . '; store: ' . ($storeId ?: 'all'));

        try {
            $this->checkRequiredAccounts();
            $this->checkTransactionRows($from, $to, $storeId);
            $this->checkTrialBalance($from, $to, $storeId);
            $this->checkLedgerGroups($from, $to, $storeId);
            $this->checkOrderPaymentLedgers($from, $to, $storeId, $fixStatus);
            $this->checkServicePaymentLedgers($from, $to, $storeId, $fixStatus);
            $this->checkRefundLedgers($from, $to, $storeId, $fixStatus);
            $this->checkExpensePaymentLedgers($from, $to, $storeId, $fixStatus);
            $this->checkVendorPaymentLedgers($from, $to, $fixStatus);
            $this->checkPurchaseOrderAccounting($from, $to, $storeId);
            $this->checkCashSheetAccountingLinks($from, $to, $storeId);
            $this->checkCOGSLedgers($from, $to, $storeId);
        } catch (Throwable $e) {
            $this->addIssue('critical', 'CHECK_FAILED', 'Integrity check crashed before finishing.', [
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
        }

        $this->summary['fixed_rows'] = $this->fixedRows;
        $this->printReport();
        $this->writeJsonReportIfRequested();

        $critical = $this->countBySeverity('critical');
        $warning = $this->countBySeverity('warning');

        if ($critical > 0) {
            return Command::FAILURE;
        }

        if ($warning > 0 && $this->option('fail-on-warning')) {
            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }

    private function checkRequiredAccounts(): void
    {
        $standardAccounts = [
            '1001' => ['name' => 'Cash and Cash Equivalents', 'type' => 'asset'],
            '1002' => ['name' => 'Accounts Receivable', 'type' => 'asset'],
            '1003' => ['name' => 'Inventory', 'type' => 'asset'],
            '1004' => ['name' => 'Bank Account', 'type' => 'asset'],
            '1006' => ['name' => 'Vendor Advances / Supplier Deposits', 'type' => 'asset'],
            '2001' => ['name' => 'Accounts Payable', 'type' => 'liability'],
            '2002' => ['name' => 'Tax Payable', 'type' => 'liability'],
            '3002' => ['name' => 'Owner Capital', 'type' => 'equity'],
            '4001' => ['name' => 'Sales Revenue', 'type' => 'income'],
            '5001' => ['name' => 'Operating Expenses', 'type' => 'expense'],
            '5002' => ['name' => 'Cost of Goods Sold', 'type' => 'expense'],
        ];

        foreach ($standardAccounts as $code => $expected) {
            $account = Account::where('account_code', $code)->first();
            if (!$account) {
                $this->addIssue('critical', 'MISSING_STANDARD_ACCOUNT', "Chart of accounts is missing account {$code} ({$expected['name']}).", [
                    'account_code' => $code,
                    'expected_type' => $expected['type'],
                ]);
                continue;
            }

            if (!$account->is_active) {
                $this->addIssue('critical', 'INACTIVE_STANDARD_ACCOUNT', "Required account {$code} exists but is inactive.", [
                    'account_id' => $account->id,
                    'account_code' => $code,
                    'account_name' => $account->name,
                ]);
            }

            if ($account->type !== $expected['type']) {
                $this->addIssue('critical', 'WRONG_STANDARD_ACCOUNT_TYPE', "Account {$code} has type {$account->type}; expected {$expected['type']}.", [
                    'account_id' => $account->id,
                    'account_code' => $code,
                    'account_name' => $account->name,
                    'actual_type' => $account->type,
                    'expected_type' => $expected['type'],
                ]);
            }
        }
    }

    private function checkTransactionRows(?string $from, ?string $to, $storeId): void
    {
        $query = $this->transactionScope($from, $to, $storeId);
        $this->summary['transactions_scanned'] = (clone $query)->count();

        $badAmount = (clone $query)->where(function ($q) {
            $q->whereNull('amount')->orWhere('amount', '<=', 0);
        })->get();
        foreach ($badAmount as $transaction) {
            $this->addIssue('critical', 'BAD_TRANSACTION_AMOUNT', 'Transaction amount must be positive.', $this->transactionContext($transaction));
        }

        $missingAccount = (clone $query)->whereNull('account_id')->get();
        foreach ($missingAccount as $transaction) {
            $this->addIssue('critical', 'MISSING_TRANSACTION_ACCOUNT', 'Completed/pending transaction has no account_id.', $this->transactionContext($transaction));
        }

        $inactiveAccountRows = (clone $query)->with('account')->get()->filter(function (Transaction $transaction) {
            return $transaction->account && !$transaction->account->is_active;
        });
        foreach ($inactiveAccountRows as $transaction) {
            $this->addIssue('warning', 'INACTIVE_ACCOUNT_USED', 'Transaction is posted to an inactive account.', $this->transactionContext($transaction));
        }

        $invalidTypes = (clone $query)->whereNotIn('type', ['debit', 'credit'])->get();
        foreach ($invalidTypes as $transaction) {
            $this->addIssue('critical', 'INVALID_TRANSACTION_TYPE', 'Transaction type must be debit or credit.', $this->transactionContext($transaction));
        }
    }

    private function checkTrialBalance(?string $from, ?string $to, $storeId): void
    {
        $query = $this->transactionScope($from, $to, $storeId)->where('status', 'completed');
        $debits = (clone $query)->where('type', 'debit')->sum('amount');
        $credits = (clone $query)->where('type', 'credit')->sum('amount');
        $difference = round((float) $debits - (float) $credits, 2);

        $this->summary['trial_balance'] = [
            'debits' => round((float) $debits, 2),
            'credits' => round((float) $credits, 2),
            'difference' => $difference,
            'is_balanced' => abs($difference) <= self::EPSILON,
        ];

        if (abs($difference) > self::EPSILON) {
            $this->addIssue('critical', 'TRIAL_BALANCE_NOT_BALANCED', 'Completed ledger is not balanced.', $this->summary['trial_balance']);
        }
    }

    private function checkLedgerGroups(?string $from, ?string $to, $storeId): void
    {
        $transactions = $this->transactionScope($from, $to, $storeId)
            ->where('status', 'completed')
            ->orderBy('id')
            ->get();

        $groups = [];
        foreach ($transactions as $transaction) {
            $metadata = is_array($transaction->metadata) ? $transaction->metadata : [];
            $groupId = $metadata['group_id'] ?? null;
            $key = $groupId ? 'group:' . $groupId : 'reference:' . $transaction->reference_type . '#' . $transaction->reference_id;

            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'key' => $key,
                    'reference_type' => $transaction->reference_type,
                    'reference_id' => $transaction->reference_id,
                    'transaction_ids' => [],
                    'debit' => 0.0,
                    'credit' => 0.0,
                    'has_group_id' => (bool) $groupId,
                ];
            }

            $groups[$key]['transaction_ids'][] = $transaction->id;
            if ($transaction->type === 'debit') {
                $groups[$key]['debit'] += (float) $transaction->amount;
            } else {
                $groups[$key]['credit'] += (float) $transaction->amount;
            }
        }

        $unbalancedGroups = 0;
        foreach ($groups as $group) {
            $diff = round($group['debit'] - $group['credit'], 2);
            if (abs($diff) > self::EPSILON) {
                $unbalancedGroups++;
                $this->addIssue('critical', 'UNBALANCED_LEDGER_GROUP', 'A double-entry group/reference is not balanced.', [
                    'group_key' => $group['key'],
                    'reference_type' => $group['reference_type'],
                    'reference_id' => $group['reference_id'],
                    'debit' => round($group['debit'], 2),
                    'credit' => round($group['credit'], 2),
                    'difference' => $diff,
                    'transaction_ids' => array_slice($group['transaction_ids'], 0, 20),
                ]);
            }
        }

        $this->summary['ledger_groups'] = [
            'groups_scanned' => count($groups),
            'unbalanced_groups' => $unbalancedGroups,
        ];
    }

    private function checkOrderPaymentLedgers(?string $from, ?string $to, $storeId, bool $fixStatus): void
    {
        $query = OrderPayment::with('order')
            ->whereNotIn('payment_type', self::NON_CASH_ORDER_PAYMENT_TYPES);
        $this->sourceDateScope($query, $from, $to, 'created_at');
        $this->sourceStoreScope($query, $storeId);

        $query->chunkById(100, function ($payments) use ($fixStatus) {
            foreach ($payments as $payment) {
                $this->summary['source_documents_scanned']++;

                if ($payment->status === 'completed') {
                    $this->assertReferenceBalanced(OrderPayment::class, $payment->id, 'Completed order payment has missing or unbalanced ledger.', [
                        'payment_number' => $payment->payment_number,
                        'order_number' => $payment->order->order_number ?? null,
                        'amount' => (float) $payment->amount,
                    ], $fixStatus, 'completed', $payment->completed_at ?: now());
                }

                if (in_array($payment->status, ['cancelled', 'failed'], true)) {
                    $this->assertNoActiveLedger(OrderPayment::class, $payment->id, 'Cancelled/failed order payment still has completed ledger.', [
                        'payment_number' => $payment->payment_number,
                        'status' => $payment->status,
                    ], $fixStatus);
                }
            }
        });
    }

    private function checkServicePaymentLedgers(?string $from, ?string $to, $storeId, bool $fixStatus): void
    {
        $query = ServiceOrderPayment::query();
        $this->sourceDateScope($query, $from, $to, 'created_at');
        $this->sourceStoreScope($query, $storeId);

        $query->chunkById(100, function ($payments) use ($fixStatus) {
            foreach ($payments as $payment) {
                $this->summary['source_documents_scanned']++;

                if ($payment->status === 'completed') {
                    $this->assertReferenceBalanced(ServiceOrderPayment::class, $payment->id, 'Completed service payment has missing or unbalanced ledger.', [
                        'payment_number' => $payment->payment_number,
                        'amount' => (float) $payment->amount,
                    ], $fixStatus, 'completed', $payment->completed_at ?: now());
                }

                if (in_array($payment->status, ['cancelled', 'failed'], true)) {
                    $this->assertNoActiveLedger(ServiceOrderPayment::class, $payment->id, 'Cancelled/failed service payment still has completed ledger.', [
                        'payment_number' => $payment->payment_number,
                        'status' => $payment->status,
                    ], $fixStatus);
                }
            }
        });
    }

    private function checkRefundLedgers(?string $from, ?string $to, $storeId, bool $fixStatus): void
    {
        $query = Refund::where('refund_type', '!=', 'exchange_refund');
        $this->sourceDateScope($query, $from, $to, 'created_at');
        if ($storeId && $storeId !== 'global') {
            $query->whereHas('order', fn ($q) => $q->where('store_id', $storeId));
        }

        $query->chunkById(100, function ($refunds) use ($fixStatus) {
            foreach ($refunds as $refund) {
                $this->summary['source_documents_scanned']++;

                if ($refund->status === 'completed') {
                    $this->assertReferenceBalanced(Refund::class, $refund->id, 'Completed refund has missing or unbalanced ledger.', [
                        'refund_number' => $refund->refund_number,
                        'amount' => (float) $refund->refund_amount,
                    ], $fixStatus, 'completed', $refund->completed_at ?: now());
                }

                if (in_array($refund->status, ['cancelled', 'failed'], true)) {
                    $this->assertNoActiveLedger(Refund::class, $refund->id, 'Cancelled/failed refund still has completed ledger.', [
                        'refund_number' => $refund->refund_number,
                        'status' => $refund->status,
                    ], $fixStatus);
                }
            }
        });
    }

    private function checkExpensePaymentLedgers(?string $from, ?string $to, $storeId, bool $fixStatus): void
    {
        $query = ExpensePayment::with('expense');
        $this->sourceDateScope($query, $from, $to, 'created_at');
        $this->sourceStoreScope($query, $storeId);

        $query->chunkById(100, function ($payments) use ($fixStatus) {
            foreach ($payments as $payment) {
                $this->summary['source_documents_scanned']++;

                if ($payment->status === 'completed') {
                    $this->assertReferenceBalanced(ExpensePayment::class, $payment->id, 'Completed expense payment has missing or unbalanced ledger.', [
                        'payment_number' => $payment->payment_number,
                        'expense_number' => $payment->expense->expense_number ?? null,
                        'amount' => (float) $payment->amount,
                    ], $fixStatus, 'completed', $payment->completed_at ?: now());
                }

                if (in_array($payment->status, ['cancelled', 'failed'], true)) {
                    $this->assertNoActiveLedger(ExpensePayment::class, $payment->id, 'Cancelled/failed expense payment still has completed ledger.', [
                        'payment_number' => $payment->payment_number,
                        'status' => $payment->status,
                    ], $fixStatus);
                }
            }
        });
    }

    private function checkVendorPaymentLedgers(?string $from, ?string $to, bool $fixStatus): void
    {
        $query = VendorPayment::query();
        $this->sourceDateScope($query, $from, $to, 'payment_date');

        $query->chunkById(100, function ($payments) use ($fixStatus) {
            foreach ($payments as $payment) {
                $this->summary['source_documents_scanned']++;

                if ($payment->status === 'completed' && $payment->payment_type !== 'refund') {
                    $this->assertReferenceBalanced(VendorPayment::class, $payment->id, 'Completed vendor payment has missing or unbalanced ledger.', [
                        'payment_number' => $payment->payment_number,
                        'amount' => (float) $payment->amount,
                        'payment_type' => $payment->payment_type,
                    ], $fixStatus, 'completed', $payment->processed_at ?: $payment->payment_date ?: now());
                }

                if (in_array($payment->status, ['cancelled', 'failed'], true)) {
                    $this->assertNoActiveLedger(VendorPayment::class, $payment->id, 'Cancelled/failed vendor payment still has completed ledger.', [
                        'payment_number' => $payment->payment_number,
                        'status' => $payment->status,
                    ], $fixStatus);
                }

                if ($payment->status === 'refunded') {
                    $this->assertReferenceBalanced(VendorPayment::class, $payment->id, 'Refunded vendor payment reversal is missing or unbalanced.', [
                        'payment_number' => $payment->payment_number,
                        'status' => $payment->status,
                    ], false, null, null, true);
                }
            }
        });

        VendorPaymentItem::with(['vendorPayment', 'purchaseOrder'])->chunkById(100, function ($items) {
            foreach ($items as $item) {
                if (!$item->vendorPayment || !$item->purchaseOrder) {
                    $this->addIssue('critical', 'BROKEN_VENDOR_PAYMENT_ALLOCATION', 'Vendor payment allocation points to missing payment or PO.', [
                        'vendor_payment_item_id' => $item->id,
                        'vendor_payment_id' => $item->vendor_payment_id,
                        'purchase_order_id' => $item->purchase_order_id,
                    ]);
                    continue;
                }

                if ($item->allocated_amount <= 0 && $item->vendorPayment->payment_type !== 'refund') {
                    $this->addIssue('warning', 'NON_POSITIVE_VENDOR_ALLOCATION', 'Vendor payment allocation is zero or negative.', [
                        'vendor_payment_item_id' => $item->id,
                        'payment_number' => $item->vendorPayment->payment_number,
                        'po_number' => $item->purchaseOrder->po_number,
                        'allocated_amount' => (float) $item->allocated_amount,
                    ]);
                }
            }
        });
    }

    private function checkPurchaseOrderAccounting(?string $from, ?string $to, $storeId): void
    {
        $query = PurchaseOrder::with(['items', 'vendor'])
            ->whereIn('status', ['partially_received', 'received']);
        $this->sourceDateScope($query, $from, $to, 'created_at');
        $this->sourceStoreScope($query, $storeId);

        $inventoryAccount = Account::where('account_code', '1003')->where('is_active', true)->first();
        $apAccount = Account::where('account_code', '2001')->where('is_active', true)->first();

        $query->chunkById(50, function ($purchaseOrders) use ($inventoryAccount, $apAccount) {
            foreach ($purchaseOrders as $po) {
                $this->summary['source_documents_scanned']++;

                $receivedLines = $this->buildFullReceivedLines($po);
                $receivedValue = $po->calculateReceiptLedgerAmount($receivedLines);
                if ($receivedValue <= 0) {
                    continue;
                }

                $ledgerRows = Transaction::where('reference_type', PurchaseOrder::class)
                    ->where('reference_id', $po->id)
                    ->where('status', 'completed')
                    ->get()
                    ->filter(fn (Transaction $tx) => (($tx->metadata['source'] ?? null) === 'purchase_order_receipt'));

                if ($ledgerRows->isEmpty()) {
                    $this->addIssue('critical', 'PO_RECEIPT_LEDGER_MISSING', 'Received PO has no Inventory/AP receipt ledger.', [
                        'purchase_order_id' => $po->id,
                        'po_number' => $po->po_number,
                        'vendor' => $po->vendor->name ?? null,
                        'received_value' => round($receivedValue, 2),
                    ]);
                    continue;
                }

                $debit = round((float) $ledgerRows->where('type', 'debit')->sum('amount'), 2);
                $credit = round((float) $ledgerRows->where('type', 'credit')->sum('amount'), 2);
                if (abs($debit - $credit) > self::EPSILON) {
                    $this->addIssue('critical', 'PO_RECEIPT_LEDGER_UNBALANCED', 'PO receipt ledger is not balanced.', [
                        'purchase_order_id' => $po->id,
                        'po_number' => $po->po_number,
                        'debit' => $debit,
                        'credit' => $credit,
                        'difference' => round($debit - $credit, 2),
                    ]);
                }

                if ($inventoryAccount && $ledgerRows->where('type', 'debit')->where('account_id', $inventoryAccount->id)->sum('amount') <= 0) {
                    $this->addIssue('critical', 'PO_RECEIPT_NO_INVENTORY_DEBIT', 'PO receipt ledger is missing Inventory debit.', [
                        'purchase_order_id' => $po->id,
                        'po_number' => $po->po_number,
                    ]);
                }

                if ($apAccount && $ledgerRows->where('type', 'credit')->where('account_id', $apAccount->id)->sum('amount') <= 0) {
                    $this->addIssue('critical', 'PO_RECEIPT_NO_AP_CREDIT', 'PO receipt ledger is missing Accounts Payable credit.', [
                        'purchase_order_id' => $po->id,
                        'po_number' => $po->po_number,
                    ]);
                }

                $bookedReceipt = round((float) $ledgerRows->where('type', 'debit')->sum('amount'), 2);
                if (abs($bookedReceipt - $receivedValue) > 1.00) {
                    $this->addIssue('warning', 'PO_RECEIPT_VALUE_MISMATCH', 'PO received value and booked inventory receipt value do not match. This may indicate historical pre-fix PO data or duplicate/missing receipt entries.', [
                        'purchase_order_id' => $po->id,
                        'po_number' => $po->po_number,
                        'calculated_received_value' => round($receivedValue, 2),
                        'booked_receipt_value' => $bookedReceipt,
                        'difference' => round($bookedReceipt - $receivedValue, 2),
                    ]);
                }
            }
        });

        $this->checkAccountsPayableControlBalance();
    }

    private function checkAccountsPayableControlBalance(): void
    {
        $apAccount = Account::where('account_code', '2001')->where('is_active', true)->first();
        if (!$apAccount) {
            return;
        }

        $apDebit = Transaction::where('account_id', $apAccount->id)->where('status', 'completed')->where('type', 'debit')->sum('amount');
        $apCredit = Transaction::where('account_id', $apAccount->id)->where('status', 'completed')->where('type', 'credit')->sum('amount');
        $ledgerPayableBalance = round((float) $apCredit - (float) $apDebit, 2);
        $poOutstanding = round((float) PurchaseOrder::whereIn('status', ['partially_received', 'received'])->sum('outstanding_amount'), 2);

        $this->summary['accounts_payable_control'] = [
            'ledger_credit_balance' => $ledgerPayableBalance,
            'po_outstanding_amount' => $poOutstanding,
            'difference' => round($ledgerPayableBalance - $poOutstanding, 2),
        ];

        if (abs($ledgerPayableBalance - $poOutstanding) > 1.00) {
            $this->addIssue('warning', 'AP_CONTROL_MISMATCH', 'Accounts Payable ledger balance does not match received PO outstanding amount. Historical paid POs, advances, or pre-fix data may need backfill/reconciliation.', $this->summary['accounts_payable_control']);
        }
    }

    private function checkCashSheetAccountingLinks(?string $from, ?string $to, $storeId): void
    {
        $branchCostQuery = BranchCostEntry::query();
        $this->sourceDateScope($branchCostQuery, $from, $to, 'entry_date');
        $this->sourceStoreScope($branchCostQuery, $storeId);

        $branchCostQuery->chunkById(100, function ($entries) {
            foreach ($entries as $entry) {
                $expense = $this->findCashSheetExpenseForBranchCost($entry);
                if (!$expense) {
                    $this->addIssue('critical', 'BRANCH_COST_EXPENSE_MISSING', 'Cash-sheet branch daily cost is not linked to an Expense record.', [
                        'branch_cost_entry_id' => $entry->id,
                        'entry_date' => optional($entry->entry_date)->toDateString(),
                        'store_id' => $entry->store_id,
                        'amount' => (float) $entry->amount,
                    ]);
                    continue;
                }

                $payment = ExpensePayment::where('expense_id', $expense->id)->where('status', 'completed')->first();
                if (!$payment) {
                    $this->addIssue('critical', 'BRANCH_COST_EXPENSE_PAYMENT_MISSING', 'Cash-sheet branch daily cost expense has no completed ExpensePayment.', [
                        'branch_cost_entry_id' => $entry->id,
                        'expense_id' => $expense->id,
                        'expense_number' => $expense->expense_number,
                    ]);
                    continue;
                }

                $this->assertReferenceBalanced(ExpensePayment::class, $payment->id, 'Cash-sheet branch daily cost payment ledger is missing or unbalanced.', [
                    'branch_cost_entry_id' => $entry->id,
                    'expense_id' => $expense->id,
                    'payment_id' => $payment->id,
                    'amount' => (float) $entry->amount,
                ], false);
            }
        });

        $adminQuery = AdminEntry::query();
        $this->sourceDateScope($adminQuery, $from, $to, 'entry_date');
        $this->sourceStoreScope($adminQuery, $storeId);
        $adminQuery->chunkById(100, function ($entries) {
            foreach ($entries as $entry) {
                $this->assertReferenceBalanced(AdminEntry::class, $entry->id, 'Cash-sheet admin entry ledger is missing or unbalanced.', [
                    'admin_entry_id' => $entry->id,
                    'entry_date' => optional($entry->entry_date)->toDateString(),
                    'type' => $entry->type,
                    'amount' => (float) $entry->amount,
                ], false);
            }
        });

        $ownerQuery = OwnerEntry::query();
        $this->sourceDateScope($ownerQuery, $from, $to, 'entry_date');
        $ownerQuery->chunkById(100, function ($entries) {
            foreach ($entries as $entry) {
                $this->assertReferenceBalanced(OwnerEntry::class, $entry->id, 'Cash-sheet owner entry ledger is missing or unbalanced.', [
                    'owner_entry_id' => $entry->id,
                    'entry_date' => optional($entry->entry_date)->toDateString(),
                    'type' => $entry->type,
                    'amount' => (float) $entry->amount,
                ], false);
            }
        });
    }

    private function checkCOGSLedgers(?string $from, ?string $to, $storeId): void
    {
        $query = Order::with('items')
            ->where('status', 'completed');
        $this->sourceDateScope($query, $from, $to, 'created_at');
        $this->sourceStoreScope($query, $storeId);

        $query->chunkById(100, function ($orders) {
            foreach ($orders as $order) {
                $expectedCOGS = round((float) $order->items->sum('cogs'), 2);
                if ($expectedCOGS <= 0) {
                    continue;
                }

                $exchangeCOGSExists = Transaction::where('account_id', Account::where('account_code', '5002')->value('id'))
                    ->where('reference_type', ProductReturn::class)
                    ->where('status', 'completed')
                    ->get()
                    ->contains(function (Transaction $tx) use ($order) {
                        return (int) (($tx->metadata['new_order_id'] ?? 0)) === (int) $order->id;
                    });

                if ($exchangeCOGSExists) {
                    continue;
                }

                $rows = Transaction::where('reference_type', Order::class)
                    ->where('reference_id', $order->id)
                    ->where('status', 'completed')
                    ->get();
                $debit = round((float) $rows->where('type', 'debit')->sum('amount'), 2);
                $credit = round((float) $rows->where('type', 'credit')->sum('amount'), 2);

                if ($rows->isEmpty()) {
                    $this->addIssue('warning', 'ORDER_COGS_LEDGER_MISSING', 'Completed order has no COGS/Inventory ledger. P&L gross profit may be overstated.', [
                        'order_id' => $order->id,
                        'order_number' => $order->order_number,
                        'expected_cogs' => $expectedCOGS,
                    ]);
                    continue;
                }

                if (abs($debit - $credit) > self::EPSILON) {
                    $this->addIssue('critical', 'ORDER_COGS_LEDGER_UNBALANCED', 'Order COGS ledger is not balanced.', [
                        'order_id' => $order->id,
                        'order_number' => $order->order_number,
                        'debit' => $debit,
                        'credit' => $credit,
                    ]);
                }
            }
        });
    }

    private function assertReferenceBalanced(
        string $referenceType,
        int $referenceId,
        string $message,
        array $context = [],
        bool $fixStatus = false,
        ?string $fixToStatus = null,
        $transactionDate = null,
        bool $allowExistingPlusReversal = false
    ): void {
        $allRows = Transaction::byReference($referenceType, $referenceId)->get();

        if ($allRows->isEmpty()) {
            $this->addIssue('critical', 'SOURCE_LEDGER_MISSING', $message, array_merge($context, [
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]));
            return;
        }

        if ($fixStatus && $fixToStatus) {
            $updates = ['status' => $fixToStatus];
            if ($transactionDate) {
                $updates['transaction_date'] = Carbon::parse($transactionDate)->toDateString();
            }
            $this->fixedRows += Transaction::byReference($referenceType, $referenceId)->update($updates);
            $allRows = Transaction::byReference($referenceType, $referenceId)->get();
        }

        $pendingRows = $allRows->whereNotIn('status', ['completed']);
        if ($fixToStatus === 'completed' && $pendingRows->isNotEmpty()) {
            $this->addIssue('warning', 'SOURCE_LEDGER_STATUS_MISMATCH', 'Source document is completed but some related ledger rows are not completed. Run with --fix-status to repair safely.', array_merge($context, [
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'non_completed_transaction_ids' => $pendingRows->pluck('id')->values()->all(),
            ]));
        }

        $completed = $allRows->where('status', 'completed');
        if ($completed->isEmpty()) {
            $this->addIssue('critical', 'SOURCE_LEDGER_NO_COMPLETED_ROWS', $message, array_merge($context, [
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]));
            return;
        }

        $debit = round((float) $completed->where('type', 'debit')->sum('amount'), 2);
        $credit = round((float) $completed->where('type', 'credit')->sum('amount'), 2);
        $diff = round($debit - $credit, 2);
        if (abs($diff) > self::EPSILON) {
            $severity = $allowExistingPlusReversal ? 'warning' : 'critical';
            $this->addIssue($severity, 'SOURCE_LEDGER_UNBALANCED', $message, array_merge($context, [
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'debit' => $debit,
                'credit' => $credit,
                'difference' => $diff,
                'completed_transaction_ids' => $completed->pluck('id')->values()->all(),
            ]));
        }
    }

    private function assertNoActiveLedger(string $referenceType, int $referenceId, string $message, array $context = [], bool $fixStatus = false): void
    {
        $completedRows = Transaction::byReference($referenceType, $referenceId)
            ->where('status', 'completed')
            ->get();

        if ($completedRows->isEmpty()) {
            return;
        }

        if ($fixStatus) {
            $this->fixedRows += Transaction::byReference($referenceType, $referenceId)->update(['status' => 'cancelled']);
            return;
        }

        $this->addIssue('critical', 'CANCELLED_SOURCE_HAS_ACTIVE_LEDGER', $message, array_merge($context, [
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'completed_transaction_ids' => $completedRows->pluck('id')->values()->all(),
        ]));
    }

    private function transactionScope(?string $from, ?string $to, $storeId): Builder
    {
        $query = Transaction::query();

        if ($from) {
            $query->whereDate('transaction_date', '>=', $from);
        }
        if ($to) {
            $query->whereDate('transaction_date', '<=', $to);
        }

        if ($storeId !== null && $storeId !== '') {
            if ($storeId === 'global' || $storeId === 'NULL') {
                $query->whereNull('store_id');
            } else {
                $query->where('store_id', $storeId);
            }
        }

        return $query;
    }

    private function sourceDateScope($query, ?string $from, ?string $to, string $column): void
    {
        if ($from) {
            $query->whereDate($column, '>=', $from);
        }
        if ($to) {
            $query->whereDate($column, '<=', $to);
        }
    }

    private function sourceStoreScope($query, $storeId): void
    {
        if ($storeId === null || $storeId === '') {
            return;
        }
        if ($storeId === 'global' || $storeId === 'NULL') {
            $query->whereNull('store_id');
            return;
        }
        $query->where('store_id', $storeId);
    }

    private function buildFullReceivedLines(PurchaseOrder $po): array
    {
        $lines = [];

        foreach ($po->items as $item) {
            $receivedQuantity = (int) $item->quantity_received;
            if ($receivedQuantity <= 0) {
                continue;
            }

            $orderedQuantity = max(1, (int) $item->quantity_ordered);
            $lineGross = round(((float) $item->unit_cost) * $receivedQuantity, 2);
            $lineTax = round(((float) $item->tax_amount) * ($receivedQuantity / $orderedQuantity), 2);
            $lineDiscount = round(((float) $item->discount_amount) * ($receivedQuantity / $orderedQuantity), 2);

            $lines[] = [
                'item_id' => $item->id,
                'product_id' => $item->product_id,
                'quantity_received' => $receivedQuantity,
                'unit_cost' => (float) $item->unit_cost,
                'gross_amount' => $lineGross,
                'tax_amount' => $lineTax,
                'discount_amount' => $lineDiscount,
                'net_amount' => round($lineGross + $lineTax - $lineDiscount, 2),
            ];
        }

        return $lines;
    }

    private function findCashSheetExpenseForBranchCost(BranchCostEntry $entry): ?Expense
    {
        return Expense::where(function ($query) use ($entry) {
            $needle1 = '"cash_sheet_branch_cost_entry_id":' . (int) $entry->id;
            $needle2 = '"cash_sheet_branch_cost_entry_id":"' . (int) $entry->id . '"';
            $query->whereRaw('CAST(metadata AS CHAR) LIKE ?', ['%' . $needle1 . '%'])
                ->orWhereRaw('CAST(metadata AS CHAR) LIKE ?', ['%' . $needle2 . '%']);
        })
            ->whereRaw('CAST(metadata AS CHAR) LIKE ?', ['%cash_sheet_branch_cost%'])
            ->first();
    }

    private function transactionContext(Transaction $transaction): array
    {
        return [
            'transaction_id' => $transaction->id,
            'transaction_number' => $transaction->transaction_number,
            'transaction_date' => optional($transaction->transaction_date)->toDateString(),
            'type' => $transaction->type,
            'amount' => (float) $transaction->amount,
            'account_id' => $transaction->account_id,
            'reference_type' => $transaction->reference_type,
            'reference_id' => $transaction->reference_id,
            'status' => $transaction->status,
        ];
    }

    private function addIssue(string $severity, string $code, string $message, array $context = []): void
    {
        $this->issues[] = [
            'severity' => $severity,
            'code' => $code,
            'message' => $message,
            'context' => $context,
        ];
    }

    private function countBySeverity(string $severity): int
    {
        return count(array_filter($this->issues, fn ($issue) => $issue['severity'] === $severity));
    }

    private function printReport(): void
    {
        $critical = $this->countBySeverity('critical');
        $warning = $this->countBySeverity('warning');
        $info = $this->countBySeverity('info');

        $this->newLine();
        $this->info('Accounting integrity check summary');
        $this->table(
            ['Critical', 'Warning', 'Info', 'Fixed Rows', 'Transactions Scanned', 'Source Docs Scanned'],
            [[$critical, $warning, $info, $this->fixedRows, $this->summary['transactions_scanned'], $this->summary['source_documents_scanned']]]
        );

        if (isset($this->summary['trial_balance'])) {
            $tb = $this->summary['trial_balance'];
            $this->table(['Trial Balance Debit', 'Trial Balance Credit', 'Difference', 'Balanced'], [[
                number_format($tb['debits'], 2),
                number_format($tb['credits'], 2),
                number_format($tb['difference'], 2),
                $tb['is_balanced'] ? 'YES' : 'NO',
            ]]);
        }

        if (isset($this->summary['accounts_payable_control'])) {
            $ap = $this->summary['accounts_payable_control'];
            $this->table(['AP Ledger Credit Balance', 'PO Outstanding', 'Difference'], [[
                number_format($ap['ledger_credit_balance'], 2),
                number_format($ap['po_outstanding_amount'], 2),
                number_format($ap['difference'], 2),
            ]]);
        }

        if (empty($this->issues)) {
            $this->info('PASS: no accounting integrity issues found in the selected scope.');
            return;
        }

        $rows = array_map(function ($issue) {
            return [
                strtoupper($issue['severity']),
                $issue['code'],
                $issue['message'],
                json_encode($issue['context'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ];
        }, array_slice($this->issues, 0, 50));

        $this->table(['Severity', 'Code', 'Message', 'Context'], $rows);

        if (count($this->issues) > 50) {
            $this->warn('Showing first 50 issues only. Use --json=/path/report.json for full details.');
        }

        if (!$this->option('fix-status') && $this->hasStatusFixableIssues()) {
            $this->warn('Some issues are safe status mismatches. Run again with --fix-status to complete/cancel related ledger rows according to source document status.');
        }
    }

    private function hasStatusFixableIssues(): bool
    {
        foreach ($this->issues as $issue) {
            if (in_array($issue['code'], ['SOURCE_LEDGER_STATUS_MISMATCH', 'CANCELLED_SOURCE_HAS_ACTIVE_LEDGER'], true)) {
                return true;
            }
        }
        return false;
    }

    private function writeJsonReportIfRequested(): void
    {
        $path = $this->option('json');
        if (!$path) {
            return;
        }

        $report = [
            'summary' => $this->summary,
            'issue_counts' => [
                'critical' => $this->countBySeverity('critical'),
                'warning' => $this->countBySeverity('warning'),
                'info' => $this->countBySeverity('info'),
            ],
            'issues' => $this->issues,
        ];

        $dir = dirname($path);
        if ($dir && $dir !== '.' && !File::exists($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        File::put($path, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $this->info("Full JSON report written to {$path}");
    }
}
