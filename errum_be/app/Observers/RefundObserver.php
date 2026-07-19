<?php

namespace App\Observers;

use App\Models\Refund;
use App\Models\ProductReturn;
use App\Models\Transaction as AccountingTransaction;
use App\Models\Order;
use App\Services\PaymentCommissionService;

class RefundObserver
{
    /**
     * Handle the Refund "created" event.
     */
    public function created(Refund $refund): void
    {
        // Commission refund policy applies to both standard returns and exchange
        // refunds, even when exchange accounting is posted through a different path.
        $this->syncCommissionRefundPolicy($refund);

        // Skip the ordinary refund ledger for exchanges; Transaction::createFromExchange
        // owns that accounting flow.
        if ($refund->refund_type === 'exchange_refund') {
            return;
        }

        // Create cash/revenue transaction when refund is created
        AccountingTransaction::createFromRefund($refund);

        // Also create COGS/Inventory reversal if there is a linked restocked ProductReturn
        $this->createCOGSReversalIfApplicable($refund);
    }

    /**
     * Handle the Refund "updated" event.
     */
    public function updated(Refund $refund): void
    {
        // Check if status changed to completed
        if ($refund->wasChanged('status') && $refund->status === 'completed') {
            // Find existing transaction or create new one
            $existingQuery = AccountingTransaction::byReference(Refund::class, $refund->id);

            if ((clone $existingQuery)->exists()) {
                // Update the full refund reversal group, not only the first row.
                $existingQuery->update([
                    'status' => 'completed',
                    'transaction_date' => $refund->completed_at ?? now(),
                ]);
            } else {
                // Create new transaction group if it doesn't exist
                AccountingTransaction::createFromRefund($refund);
            }

            // Create COGS/Inventory reversal if applicable (on completion)
            $this->createCOGSReversalIfApplicable($refund);
        }

        if ($refund->wasChanged('status') && in_array($refund->status, ['cancelled', 'failed'], true)) {
            AccountingTransaction::byReference(Refund::class, $refund->id)
                ->update(['status' => 'cancelled']);
        }

        if ($refund->wasChanged(['status', 'refund_amount', 'refund_method', 'refund_method_details'])) {
            $this->syncCommissionRefundPolicy($refund);
        }
    }

    /**
     * Handle the Refund "deleted" event.
     */
    public function deleted(Refund $refund): void
    {
        $this->syncCommissionRefundPolicy($refund);
        // Mark related transactions as cancelled
        AccountingTransaction::byReference(Refund::class, $refund->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Handle the Refund "restored" event.
     */
    public function restored(Refund $refund): void
    {
        $this->syncCommissionRefundPolicy($refund);
        // Restore related transactions
        AccountingTransaction::byReference(Refund::class, $refund->id)
            ->update(['status' => 'completed']);
    }

    /**
     * Handle the Refund "force deleted" event.
     */
    public function forceDeleted(Refund $refund): void
    {
        $this->syncCommissionRefundPolicy($refund);
        // Permanently delete related transactions
        AccountingTransaction::byReference(Refund::class, $refund->id)->delete();
    }

    private function syncCommissionRefundPolicy(Refund $refund): void
    {
        if (!$refund->order_id) {
            return;
        }

        $order = Order::find($refund->order_id);
        if ($order) {
            app(PaymentCommissionService::class)->syncRefundReversalForOrder($order);
        }
    }

    /**
     * Create COGS/Inventory reversal if the refund has a linked ProductReturn
     * with a positive total_return_value (items confirmed restocked).
     * Uses order_id to find the most recent completed ProductReturn for this order.
     */
    private function createCOGSReversalIfApplicable(Refund $refund): void
    {
        if (!$refund->order_id) {
            return;
        }

        // Find linked ProductReturn for the same order
        $productReturn = ProductReturn::where('order_id', $refund->order_id)
            ->whereIn('status', ['completed', 'refunded'])
            ->latest()
            ->first();

        if (!$productReturn || (float)$productReturn->total_return_value <= 0) {
            return;
        }

        // Avoid duplicate COGS reversal entries for this ProductReturn
        $existingCOGS = AccountingTransaction::where('reference_type', ProductReturn::class)
            ->where('reference_id', $productReturn->id)
            ->where('type', 'debit') // Inventory debit = restocking entry
            ->exists();

        if (!$existingCOGS) {
            AccountingTransaction::createFromRefundCOGS($productReturn);
        }
    }
}
