<?php

namespace App\Observers;

use App\Models\Refund;
use App\Models\Transaction as AccountingTransaction;

class RefundObserver
{
    /**
     * Handle the Refund "created" event.
     */
    public function created(Refund $refund): void
    {
        // Create transaction when refund is created
        AccountingTransaction::createFromRefund($refund);
    }

    /**
     * Handle the Refund "updated" event.
     */
    public function updated(Refund $refund): void
    {
        // Check if status changed to completed
        if ($refund->wasChanged('status') && $refund->status === 'completed') {
            // Find existing transaction or create new one
            $transaction = AccountingTransaction::byReference(Refund::class, $refund->id)->first();

            if ($transaction) {
                // Update existing transaction
                $transaction->update([
                    'status' => 'completed',
                    'transaction_date' => $refund->completed_at ?? now(),
                ]);
            } else {
                // Create new transaction if it doesn't exist
                AccountingTransaction::createFromRefund($refund);
            }
        }
    }

    /**
     * Handle the Refund "deleted" event.
     */
    public function deleted(Refund $refund): void
    {
        // Mark related transactions as cancelled
        AccountingTransaction::byReference(Refund::class, $refund->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the Refund "restored" event.
     */
    public function restored(Refund $refund): void
    {
        // Restore related transactions
        AccountingTransaction::byReference(Refund::class, $refund->id)
            ->update(['status' => 'completed']);
    }

    /**
     * Handle the Refund "force deleted" event.
     */
    public function forceDeleted(Refund $refund): void
    {
        // Permanently delete related transactions
        AccountingTransaction::byReference(Refund::class, $refund->id)->delete();
    }
}
