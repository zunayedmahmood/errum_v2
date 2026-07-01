<?php

namespace App\Observers;

use App\Models\ExpensePayment;
use App\Models\Transaction as AccountingTransaction;
use Illuminate\Support\Str;

class ExpensePaymentObserver
{
    /**
     * Handle the ExpensePayment "created" event.
     */
    public function created(ExpensePayment $expensePayment): void
    {
        if ($expensePayment->status === 'completed') {
            AccountingTransaction::createFromExpensePayment($expensePayment);
        }
    }

    /**
     * Handle the ExpensePayment "updated" event.
     */
    public function updated(ExpensePayment $expensePayment): void
    {
        if ($expensePayment->wasChanged('status') && $expensePayment->status === 'completed') {
            $exists = AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)->exists();

            if ($exists) {
                AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                    ->update([
                        'status' => 'completed',
                        'transaction_date' => $expensePayment->completed_at ?? now(),
                    ]);
            } else {
                AccountingTransaction::createFromExpensePayment($expensePayment);
            }
        }

        if ($expensePayment->wasChanged('status') && in_array($expensePayment->status, ['cancelled', 'failed'], true)) {
            AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                ->update(['status' => 'cancelled']);
        }

        // Expense payment refund: money comes back and the expense is reduced.
        if ($expensePayment->wasChanged('status') && in_array($expensePayment->status, ['refunded', 'partially_refunded'], true)) {
            $refundAmount = (float) $expensePayment->refunded_amount;
            if ($refundAmount <= 0) {
                return;
            }

            $alreadyRecorded = AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                ->where('description', 'like', 'Expense Payment Refund%')
                ->exists();

            if ($alreadyRecorded) {
                return;
            }

            $groupId = (string) Str::uuid();
            $settlementAccountId = AccountingTransaction::getSettlementAccountIdForPaymentMethod(
                $expensePayment->paymentMethod,
                $expensePayment->store_id
            );
            $expenseAccountId = AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                ->where('type', 'debit')
                ->where('description', 'like', 'Expense Recognized%')
                ->value('account_id') ?: AccountingTransaction::getOperatingExpenseAccountId();

            $metadata = [
                'payment_method' => $expensePayment->paymentMethod->name ?? 'Unknown',
                'expense_number' => $expensePayment->expense->expense_number ?? null,
                'refund_amount' => $refundAmount,
                'source' => 'expense_payment_refund',
                'group_id' => $groupId,
            ];

            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $refundAmount,
                'type' => 'debit',
                'account_id' => $settlementAccountId,
                'reference_type' => ExpensePayment::class,
                'reference_id' => $expensePayment->id,
                'description' => "Expense Payment Refund (Money In) - {$expensePayment->payment_number}",
                'store_id' => $expensePayment->store_id,
                'created_by' => auth()->id(),
                'metadata' => $metadata,
                'status' => 'completed',
            ]);

            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $refundAmount,
                'type' => 'credit',
                'account_id' => $expenseAccountId,
                'reference_type' => ExpensePayment::class,
                'reference_id' => $expensePayment->id,
                'description' => "Expense Payment Refund (Expense Reversal) - {$expensePayment->payment_number}",
                'store_id' => $expensePayment->store_id,
                'created_by' => auth()->id(),
                'metadata' => $metadata,
                'status' => 'completed',
            ]);
        }
    }

    /**
     * Handle the ExpensePayment "deleted" event.
     */
    public function deleted(ExpensePayment $expensePayment): void
    {
        AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the ExpensePayment "restored" event.
     */
    public function restored(ExpensePayment $expensePayment): void
    {
        $status = $expensePayment->status === 'completed' ? 'completed' : 'pending';
        AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
            ->update(['status' => $status]);
    }

    /**
     * Handle the ExpensePayment "force deleted" event.
     */
    public function forceDeleted(ExpensePayment $expensePayment): void
    {
        AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)->delete();
    }
}
