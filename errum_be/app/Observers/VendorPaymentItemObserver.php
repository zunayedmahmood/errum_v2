<?php

namespace App\Observers;

use App\Models\Transaction as AccountingTransaction;
use App\Models\VendorPaymentItem;

class VendorPaymentItemObserver
{
    public function created(VendorPaymentItem $vendorPaymentItem): void
    {
        $payment = $vendorPaymentItem->vendorPayment;
        if ($payment && $payment->payment_type === 'advance' && $payment->status === 'completed') {
            AccountingTransaction::createFromVendorAdvanceAllocation($vendorPaymentItem);
        }
    }

    public function updated(VendorPaymentItem $vendorPaymentItem): void
    {
        if ($vendorPaymentItem->wasChanged('allocated_amount')) {
            AccountingTransaction::where('reference_type', VendorPaymentItem::class)
                ->where('reference_id', $vendorPaymentItem->id)
                ->update(['status' => 'cancelled']);
            $this->created($vendorPaymentItem);
        }
    }

    public function deleted(VendorPaymentItem $vendorPaymentItem): void
    {
        AccountingTransaction::where('reference_type', VendorPaymentItem::class)
            ->where('reference_id', $vendorPaymentItem->id)
            ->update(['status' => 'cancelled']);
    }
}
