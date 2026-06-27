<?php

namespace App\Observers;

use App\Models\ExpensePayment;
use App\Models\Transaction as AccountingTransaction;

class ExpensePaymentObserver
{
    public function created(ExpensePayment $expensePayment): void
    {
        if ($expensePayment->status === 'completed') {
            AccountingTransaction::createFromExpensePayment($expensePayment);
        }
    }

    public function updated(ExpensePayment $expensePayment): void
    {
        if ($expensePayment->wasChanged('status')) {
            if ($expensePayment->status === 'completed') {
                AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                    ->where(function ($q) {
                        $q->where('metadata->event', 'expense_payment')
                          ->orWhere('description', 'like', 'Expense%');
                    })
                    ->update(['status' => 'cancelled']);
                AccountingTransaction::createFromExpensePayment($expensePayment);
            } elseif (in_array($expensePayment->status, ['cancelled', 'failed', 'refunded'], true)) {
                AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
                    ->update(['status' => 'cancelled']);
            }
        }
    }

    public function deleted(ExpensePayment $expensePayment): void
    {
        AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)
            ->update(['status' => 'cancelled']);
    }

    public function restored(ExpensePayment $expensePayment): void
    {
        if ($expensePayment->status === 'completed') {
            AccountingTransaction::createFromExpensePayment($expensePayment);
        }
    }

    public function forceDeleted(ExpensePayment $expensePayment): void
    {
        AccountingTransaction::byReference(ExpensePayment::class, $expensePayment->id)->delete();
    }
}
