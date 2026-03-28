<?php

namespace App\Observers;

use App\Models\Order;
use App\Models\ReservedProduct;
use App\Services\AdAttributionService;
use App\Jobs\ComputeAdAttributionJob;
use Illuminate\Support\Facades\Log;

class OrderObserver
{
    /**
     * Handle the Order "updated" event.
     * Triggers attribution when order status changes to countable status.
     */
    public function updated(Order $order): void
    {
        // Check if status changed
        if ($order->isDirty('status')) {
            $oldStatus = $order->getOriginal('status');
            $newStatus = $order->status;
            
            // Define countable statuses (based on actual system status values)
            // System statuses: pending, confirmed, processing, ready_for_pickup, shipped, delivered, cancelled, refunded
            $countableStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];
            
            // Define reversal statuses
            $reversalStatuses = ['cancelled', 'refunded'];
            
            // Handle inventory reservation release for online orders (ecommerce/social_commerce)
            // if order is cancelled or refunded while items are still reserved (not yet scanned/fulfilled)
            if (in_array($newStatus, $reversalStatuses) && !in_array($oldStatus, $reversalStatuses)) {
                if (in_array($order->order_type, ['ecommerce', 'social_commerce'])) {
                    foreach ($order->items as $item) {
                        // Only release if not already physically deducted (barcode not scanned)
                        if ($item->product_barcode_id === null && $item->scan_status !== 'scanned') {
                            if ($reservedRecord = ReservedProduct::where('product_id', $item->product_id)->first()) {
                                $reservedRecord->decrement('reserved_inventory', $item->quantity);
                                $reservedRecord->increment('available_inventory', $item->quantity);
                                Log::info("Released reservation for unscanned item in cancelled order {$order->order_number}: Product {$item->product_id}");
                            }
                        }
                    }
                }
            }
            

            
            // Compute credits if entering countable status for first time
            if (in_array($newStatus, $countableStatuses) && !in_array($oldStatus, $countableStatuses)) {
                Log::info("Order {$order->order_number} became countable, dispatching attribution job", [
                    'order_id' => $order->id,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                ]);
                
                // Dispatch background job for performance
                ComputeAdAttributionJob::dispatch($order->id);
            }
            
            // Reverse credits if entering reversal status
            if (in_array($newStatus, $reversalStatuses) && !in_array($oldStatus, $reversalStatuses)) {
                Log::info("Order {$order->order_number} was cancelled/refunded, reversing credits", [
                    'order_id' => $order->id,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                ]);
                
                $attributionService = app(AdAttributionService::class);
                $attributionService->reverseCreditsForOrder($order);
            }
            
            // Unreverse credits if coming back from reversal status
            if (!in_array($newStatus, $reversalStatuses) && in_array($oldStatus, $reversalStatuses)) {
                Log::info("Order {$order->order_number} reinstated, unreversing credits", [
                    'order_id' => $order->id,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                ]);
                
                $attributionService = app(AdAttributionService::class);
                $attributionService->unreverseCreditsForOrder($order);
            }
        }
    }

    /**
     * Handle the Order "deleted" event.
     */
    public function deleted(Order $order): void
    {
        // If an order is deleted (e.g., hard deleted), release any trapped reservations
        if (in_array($order->order_type, ['ecommerce', 'social_commerce'])) {
            foreach ($order->items as $item) {
                if ($item->product_barcode_id === null) {
                    if ($reservedRecord = ReservedProduct::where('product_id', $item->product_id)->first()) {
                        $reservedRecord->decrement('reserved_inventory', $item->quantity);
                        $reservedRecord->increment('available_inventory', $item->quantity);
                    }
                }
            }
            Log::info("Released reservations for deleted order {$order->order_number}");
        }
    }
}
