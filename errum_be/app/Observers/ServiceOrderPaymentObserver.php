<?php

namespace App\Observers;

use App\Models\ServiceOrderPayment;
use App\Models\Transaction as AccountingTransaction;

class ServiceOrderPaymentObserver
{
    /**
     * Handle the ServiceOrderPayment "created" event.
     */
    public function created(ServiceOrderPayment $serviceOrderPayment): void
    {
        // Create transaction when payment is created
        AccountingTransaction::createFromServiceOrderPayment($serviceOrderPayment);
    }

    /**
     * Handle the ServiceOrderPayment "updated" event.
     */
    public function updated(ServiceOrderPayment $serviceOrderPayment): void
    {
        // Check if status changed to completed
        if ($serviceOrderPayment->wasChanged('status') && $serviceOrderPayment->status === 'completed') {
            // Find existing transaction or create new one
            $transaction = AccountingTransaction::byReference(ServiceOrderPayment::class, $serviceOrderPayment->id)->first();

            if ($transaction) {
                // Update existing transaction
                $transaction->update([
                    'status' => 'completed',
                    'transaction_date' => $serviceOrderPayment->completed_at ?? now(),
                ]);
            } else {
                // Create new transaction if it doesn't exist
                AccountingTransaction::createFromServiceOrderPayment($serviceOrderPayment);
            }
        }

        // Handle refunds
        if ($serviceOrderPayment->wasChanged('refunded_amount') && $serviceOrderPayment->refunded_amount > 0) {
            // Create credit transaction for refund
            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $serviceOrderPayment->refunded_amount,
                'type' => 'credit',
                'account_id' => AccountingTransaction::getCashAccountId($serviceOrderPayment->store_id),
                'reference_type' => ServiceOrderPayment::class,
                'reference_id' => $serviceOrderPayment->id,
                'description' => "Refund from Service Order Payment - {$serviceOrderPayment->payment_number}",
                'store_id' => $serviceOrderPayment->store_id,
                'created_by' => auth()->id(),
                'metadata' => [
                    'payment_method' => $serviceOrderPayment->paymentMethod->name ?? 'Unknown',
                    'service_order_number' => $serviceOrderPayment->serviceOrder->order_number ?? null,
                    'refund_reason' => 'Payment refund',
                ],
                'status' => 'completed',
            ]);
        }
    }

    /**
     * Handle the ServiceOrderPayment "deleted" event.
     */
    public function deleted(ServiceOrderPayment $serviceOrderPayment): void
    {
        // Mark related transactions as cancelled
        AccountingTransaction::byReference(ServiceOrderPayment::class, $serviceOrderPayment->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the ServiceOrderPayment "restored" event.
     */
    public function restored(ServiceOrderPayment $serviceOrderPayment): void
    {
        // Restore related transactions
        AccountingTransaction::byReference(ServiceOrderPayment::class, $serviceOrderPayment->id)
            ->update(['status' => 'completed']);
    }

    /**
     * Handle the ServiceOrderPayment "force deleted" event.
     */
    public function forceDeleted(ServiceOrderPayment $serviceOrderPayment): void
    {
        // Permanently delete related transactions
        AccountingTransaction::byReference(ServiceOrderPayment::class, $serviceOrderPayment->id)->delete();
    }
}
