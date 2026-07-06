<?php

namespace App\Services;

use App\Models\Order;
use App\Models\ProductBarcode;
use App\Models\ProductBatch;
use App\Models\ProductMovement;
use App\Models\ReservedProduct;
use Illuminate\Support\Facades\Log;

class InventoryReservationService
{
    /**
     * Order statuses where stock is still only reserved, not finally deducted.
     */
    private const RESERVATION_HELD_STATUSES = [
        'pending',
        'pending_assignment',
        'assigned_to_store',
        'picking',
        'processing',
        'ready_for_pickup',
        'ready_for_shipment',
    ];

    /**
     * Release reserved stock for an order being cancelled.
     *
     * Important: this must be called inside the same DB transaction that changes
     * the order status to cancelled, and before the status is changed.
     */
    public function releaseForCancelledOrder(Order $order): array
    {
        $order->loadMissing(['items.barcode', 'items.batch']);

        if (!$this->shouldReleaseForCancellation($order)) {
            return [
                'released' => false,
                'reason' => 'Order status does not currently hold reservation or packed stock',
                'order_status' => $order->status,
                'fulfillment_status' => $order->fulfillment_status,
                'items' => [],
                'barcodes' => [],
                'batches' => [],
            ];
        }

        $releasedItems = $this->releaseReservedProductRows($order);
        $physicalRelease = $this->releasePackedBarcodeUnits($order);

        $result = [
            'released' => true,
            'order_status' => $order->status,
            'fulfillment_status' => $order->fulfillment_status,
            'items' => $releasedItems,
            'barcodes' => $physicalRelease['barcodes'],
            'batches' => $physicalRelease['batches'],
        ];

        Log::info('Released order reservations and packed units during cancellation', [
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'result' => $result,
        ]);

        return $result;
    }

    private function releaseReservedProductRows(Order $order): array
    {
        $releasedItems = [];

        $quantitiesByProduct = $order->items
            ->reject(fn ($item) => $this->isDefectiveResaleItem($item))
            ->groupBy('product_id')
            ->map(fn ($items) => (int) $items->sum('quantity'));

        foreach ($quantitiesByProduct as $productId => $quantityToRelease) {
            if ($quantityToRelease <= 0) {
                continue;
            }

            /** @var ReservedProduct|null $reservedProduct */
            $reservedProduct = ReservedProduct::where('product_id', $productId)
                ->lockForUpdate()
                ->first();

            if (!$reservedProduct) {
                $releasedItems[] = [
                    'product_id' => (int) $productId,
                    'requested_release_qty' => $quantityToRelease,
                    'released_qty' => 0,
                    'reason' => 'No reserved_products row found',
                ];
                continue;
            }

            $beforeReserved = max(0, (int) $reservedProduct->reserved_inventory);
            $beforeAvailable = (int) $reservedProduct->available_inventory;
            $releaseQty = min($quantityToRelease, $beforeReserved);
            $afterReserved = $beforeReserved - $releaseQty;

            $reservedProduct->reserved_inventory = $afterReserved;
            $reservedProduct->available_inventory = max(0, (int) $reservedProduct->total_inventory - $afterReserved);
            $reservedProduct->save();

            $releasedItems[] = [
                'product_id' => (int) $productId,
                'requested_release_qty' => $quantityToRelease,
                'released_qty' => $releaseQty,
                'before_reserved' => $beforeReserved,
                'after_reserved' => $afterReserved,
                'before_available' => $beforeAvailable,
                'after_available' => (int) $reservedProduct->available_inventory,
            ];
        }

        return $releasedItems;
    }

