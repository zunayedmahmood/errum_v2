<?php

namespace App\Observers;

use App\Models\ProductBatch;
use App\Models\ReservedProduct;
use App\Jobs\SendLazyChatProductWebhook;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProductBatchObserver
{
    public function saved(ProductBatch $batch): void
    {
        $this->syncReservedProduct($batch->product_id);
        $this->dispatchLazyChatUpdate($batch->product_id);
    }

    public function deleted(ProductBatch $batch): void
    {
        $this->syncReservedProduct($batch->product_id);
        $this->dispatchLazyChatUpdate($batch->product_id);
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
        $reservedProduct->save();
    }
    protected function dispatchLazyChatUpdate(?int $productId): void
    {
        if (!$productId) {
            return;
        }

        try {
            SendLazyChatProductWebhook::dispatch($productId, 'product/update');
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product batch webhook job.', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
