<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReservedProduct extends Model
{
    protected $fillable = [
        'product_id',
        'total_inventory',
        'reserved_inventory',
        'available_inventory',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Canonical sellable physical stock for a product.
     *
     * Only active + available batches participate in normal sale inventory.
     * reserved_products is a rebuildable snapshot and must never be used as the
     * source of truth for physical quantity.
     */
    public static function physicalInventoryForProduct(int $productId): int
    {
        return max(0, (int) ProductBatch::where('product_id', $productId)
            ->where('is_active', true)
            ->where('availability', true)
            ->where('quantity', '>', 0)
            ->sum('quantity'));
    }

    /**
     * Rebuild one reserved_products snapshot from canonical physical stock.
     *
     * When $reservedInventory is omitted, the existing reservation count is
     * preserved. The reconciliation Artisan command supplies a rebuilt
     * reservation count from active online orders.
     */
    public static function syncSnapshot(
        int $productId,
        ?int $reservedInventory = null,
        bool $lock = false
    ): self {
        $query = static::where('product_id', $productId);
        if ($lock) {
            $query->lockForUpdate();
        }

        $snapshot = $query->first();
        if (!$snapshot) {
            $snapshot = new static([
                'product_id' => $productId,
                'total_inventory' => 0,
                'reserved_inventory' => 0,
                'available_inventory' => 0,
            ]);
        }

        $physicalInventory = static::physicalInventoryForProduct($productId);
        $reserved = max(0, $reservedInventory ?? (int) ($snapshot->reserved_inventory ?? 0));

        $snapshot->total_inventory = $physicalInventory;
        $snapshot->reserved_inventory = $reserved;
        $snapshot->available_inventory = max(0, $physicalInventory - $reserved);
        $snapshot->save();

        return $snapshot;
    }
}
