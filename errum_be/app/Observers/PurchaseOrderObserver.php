<?php

namespace App\Observers;

use App\Models\PurchaseOrder;
use App\Services\AccountingPostingService;

class PurchaseOrderObserver
{
    public function created(PurchaseOrder $purchaseOrder): void
    {
        // Initial create usually has zero total before items are saved. The later total recalculation
        // update will create the actual temporary PO commitment.
        app(AccountingPostingService::class)->syncPurchaseOrderCommitment($purchaseOrder, true);
    }

    public function updated(PurchaseOrder $purchaseOrder): void
    {
        $service = app(AccountingPostingService::class);

        if ($purchaseOrder->wasChanged('status') && $purchaseOrder->status === 'cancelled') {
            $service->postPurchaseOrderCancellation($purchaseOrder);
            return;
        }

        if ($purchaseOrder->wasChanged([
            'total_amount',
            'subtotal',
            'tax_amount',
            'shipping_cost',
            'other_charges',
            'discount_amount',
            'status',
        ])) {
            $service->syncPurchaseOrderCommitment($purchaseOrder, true);
        }
    }

    public function deleted(PurchaseOrder $purchaseOrder): void
    {
        app(AccountingPostingService::class)->cancelReference(PurchaseOrder::class, (int) $purchaseOrder->id, 'Purchase order deleted');
    }

    public function restored(PurchaseOrder $purchaseOrder): void
    {
        app(AccountingPostingService::class)->syncPurchaseOrderCommitment($purchaseOrder, true);
    }
}
