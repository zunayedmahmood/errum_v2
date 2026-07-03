<?php

namespace App\Models;

use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;
use App\Traits\AutoLogsActivity;
use App\Models\OrderPayment;
use App\Models\Refund;
use App\Models\ProductReturn;
use App\Models\Order;
use App\Models\Store;
use App\Models\Employee;
use App\Models\Account;
use App\Services\AccountingPostingService;

class Transaction extends Model
{
    use HasFactory, DatabaseAgnosticSearch, AutoLogsActivity;

    protected $fillable = [
        'transaction_number',
        'transaction_date',
        'amount',
        'type',
        'account_id',
        'reference_type',
        'reference_id',
        'description',
        'store_id',
        'created_by',
        'metadata',
        'status',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'transaction_date' => 'date',
        'metadata' => 'array',
    ];

    protected $appends = ['reference_label', 'display_id'];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($transaction) {
            if (empty($transaction->transaction_number)) {
                $transaction->transaction_number = static::generateTransactionNumber();
            }

            if (empty($transaction->transaction_date)) {
                $transaction->transaction_date = now()->toDateString();
            }
        });
    }

    // Relationships
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by');
    }

    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    // Accessors for metadata-driven features
    public function getGroupIdAttribute(): ?string
    {
        return $this->metadata['group_id'] ?? null;
    }

    public function getAttachmentsAttribute(): array
    {
        return $this->metadata['attachments'] ?? [];
    }

    public function getAdditionalReferencesAttribute(): array
    {
        return $this->metadata['additional_references'] ?? [];
    }

    /**
     * Get all transactions belonging to the same business event group.
     * Groups by group_id (if exists) or by reference_type/reference_id.
     */
    public function getRelatedTransactions()
    {
        $groupId = $this->group_id;
        
        if ($groupId) {
            return static::where('metadata->group_id', $groupId)
                ->with(['account', 'store', 'createdBy'])
                ->orderBy('id', 'asc')
                ->get();
        }

        return static::where('reference_type', $this->reference_type)
            ->where('reference_id', $this->reference_id)
            ->with(['account', 'store', 'createdBy'])
            ->orderBy('id', 'asc')
            ->get();
    }

    // Human-readable labels for reference types
    public function getReferenceLabelAttribute(): string
    {
        // Check for manual reference type set in metadata or directly
        if ($this->reference_type === 'manual') return 'Manual Entry';
        
        $type = $this->reference_type;
        
        // Handle full class names if present
        if (str_contains($type, '\\')) {
            $type = class_basename($type);
        }

        return match ($type) {
            'OrderPayment', 'ServiceOrderPayment' => 'Order Payment',
            'Expense' => 'Expense',
            'ExpensePayment' => 'Expense Payment',
            'Refund' => 'Refund',
            'ProductReturn' => 'Product Return',
            'VendorPayment' => 'Vendor Payment',
            'Order' => 'Store Order',
            'PurchaseOrder' => 'Purchase Order',
            'manual' => 'Manual Entry',
            default => $type ?: 'N/A'
        };
    }

    // Human-readable display ID
    public function getDisplayIdAttribute(): string
    {
        $year = $this->transaction_date ? $this->transaction_date->format('Y') : date('Y');
        return "TXN-{$year}-" . str_pad($this->id, 4, '0', STR_PAD_LEFT);
    }

    // Scopes
    public function scopeDebit($query)
    {
        return $query->where('type', 'debit');
    }

    public function scopeCredit($query)
    {
        return $query->where('type', 'credit');
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    public function scopeByAccount($query, $accountId)
    {
        return $query->where('account_id', $accountId);
    }

    public function scopeByStore($query, $storeId)
    {
        if ($storeId === 'all' || $storeId === '' || $storeId === null) {
            return $query;
        }
        
        if ($storeId === 'global' || $storeId === 'errum' || $storeId === 'NULL') {
            return $query->whereNull('store_id');
        }

        return $query->where('store_id', $storeId);
    }

    public function scopeByReference($query, $referenceType, $referenceId)
    {
        return $query->where('reference_type', $referenceType)
                    ->where('reference_id', $referenceId);
    }

    public function scopeByDateRange($query, $startDate, $endDate)
    {
        return $query->whereBetween('transaction_date', [$startDate, $endDate]);
    }

    public function scopeThisMonth($query)
    {
        return $query->whereMonth('transaction_date', now()->month)
                    ->whereYear('transaction_date', now()->year);
    }

    public function scopeThisYear($query)
    {
        return $query->whereYear('transaction_date', now()->year);
    }

    // Business logic methods
    public function complete(): bool
    {
        if ($this->status !== 'pending') {
            return false;
        }

        $this->status = 'completed';
        return $this->save();
    }

    public function fail(string $reason = null): bool
    {
        if ($this->status === 'completed') {
            return false;
        }

        $this->status = 'failed';
        $this->metadata = array_merge($this->metadata ?? [], ['failure_reason' => $reason]);
        return $this->save();
    }

    public function cancel(string $reason = null): bool
    {
        if ($this->status === 'completed') {
            return false;
        }

        $this->status = 'cancelled';
        $this->metadata = array_merge($this->metadata ?? [], ['cancellation_reason' => $reason]);
        return $this->save();
    }

    public function isDebit(): bool
    {
        return $this->type === 'debit';
    }

    public function isCredit(): bool
    {
        return $this->type === 'credit';
    }

    // Static methods for creating transactions
    public static function createFromOrderPayment(OrderPayment $payment): self
    {
        return app(AccountingPostingService::class)->postOrderPayment($payment) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'Order payment ledger skipped — no amount or non-cash internal settlement',
        ]);
    }

    public static function createFromServiceOrderPayment(ServiceOrderPayment $payment): self
    {
        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $payment->completed_at ?? $payment->processed_at ?? now();
        $cashAccountId = static::getSettlementAccountIdForPaymentMethod($payment->paymentMethod, $payment->store_id);
        $serviceRevenueAccountId = static::getServiceRevenueAccountId();
        $groupId = (string) Str::uuid();

        $metadata = [
            'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
            'service_order_number' => $payment->serviceOrder->order_number ?? null,
            'customer_name' => $payment->customer->name ?? null,
            'group_id' => $groupId,
        ];

        // DOUBLE-ENTRY BOOKKEEPING:
        // 1. Debit Cash Account (Asset increases)
        $debitTransaction = static::create([
            'transaction_date' => $transactionDate,
            'amount' => $payment->amount,
            'type' => 'debit',
            'account_id' => $cashAccountId,
            'reference_type' => ServiceOrderPayment::class,
            'reference_id' => $payment->id,
            'description' => "Service Order Payment - {$payment->payment_number}",
            'store_id' => $payment->store_id,
            'created_by' => $payment->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 2. Credit Service Revenue Account (Income increases)
        static::create([
            'transaction_date' => $transactionDate,
            'amount' => $payment->amount,
            'type' => 'credit',
            'account_id' => $serviceRevenueAccountId,
            'reference_type' => ServiceOrderPayment::class,
            'reference_id' => $payment->id,
            'description' => "Service Order Payment - {$payment->payment_number}",
            'store_id' => $payment->store_id,
            'created_by' => $payment->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        return $debitTransaction;
    }

    public static function createFromRefund(Refund $refund): self
    {
        return app(AccountingPostingService::class)->postRefund($refund) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'Refund ledger skipped — no payable/refundable amount or exchange-handled refund',
        ]);
    }

    /**
     * Create COGS/Inventory reversal entries when a return is accepted (items going back to stock).
     * Call this after createFromRefund when the return items are confirmed as restocked.
     */
    public static function createFromRefundCOGS(\App\Models\ProductReturn $productReturn): void
    {
        app(AccountingPostingService::class)->postReturnRestock($productReturn);
    }

    /**
     * Create double-entry journal for a product exchange (return old item + give new item).
     * Handles three scenarios:
     *   A) Same price: Only COGS/Inventory swap, no cash/revenue impact.
     *   B) New item more expensive: Customer pays the difference (cash in, revenue credit).
     *   C) New item less expensive: Store refunds the difference (cash out, revenue debit).
     */
    public static function createFromExchange(\App\Models\ProductReturn $productReturn, Order $newOrder): void
    {
        app(AccountingPostingService::class)->postExchange($productReturn, $newOrder);
    }

    public static function createFromExpense(Expense $expense): self
    {
        $status = $expense->payment_status === 'paid' ? 'completed' : 'pending';
        $groupId = (string) Str::uuid();
        $expenseAccountId = static::getExpenseAccountId($expense->category_id);
        $cashAccountId = static::getCashAccountId($expense->store_id);

        $metadata = [
            'expense_category' => $expense->category->name ?? null,
            'vendor_name' => $expense->vendor->name ?? null,
            'expense_type' => $expense->expense_type,
            'group_id' => $groupId,
        ];

        // DOUBLE-ENTRY BOOKKEEPING:
        // 1. Debit Expense Account (Expense increases - cost recognised)
        $debitTransaction = static::create([
            'transaction_date' => $expense->expense_date,
            'amount' => $expense->total_amount,
            'type' => 'debit',
            'account_id' => $expenseAccountId,
            'reference_type' => Expense::class,
            'reference_id' => $expense->id,
            'description' => "Expense - {$expense->expense_number}: " . ($expense->description ?? 'No description'),
            'store_id' => $expense->store_id,
            'created_by' => $expense->created_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 2. Credit Cash Account (Asset decreases - money going out)
        static::create([
            'transaction_date' => $expense->expense_date,
            'amount' => $expense->total_amount,
            'type' => 'credit',
            'account_id' => $cashAccountId,
            'reference_type' => Expense::class,
            'reference_id' => $expense->id,
            'description' => "Expense Payment (Cash) - {$expense->expense_number}",
            'store_id' => $expense->store_id,
            'created_by' => $expense->created_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        return $debitTransaction;
    }

    public static function createFromExpensePayment(ExpensePayment $payment): self
    {
        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $payment->completed_at ?? $payment->processed_at ?? now();
        $groupId = (string) Str::uuid();
        $expense = $payment->expense;
        $expenseAccountId = static::getExpenseAccountId($expense->category_id ?? null);
        $settlementAccountId = static::getSettlementAccountIdForPaymentMethod($payment->paymentMethod, $payment->store_id ?? $expense->store_id ?? null);

        $metadata = [
            'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
            'expense_number' => $expense->expense_number ?? null,
            'expense_description' => $expense->description ?? null,
            'expense_category_id' => $expense->category_id ?? null,
            'group_id' => $groupId,
        ];

        // 1. Debit the mapped expense account.
        $debitTransaction = static::create([
            'transaction_date' => $transactionDate,
            'amount' => $payment->amount,
            'type' => 'debit',
            'account_id' => $expenseAccountId,
            'reference_type' => ExpensePayment::class,
            'reference_id' => $payment->id,
            'description' => "Expense Recognized - {$payment->payment_number}: " . ($expense->description ?? 'No description'),
            'store_id' => $payment->store_id ?? $expense->store_id ?? null,
            'created_by' => $payment->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 2. Credit cash/bank depending on the payment method.
        static::create([
            'transaction_date' => $transactionDate,
            'amount' => $payment->amount,
            'type' => 'credit',
            'account_id' => $settlementAccountId,
            'reference_type' => ExpensePayment::class,
            'reference_id' => $payment->id,
            'description' => "Expense Payment - {$payment->payment_number}: " . ($expense->description ?? 'No description'),
            'store_id' => $payment->store_id ?? $expense->store_id ?? null,
            'created_by' => $payment->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        return $debitTransaction;
    }

    /**
     * Recognise inventory received from a purchase order.
     *
     * Accounting rule:
     *   Dr Inventory
     *   Cr Accounts Payable
     *
     * This is intentionally recorded when goods are received, not when the PO is
     * merely drafted/approved. An unpaid received PO therefore appears as a
     * liability in the trial balance.
     */
    public static function createFromPurchaseOrderReceipt(PurchaseOrder $purchaseOrder, float $amount, array $extraMetadata = []): self
    {
        return app(AccountingPostingService::class)->postPurchaseOrderReceipt($purchaseOrder, $amount, $extraMetadata) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'PO receipt ledger skipped — zero received value or duplicate receipt event',
        ]);
    }

    public static function createFromVendorPayment(VendorPayment $payment): self
    {
        return app(AccountingPostingService::class)->postVendorPayment($payment) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'Vendor payment ledger skipped — zero amount, refund, or unsupported state',
        ]);
    }

    /**
     * Apply a previously paid supplier advance to a purchase order.
     *
     * Initial advance payment:    Dr Vendor Advances, Cr Cash/Bank
     * Later allocation to PO:     Dr Accounts Payable, Cr Vendor Advances
     */
    public static function createFromVendorAdvanceAllocation(VendorPaymentItem $paymentItem): self
    {
        return app(AccountingPostingService::class)->postVendorAdvanceAllocation($paymentItem) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'Vendor advance allocation skipped — not an advance allocation or duplicate',
        ]);
    }

    public static function createFromOrderCOGS(Order $order): self
    {
        $service = app(AccountingPostingService::class);
        $service->postOrderCompletionRevenue($order);
        return $service->postOrderCOGS($order) ?: new static([
            'amount' => 0,
            'type' => 'debit',
            'description' => 'COGS ledger skipped — no COGS amount or duplicate COGS event',
        ]);
    }

    // Helper methods for account IDs
    public static function getCashAccountId($storeId = null): ?int
    {
        // Primary: find by name LIKE 'Cash' within current assets
        $query = Account::query()->where('type', 'asset')
            ->where('sub_type', 'current_asset')
            ->where('is_active', true);
        (new static)->whereLike($query, 'name', 'Cash');
        $account = $query->first();

        // Secondary: find by standard account code
        if (!$account) {
            $account = Account::where('account_code', '1001')
                ->where('is_active', true)
                ->first();
        }

        // Tertiary: any current asset account
        if (!$account) {
            $account = Account::where('type', 'asset')
                ->where('sub_type', 'current_asset')
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            throw new \RuntimeException(
                'No cash/current-asset account found in chart of accounts. ' .
                'Ensure account code 1001 (Cash and Cash Equivalents) exists.'
            );
        }

        return $account->id;
    }

    public static function getSalesRevenueAccountId(): ?int
    {
        // Primary: find by sub_type
        $account = Account::where('type', 'income')
            ->where('sub_type', 'sales_revenue')
            ->where('is_active', true)
            ->first();

        // Secondary: find by standard account code
        if (!$account) {
            $account = Account::where('account_code', '4001')
                ->where('is_active', true)
                ->first();
        }

        // Tertiary: any income account with Sales in name
        if (!$account) {
            $query = Account::query()->where('type', 'income')
                ->where('is_active', true);
            (new static)->whereLike($query, 'name', 'Sales');
            $account = $query->first();
        }

        if (!$account) {
            throw new \RuntimeException(
                'No sales revenue account found in chart of accounts. ' .
                'Ensure account code 4001 (Sales Revenue) exists.'
            );
        }

        return $account->id;
    }

    public static function getServiceRevenueAccountId(): ?int
    {
        // Get service revenue account from database
        $query = Account::query()->where('type', 'income')
            ->where('is_active', true);
        (new static)->whereLike($query, 'name', 'Service');
        $account = $query->first();
        
        // If no specific service revenue account, use sales revenue
        if (!$account) {
            return static::getSalesRevenueAccountId();
        }
        
        return $account->id;
    }

    public static function getCOGSAccountId(): ?int
    {
        // Primary: find by sub_type or name LIKE COGS/Cost of Goods Sold
        $account = Account::where('type', 'expense')
            ->where(function ($q) {
                $instance = new static;
                $instance->whereLike($q, 'name', 'COGS');
                $instance->orWhereLike($q, 'name', 'Cost of Goods Sold');
                $q->orWhere('sub_type', 'cogs');
                $q->orWhere('sub_type', 'cost_of_goods_sold');
            })
            ->where('is_active', true)
            ->first();

        // Secondary: find by standard account code
        if (!$account) {
            $account = Account::where('account_code', '5002')
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            throw new \RuntimeException(
                'No COGS account found in chart of accounts. ' .
                'Ensure account code 5002 (Cost of Goods Sold) exists.'
            );
        }

        return $account->id;
    }

    public static function getInventoryAccountId(): ?int
    {
        $likeOp = (new static)->getLikeOperator();

        // Primary: find by name or inventory sub_type (never fall through to current_asset generically)
        $account = Account::where('type', 'asset')
            ->where(function ($q) {
                (new static)->whereLike($q, 'name', 'Inventory');
                $q->orWhere('sub_type', 'inventory');
            })
            ->where('is_active', true)
            ->orderByRaw("CASE
                WHEN name {$likeOp} '%Inventory%' THEN 1
                WHEN sub_type = 'inventory' THEN 2
                ELSE 3
            END")
            ->first();

        // Secondary: standard account code
        if (!$account) {
            $account = Account::where('account_code', '1003')
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            throw new \RuntimeException(
                'No inventory account found in chart of accounts. ' .
                'Ensure account code 1003 (Inventory) exists. ' .
                'Falling back to Cash would silently corrupt your ledger.'
            );
        }

        return $account->id;
    }

    public static function getAccountsPayableAccountId(): int
    {
        $account = Account::where('account_code', '2001')
            ->where('is_active', true)
            ->first();

        if (!$account) {
            $account = Account::where('type', 'liability')
                ->where(function ($q) {
                    (new static)->whereLike($q, 'name', 'Accounts Payable');
                    (new static)->orWhereLike($q, 'name', 'Payable');
                })
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            $account = Account::create([
                'account_code' => '2001',
                'name' => 'Accounts Payable',
                'type' => 'liability',
                'sub_type' => 'current_liability',
                'description' => 'Supplier/vendor bills payable for received inventory and unpaid purchases.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getVendorAdvanceAccountId(): int
    {
        $account = Account::where('account_code', '1006')
            ->where('is_active', true)
            ->first();

        if (!$account) {
            $account = Account::create([
                'account_code' => '1006',
                'name' => 'Vendor Advances / Supplier Deposits',
                'type' => 'asset',
                'sub_type' => 'current_asset',
                'description' => 'Advance payments made to suppliers before being allocated to purchase orders.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getTaxLiabilityAccountId(): ?int
    {
        // Get tax liability account from database
        $account = Account::where('type', 'liability')
            ->where(function ($q) {
                $instance = new static;
                $instance->whereLike($q, 'name', 'Tax');
                $instance->orWhereLike($q, 'name', 'VAT');
                $instance->orWhereLike($q, 'name', 'Sales Tax');
            })
            ->where('is_active', true)
            ->first();
        
        // If not found, create a default tax liability account
        if (!$account) {
            $account = Account::create([
                'account_code' => '2002',
                'name' => 'Tax Payable',
                'type' => 'liability',
                'sub_type' => 'current_liability',
                'description' => 'Sales tax collected from customers',
                'is_active' => true,
            ]);
        }
        
        return $account->id;
    }

    public static function getBankAccountId($storeId = null): int
    {
        $query = Account::query()
            ->where('type', 'asset')
            ->where('sub_type', 'current_asset')
            ->where('is_active', true)
            ->where(function ($q) {
                (new static)->whereLike($q, 'name', 'Bank');
                (new static)->orWhereLike($q, 'name', 'bKash');
                (new static)->orWhereLike($q, 'name', 'Nagad');
                (new static)->orWhereLike($q, 'name', 'MFS');
            });

        $account = $query->first();

        if (!$account) {
            $account = Account::where('account_code', '1004')
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            $account = Account::create([
                'account_code' => '1004',
                'name' => 'Bank Account',
                'type' => 'asset',
                'sub_type' => 'current_asset',
                'description' => 'Bank/MFS/card settlement account used by cash sheet and accounting integration.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getAccountsReceivableAccountId(): int
    {
        $account = Account::where('account_code', '1002')
            ->where('is_active', true)
            ->first();

        if (!$account) {
            $account = Account::create([
                'account_code' => '1002',
                'name' => 'Accounts Receivable',
                'type' => 'asset',
                'sub_type' => 'current_asset',
                'description' => 'Receivables awaiting settlement/disbursement.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getInventoryToReceiveAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('inventory_to_receive');
    }

    public static function getPOPayableCommitmentAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('po_payable_commitment');
    }

    public static function getPathaoReceivableAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('pathao_receivable');
    }

    public static function getSSLCommerzReceivableAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('sslcommerz_receivable');
    }

    public static function getCustomerAdvanceAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('customer_advance');
    }

    public static function getSalesReturnAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('sales_return');
    }

    public static function getPathaoDeliveryExpenseAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('delivery_expense_pathao');
    }

    public static function getSSLCommerzFeeExpenseAccountId(): int
    {
        return app(AccountingPostingService::class)->accountId('ssl_fee_expense');
    }

    public static function getOwnerEquityAccountId(): int
    {
        $account = Account::where('account_code', '3002')
            ->where('is_active', true)
            ->first()
            ?: Account::where('account_code', '3000')->where('is_active', true)->first()
            ?: Account::where('type', 'equity')->where('is_active', true)->first();

        if (!$account) {
            $account = Account::create([
                'account_code' => '3002',
                'name' => 'Owner Capital',
                'type' => 'equity',
                'sub_type' => 'owner_equity',
                'description' => 'Owner investments recorded from the cash sheet.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getSalaryReserveAccountId(): int
    {
        $account = Account::where('account_code', '1005')
            ->where('is_active', true)
            ->first();

        if (!$account) {
            $account = Account::create([
                'account_code' => '1005',
                'name' => 'Salary/Rent Reserve Cash',
                'type' => 'asset',
                'sub_type' => 'current_asset',
                'description' => 'Cash set aside from branch collections for salary, rent, or similar admin payouts.',
                'is_active' => true,
            ]);
        }

        return (int) $account->id;
    }

    public static function getOperatingExpenseAccountId(): int
    {
        return (int) static::getExpenseAccountId(null);
    }

    public static function getSettlementAccountIdForPaymentMethod($paymentMethod = null, $storeId = null): int
    {
        $methodType = $paymentMethod?->type ?? 'cash';
        return static::getSettlementAccountIdForMethodType($methodType, $storeId);
    }

    public static function getSettlementAccountIdForMethodType(?string $methodType, $storeId = null): int
    {
        $methodType = strtolower((string) $methodType);

        if ($methodType === 'cash') {
            return (int) static::getCashAccountId($storeId);
        }

        if (in_array($methodType, ['store_credit', 'gift_card', 'exchange_balance', 'balance_carryover'], true)) {
            return (int) static::getCashAccountId($storeId);
        }

        return static::getBankAccountId($storeId);
    }

    private static function getExpenseAccountId($categoryId): ?int
    {
        // Prefer the category's explicit chart-of-accounts mapping when present.
        if ($categoryId) {
            $category = \App\Models\ExpenseCategory::find($categoryId);
            if ($category) {
                if (!empty($category->account_id)) {
                    $mapped = Account::where('id', $category->account_id)
                        ->where('is_active', true)
                        ->first();
                    if ($mapped) {
                        return $mapped->id;
                    }
                }

                // Map category types to standard account codes. Missing codes fall back below.
                $accountCode = match ($category->type) {
                    'personnel'      => '5003',
                    'marketing'      => '5004',
                    'logistics'      => '5005',
                    'utilities'      => '5006',
                    'maintenance'    => '5007',
                    'taxes'          => '5008',
                    'capital'        => '1101',
                    default          => '5001',
                };
                $account = Account::where('account_code', $accountCode)
                    ->where('is_active', true)
                    ->first();
                if ($account) {
                    return $account->id;
                }
            }
        }

        // Fallback: any active operating expense account by code
        $account = Account::where('account_code', '5001')
            ->where('is_active', true)
            ->first();

        if (!$account) {
            // Last resort: any expense account
            $account = Account::where('type', 'expense')
                ->where('is_active', true)
                ->first();
        }

        if (!$account) {
            throw new \RuntimeException(
                'No expense account found in chart of accounts. ' .
                'Ensure account code 5001 (Operating Expenses) exists.'
            );
        }

        return $account->id;
    }

    // Accessors
    public function getTypeColorAttribute(): string
    {
        return match ($this->type) {
            'debit' => 'success',
            'credit' => 'danger',
            default => 'secondary',
        };
    }

    public function getTypeLabelAttribute(): string
    {
        return match ($this->type) {
            'debit' => 'Debit',
            'credit' => 'Credit',
            default => 'Unknown',
        };
    }

    public function getStatusColorAttribute(): string
    {
        return match ($this->status) {
            'completed' => 'success',
            'pending' => 'warning',
            'failed' => 'danger',
            'cancelled' => 'secondary',
            default => 'secondary',
        };
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'completed' => 'Completed',
            'pending' => 'Pending',
            'failed' => 'Failed',
            'cancelled' => 'Cancelled',
            default => 'Unknown',
        };
    }

    public function getReferenceModelAttribute()
    {
        return $this->reference_type::find($this->reference_id);
    }

    // Static methods
    public static function generateTransactionNumber(): string
    {
        do {
            $transactionNumber = 'TXN-' . date('Ymd') . '-' . strtoupper(Str::random(8));
        } while (static::where('transaction_number', $transactionNumber)->exists());

        return $transactionNumber;
    }

    public static function getAccountBalance(int $accountId, $storeId = null, $endDate = null): float
    {
        $query = static::byAccount($accountId)->completed();

        if ($storeId) {
            $query->byStore($storeId);
        }

        if ($endDate) {
            $query->where('transaction_date', '<=', $endDate);
        }

        $debits = (clone $query)->debit()->sum('amount');
        $credits = (clone $query)->credit()->sum('amount');

        return $debits - $credits;
    }

    public static function getStoreBalance($storeId, $endDate = null): float
    {
        $query = static::byStore($storeId)->completed();

        if ($endDate) {
            $query->where('transaction_date', '<=', $endDate);
        }

        $debits = (clone $query)->debit()->sum('amount');
        $credits = (clone $query)->credit()->sum('amount');

        return $debits - $credits;
    }

    public static function getTrialBalance($storeId = null, $startDate = null, $endDate = null): array
    {
        $query = static::completed();

        if ($storeId) {
            $query->byStore($storeId);
        }

        if ($startDate && $endDate) {
            $query->byDateRange($startDate, $endDate);
        }

        $debits = (clone $query)->debit()->sum('amount');
        $credits = (clone $query)->credit()->sum('amount');

        return [
            'total_debits' => $debits,
            'total_credits' => $credits,
            'balance' => $debits - $credits,
            'in_balance' => abs($debits - $credits) < 0.01, // Allow for small floating point differences
        ];
    }
}
