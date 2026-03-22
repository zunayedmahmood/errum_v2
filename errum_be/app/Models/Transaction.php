<?php

namespace App\Models;

use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;
use App\Traits\AutoLogsActivity;

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
        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $payment->completed_at ?? $payment->processed_at ?? now();
        $cashAccountId = static::getCashAccountId($payment->store_id);
        $salesRevenueAccountId = static::getSalesRevenueAccountId();
        $taxLiabilityAccountId = static::getTaxLiabilityAccountId();

        $metadata = [
            'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
            'order_number' => $payment->order->order_number ?? null,
            'customer_name' => $payment->customer->name ?? null,
        ];

        // Calculate proportional tax for this payment (inclusive tax system)
        $order = $payment->order;
        $paymentAmount = (float)$payment->amount;
        
        // Calculate tax proportion based on order total
        if ($order && $order->total_amount > 0) {
            // Tax ratio = order tax / order total
            $taxRatio = (float)$order->tax_amount / (float)$order->total_amount;
            // Apply ratio to payment amount to get proportional tax
            $taxAmount = round($paymentAmount * $taxRatio, 2);
        } else {
            $taxAmount = 0;
        }
        
        $revenueAmount = $paymentAmount - $taxAmount;

        // DOUBLE-ENTRY BOOKKEEPING WITH INCLUSIVE TAX:
        // 1. Debit Cash Account (Asset increases - full amount including tax)
        $debitTransaction = static::create([
            'transaction_date' => $transactionDate,
            'amount' => $paymentAmount,
            'type' => 'debit',
            'account_id' => $cashAccountId,
            'reference_type' => OrderPayment::class,
            'reference_id' => $payment->id,
            'description' => "Order Payment - {$payment->payment_number}",
            'store_id' => $payment->store_id,
            'created_by' => $payment->processed_by,
            'metadata' => array_merge($metadata, [
                'includes_tax' => $taxAmount > 0,
                'tax_amount' => $taxAmount,
            ]),
            'status' => $status,
        ]);

        // 2. Credit Sales Revenue Account (Income - excluding tax)
        static::create([
            'transaction_date' => $transactionDate,
            'amount' => $revenueAmount,
            'type' => 'credit',
            'account_id' => $salesRevenueAccountId,
            'reference_type' => OrderPayment::class,
            'reference_id' => $payment->id,
            'description' => "Order Revenue (excl. tax) - {$payment->payment_number}",
            'store_id' => $payment->store_id,
            'created_by' => $payment->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 3. Credit Tax Liability Account (Liability - tax collected)
        if ($taxAmount > 0) {
            static::create([
                'transaction_date' => $transactionDate,
                'amount' => $taxAmount,
                'type' => 'credit',
                'account_id' => $taxLiabilityAccountId,
                'reference_type' => OrderPayment::class,
                'reference_id' => $payment->id,
                'description' => "Sales Tax Collected - {$payment->payment_number}",
                'store_id' => $payment->store_id,
                'created_by' => $payment->processed_by,
                'metadata' => array_merge($metadata, [
                    'tax_type' => 'sales_tax',
                    'order_subtotal' => $order->subtotal ?? 0,
                ]),
                'status' => $status,
            ]);
        }

        return $debitTransaction;
    }

    public static function createFromServiceOrderPayment(ServiceOrderPayment $payment): self
    {
        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $payment->completed_at ?? $payment->processed_at ?? now();
        $cashAccountId = static::getCashAccountId($payment->store_id);
        $serviceRevenueAccountId = static::getServiceRevenueAccountId();

        $metadata = [
            'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
            'service_order_number' => $payment->serviceOrder->order_number ?? null,
            'customer_name' => $payment->customer->name ?? null,
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
        $status = $refund->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $refund->completed_at ?? now();
        $cashAccountId = static::getCashAccountId($refund->order->store_id ?? null);
        $salesRevenueAccountId = static::getSalesRevenueAccountId();

        $metadata = [
            'refund_method' => $refund->refund_method,
            'order_number' => $refund->order->order_number ?? null,
            'customer_name' => $refund->customer->name ?? null,
            'refund_type' => $refund->refund_type,
        ];

        // DOUBLE-ENTRY BOOKKEEPING (Reverse of sale):
        // 1. Credit Cash Account (Asset decreases - money going out)
        $creditTransaction = static::create([
            'transaction_date' => $transactionDate,
            'amount' => $refund->refund_amount,
            'type' => 'credit',
            'account_id' => $cashAccountId,
            'reference_type' => Refund::class,
            'reference_id' => $refund->id,
            'description' => "Refund - {$refund->refund_number}",
            'store_id' => $refund->order->store_id ?? null,
            'created_by' => $refund->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 2. Debit Sales Revenue Account (Revenue decreases - reverse sale)
        static::create([
            'transaction_date' => $transactionDate,
            'amount' => $refund->refund_amount,
            'type' => 'debit',
            'account_id' => $salesRevenueAccountId,
            'reference_type' => Refund::class,
            'reference_id' => $refund->id,
            'description' => "Refund - {$refund->refund_number}",
            'store_id' => $refund->order->store_id ?? null,
            'created_by' => $refund->processed_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        return $creditTransaction;
    }

    public static function createFromExpense(Expense $expense): self
    {
        $status = $expense->payment_status === 'paid' ? 'completed' : 'pending';

        return static::create([
            'transaction_date' => $expense->expense_date,
            'amount' => $expense->total_amount,
            'type' => 'credit', // Money going out of the business
            'account_id' => static::getExpenseAccountId($expense->category_id),
            'reference_type' => Expense::class,
            'reference_id' => $expense->id,
            'description' => "Expense - {$expense->expense_number}: {$expense->title}",
            'store_id' => $expense->store_id,
            'created_by' => $expense->created_by,
            'metadata' => [
                'expense_category' => $expense->category->name ?? null,
                'vendor_name' => $expense->vendor->name ?? null,
                'expense_type' => $expense->expense_type,
            ],
            'status' => $status,
        ]);
    }

    public static function createFromExpensePayment(ExpensePayment $payment): self
    {
        $status = $payment->status === 'completed' ? 'completed' : 'pending';

        return static::create([
            'transaction_date' => $payment->completed_at ?? $payment->processed_at ?? now(),
            'amount' => $payment->amount,
            'type' => 'credit', // Money going out for expense payment
            'account_id' => static::getCashAccountId($payment->expense->store_id),
            'reference_type' => ExpensePayment::class,
            'reference_id' => $payment->id,
            'description' => "Expense Payment - {$payment->payment_number}",
            'store_id' => $payment->expense->store_id,
            'created_by' => $payment->processed_by,
            'metadata' => [
                'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
                'expense_number' => $payment->expense->expense_number ?? null,
                'expense_title' => $payment->expense->title ?? null,
            ],
            'status' => $status,
        ]);
    }

    public static function createFromVendorPayment(VendorPayment $payment): self
    {
        $status = $payment->status === 'completed' ? 'completed' : 'pending';

        return static::create([
            'transaction_date' => $payment->processed_at ?? $payment->payment_date ?? now(),
            'amount' => $payment->amount,
            'type' => 'credit', // Money going out to vendor
            'account_id' => static::getCashAccountId(),
            'reference_type' => VendorPayment::class,
            'reference_id' => $payment->id,
            'description' => "Vendor Payment - {$payment->payment_number}",
            'created_by' => $payment->employee_id,
            'metadata' => [
                'payment_method' => $payment->paymentMethod->name ?? 'Unknown',
                'vendor_name' => $payment->vendor->name ?? null,
                'payment_type' => $payment->payment_type,
                'allocated_amount' => $payment->allocated_amount,
                'unallocated_amount' => $payment->unallocated_amount,
            ],
            'status' => $status,
        ]);
    }

    public static function createFromOrderCOGS(Order $order): self
    {
        $status = $order->status === 'completed' ? 'completed' : 'pending';
        $transactionDate = $order->completed_at ?? now();
        $cogsAccountId = static::getCOGSAccountId();
        $inventoryAccountId = static::getInventoryAccountId();
        
        // Calculate total COGS from all order items
        $totalCOGS = $order->items->sum('cogs');

        $metadata = [
            'order_number' => $order->order_number,
            'customer_name' => $order->customer->name ?? null,
            'order_type' => $order->order_type,
            'items_count' => $order->items->count(),
        ];

        // DOUBLE-ENTRY BOOKKEEPING:
        // 1. Debit COGS Account (Expense increases - cost of goods sold)
        $debitTransaction = static::create([
            'transaction_date' => $transactionDate,
            'amount' => $totalCOGS,
            'type' => 'debit',
            'account_id' => $cogsAccountId,
            'reference_type' => Order::class,
            'reference_id' => $order->id,
            'description' => "COGS - Order {$order->order_number}",
            'store_id' => $order->store_id,
            'created_by' => $order->created_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        // 2. Credit Inventory Account (Asset decreases - inventory reduced)
        static::create([
            'transaction_date' => $transactionDate,
            'amount' => $totalCOGS,
            'type' => 'credit',
            'account_id' => $inventoryAccountId,
            'reference_type' => Order::class,
            'reference_id' => $order->id,
            'description' => "COGS - Order {$order->order_number}",
            'store_id' => $order->store_id,
            'created_by' => $order->created_by,
            'metadata' => $metadata,
            'status' => $status,
        ]);

        return $debitTransaction;
    }

    // Helper methods for account IDs
    public static function getCashAccountId($storeId = null): ?int
    {
        // Get cash account from database or return default
        $query = Account::query()->where('type', 'asset')
            ->where('sub_type', 'current_asset')
            ->where('is_active', true);
        (new static)->whereLike($query, 'name', 'Cash');
        $account = $query->first();
        
        // If no cash account found, get any current asset account
        if (!$account) {
            $account = Account::where('type', 'asset')
                ->where('sub_type', 'current_asset')
                ->where('is_active', true)
                ->first();
        }
        
        return $account ? $account->id : 1; // Fallback to ID 1
    }

    public static function getSalesRevenueAccountId(): ?int
    {
        // Get sales revenue account from database
        $account = Account::where('type', 'income')
            ->where('sub_type', 'sales_revenue')
            ->where('is_active', true)
            ->first();
        
        // If not found, get any sales revenue account by name
        if (!$account) {
            $query = Account::query()->where('type', 'income')
                ->where('is_active', true);
            (new static)->whereLike($query, 'name', 'Sales');
            $account = $query->first();
        }
        
        return $account ? $account->id : 2; // Fallback to ID 2
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
        // Get COGS expense account from database
        $query = Account::where('type', 'expense')
            ->where(function ($q) {
                $instance = new static;
                $instance->whereLike($q, 'name', 'COGS');
                $instance->orWhereLike($q, 'name', 'Cost of Goods Sold');
                $q->orWhere('sub_type', 'cogs');
            })
            ->where('is_active', true);
        $account = $query->first();
        
        // If not found, get any expense account with COGS in name
        if (!$account) {
            $account = Account::where('type', 'expense')
                ->where('is_active', true)
                ->first();
        }
        
        return $account ? $account->id : 3; // Fallback to ID 3
    }

    public static function getInventoryAccountId(): ?int
    {
        // Get inventory asset account from database
        $likeOp = (new static)->getLikeOperator();
        $query = Account::where('type', 'asset')
            ->where(function ($q) {
                (new static)->whereLike($q, 'name', 'Inventory');
                $q->orWhere('sub_type', 'inventory')
                  ->orWhere('sub_type', 'current_asset');
            })
            ->where('is_active', true)
            ->whereNotNull('id')
            ->orderByRaw("CASE 
                WHEN name {$likeOp} '%Inventory%' THEN 1 
                WHEN sub_type = 'inventory' THEN 2 
                ELSE 3 
            END");
        $account = $query->first();
        
        // If not found, use cash account as fallback (not ideal but safe)
        if (!$account) {
            return static::getCashAccountId();
        }
        
        return $account->id;
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

    private static function getExpenseAccountId($categoryId): ?int
    {
        // Map expense categories to accounts - this should be configurable
        return 2; // Placeholder - should be configurable based on category
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
