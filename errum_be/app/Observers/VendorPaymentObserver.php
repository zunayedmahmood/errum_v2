<?php

namespace App\Observers;

use App\Models\VendorPayment;
use App\Models\Transaction as AccountingTransaction;

class VendorPaymentObserver
{
    /**
     * Handle the VendorPayment "created" event.
     */
    public function created(VendorPayment $vendorPayment): void
    {
        // Create transaction when vendor payment is created
        if ($vendorPayment->status === 'completed') {
            AccountingTransaction::createFromVendorPayment($vendorPayment);
        }
    }

    /**
     * Handle the VendorPayment "updated" event.
     */
    public function updated(VendorPayment $vendorPayment): void
    {
        // Check if status changed to completed
        if ($vendorPayment->wasChanged('status') && $vendorPayment->status === 'completed') {
            $existingQuery = AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id);

            if ((clone $existingQuery)->exists()) {
                $existingQuery->update([
                    'status' => 'completed',
                    'transaction_date' => $vendorPayment->processed_at ?? now(),
                ]);
            } else {
                AccountingTransaction::createFromVendorPayment($vendorPayment);
            }
        }

        if ($vendorPayment->wasChanged('status') && in_array($vendorPayment->status, ['cancelled', 'failed'], true)) {
            AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id)
                ->update(['status' => 'cancelled']);
        }

        // Handle vendor refunds - money comes back and the payable/deposit previously settled is restored.
        if ($vendorPayment->wasChanged('status') && $vendorPayment->status === 'refunded') {
            $alreadyRecorded = AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id)
                ->where('description', 'like', 'Vendor Refund%')
                ->exists();

            if ($alreadyRecorded) {
                return;
            }

            $amount = abs((float) $vendorPayment->amount);
            if ($amount <= 0) {
                return;
            }

            $metadata = [
                'payment_method' => $vendorPayment->paymentMethod->name ?? 'Unknown',
                'vendor_name' => $vendorPayment->vendor->name ?? null,
                'refund_reason' => 'Vendor payment refund',
                'source' => 'vendor_payment_refund',
            ];

            // 1. Debit Cash/Bank (money coming back to business).
            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $amount,
                'type' => 'debit',
                'account_id' => AccountingTransaction::getSettlementAccountIdForPaymentMethod($vendorPayment->paymentMethod, null),
                'reference_type' => VendorPayment::class,
                'reference_id' => $vendorPayment->id,
                'description' => "Vendor Refund (Cash/Bank Received) - {$vendorPayment->payment_number}",
                'created_by' => auth()->id(),
                'metadata' => $metadata,
                'status' => 'completed',
            ]);

            // 2. Credit AP (or supplier deposit in a full advance refund) to reverse the earlier debit.
            $creditAccountId = $vendorPayment->payment_type === 'advance'
                ? AccountingTransaction::getVendorAdvanceAccountId()
                : AccountingTransaction::getAccountsPayableAccountId();

            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount' => $amount,
                'type' => 'credit',
                'account_id' => $creditAccountId,
                'reference_type' => VendorPayment::class,
                'reference_id' => $vendorPayment->id,
                'description' => "Vendor Refund (Payment Reversal) - {$vendorPayment->payment_number}",
                'created_by' => auth()->id(),
                'metadata' => $metadata,
                'status' => 'completed',
            ]);
        }
    }

    /**
     * Handle the VendorPayment "deleted" event.
     */
    public function deleted(VendorPayment $vendorPayment): void
    {
        // Mark related transactions as cancelled
        AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the VendorPayment "restored" event.
     */
    public function restored(VendorPayment $vendorPayment): void
    {
        // Restore related transactions
        $status = $vendorPayment->status === 'completed' ? 'completed' : 'pending';
        AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id)
            ->update(['status' => $status]);
    }

    /**
     * Handle the VendorPayment "force deleted" event.
     */
    public function forceDeleted(VendorPayment $vendorPayment): void
    {
        // Permanently delete related transactions
        AccountingTransaction::byReference(VendorPayment::class, $vendorPayment->id)->delete();
    }
}
