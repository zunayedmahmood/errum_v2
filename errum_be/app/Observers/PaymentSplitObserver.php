<?php

namespace App\Observers;

use App\Models\PaymentSplit;
use App\Services\PaymentCommissionService;
use Illuminate\Support\Facades\Log;

class PaymentSplitObserver
{
    public function created(PaymentSplit $split): void
    {
        $this->sync($split, true);
    }

    public function updated(PaymentSplit $split): void
    {
        if ($split->wasChanged([
            'amount',
            'payment_method_id',
            'payment_data',
            'metadata',
            'store_id',
            'status',
            'refunded_amount',
        ])) {
            $this->sync($split, $split->wasChanged(['amount', 'payment_method_id', 'payment_data', 'metadata']));
        }
    }

    public function deleting(PaymentSplit $split): void
    {
        app(PaymentCommissionService::class)->cancelSplit($split, 'Payment split deleted.');
    }

    public function deleted(PaymentSplit $split): void
    {
        app(PaymentCommissionService::class)->cancelSplit($split, 'Payment split deleted.');
    }

    public function restored(PaymentSplit $split): void
    {
        $this->sync($split, false);
    }

    private function sync(PaymentSplit $split, bool $forceRate): void
    {
        try {
            app(PaymentCommissionService::class)->syncSplit($split, $forceRate);
        } catch (\Throwable $e) {
            Log::error('Payment split commission sync failed', [
                'payment_split_id' => $split->id,
                'order_payment_id' => $split->order_payment_id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
