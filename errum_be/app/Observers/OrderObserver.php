<?php

namespace App\Observers;

use App\Models\Order;
use App\Services\SalesTargetAggregationService;
use App\Services\AccountingPostingService;
use Illuminate\Support\Facades\Log;

class OrderObserver
{
    protected $aggregationService;

    public function __construct(SalesTargetAggregationService $aggregationService)
    {
        $this->aggregationService = $aggregationService;
    }

    public function created(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order);
    }

    public function updated(Order $order): void
    {
        if ($order->wasChanged(['status', 'created_by', 'salesman_id', 'store_id', 'total_amount', 'order_date'])) {
            $this->aggregationService->syncOrderChange($order, $order->getOriginal());
        }

        if ($order->wasChanged('status')) {
            try {
                $posting = app(AccountingPostingService::class);

                if (in_array($order->status, ['delivered', 'completed'], true)) {
                    // For online/social commerce: clear Customer Advance into Sales Revenue when the sale is final.
                    // For all order types: create COGS/Inventory entry if it has not already been posted.
                    $posting->postOrderCompletionRevenue($order->fresh(['payments', 'items']) ?: $order);
                    $posting->postOrderCOGS($order->fresh(['items']) ?: $order);
                }

                if (in_array($order->status, ['cancelled', 'refunded'], true)) {
                    // Do not delete historical rows; mark pending/completed ledger for this order source as cancelled.
                    // Actual refunds/returns are posted by Refund/ProductReturn observers.
                    \App\Models\Transaction::where('reference_type', Order::class)
                        ->where('reference_id', $order->id)
                        ->whereIn('status', ['pending', 'completed'])
                        ->where(function ($q) {
                            $q->where('metadata->source', 'order_cogs')
                              ->orWhere('metadata->source', 'order_completion_revenue');
                        })
                        ->update(['status' => 'cancelled']);
                }
            } catch (\Throwable $e) {
                Log::error('Order accounting observer failed', [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'status' => $order->status,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    public function deleted(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order, $order->toArray());
    }

    public function restored(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order);
    }

    public function forceDeleted(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order, $order->toArray());
    }
}