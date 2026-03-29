<?php

namespace App\Observers;

use App\Models\ProductBatch;
use App\Models\ReservedProduct;

class ProductBatchObserver
{
    public function saved(ProductBatch $batch): void
    {
        $this->syncReservedProduct($batch->product_id);
    }

    public function deleted(ProductBatch $batch): void
    {
        $this->syncReservedProduct($batch->product_id);
    }

    protected function syncReservedProduct(int $productId): void
    {
        $total = ProductBatch::where('product_id', $productId)->sum('quantity');
        
        $reservedProduct = ReservedProduct::firstOrCreate(
            ['product_id' => $productId],
            ['total_inventory' => 0, 'reserved_inventory' => 0, 'available_inventory' => 0]
        );

        // Ensure we have the latest reserved_inventory from DB
        $reservedProduct->refresh();

        $reservedProduct->total_inventory = $total;
        // Standardize formula: available = total - reserved
        $reservedProduct->available_inventory = $total - $reservedProduct->reserved_inventory;
        $reservedProduct->save();
    }
}
