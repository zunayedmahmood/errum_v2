<?php

namespace App\Services\LazyChat;

use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ReservedProduct;

class ProductPayloadBuilder
{
    public function build(Product $product): array
    {
        $product = $product->fresh([
            'category',
            'vendor',
            'images' => function ($query) {
                $query->active()->ordered();
            },
            'batches.store',
            'barcodes',
            'reservedProduct',
        ]) ?? $product;

        $activeBatches = $product->batches
            ->where('is_active', true);

        $availableBatches = $activeBatches
            ->where('availability', true)
            ->where('quantity', '>', 0);

        $lowestBatch = $availableBatches
            ->sortBy('sell_price')
            ->first();

        $reserved = $product->reservedProduct;
        $totalPhysicalStock = (int) $activeBatches->sum('quantity');
        $reservedStock = (int) ($reserved->reserved_inventory ?? 0);
        $availableStock = $reserved
            ? (int) $reserved->available_inventory
            : max(0, $totalPhysicalStock - $reservedStock);

        $sellingPrice = $lowestBatch ? (float) $lowestBatch->sell_price : null;

        return [
            'id' => $product->id,
            'sku' => $product->sku,
            'base_name' => $product->base_name ?: $product->name,
            'variation_suffix' => $product->variation_suffix ?? '',
            'name' => $product->name,
            'brand' => $product->brand,
            'category' => $product->category ? [
                'id' => $product->category->id,
                'title' => $product->category->title,
                'slug' => $product->category->slug,
            ] : null,
            'vendor' => $product->vendor ? [
                'id' => $product->vendor->id,
                'name' => $product->vendor->name,
            ] : null,
            'description' => $product->description,
            'weight' => isset($product->weight) ? (float) $product->weight : null,
            'selling_price' => $sellingPrice,
            'price' => $sellingPrice,
            'lowest_batch_price' => $availableBatches->min('sell_price') !== null ? (float) $availableBatches->min('sell_price') : null,
            'highest_batch_price' => $availableBatches->max('sell_price') !== null ? (float) $availableBatches->max('sell_price') : null,
            'average_batch_price' => $availableBatches->avg('sell_price') !== null ? round((float) $availableBatches->avg('sell_price'), 2) : null,
            'stock_quantity' => $totalPhysicalStock,
            'reserved_inventory' => $reservedStock,
            'available_inventory' => $availableStock,
            'in_stock' => $availableStock > 0 && !$product->is_archived,
            'stock' => [
                'total_physical_stock' => $totalPhysicalStock,
                'reserved_stock' => $reservedStock,
                'available_stock' => $availableStock,
                'in_stock' => $availableStock > 0 && !$product->is_archived,
            ],
            'branch_stock' => $this->buildBranchStock($activeBatches),
            'images' => $product->images->map(function ($image) {
                return [
                    'id' => $image->id,
                    'product_id' => $image->product_id,
                    'url' => $image->image_url,
                    'alt_text' => $image->alt_text,
                    'is_primary' => (bool) $image->is_primary,
                    'sort_order' => (int) $image->sort_order,
                ];
            })->values()->all(),
            'batches' => $activeBatches->map(function (ProductBatch $batch) {
                return [
                    'id' => $batch->id,
                    'batch_number' => $batch->batch_number,
                    'store_id' => $batch->store_id,
                    'store_name' => optional($batch->store)->name,
                    'quantity' => (int) $batch->quantity,
                    'sell_price' => $batch->sell_price !== null ? (float) $batch->sell_price : null,
                    'availability' => (bool) $batch->availability,
                    'is_active' => (bool) $batch->is_active,
                    'manufactured_date' => optional($batch->manufactured_date)->toDateString(),
                    'expiry_date' => optional($batch->expiry_date)->toDateString(),
                ];
            })->values()->all(),
            'barcodes' => $product->barcodes
                ->where('is_active', true)
                ->map(function ($barcode) {
                    return [
                        'id' => $barcode->id,
                        'barcode' => $barcode->barcode,
                        'batch_id' => $barcode->batch_id,
                        'current_store_id' => $barcode->current_store_id,
                        'current_status' => $barcode->current_status,
                        'is_active' => (bool) $barcode->is_active,
                        'is_defective' => (bool) $barcode->is_defective,
                    ];
                })->values()->all(),
            'is_archived' => (bool) $product->is_archived,
            'created_at' => optional($product->created_at)->toIso8601String(),
            'updated_at' => optional($product->updated_at)->toIso8601String(),
        ];
    }

    public function priceForOrder(Product $product): ?float
    {
        $batch = ProductBatch::where('product_id', $product->id)
            ->where('is_active', true)
            ->where('availability', true)
            ->where('quantity', '>', 0)
            ->orderBy('sell_price', 'asc')
            ->first();

        return $batch ? (float) $batch->sell_price : null;
    }

    public function batchForOrder(Product $product): ?ProductBatch
    {
        return ProductBatch::where('product_id', $product->id)
            ->where('is_active', true)
            ->where('availability', true)
            ->where('quantity', '>', 0)
            ->orderBy('sell_price', 'asc')
            ->first();
    }

    private function buildBranchStock($activeBatches): array
    {
        return $activeBatches
            ->groupBy('store_id')
            ->map(function ($batches, $storeId) {
                $store = optional($batches->first())->store;
                $quantity = (int) $batches->sum('quantity');

                return [
                    'store_id' => $storeId ? (int) $storeId : null,
                    'store_name' => optional($store)->name,
                    'store_address' => optional($store)->address,
                    'quantity' => $quantity,
                    'available_quantity' => $quantity,
                ];
            })
            ->values()
            ->all();
    }
}
