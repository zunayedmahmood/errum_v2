<?php

namespace App\Services\LazyChat;

use App\Models\Product;
use App\Models\ProductBatch;

class ProductPayloadBuilder
{
    /**
     * Build the LazyChat product payload at SKU level.
     *
     * LazyChat treats one SKU as one catalog product, while Errum stores every
     * size/color/etc. option as a separate Product row under the same SKU.
     * Therefore any change to one Product row must sync the entire SKU family.
     */
    public function build(Product $product): array
    {
        $product = Product::withTrashed()->find($product->id) ?? $product;

        if (empty($product->sku)) {
            return $this->buildSingleVariantFallback($product);
        }

        return $this->buildForSku((string) $product->sku, $product);
    }

    public function buildForSku(string $sku, ?Product $changedProduct = null): array
    {
        $variants = Product::withTrashed()
            ->with([
                'category',
                'vendor',
                'images' => function ($query) {
                    $query->active()->ordered();
                },
                'batches.store',
                'barcodes',
                'reservedProduct',
            ])
            ->where('sku', $sku)
            ->orderBy('id')
            ->get();

        if ($variants->isEmpty() && $changedProduct) {
            $variants = collect([$this->freshVariant($changedProduct)]);
        }

        $variantPayloads = $variants
            ->map(fn (Product $variant) => $this->buildVariantPayload($variant))
            ->values();

        $activeVariantPayloads = $variantPayloads
            ->filter(fn (array $variant) => !($variant['is_deleted'] ?? false) && !($variant['is_archived'] ?? false));

        $referenceVariant = $variants
            ->first(fn (Product $variant) => !$variant->trashed() && !$variant->is_archived)
            ?? $variants->first();

        $lowestPrice = $activeVariantPayloads
            ->pluck('selling_price')
            ->filter(fn ($price) => $price !== null)
            ->min();

        $highestPrice = $activeVariantPayloads
            ->pluck('selling_price')
            ->filter(fn ($price) => $price !== null)
            ->max();

        $availableInventory = (int) $activeVariantPayloads->sum('available_inventory');
        $totalPhysicalStock = (int) $variantPayloads->sum('stock_quantity');
        $reservedInventory = (int) $variantPayloads->sum('reserved_inventory');
        $latestUpdatedAt = $variantPayloads->pluck('updated_at')->filter()->sort()->last();

        return [
            'sku' => $sku,
            'changed_product_id' => $changedProduct?->id,
            'base_name' => $referenceVariant?->base_name ?: $referenceVariant?->name,
            'name' => $referenceVariant?->base_name ?: $referenceVariant?->name,
            'brand' => $referenceVariant?->brand,
            'category' => $referenceVariant?->category ? [
                'id' => $referenceVariant->category->id,
                'title' => $referenceVariant->category->title,
                'slug' => $referenceVariant->category->slug,
            ] : null,
            'vendor' => $referenceVariant?->vendor ? [
                'id' => $referenceVariant->vendor->id,
                'name' => $referenceVariant->vendor->name,
            ] : null,
            'price' => $lowestPrice !== null ? (float) $lowestPrice : null,
            'selling_price' => $lowestPrice !== null ? (float) $lowestPrice : null,
            'lowest_variant_price' => $lowestPrice !== null ? (float) $lowestPrice : null,
            'highest_variant_price' => $highestPrice !== null ? (float) $highestPrice : null,
            'stock_quantity' => $totalPhysicalStock,
            'reserved_inventory' => $reservedInventory,
            'available_inventory' => $availableInventory,
            'in_stock' => $availableInventory > 0,
            'variant_count' => $variantPayloads->count(),
            'active_variant_count' => $activeVariantPayloads->count(),
            'deleted_variant_ids' => $variantPayloads
                ->filter(fn (array $variant) => (bool) ($variant['is_deleted'] ?? false))
                ->pluck('id')
                ->values()
                ->all(),
            'archived_variant_ids' => $variantPayloads
                ->filter(fn (array $variant) => (bool) ($variant['is_archived'] ?? false))
                ->pluck('id')
                ->values()
                ->all(),
            'variants' => $variantPayloads->all(),
            'updated_at' => $latestUpdatedAt,
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

    private function buildSingleVariantFallback(Product $product): array
    {
        $variantPayload = $this->buildVariantPayload($this->freshVariant($product));

        return [
            'sku' => $variantPayload['sku'],
            'changed_product_id' => $variantPayload['id'],
            'base_name' => $variantPayload['base_name'],
            'name' => $variantPayload['base_name'] ?: $variantPayload['name'],
            'brand' => $variantPayload['brand'],
            'category' => $variantPayload['category'],
            'vendor' => $variantPayload['vendor'],
            'price' => $variantPayload['price'],
            'selling_price' => $variantPayload['selling_price'],
            'lowest_variant_price' => $variantPayload['selling_price'],
            'highest_variant_price' => $variantPayload['selling_price'],
            'stock_quantity' => $variantPayload['stock_quantity'],
            'reserved_inventory' => $variantPayload['reserved_inventory'],
            'available_inventory' => $variantPayload['available_inventory'],
            'in_stock' => (bool) $variantPayload['in_stock'],
            'variant_count' => 1,
            'active_variant_count' => (!$variantPayload['is_deleted'] && !$variantPayload['is_archived']) ? 1 : 0,
            'deleted_variant_ids' => $variantPayload['is_deleted'] ? [$variantPayload['id']] : [],
            'archived_variant_ids' => $variantPayload['is_archived'] ? [$variantPayload['id']] : [],
            'variants' => [$variantPayload],
            'updated_at' => $variantPayload['updated_at'],
        ];
    }

    private function buildVariantPayload(Product $product): array
    {
        $product = $this->freshVariant($product);

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
        $isDeleted = method_exists($product, 'trashed') ? (bool) $product->trashed() : false;

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
            'in_stock' => $availableStock > 0 && !$product->is_archived && !$isDeleted,
            'stock' => [
                'total_physical_stock' => $totalPhysicalStock,
                'reserved_stock' => $reservedStock,
                'available_stock' => $availableStock,
                'in_stock' => $availableStock > 0 && !$product->is_archived && !$isDeleted,
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
            'is_deleted' => $isDeleted,
            'deleted_at' => optional($product->deleted_at)->toIso8601String(),
            'created_at' => optional($product->created_at)->toIso8601String(),
            'updated_at' => optional($product->updated_at)->toIso8601String(),
        ];
    }

    private function freshVariant(Product $product): Product
    {
        return Product::withTrashed()
            ->with([
                'category',
                'vendor',
                'images' => function ($query) {
                    $query->active()->ordered();
                },
                'batches.store',
                'barcodes',
                'reservedProduct',
            ])
            ->find($product->id) ?? $product;
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