    /**
     * Release physical barcodes that were already scanned/packed for an online order.
     *
     * Why this exists: social-commerce/ecommerce packing attaches a real barcode to
     * order_items and changes the barcode lifecycle to in_shipment while keeping reserved_for_order metadata. Cancelling
     * the order must free that exact physical unit. If older code already reduced the
     * original batch quantity during packing/completion, the batch is raised back to
     * at least the number of now-sellable barcodes in that batch, and the batch is
     * made active/available again. This covers the edge case where the batch reached
     * quantity 0 while the only remaining unit was stuck on the cancelled order.
     */
    private function releasePackedBarcodeUnits(Order $order): array
    {
        $releasedBarcodes = [];
        $touchedBatchIds = [];

        $items = $order->items->filter(fn ($item) => !empty($item->product_barcode_id));

        foreach ($items as $item) {
            /** @var ProductBarcode|null $barcode */
            $barcode = ProductBarcode::whereKey($item->product_barcode_id)->lockForUpdate()->first();
            if (!$barcode) {
                $releasedBarcodes[] = [
                    'order_item_id' => (int) $item->id,
                    'barcode_id' => (int) $item->product_barcode_id,
                    'released' => false,
                    'reason' => 'Barcode row not found',
                ];
                continue;
            }

            $previousStatus = $barcode->current_status;
            $previousStoreId = $barcode->current_store_id;
            $batchId = $barcode->batch_id ?: $item->product_batch_id;
            $targetStoreId = $barcode->current_store_id ?: $order->store_id;

            /** @var ProductBatch|null $batch */
            $batch = $batchId ? ProductBatch::whereKey($batchId)->lockForUpdate()->first() : null;
            if ($batch) {
                $targetStoreId = $targetStoreId ?: $batch->store_id;
            }

            $metadata = array_merge($barcode->location_metadata ?? [], [
                'released_from_cancelled_order' => true,
                'released_from_order_id' => (int) $order->id,
                'released_from_order_number' => $order->order_number,
                'released_order_item_id' => (int) $item->id,
                'released_reason' => 'order_cancelled_after_packing',
                'released_previous_status' => $previousStatus,
                'released_at' => now()->toDateTimeString(),
                'released_by' => auth()->id(),
            ]);

            $barcode->forceFill([
                'is_active' => true,
                'current_store_id' => $targetStoreId,
                'current_status' => 'in_shop',
                'location_updated_at' => now(),
                'location_metadata' => $metadata,
            ])->save();

            if ($batch) {
                $touchedBatchIds[(int) $batch->id] = true;

                ProductMovement::create([
                    'product_batch_id' => $batch->id,
                    'product_barcode_id' => $barcode->id,
                    'from_store_id' => $previousStoreId,
                    'to_store_id' => $targetStoreId,
                    'movement_type' => 'return',
                    'quantity' => 1,
                    'status_before' => $previousStatus,
                    'status_after' => 'in_shop',
                    'movement_date' => now(),
                    'reference_type' => 'order',
                    'reference_id' => $order->id,
                    'notes' => 'Barcode released back to original batch after packed order cancellation',
                    'performed_by' => auth()->id(),
                ]);
            }

            $item->forceFill([
                'product_barcode_id' => null,
                'product_batch_id' => null,
                'notes' => trim(($item->notes ? $item->notes . "\n" : '') . 'Packed barcode ' . $barcode->barcode . ' was released because order ' . $order->order_number . ' was cancelled.'),
            ])->saveQuietly();

            $releasedBarcodes[] = [
                'order_item_id' => (int) $item->id,
                'barcode_id' => (int) $barcode->id,
                'barcode' => $barcode->barcode,
                'batch_id' => $batch ? (int) $batch->id : null,
                'previous_status' => $previousStatus,
                'new_status' => 'in_shop',
                'released' => true,
            ];
        }

        $batchRepairs = [];
        foreach (array_keys($touchedBatchIds) as $batchId) {
            $batch = ProductBatch::whereKey($batchId)->lockForUpdate()->first();
            if (!$batch) {
                continue;
            }

            $batchRepairs[] = $this->reactivateBatchFromSellableBarcodes($batch);
        }

        return [
            'barcodes' => $releasedBarcodes,
            'batches' => $batchRepairs,
        ];
    }

    private function reactivateBatchFromSellableBarcodes(ProductBatch $batch): array
    {
        $before = [
            'quantity' => (int) $batch->quantity,
            'availability' => (bool) $batch->availability,
            'is_active' => (bool) $batch->is_active,
        ];

        $sellableBarcodeCount = ProductBarcode::where('batch_id', $batch->id)
            ->where('is_active', true)
            ->where(function ($query) {
                $query->where('is_defective', false)->orWhereNull('is_defective');
            })
            ->whereIn('current_status', ['available', 'in_shop', 'on_display', 'in_warehouse'])
            ->count();

        $newQuantity = max((int) $batch->quantity, (int) $sellableBarcodeCount);

        $batch->forceFill([
            'quantity' => $newQuantity,
            'availability' => $newQuantity > 0,
            'is_active' => true,
            'notes' => trim(($batch->notes ? $batch->notes . "\n" : '') . '[' . now()->format('Y-m-d H:i:s') . '] Batch reactivated/reconciled after packed order cancellation. Sellable barcodes in batch: ' . $sellableBarcodeCount . '.'),
        ])->save();

        return [
            'batch_id' => (int) $batch->id,
            'before' => $before,
            'sellable_barcode_count' => (int) $sellableBarcodeCount,
            'after' => [
                'quantity' => (int) $batch->quantity,
                'availability' => (bool) $batch->availability,
                'is_active' => (bool) $batch->is_active,
            ],
        ];
    }

    private function isDefectiveResaleItem($item): bool
    {
        $name = strtolower((string) ($item->product_name ?? ''));

        return str_contains($name, '[defective/used resale]')
            || str_contains($name, '[defective]');
    }

    private function shouldReleaseForCancellation(Order $order): bool
    {
        if (in_array($order->status, self::RESERVATION_HELD_STATUSES, true)) {
            return true;
        }

        // Ecommerce/social orders may become "confirmed" after payment/COD before
        // warehouse completion. In this codebase OrderController@complete also stores
        // completed online sales as status=confirmed with fulfillment_status=fulfilled,
        // so cancellation must be able to release/restock those physical packed units too.
        if ($order->status === 'confirmed' && in_array($order->order_type, ['ecommerce', 'social_commerce'], true)) {
            return true;
        }

        return false;
    }

    private function isFulfillmentOrderStillReserved(Order $order): bool
    {
        $requiresFulfillment = in_array($order->order_type, ['ecommerce', 'social_commerce'], true);

        return $requiresFulfillment
            && !in_array($order->fulfillment_status, ['fulfilled', 'completed'], true);
    }
}
