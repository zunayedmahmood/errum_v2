<?php

namespace App\Observers;

use App\Models\OrderPayment;
use App\Models\Transaction as AccountingTransaction;

class OrderPaymentObserver
{
    /**
     * Handle the OrderPayment "created" event.
     */
    public function created(OrderPayment $orderPayment): void
    {
        // Create transaction when payment is created
        AccountingTransaction::createFromOrderPayment($orderPayment);
    }

    /**
     * Handle the OrderPayment "updated" event.
     */
    public function updated(OrderPayment $orderPayment): void
    {
        // Check if status changed to completed
        if ($orderPayment->wasChanged('status') && $orderPayment->status === 'completed') {
            // Find existing transaction or create new one
            $transaction = AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)->first();

            if ($transaction) {
                // Update existing transaction
                $transaction->update([
                    'status' => 'completed',
                    'transaction_date' => $orderPayment->completed_at ?? now(),
                ]);
            } else {
                // Create new transaction if it doesn't exist
                AccountingTransaction::createFromOrderPayment($orderPayment);
            }
        }

        // Handle refunds
        if ($orderPayment->wasChanged('refunded_amount') && $orderPayment->refunded_amount > 0) {
            // Create credit transaction for refund
            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $orderPayment->refunded_amount,
                'type' => 'credit',
                'account_id' => AccountingTransaction::getCashAccountId($orderPayment->store_id),
                'reference_type' => OrderPayment::class,
                'reference_id' => $orderPayment->id,
                'description' => "Refund from Order Payment - {$orderPayment->payment_number}",
                'store_id' => $orderPayment->store_id,
                'created_by' => auth()->id(),
                'metadata' => [
                    'payment_method' => $orderPayment->paymentMethod->name ?? 'Unknown',
                    'order_number' => $orderPayment->order->order_number ?? null,
                    'refund_reason' => 'Payment refund',
                ],
                'status' => 'completed',
            ]);
        }
    }

    /**
     * Handle the OrderPayment "deleted" event.
     */
    public function deleted(OrderPayment $orderPayment): void
    {
        // Mark related transactions as cancelled
        AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the OrderPayment "restored" event.
     */
    public function restored(OrderPayment $orderPayment): void
    {
        // Restore related transactions
        AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)
            ->update(['status' => 'completed']);
    }

    /**
     * Handle the OrderPayment "force deleted" event.
     */
    public function forceDeleted(OrderPayment $orderPayment): void
    {
        // Permanently delete related transactions
        AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)->delete();
    }
}
