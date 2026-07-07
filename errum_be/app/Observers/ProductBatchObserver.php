<?php

namespace App\Observers;

use App\Models\ProductBatch;
use App\Models\ReservedProduct;
use App\Services\LazyChat\LazyChatProductWebhookDispatcher;
use App\Services\LazyChat\LazyChatWebhookTestContext;

class ProductBatchObserver
{
    public function saved(ProductBatch $batch): void
    {
        if (!$this->shouldSyncCatalogStock($batch)) {
            return;
        }

        $this->syncReservedProduct($batch->product_id);
        $this->dispatchLazyChatUpdate($batch->product_id, 'saved');
    }

    public function deleted(ProductBatch $batch): void
    {
        $this->syncReservedProduct($batch->product_id);
        $this->dispatchLazyChatUpdate($batch->product_id, 'deleted');
    }

    protected function syncReservedProduct(int $productId): void
    {
        $total = ProductBatch::where('product_id', $productId)->sum('quantity');

        $reservedProduct = ReservedProduct::firstOrCreate(
            ['product_id' => $productId],
            ['total_inventory' => 0, 'reserved_inventory' => 0, 'available_inventory' => 0]
        );

        $reservedProduct->total_inventory = $total;
        $reservedProduct->available_inventory = max(0, $total - $reservedProduct->reserved_inventory);

        if ($reservedProduct->isDirty(['total_inventory', 'available_inventory'])) {
            $reservedProduct->save();
        }
    }

    protected function shouldSyncCatalogStock(ProductBatch $batch): bool
    {
        if ($batch->wasRecentlyCreated) {
            return true;
        }

        return $batch->wasChanged([
            'quantity',
            'sell_price',
            'cost_price',
            'tax_percentage',
            'base_price',
            'tax_amount',
            'availability',
            'is_active',
            'store_id',
        ]);
    }

    protected function dispatchLazyChatUpdate(?int $productId, string $event): void
    {
        if (!$productId) {
            return;
        }

        LazyChatProductWebhookDispatcher::dispatch((int) $productId, 'product/update', LazyChatWebhookTestContext::meta([
            'model' => ProductBatch::class,
            'observer' => self::class,
            'model_event' => $event,
        ]));
    }
}
