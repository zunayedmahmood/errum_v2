<?php

namespace App\Observers;

use App\Models\OrderItem;
use App\Models\ReservedProduct;
use App\Models\ProductBatch;
use Illuminate\Support\Facades\Log;

class OrderItemObserver
{
    private const RESERVATION_STATUSES = [
        'pending_assignment',
        'pending',
        'assigned_to_store',
        'picking',
        'processing',
        'ready_for_pickup',
        'ready_for_shipment',
    ];

    /**
     * Handle the OrderItem "created" event.
     */
    public function created(OrderItem $orderItem): void
    {
        if ($this->isCounterSale($orderItem)) {
            $this->syncAvailabilitySnapshot($orderItem->product_id);
            return;
        }

        if (!$this->shouldReserveStock($orderItem)) {
            return;
        }

        $this->incrementReservation($orderItem->product_id, $orderItem->quantity);
    }

    /**
     * Handle the OrderItem "updated" event.
     */
    public function updated(OrderItem $orderItem): void
    {
        if ($this->isCounterSale($orderItem)) {
            $this->syncAvailabilitySnapshot($orderItem->product_id);
            return;
        }

        if (!$this->shouldReserveStock($orderItem) || !$orderItem->isDirty('quantity')) {
            return;
        }

        $oldQty = $orderItem->getOriginal('quantity');
        $newQty = $orderItem->quantity;
        $diff = $newQty - $oldQty;

        if ($diff > 0) {
            $this->incrementReservation($orderItem->product_id, $diff);
        } else if ($diff < 0) {
            $this->decrementReservation($orderItem->product_id, abs($diff));
        }
    }

    /**
     * Handle the OrderItem "deleted" event.
     */
    public function deleted(OrderItem $orderItem): void
    {
        if ($this->isCounterSale($orderItem)) {
            $this->syncAvailabilitySnapshot($orderItem->product_id);
            return;
        }

        if (!$this->shouldReserveStock($orderItem)) {
            return;
        }

        $this->decrementReservation($orderItem->product_id, $orderItem->quantity);
    }

    private function isCounterSale(OrderItem $orderItem): bool
    {
        return $orderItem->order && $orderItem->order->order_type === 'counter';
    }

    private function syncAvailabilitySnapshot($productId): void
    {
        if (!$productId) {
            return;
        }

        $total = \App\Models\ProductBatch::where('product_id', $productId)->sum('quantity');
        $reservedRecord = ReservedProduct::firstOrCreate(
            ['product_id' => $productId],
            ['total_inventory' => 0, 'reserved_inventory' => 0, 'available_inventory' => 0]
        );

        $reservedRecord->total_inventory = $total;
        $reservedRecord->available_inventory = max(0, $total - $reservedRecord->reserved_inventory);

        if ($reservedRecord->isDirty(['total_inventory', 'available_inventory'])) {
            $reservedRecord->save();
        }

        Log::info("Synced reserved_products availability snapshot for POS product {$productId}", [
            'product_id' => $productId,
            'total_inventory' => (int) $reservedRecord->total_inventory,
            'reserved_inventory' => (int) $reservedRecord->reserved_inventory,
            'available_inventory' => (int) $reservedRecord->available_inventory,
        ]);
    }

    private function shouldReserveStock(OrderItem $orderItem): bool
    {
        $order = $orderItem->order;

        if (!$order) {
            return false;
        }

        if ($order->order_type === 'preorder' || $this->isDefectiveResale($orderItem)) {
            return false;
        }

        return in_array($order->status, self::RESERVATION_STATUSES, true);
    }

    private function isDefectiveResale(OrderItem $orderItem): bool
    {
        return str_contains(strtolower((string) $orderItem->product_name), '[defective/used resale]')
            || str_contains(strtolower((string) $orderItem->product_name), '[defective]');
    }

    private function incrementReservation($productId, $quantity): void
    {
        $reservedRecord = $this->syncReservedProductSnapshot((int) $productId);
        $reservedRecord->reserved_inventory = max(0, (int) $reservedRecord->reserved_inventory) + (int) $quantity;
        $reservedRecord->available_inventory = max(0, (int) $reservedRecord->total_inventory - (int) $reservedRecord->reserved_inventory);
        $reservedRecord->save();

        Log::info("Incremented reservation for product {$productId} by {$quantity}", [
            'reserved_inventory' => (int) $reservedRecord->reserved_inventory,
            'available_inventory' => (int) $reservedRecord->available_inventory,
        ]);
    }

    private function decrementReservation($productId, $quantity): void
    {
        $reservedRecord = $this->syncReservedProductSnapshot((int) $productId);
        $reservedRecord->reserved_inventory = max(0, (int) $reservedRecord->reserved_inventory - (int) $quantity);
        $reservedRecord->available_inventory = max(0, (int) $reservedRecord->total_inventory - (int) $reservedRecord->reserved_inventory);
        $reservedRecord->save();

        Log::info("Decremented reservation for product {$productId} by {$quantity}", [
            'reserved_inventory' => (int) $reservedRecord->reserved_inventory,
            'available_inventory' => (int) $reservedRecord->available_inventory,
        ]);
    }

    private function syncReservedProductSnapshot(int $productId): ReservedProduct
    {
        $reservedRecord = ReservedProduct::firstOrCreate(
            ['product_id' => $productId],
            ['total_inventory' => 0, 'reserved_inventory' => 0, 'available_inventory' => 0]
        );

        $totalInventory = (int) ProductBatch::where('product_id', $productId)->sum('quantity');
        $reservedRecord->total_inventory = $totalInventory;
        $reservedRecord->reserved_inventory = max(0, (int) $reservedRecord->reserved_inventory);
        $reservedRecord->available_inventory = max(0, $totalInventory - (int) $reservedRecord->reserved_inventory);
        $reservedRecord->save();

        return $reservedRecord;
    }
}
