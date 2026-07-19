<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\PaymentMethod;
use App\Models\PaymentCommissionEntry;
use App\Models\ProductReturn;
use App\Models\PurchaseOrder;
use App\Models\Refund;
use App\Models\Shipment;
use App\Models\Transaction;
use App\Models\VendorPayment;
use App\Models\VendorPaymentItem;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class AccountingPostingService
{
    private const EPSILON = 0.01;

    public function ensureAccount(string $code, string $name, string $type, string $subType, ?string $description = null): Account
    {
        $account = Account::where('account_code', $code)->first();
        if ($account) {
            $dirty = false;
            if (!$account->is_active) {
                $account->is_active = true;
                $dirty = true;
            }
            if ($account->name !== $name && trim((string) $account->name) === '') {
                $account->name = $name;
                $dirty = true;
            }
            if ($account->type !== $type) {
                // Never silently mutate type for an existing account with transactions.
                // Return it so legacy data keeps working; integrity check will flag type mismatch.
                return $account;
            }
            if ($dirty) {
                $account->save();
            }
            return $account;
        }

        return Account::create([
            'account_code' => $code,
            'name' => $name,
            'type' => $type,
            'sub_type' => $subType,
            'description' => $description,
            'is_active' => true,
        ]);
    }

    public function accountId(string $slug): int
    {
        $account = match ($slug) {
            'cash' => $this->ensureAccount('1001', 'Cash and Cash Equivalents', 'asset', 'current_asset', 'Branch/counter cash.'),
            'accounts_receivable' => $this->ensureAccount('1002', 'Accounts Receivable', 'asset', 'current_asset', 'General receivables awaiting settlement.'),
            'inventory' => $this->ensureAccount('1003', 'Inventory', 'asset', 'current_asset', 'Actual received inventory value.'),
            'bank' => $this->ensureAccount('1004', 'Bank Account', 'asset', 'current_asset', 'Bank/MFS/card settlement account.'),
            'salary_reserve' => $this->ensureAccount('1005', 'Salary/Rent Reserve Cash', 'asset', 'current_asset', 'Cash set aside for salary/rent/admin payout.'),
            'vendor_advance' => $this->ensureAccount('1006', 'Vendor Advances / Supplier Deposits', 'asset', 'current_asset', 'Advance payments to vendors before allocation.'),
            'inventory_to_receive' => $this->ensureAccount('1007', 'Inventory to Receive / PO Commitment Asset', 'asset', 'current_asset', 'Temporary expected inventory for open purchase orders.'),
            'pathao_receivable' => $this->ensureAccount('1008', 'Pathao Receivable', 'asset', 'current_asset', 'COD and disbursement receivable from Pathao.'),
            'sslcommerz_receivable' => $this->ensureAccount('1009', 'SSLCommerz Receivable', 'asset', 'current_asset', 'Online payment receivable from SSLCommerz.'),
            'customer_receivable' => $this->ensureAccount('1010', 'Customer Receivable', 'asset', 'current_asset', 'Customer due receivables.'),
            'accounts_payable' => $this->ensureAccount('2001', 'Accounts Payable', 'liability', 'current_liability', 'Vendor bills payable for received goods.'),
            'tax_payable' => $this->ensureAccount('2002', 'Tax Payable', 'liability', 'current_liability', 'Sales tax/VAT payable.'),
            'po_payable_commitment' => $this->ensureAccount('2003', 'PO Payable Commitment', 'liability', 'current_liability', 'Temporary payable commitment for open purchase orders.'),
            'customer_advance' => $this->ensureAccount('2004', 'Customer Advance / Unearned Revenue', 'liability', 'current_liability', 'Customer payments received before sale completion.'),
            'customer_refund_payable' => $this->ensureAccount('2005', 'Customer Refund Payable', 'liability', 'current_liability', 'Refund owed to customer but not paid yet.'),
            'customer_store_credit' => $this->ensureAccount('2006', 'Customer Store Credit', 'liability', 'current_liability', 'Customer return/exchange credit usable later.'),
            'pathao_payable' => $this->ensureAccount('2007', 'Pathao Payable', 'liability', 'current_liability', 'Delivery fee payable to Pathao when not deducted.'),
            'exchange_clearing' => $this->ensureAccount('2999', 'Exchange Clearing', 'liability', 'current_liability', 'Temporary clearing account for exchanges; should net to zero.'),
            'owner_capital' => $this->ensureAccount('3002', 'Owner Capital', 'equity', 'owner_equity', 'Owner investment.'),
            'owner_drawings' => $this->ensureAccount('3003', 'Owner Drawings', 'equity', 'owner_equity', 'Owner withdrawals.'),
            'sales_revenue' => $this->ensureAccount('4001', 'Sales Revenue', 'income', 'sales_revenue', 'Product sales revenue.'),
            'service_revenue' => $this->ensureAccount('4002', 'Service Revenue', 'income', 'other_income', 'Service sales revenue.'),
            'delivery_charge_income' => $this->ensureAccount('4003', 'Delivery Charge Income', 'income', 'other_income', 'Delivery charges collected from customers.'),
            'sales_discount' => $this->ensureAccount('4101', 'Sales Discount / Contra Revenue', 'expense', 'other_expenses', 'Discounts given to customers.'),
            'sales_return' => $this->ensureAccount('4102', 'Sales Return / Refund / Contra Revenue', 'expense', 'other_expenses', 'Returned/refunded sale value.'),
            'cogs' => $this->ensureAccount('5002', 'Cost of Goods Sold', 'expense', 'cost_of_goods_sold', 'Cost value of products sold.'),
            'operating_expense' => $this->ensureAccount('5001', 'Operating Expenses', 'expense', 'operating_expenses', 'General operating expense.'),
            'delivery_expense_pathao' => $this->ensureAccount('5010', 'Delivery Expense - Pathao', 'expense', 'operating_expenses', 'Courier/delivery expense charged by Pathao.'),
            'ssl_fee_expense' => $this->ensureAccount('5011', 'SSLCommerz Commission Expense', 'expense', 'operating_expenses', 'Payment gateway commission expense.'),
            'payment_processing_fee' => $this->ensureAccount('5014', 'Payment Processing Fees', 'expense', 'operating_expenses', 'Card, bank and mobile-wallet commissions deducted from customer payments.'),
            'branch_daily_expense' => $this->ensureAccount('5012', 'Branch Daily Expense', 'expense', 'operating_expenses', 'Branch daily cash-sheet expenses.'),
            'damaged_inventory_loss' => $this->ensureAccount('5013', 'Inventory Loss / Damage', 'expense', 'other_expenses', 'Damaged/unsellable inventory loss.'),
            default => throw new RuntimeException("Unknown accounting account slug: {$slug}"),
        };

        return (int) $account->id;
    }

    public function ensureWorkbookAccounts(): void
    {
        foreach ([
            'cash',
            'accounts_receivable',
            'inventory',
            'bank',
            'salary_reserve',
            'vendor_advance',
            'inventory_to_receive',
            'pathao_receivable',
            'sslcommerz_receivable',
            'customer_receivable',
            'accounts_payable',
            'tax_payable',
            'po_payable_commitment',
            'customer_advance',
            'customer_refund_payable',
            'customer_store_credit',
            'pathao_payable',
            'exchange_clearing',
            'owner_capital',
            'owner_drawings',
            'sales_revenue',
            'service_revenue',
            'delivery_charge_income',
            'sales_discount',
            'sales_return',
            'cogs',
            'operating_expense',
            'delivery_expense_pathao',
            'ssl_fee_expense',
            'payment_processing_fee',
            'branch_daily_expense',
            'damaged_inventory_loss',
        ] as $slug) {
            $this->accountId($slug);
        }
    }

    public function postBalancedJournal(
        string $eventKey,
        string $referenceType,
        int $referenceId,
        $transactionDate,
        string $description,
        ?int $storeId,
        ?int $createdBy,
        array $lines,
        array $metadata = [],
        string $status = 'completed',
        bool $replace = false
    ): ?Transaction {
        $eventKey = trim($eventKey);
        if ($eventKey === '') {
            throw new RuntimeException('Accounting event key cannot be empty.');
        }

        $existing = Transaction::where('metadata->event_key', $eventKey)
            ->whereIn('status', ['pending', 'completed'])
            ->get();

        if ($existing->isNotEmpty() && !$replace) {
            return $existing->first();
        }

        return DB::transaction(function () use ($existing, $eventKey, $referenceType, $referenceId, $transactionDate, $description, $storeId, $createdBy, $lines, $metadata, $status, $replace) {
            if ($existing->isNotEmpty() && $replace) {
                Transaction::where('metadata->event_key', $eventKey)
                    ->whereIn('status', ['pending', 'completed'])
                    ->update(['status' => 'cancelled']);
            }

            $cleanLines = [];
            $debits = 0.0;
            $credits = 0.0;

            foreach ($lines as $line) {
                $amount = round(abs((float) ($line['amount'] ?? 0)), 2);
                if ($amount <= 0) {
                    continue;
                }

                $type = (string) ($line['type'] ?? '');
                if (!in_array($type, ['debit', 'credit'], true)) {
                    throw new RuntimeException("Invalid transaction line type for {$eventKey}.");
                }

                $accountId = (int) ($line['account_id'] ?? 0);
                if ($accountId <= 0) {
                    throw new RuntimeException("Missing account_id for {$eventKey}.");
                }

                if ($type === 'debit') {
                    $debits += $amount;
                } else {
                    $credits += $amount;
                }

                $cleanLines[] = [
                    'type' => $type,
                    'amount' => $amount,
                    'account_id' => $accountId,
                    'description' => $line['description'] ?? $description,
                    'store_id' => array_key_exists('store_id', $line) ? $line['store_id'] : $storeId,
                ];
            }

            $debits = round($debits, 2);
            $credits = round($credits, 2);
            if (count($cleanLines) < 2) {
                return null;
            }
            if (abs($debits - $credits) > self::EPSILON) {
                throw new RuntimeException("Unbalanced accounting journal {$eventKey}: debit {$debits}, credit {$credits}.");
            }

            $groupId = (string) Str::uuid();
            $baseMetadata = array_merge($metadata, [
                'event_key' => $eventKey,
                'group_id' => $groupId,
                'posting_engine' => 'AccountingPostingService',
                'posted_at' => now()->toISOString(),
            ]);

            $first = null;
            foreach ($cleanLines as $line) {
                $row = Transaction::create([
                    'transaction_date' => $this->normaliseDate($transactionDate),
                    'amount' => $line['amount'],
                    'type' => $line['type'],
                    'account_id' => $line['account_id'],
                    'reference_type' => $referenceType,
                    'reference_id' => $referenceId,
                    'description' => $line['description'],
                    'store_id' => $line['store_id'],
                    'created_by' => $createdBy,
                    'metadata' => $baseMetadata,
                    'status' => $status,
                ]);
                $first = $first ?: $row;
            }

            return $first;
        });
    }

    public function cancelEvent(string $eventKey, ?string $reason = null): int
    {
        return Transaction::where('metadata->event_key', $eventKey)
            ->whereIn('status', ['pending', 'completed'])
            ->update([
                'status' => 'cancelled',
                'metadata' => DB::raw($this->jsonSetCancellationReason($reason)),
            ]);
    }

    public function cancelReference(string $referenceType, int $referenceId, ?string $reason = null): int
    {
        // Avoid DB-specific JSON mutation here; status is enough for reports/integrity.
        return Transaction::where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->whereIn('status', ['pending', 'completed'])
            ->update(['status' => 'cancelled']);
    }

    private function jsonSetCancellationReason(?string $reason): string
    {
        // Kept as raw metadata update compatibility fallback. In practice cancelEvent is rarely called directly.
        return 'metadata';
    }

    private function hasAnyActiveReferenceRows(string $referenceType, int $referenceId): bool
    {
        return Transaction::where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->whereIn('status', ['pending', 'completed'])
            ->exists();
    }

    private function hasActiveManagedEvent(string $eventKey): bool
    {
        return Transaction::where('metadata->event_key', $eventKey)
            ->whereIn('status', ['pending', 'completed'])
            ->exists();
    }

    public function syncPurchaseOrderCommitment(PurchaseOrder $po, bool $replace = true, bool $allowAfterReceipt = false): ?Transaction
    {
        $po = $po->loadMissing('items', 'vendor');
        if (in_array($po->status, ['cancelled', 'returned'], true)) {
            return $this->postPurchaseOrderCancellation($po);
        }

        $receivedQty = (int) $po->items->sum('quantity_received');
        if ($receivedQty > 0 && !$allowAfterReceipt) {
            // Once receiving starts, do not rewrite the original commitment in normal UI saves, because
            // receipt settlement depends on the original committed total. Backfill commands may
            // explicitly allow this to rebuild historical data into the new full workbook flow.
            return null;
        }

        $amount = round((float) ($po->total_amount ?? 0), 2);
        if ($amount <= 0) {
            return null;
        }

        return $this->postBalancedJournal(
            "purchase_order:{$po->id}:created_commitment",
            PurchaseOrder::class,
            (int) $po->id,
            $po->order_date ?: $po->created_at ?: now(),
            "PO Created - Temporary Commitment - {$po->po_number}",
            $po->store_id,
            $po->created_by,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('inventory_to_receive'), 'amount' => $amount, 'description' => "PO Created - Inventory to Receive - {$po->po_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('po_payable_commitment'), 'amount' => $amount, 'description' => "PO Created - Payable Commitment - {$po->po_number}"],
            ],
            [
                'source' => 'purchase_order_commitment',
                'po_number' => $po->po_number,
                'vendor_id' => $po->vendor_id,
                'vendor_name' => $po->vendor->name ?? null,
                'commitment_amount' => $amount,
            ],
            'completed',
            $replace
        );
    }

    public function postPurchaseOrderReceipt(PurchaseOrder $po, float $amount, array $extraMetadata = []): ?Transaction
    {
        $po = $po->loadMissing('vendor', 'store');
        $amount = round(abs($amount), 2);
        if ($amount <= 0) {
            return null;
        }

        $eventKey = $extraMetadata['event_key'] ?? $this->receiptEventKey($po, $amount, $extraMetadata);
        $hasCommitment = Transaction::where('reference_type', PurchaseOrder::class)
            ->where('reference_id', $po->id)
            ->where('metadata->event_key', "purchase_order:{$po->id}:created_commitment")
            ->whereIn('status', ['completed', 'pending'])
            ->exists();

        $date = $po->received_at ?? $po->actual_delivery_date ?? now();
        $metadata = array_merge([
            'source' => 'purchase_order_receipt',
            'po_number' => $po->po_number,
            'vendor_id' => $po->vendor_id,
            'vendor_name' => $po->vendor->name ?? null,
            'receipt_amount' => $amount,
            'uses_commitment_settlement' => $hasCommitment,
        ], $extraMetadata);

        if ($hasCommitment) {
            return $this->postBalancedJournal(
                $eventKey,
                PurchaseOrder::class,
                (int) $po->id,
                $date,
                "PO Received - Settle Commitment - {$po->po_number}",
                $po->store_id,
                auth()->id() ?: $po->received_by ?: $po->created_by,
                [
                    ['type' => 'debit', 'account_id' => $this->accountId('inventory'), 'amount' => $amount, 'description' => "PO Received - Actual Inventory - {$po->po_number}"],
                    ['type' => 'credit', 'account_id' => $this->accountId('inventory_to_receive'), 'amount' => $amount, 'description' => "PO Received - Reduce Inventory to Receive - {$po->po_number}"],
                    ['type' => 'debit', 'account_id' => $this->accountId('po_payable_commitment'), 'amount' => $amount, 'description' => "PO Received - Reduce PO Payable Commitment - {$po->po_number}"],
                    ['type' => 'credit', 'account_id' => $this->accountId('accounts_payable'), 'amount' => $amount, 'description' => "PO Received - Actual Accounts Payable - {$po->po_number}"],
                ],
                $metadata
            );
        }

        // Legacy fallback for old POs created before the temporary commitment logic existed.
        return $this->postBalancedJournal(
            $eventKey,
            PurchaseOrder::class,
            (int) $po->id,
            $date,
            "PO Received - Inventory/AP - {$po->po_number}",
            $po->store_id,
            auth()->id() ?: $po->received_by ?: $po->created_by,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('inventory'), 'amount' => $amount, 'description' => "PO Received - Inventory - {$po->po_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('accounts_payable'), 'amount' => $amount, 'description' => "PO Received - Accounts Payable - {$po->po_number}"],
            ],
            $metadata
        );
    }

    public function postPurchaseOrderCancellation(PurchaseOrder $po): ?Transaction
    {
        $po = $po->loadMissing('items', 'vendor');
        $remaining = $this->purchaseOrderRemainingCommitmentAmount($po);
        if ($remaining <= 0) {
            return null;
        }

        return $this->postBalancedJournal(
            "purchase_order:{$po->id}:cancel_remaining_commitment",
            PurchaseOrder::class,
            (int) $po->id,
            $po->cancelled_at ?: now(),
            "PO Cancelled - Reverse Remaining Commitment - {$po->po_number}",
            $po->store_id,
            auth()->id() ?: $po->created_by,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('po_payable_commitment'), 'amount' => $remaining, 'description' => "PO Cancelled - Reduce PO Payable Commitment - {$po->po_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('inventory_to_receive'), 'amount' => $remaining, 'description' => "PO Cancelled - Reduce Inventory to Receive - {$po->po_number}"],
            ],
            [
                'source' => 'purchase_order_cancellation',
                'po_number' => $po->po_number,
                'remaining_commitment_amount' => $remaining,
            ]
        );
    }

    public function purchaseOrderReceivedLedgerAmount(PurchaseOrder $po): float
    {
        $po = $po->loadMissing('items');
        $lines = [];
        foreach ($po->items as $item) {
            $received = (int) ($item->quantity_received ?? 0);
            if ($received <= 0) {
                continue;
            }
            $ordered = max(1, (int) ($item->quantity_ordered ?? 0));
            $gross = round((float) $item->unit_cost * $received, 2);
            $tax = round((float) $item->tax_amount * ($received / $ordered), 2);
            $discount = round((float) $item->discount_amount * ($received / $ordered), 2);
            $lines[] = [
                'gross_amount' => $gross,
                'net_amount' => round($gross + $tax - $discount, 2),
            ];
        }

        return round($po->calculateReceiptLedgerAmount($lines), 2);
    }

    public function purchaseOrderRemainingCommitmentAmount(PurchaseOrder $po): float
    {
        $total = round((float) ($po->total_amount ?? 0), 2);
        $received = $this->purchaseOrderReceivedLedgerAmount($po);
        return round(max(0, $total - $received), 2);
    }

    public function postVendorPayment(VendorPayment $payment): ?Transaction
    {
        if ($payment->payment_type === 'refund') {
            return null;
        }

        $paymentAmount = round(abs((float) $payment->amount), 2);
        if ($paymentAmount <= 0) {
            return null;
        }

        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        $eventKey = "vendor_payment:{$payment->id}:completed";
        if (!$this->hasActiveManagedEvent($eventKey) && $this->hasAnyActiveReferenceRows(VendorPayment::class, (int) $payment->id)) {
            return Transaction::where('reference_type', VendorPayment::class)
                ->where('reference_id', $payment->id)
                ->whereIn('status', ['pending', 'completed'])
                ->first();
        }

        $date = $payment->processed_at ?? $payment->payment_date ?? now();
        $allocated = round(abs((float) $payment->allocated_amount), 2);
        if ($payment->payment_type === 'purchase_order' && $allocated <= 0) {
            $allocated = $paymentAmount;
        }
        if ($payment->payment_type === 'advance') {
            $allocated = 0;
        }
        $allocated = min($allocated, $paymentAmount);
        $advance = round($paymentAmount - $allocated, 2);

        $lines = [];
        if ($allocated > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('accounts_payable'), 'amount' => $allocated, 'description' => "Vendor Payment - AP Settled - {$payment->payment_number}"];
        }
        if ($advance > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('vendor_advance'), 'amount' => $advance, 'description' => "Vendor Advance / Supplier Deposit - {$payment->payment_number}"];
        }
        $lines[] = ['type' => 'credit', 'account_id' => $this->settlementAccountIdForPaymentMethod($payment->paymentMethod), 'amount' => $paymentAmount, 'description' => "Vendor Payment - Cash/Bank Out - {$payment->payment_number}"];

        return $this->postBalancedJournal(
            $eventKey,
            VendorPayment::class,
            (int) $payment->id,
            $date,
            "Vendor Payment - {$payment->payment_number}",
            null,
            $payment->employee_id,
            $lines,
            [
                'source' => 'vendor_payment',
                'payment_number' => $payment->payment_number,
                'payment_type' => $payment->payment_type,
                'vendor_id' => $payment->vendor_id,
                'vendor_name' => $payment->vendor->name ?? null,
                'allocated_amount' => $allocated,
                'unallocated_amount' => $advance,
            ],
            $status
        );
    }

    public function postVendorAdvanceAllocation(VendorPaymentItem $item): ?Transaction
    {
        $payment = $item->vendorPayment;
        $po = $item->purchaseOrder;
        $amount = round(abs((float) $item->allocated_amount), 2);
        if (!$payment || !$po || $amount <= 0 || $payment->payment_type !== 'advance') {
            return null;
        }

        return $this->postBalancedJournal(
            "vendor_payment_item:{$item->id}:advance_allocated",
            VendorPaymentItem::class,
            (int) $item->id,
            now(),
            "Vendor Advance Allocated - {$po->po_number}",
            $po->store_id,
            auth()->id() ?: $payment->employee_id,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('accounts_payable'), 'amount' => $amount, 'description' => "Vendor Advance Allocated - AP Settled - {$po->po_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('vendor_advance'), 'amount' => $amount, 'description' => "Vendor Advance Allocated - Deposit Used - {$po->po_number}"],
            ],
            [
                'source' => 'vendor_advance_allocation',
                'payment_number' => $payment->payment_number,
                'po_number' => $po->po_number,
                'vendor_id' => $payment->vendor_id,
            ]
        );
    }

    public function postPaymentCommission(PaymentCommissionEntry $entry, bool $replace = true): ?Transaction
    {
        $entry = $entry->loadMissing('paymentMethod', 'order');
        $amount = round(max(0, (float) $entry->commission_amount), 2);
        $eventKey = "payment_commission:{$entry->id}:expense";

        if ($entry->status === 'cancelled' || $amount <= 0) {
            $this->cancelEvent($eventKey, 'No active commission expense.');
            return null;
        }

        $method = $entry->paymentMethod;
        $methodName = $method?->name ?: 'Payment Method';
        $channel = $entry->channel_code && $entry->channel_code !== 'default' ? ' / ' . ucfirst($entry->channel_code) : '';
        $orderNumber = $entry->order?->order_number ?: ('Order #' . $entry->order_id);

        return $this->postBalancedJournal(
            $eventKey,
            PaymentCommissionEntry::class,
            (int) $entry->id,
            $entry->business_date,
            "Payment Processing Commission - {$orderNumber}",
            $entry->store_id,
            $entry->created_by,
            [
                [
                    'type' => 'debit',
                    'account_id' => $this->accountId('payment_processing_fee'),
                    'amount' => $amount,
                    'description' => "{$methodName}{$channel} Commission Expense - {$orderNumber}",
                ],
                [
                    'type' => 'credit',
                    'account_id' => $this->settlementAccountIdForPaymentMethod($method, $entry->store_id),
                    'amount' => $amount,
                    'description' => "{$methodName}{$channel} Commission Deducted - {$orderNumber}",
                ],
            ],
            [
                'source' => 'payment_commission',
                'order_id' => $entry->order_id,
                'order_number' => $entry->order?->order_number,
                'payment_method_id' => $entry->payment_method_id,
                'payment_method' => $methodName,
                'channel_code' => $entry->channel_code,
                'gross_amount' => (float) $entry->gross_amount,
                'commission_rate' => (float) $entry->commission_rate,
                'commission_amount' => $amount,
                'net_amount' => (float) $entry->net_amount,
                'source_type' => $entry->source_type,
                'source_id' => $entry->source_id,
            ],
            'completed',
            $replace
        );
    }

    public function postPaymentCommissionReversal(PaymentCommissionEntry $entry, bool $replace = true): ?Transaction
    {
        $entry = $entry->loadMissing('paymentMethod', 'order');
        $amount = round(max(0, (float) $entry->reversed_commission_amount), 2);
        $eventKey = "payment_commission:{$entry->id}:reversal";

        if ($entry->status === 'cancelled' || $amount <= 0) {
            $this->cancelEvent($eventKey, 'No commission reversal due.');
            return null;
        }

        $method = $entry->paymentMethod;
        $methodName = $method?->name ?: 'Payment Method';
        $channel = $entry->channel_code && $entry->channel_code !== 'default' ? ' / ' . ucfirst($entry->channel_code) : '';
        $orderNumber = $entry->order?->order_number ?: ('Order #' . $entry->order_id);

        return $this->postBalancedJournal(
            $eventKey,
            PaymentCommissionEntry::class,
            (int) $entry->id,
            $entry->business_date,
            "Payment Commission Reversal - {$orderNumber}",
            $entry->store_id,
            auth()->id() ?: $entry->created_by,
            [
                [
                    'type' => 'debit',
                    'account_id' => $this->settlementAccountIdForPaymentMethod($method, $entry->store_id),
                    'amount' => $amount,
                    'description' => "{$methodName}{$channel} Commission Returned - {$orderNumber}",
                ],
                [
                    'type' => 'credit',
                    'account_id' => $this->accountId('payment_processing_fee'),
                    'amount' => $amount,
                    'description' => "Reverse {$methodName}{$channel} Commission Expense - {$orderNumber}",
                ],
            ],
            [
                'source' => 'payment_commission_reversal',
                'order_id' => $entry->order_id,
                'payment_method_id' => $entry->payment_method_id,
                'channel_code' => $entry->channel_code,
                'commission_entry_id' => $entry->id,
                'reversed_commission_amount' => $amount,
                'refund_policy' => $entry->refund_policy,
            ],
            'completed',
            $replace
        );
    }

    public function postOrderPayment(OrderPayment $payment): ?Transaction
    {
        $payment = $payment->loadMissing('order', 'paymentMethod', 'customer');
        $order = $payment->order;
        if (!$order) {
            return null;
        }

        if (in_array($payment->payment_type, ['exchange_balance', 'store_credit', 'balance_carryover'], true)) {
            return null;
        }

        $amount = round(abs((float) $payment->amount), 2);
        if ($amount <= 0) {
            return null;
        }

        $status = $payment->status === 'completed' ? 'completed' : 'pending';
        // Historical ledgers in this codebase often used only reference_type/reference_id and no event_key.
        // Do not double-post those unless a sync command has explicitly cancelled/rebuilt them with --force.
        if (!$this->hasActiveManagedEvent("order_payment:{$payment->id}:counter_sale_revenue")
            && !$this->hasActiveManagedEvent("order_payment:{$payment->id}:customer_advance_received")
            && !$this->hasActiveManagedEvent("order_payment:{$payment->id}:cod_delivered_revenue")
            && $this->hasAnyActiveReferenceRows(OrderPayment::class, (int) $payment->id)) {
            return Transaction::where('reference_type', OrderPayment::class)
                ->where('reference_id', $payment->id)
                ->whereIn('status', ['pending', 'completed'])
                ->first();
        }

        $date = $order->order_type === 'counter'
            ? ($order->order_date ?? $payment->completed_at ?? $payment->created_at ?? now())
            : ($payment->completed_at ?? $payment->processed_at ?? $payment->created_at ?? now());
        $metadata = [
            'source' => 'order_payment',
            'payment_number' => $payment->payment_number,
            'payment_method' => $payment->paymentMethod->name ?? $payment->payment_method ?? null,
            'payment_method_code' => $payment->paymentMethod->code ?? null,
            'payment_type' => $payment->payment_type,
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'order_type' => $order->order_type,
            'customer_id' => $payment->customer_id,
            'customer_name' => $payment->customer->name ?? null,
        ];

        if ($this->isCodPayment($payment)) {
            $lines = [
                ['type' => 'debit', 'account_id' => $this->accountId('pathao_receivable'), 'amount' => $amount, 'description' => "COD Delivered - Pathao Receivable - {$order->order_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('sales_revenue'), 'amount' => $amount, 'description' => "COD Delivered - Sales Revenue - {$order->order_number}"],
            ];

            $first = $this->postBalancedJournal(
                "order_payment:{$payment->id}:cod_delivered_revenue",
                OrderPayment::class,
                (int) $payment->id,
                $date,
                "COD Delivered - {$order->order_number}",
                $payment->store_id ?: $order->store_id,
                $payment->processed_by ?: $order->processed_by ?: $order->created_by,
                $lines,
                array_merge($metadata, ['source' => 'pathao_cod_delivered']) ,
                $status
            );

            $this->postPathaoFeeForOrder($order);
            return $first;
        }

        if ($order->order_type !== 'counter') {
            $debitAccount = $this->isSslCommerzPayment($payment)
                ? $this->accountId('sslcommerz_receivable')
                : $this->settlementAccountIdForPaymentMethod($payment->paymentMethod, $order->store_id);

            return $this->postBalancedJournal(
                "order_payment:{$payment->id}:customer_advance_received",
                OrderPayment::class,
                (int) $payment->id,
                $date,
                "Customer Advance Received - {$order->order_number}",
                $payment->store_id ?: $order->store_id,
                $payment->processed_by ?: $order->processed_by ?: $order->created_by,
                [
                    ['type' => 'debit', 'account_id' => $debitAccount, 'amount' => $amount, 'description' => "Customer Advance Received - {$order->order_number}"],
                    ['type' => 'credit', 'account_id' => $this->accountId('customer_advance'), 'amount' => $amount, 'description' => "Customer Advance Liability - {$order->order_number}"],
                ],
                array_merge($metadata, [
                    'source' => $this->isSslCommerzPayment($payment) ? 'sslcommerz_payment_captured' : 'customer_advance_received',
                    'advance_amount' => $amount,
                ]),
                $status
            );
        }

        // Counter/offline sale: payment is liquid immediately and revenue is recognised immediately.
        $taxAmount = $this->proportionalTaxForPayment($order, $amount);
        $salesAmount = round($amount - $taxAmount, 2);
        $lines = [
            ['type' => 'debit', 'account_id' => $this->settlementAccountIdForPaymentMethod($payment->paymentMethod, $order->store_id), 'amount' => $amount, 'description' => "Counter Payment - Cash/Bank In - {$order->order_number}"],
            ['type' => 'credit', 'account_id' => $this->accountId('sales_revenue'), 'amount' => $salesAmount, 'description' => "Counter Sale Revenue - {$order->order_number}"],
        ];
        if ($taxAmount > 0) {
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('tax_payable'), 'amount' => $taxAmount, 'description' => "Sales Tax Collected - {$order->order_number}"];
        }

        return $this->postBalancedJournal(
            "order_payment:{$payment->id}:counter_sale_revenue",
            OrderPayment::class,
            (int) $payment->id,
            $date,
            "Counter Sale Payment - {$order->order_number}",
            $payment->store_id ?: $order->store_id,
            $payment->processed_by ?: $order->processed_by ?: $order->created_by,
            $lines,
            array_merge($metadata, [
                'source' => 'counter_sale_payment',
                'tax_amount' => $taxAmount,
            ]),
            $status
        );
    }

    public function postOrderCompletionRevenue(Order $order): ?Transaction
    {
        $order = $order->loadMissing('payments');
        if ($order->order_type === 'counter') {
            return null;
        }

        $advanceCredits = Transaction::where('reference_type', OrderPayment::class)
            ->whereIn('reference_id', $order->payments->pluck('id')->all() ?: [-1])
            ->where('account_id', $this->accountId('customer_advance'))
            ->where('type', 'credit')
            ->where('status', 'completed')
            ->sum('amount');

        $advanceAmount = round((float) $advanceCredits, 2);
        if ($advanceAmount <= 0) {
            return null;
        }

        $taxAmount = $this->proportionalTaxForOrderAmount($order, $advanceAmount);
        $salesAmount = round($advanceAmount - $taxAmount, 2);
        $lines = [
            ['type' => 'debit', 'account_id' => $this->accountId('customer_advance'), 'amount' => $advanceAmount, 'description' => "Customer Advance Cleared - {$order->order_number}"],
            ['type' => 'credit', 'account_id' => $this->accountId('sales_revenue'), 'amount' => $salesAmount, 'description' => "Sales Revenue Recognised - {$order->order_number}"],
        ];
        if ($taxAmount > 0) {
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('tax_payable'), 'amount' => $taxAmount, 'description' => "Sales Tax Recognised - {$order->order_number}"];
        }

        return $this->postBalancedJournal(
            "order:{$order->id}:advance_revenue_recognised",
            Order::class,
            (int) $order->id,
            $order->delivered_at ?? $order->completed_at ?? now(),
            "Online/Social Sale Completed - {$order->order_number}",
            $order->store_id,
            $order->processed_by ?: $order->created_by,
            $lines,
            [
                'source' => 'order_completion_revenue',
                'order_number' => $order->order_number,
                'order_type' => $order->order_type,
                'advance_amount' => $advanceAmount,
                'tax_amount' => $taxAmount,
            ]
        );
    }

    public function postOrderCOGS(Order $order): ?Transaction
    {
        $order = $order->loadMissing('items', 'customer');
        $totalCOGS = round((float) $order->items->sum('cogs'), 2);
        if ($totalCOGS <= 0) {
            return null;
        }

        $eventKey = "order:{$order->id}:cogs";

        return $this->postBalancedJournal(
            $eventKey,
            Order::class,
            (int) $order->id,
            ($order->order_type === 'counter'
                ? ($order->order_date ?? $order->confirmed_at ?? $order->updated_at ?? now())
                : ($order->delivered_at ?? $order->completed_at ?? $order->updated_at ?? now())),
            "COGS - Order {$order->order_number}",
            $order->store_id,
            $order->created_by,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('cogs'), 'amount' => $totalCOGS, 'description' => "COGS - {$order->order_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('inventory'), 'amount' => $totalCOGS, 'description' => "Inventory Out - {$order->order_number}"],
            ],
            [
                'source' => 'order_cogs',
                'order_number' => $order->order_number,
                'order_type' => $order->order_type,
                'items_count' => $order->items->count(),
            ]
        );
    }

    public function postPathaoFeeForOrder(Order $order): ?Transaction
    {
        $shipment = $order->shipments()
            ->where(function ($q) {
                $q->where('carrier_name', 'like', '%pathao%')
                    ->orWhereNotNull('pathao_consignment_id');
            })
            ->latest()
            ->first();

        if (!$shipment) {
            return null;
        }

        return $this->postPathaoFeeForShipment($shipment);
    }

    public function postPathaoFeeForShipment(Shipment $shipment): ?Transaction
    {
        $fee = round(abs((float) ($shipment->delivery_fee ?? 0)), 2);
        if ($fee <= 0) {
            return null;
        }

        $order = $shipment->order;
        return $this->postBalancedJournal(
            "shipment:{$shipment->id}:pathao_delivery_fee",
            Shipment::class,
            (int) $shipment->id,
            $shipment->delivered_at ?? now(),
            "Pathao Delivery Fee - {$shipment->shipment_number}",
            $shipment->store_id ?: ($order->store_id ?? null),
            $shipment->processed_by ?: $shipment->created_by ?: ($order->created_by ?? null),
            [
                ['type' => 'debit', 'account_id' => $this->accountId('delivery_expense_pathao'), 'amount' => $fee, 'description' => "Pathao Delivery Expense - {$shipment->shipment_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('pathao_receivable'), 'amount' => $fee, 'description' => "Pathao Fee Deducted from Receivable - {$shipment->shipment_number}"],
            ],
            [
                'source' => 'pathao_delivery_fee',
                'shipment_number' => $shipment->shipment_number,
                'order_id' => $shipment->order_id,
                'order_number' => $order->order_number ?? null,
            ]
        );
    }

    public function postSslSettlement($referenceType, int $referenceId, float $grossAmount, float $feeAmount, float $netAmount, $date, ?int $createdBy = null, array $metadata = []): ?Transaction
    {
        $grossAmount = round(abs($grossAmount), 2);
        $feeAmount = round(abs($feeAmount), 2);
        $netAmount = round(abs($netAmount), 2);
        if ($grossAmount <= 0) {
            return null;
        }
        if (abs(($netAmount + $feeAmount) - $grossAmount) > self::EPSILON) {
            $netAmount = round($grossAmount - $feeAmount, 2);
        }

        $lines = [
            ['type' => 'debit', 'account_id' => $this->accountId('bank'), 'amount' => $netAmount, 'description' => 'SSLCommerz Settlement - Bank In'],
            ['type' => 'credit', 'account_id' => $this->accountId('sslcommerz_receivable'), 'amount' => $grossAmount, 'description' => 'SSLCommerz Settlement - Receivable Cleared'],
        ];
        if ($feeAmount > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('ssl_fee_expense'), 'amount' => $feeAmount, 'description' => 'SSLCommerz Commission Expense'];
        }

        return $this->postBalancedJournal(
            "ssl_settlement:{$referenceType}:{$referenceId}",
            is_string($referenceType) ? $referenceType : (string) $referenceType,
            $referenceId,
            $date,
            'SSLCommerz Settlement Received',
            null,
            $createdBy,
            $lines,
            array_merge(['source' => 'sslcommerz_settlement'], $metadata)
        );
    }

    public function postPathaoDisbursement($referenceType, int $referenceId, float $amount, $date, ?int $createdBy = null, array $metadata = []): ?Transaction
    {
        $amount = round(abs($amount), 2);
        if ($amount <= 0) {
            return null;
        }

        return $this->postBalancedJournal(
            "pathao_disbursement:{$referenceType}:{$referenceId}",
            is_string($referenceType) ? $referenceType : (string) $referenceType,
            $referenceId,
            $date,
            'Pathao Disbursement Received',
            null,
            $createdBy,
            [
                ['type' => 'debit', 'account_id' => $this->accountId('bank'), 'amount' => $amount, 'description' => 'Pathao Disbursement - Bank In'],
                ['type' => 'credit', 'account_id' => $this->accountId('pathao_receivable'), 'amount' => $amount, 'description' => 'Pathao Disbursement - Receivable Cleared'],
            ],
            array_merge(['source' => 'pathao_disbursement'], $metadata)
        );
    }

    public function postRefund(Refund $refund): ?Transaction
    {
        if ($refund->refund_type === 'exchange_refund') {
            return null;
        }

        $refund = $refund->loadMissing('order', 'customer');
        $order = $refund->order;
        $amount = round(abs((float) ($refund->refund_amount ?? 0)), 2);
        if (!$order || $amount <= 0) {
            return null;
        }

        $creditAccount = $this->refundCreditAccountId($refund, $order);
        $taxAmount = $this->proportionalTaxForOrderAmount($order, $amount);
        $salesReturnAmount = round($amount - $taxAmount, 2);
        $lines = [
            ['type' => 'debit', 'account_id' => $this->accountId('sales_return'), 'amount' => $salesReturnAmount, 'description' => "Sales Return / Refund - {$refund->refund_number}"],
            ['type' => 'credit', 'account_id' => $creditAccount, 'amount' => $amount, 'description' => "Refund Settlement - {$refund->refund_number}"],
        ];
        if ($taxAmount > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('tax_payable'), 'amount' => $taxAmount, 'description' => "Tax Reversal - {$refund->refund_number}"];
        }

        return $this->postBalancedJournal(
            "refund:{$refund->id}:sales_return",
            Refund::class,
            (int) $refund->id,
            $refund->completed_at ?? now(),
            "Refund - {$refund->refund_number}",
            $order->store_id,
            $refund->processed_by ?: $order->processed_by ?: $order->created_by,
            $lines,
            [
                'source' => 'refund_sales_return',
                'refund_number' => $refund->refund_number,
                'order_number' => $order->order_number,
                'refund_method' => $refund->refund_method,
                'refund_type' => $refund->refund_type,
                'tax_amount' => $taxAmount,
            ],
            $refund->status === 'completed' ? 'completed' : 'pending'
        );
    }

    public function postReturnRestock(ProductReturn $return): ?Transaction
    {
        $return = $return->loadMissing('order');
        $amount = round(abs((float) ($return->total_return_value ?? 0)), 2);
        if ($amount <= 0) {
            return null;
        }

        $inventoryDebitAccount = $this->isReturnSellable($return)
            ? $this->accountId('inventory')
            : $this->accountId('damaged_inventory_loss');

        return $this->postBalancedJournal(
            "product_return:{$return->id}:restock_cogs_reversal",
            ProductReturn::class,
            (int) $return->id,
            $return->updated_at ?? now(),
            "Return Restock / COGS Reversal - {$return->return_number}",
            $return->order->store_id ?? null,
            $return->processed_by,
            [
                ['type' => 'debit', 'account_id' => $inventoryDebitAccount, 'amount' => $amount, 'description' => "Returned Item Restocked - {$return->return_number}"],
                ['type' => 'credit', 'account_id' => $this->accountId('cogs'), 'amount' => $amount, 'description' => "COGS Reversal - {$return->return_number}"],
            ],
            [
                'source' => 'return_restock_cogs_reversal',
                'return_number' => $return->return_number,
                'order_number' => $return->order->order_number ?? null,
                'sellable' => $this->isReturnSellable($return),
            ]
        );
    }

    public function postExchange(ProductReturn $return, Order $newOrder): ?Transaction
    {
        $return = $return->loadMissing('order');
        $newOrder = $newOrder->loadMissing('items');
        $oldSaleValue = round(abs((float) ($return->refund_amount ?? $return->total_return_value ?? 0)), 2);
        $oldCost = round(abs((float) ($return->total_return_value ?? 0)), 2);
        $newSaleValue = round(abs((float) ($newOrder->total_amount ?? 0)), 2);
        $newCost = round(abs((float) $newOrder->items->sum('cogs')), 2);
        $diff = round($newSaleValue - $oldSaleValue, 2);

        $lines = [];
        if ($oldSaleValue > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('sales_return'), 'amount' => $oldSaleValue, 'description' => "Exchange - Return Old Sale - {$return->return_number}"];
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('exchange_clearing'), 'amount' => $oldSaleValue, 'description' => "Exchange Clearing - Old Value - {$return->return_number}"];
        }
        if ($oldCost > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('inventory'), 'amount' => $oldCost, 'description' => "Exchange - Old Item Back to Inventory - {$return->return_number}"];
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('cogs'), 'amount' => $oldCost, 'description' => "Exchange - Old Item COGS Reversal - {$return->return_number}"];
        }
        if ($newSaleValue > 0) {
            $clearingUse = min($oldSaleValue, $newSaleValue);
            if ($clearingUse > 0) {
                $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('exchange_clearing'), 'amount' => $clearingUse, 'description' => "Exchange Clearing Used - {$newOrder->order_number}"];
            }
            if ($diff > 0) {
                $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('cash'), 'amount' => $diff, 'description' => "Exchange Upgrade Cash In - {$newOrder->order_number}"];
            }
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('sales_revenue'), 'amount' => $newSaleValue, 'description' => "Exchange - New Item Sale - {$newOrder->order_number}"];
        }
        if ($diff < 0) {
            $refundDiff = abs($diff);
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('exchange_clearing'), 'amount' => $refundDiff, 'description' => "Exchange Downgrade Difference - {$return->return_number}"];
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('cash'), 'amount' => $refundDiff, 'description' => "Exchange Downgrade Refund - {$return->return_number}"];
        }
        if ($newCost > 0) {
            $lines[] = ['type' => 'debit', 'account_id' => $this->accountId('cogs'), 'amount' => $newCost, 'description' => "Exchange - New Item COGS - {$newOrder->order_number}"];
            $lines[] = ['type' => 'credit', 'account_id' => $this->accountId('inventory'), 'amount' => $newCost, 'description' => "Exchange - New Item Out of Inventory - {$newOrder->order_number}"];
        }

        return $this->postBalancedJournal(
            "exchange:return:{$return->id}:new_order:{$newOrder->id}",
            ProductReturn::class,
            (int) $return->id,
            now(),
            "Exchange - {$return->return_number} / {$newOrder->order_number}",
            $newOrder->store_id ?: ($return->order->store_id ?? null),
            auth()->id() ?: $newOrder->created_by,
            $lines,
            [
                'source' => 'exchange_full_flow',
                'return_number' => $return->return_number,
                'old_order_number' => $return->order->order_number ?? null,
                'new_order_id' => $newOrder->id,
                'new_order_number' => $newOrder->order_number,
                'old_sale_value' => $oldSaleValue,
                'new_sale_value' => $newSaleValue,
                'net_difference' => $diff,
            ]
        );
    }

    private function receiptEventKey(PurchaseOrder $po, float $amount, array $metadata): string
    {
        if (!empty($metadata['receipt_batch_key'])) {
            return "purchase_order:{$po->id}:receipt:" . $metadata['receipt_batch_key'];
        }

        $lineSignature = md5(json_encode($metadata['received_lines'] ?? []) . '|' . $amount . '|' . now()->format('YmdHisv'));
        return "purchase_order:{$po->id}:receipt:{$lineSignature}";
    }

    private function normaliseDate($date): string
    {
        if ($date instanceof \DateTimeInterface) {
            return Carbon::instance($date)->toDateString();
        }
        if ($date) {
            return Carbon::parse($date)->toDateString();
        }
        return now()->toDateString();
    }

    public function settlementAccountIdForPaymentMethod(?PaymentMethod $paymentMethod = null, $storeId = null): int
    {
        $type = strtolower((string) ($paymentMethod->type ?? 'cash'));
        $code = strtolower((string) ($paymentMethod->code ?? ''));
        $name = strtolower((string) ($paymentMethod->name ?? ''));

        if ($type === 'cash' || $code === 'cash' || str_contains($name, 'cash')) {
            return $this->accountId('cash');
        }

        return $this->accountId('bank');
    }

    private function isCodPayment(OrderPayment $payment): bool
    {
        $code = strtolower((string) ($payment->paymentMethod->code ?? ''));
        $type = strtolower((string) ($payment->paymentMethod->type ?? ''));
        $name = strtolower((string) ($payment->paymentMethod->name ?? ''));
        $metadata = array_merge((array) ($payment->metadata ?? []), (array) ($payment->payment_data ?? []));
        $source = strtolower((string) ($metadata['source'] ?? ''));

        return $code === 'cod'
            || $type === 'cod'
            || str_contains($name, 'cash on delivery')
            || str_contains($source, 'pathao')
            || strtolower((string) ($payment->order->payment_method ?? '')) === 'cod';
    }

    private function isSslCommerzPayment(OrderPayment $payment): bool
    {
        $method = $payment->paymentMethod;
        $code = strtolower((string) ($method->code ?? ''));
        $name = strtolower((string) ($method->name ?? ''));
        $processor = strtolower((string) ($method->processor ?? ''));
        $orderMethod = strtolower((string) ($payment->order->payment_method ?? ''));
        $metadata = array_merge((array) ($payment->metadata ?? []), (array) ($payment->payment_data ?? []));
        $source = strtolower(json_encode($metadata));

        return str_contains($code, 'ssl')
            || str_contains($name, 'ssl')
            || str_contains($processor, 'ssl')
            || str_contains($orderMethod, 'ssl')
            || str_contains($source, 'sslcommerz')
            || str_contains($source, 'sslzc');
    }

    private function proportionalTaxForPayment(Order $order, float $paymentAmount): float
    {
        return $this->proportionalTaxForOrderAmount($order, $paymentAmount);
    }

    private function proportionalTaxForOrderAmount(Order $order, float $amount): float
    {
        $orderTotal = (float) ($order->total_amount ?? 0);
        $taxTotal = (float) ($order->tax_amount ?? 0);
        if ($orderTotal <= 0 || $taxTotal <= 0) {
            return 0.0;
        }
        return round($amount * ($taxTotal / $orderTotal), 2);
    }

    private function refundCreditAccountId(Refund $refund, Order $order): int
    {
        $method = strtolower((string) ($refund->refund_method ?? ''));
        if (str_contains($method, 'store_credit')) {
            return $this->accountId('customer_store_credit');
        }
        if (str_contains($method, 'pending') || str_contains($method, 'payable')) {
            return $this->accountId('customer_refund_payable');
        }
        if ($order->order_type !== 'counter') {
            if (str_contains(strtolower((string) $order->payment_method), 'ssl')) {
                return $this->accountId('sslcommerz_receivable');
            }
            if ((string) $order->payment_method === 'cod') {
                return $this->accountId('pathao_receivable');
            }
        }
        return $this->settlementAccountIdForPaymentMethod(null, $order->store_id);
    }

    private function isReturnSellable(ProductReturn $return): bool
    {
        $metadata = (array) ($return->metadata ?? []);
        if (array_key_exists('sellable', $metadata)) {
            return (bool) $metadata['sellable'];
        }
        if (property_exists($return, 'quality_check_passed') || isset($return->quality_check_passed)) {
            return (bool) $return->quality_check_passed;
        }
        return true;
    }
}
