<?php

namespace App\Services;

use App\Models\Order;
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
        $order->loadMissing('items');

        if (!$this->shouldReleaseForCancellation($order)) {
            return [
                'released' => false,
                'reason' => 'Order status does not currently hold reservation',
                'order_status' => $order->status,
                'fulfillment_status' => $order->fulfillment_status,
                'items' => [],
            ];
        }

        $releasedItems = [];

        $quantitiesByProduct = $order->items
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

        $result = [
            'released' => true,
            'order_status' => $order->status,
            'fulfillment_status' => $order->fulfillment_status,
            'items' => $releasedItems,
        ];

        Log::info('Released order reservations during cancellation', [
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'result' => $result,
        ]);

        return $result;
    }

    private function shouldReleaseForCancellation(Order $order): bool
    {
        if (in_array($order->status, self::RESERVATION_HELD_STATUSES, true)) {
            return true;
        }

        // Ecommerce/social orders may become "confirmed" after payment/COD before
        // warehouse completion. At that point reservation still exists. Once fulfilled
        // and completed, OrderController@complete releases reservation separately.
        if ($order->status === 'confirmed' && $this->isFulfillmentOrderStillReserved($order)) {
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
