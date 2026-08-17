<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class DefectiveProduct extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'product_id',
        'product_barcode_id',
        'product_batch_id',
        'store_id',
        'defect_type',
        'defect_description',
        'defect_images',
        'severity',
        'original_price',
        'suggested_selling_price',
        'minimum_selling_price',
        'status',
        'identified_by',
        'inspected_by',
        'sold_by',
        'identified_at',
        'inspected_at',
        'sold_at',
        'order_id',
        'actual_selling_price',
        'sale_notes',
        'disposal_notes',
        'disposed_at',
        'vendor_id',
        'returned_to_vendor_at',
        'vendor_notes',
        'internal_notes',
        'source_return_id',
        'metadata',
    ];

    protected $casts = [
        'defect_images' => 'array',
        'metadata' => 'array',
        'original_price' => 'decimal:2',
        'suggested_selling_price' => 'decimal:2',
        'minimum_selling_price' => 'decimal:2',
        'actual_selling_price' => 'decimal:2',
        'identified_at' => 'datetime',
        'inspected_at' => 'datetime',
        'sold_at' => 'datetime',
        'disposed_at' => 'datetime',
        'returned_to_vendor_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($defectiveProduct) {
            if (!$defectiveProduct->identified_at) {
                $defectiveProduct->identified_at = now();
            }

            // Auto-suggest selling price based on severity
            if (!$defectiveProduct->suggested_selling_price) {
                $defectiveProduct->suggested_selling_price = $defectiveProduct->calculateSuggestedPrice();
            }

            if (!$defectiveProduct->minimum_selling_price) {
                $defectiveProduct->minimum_selling_price = $defectiveProduct->calculateMinimumPrice();
            }
        });
    }

    // Relationships
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function barcode(): BelongsTo
    {
        return $this->belongsTo(ProductBarcode::class, 'product_barcode_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductBatch::class, 'product_batch_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function identifiedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'identified_by');
    }

    public function inspectedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'inspected_by');
    }

    public function soldBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'sold_by');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function sourceReturn(): BelongsTo
    {
        return $this->belongsTo(ProductReturn::class, 'source_return_id');
    }

    // Scopes
    public function scopeAvailableForSale($query)
    {
        return $query->where('status', 'available_for_sale');
    }

    public function scopeIdentified($query)
    {
        return $query->where('status', 'identified');
    }

    public function scopeInspected($query)
    {
        return $query->where('status', 'inspected');
    }

    public function scopeSold($query)
    {
        return $query->where('status', 'sold');
    }

    public function scopeByStore($query, $storeId)
    {
        return $query->where('store_id', $storeId);
    }

    public function scopeBySeverity($query, $severity)
    {
        return $query->where('severity', $severity);
    }

    public function scopeByDefectType($query, $type)
    {
        return $query->where('defect_type', $type);
    }

    // Helper methods
    public function calculateSuggestedPrice(): float
    {
        // Suggest price based on severity
        $discountPercentage = match($this->severity) {
            'minor' => 0.10,      // 10% off
            'moderate' => 0.25,   // 25% off
            'major' => 0.50,      // 50% off
            'critical' => 0.70,   // 70% off
            default => 0.25
        };

        return $this->original_price * (1 - $discountPercentage);
    }

    public function calculateMinimumPrice(): float
    {
        // Minimum price is 30% of original for minor, 10% for critical
        $minPercentage = match($this->severity) {
            'minor' => 0.30,
            'moderate' => 0.20,
            'major' => 0.15,
            'critical' => 0.10,
            default => 0.20
        };

        return $this->original_price * $minPercentage;
    }

    public function markAsInspected(Employee $inspector, array $data = []): bool
    {
        if (!in_array($this->status, ['identified'])) {
            return false;
        }

        $updateData = [
            'status' => 'inspected',
            'inspected_by' => $inspector->id,
            'inspected_at' => now(),
        ];

        if (isset($data['severity'])) {
            $updateData['severity'] = $data['severity'];
            // Recalculate prices
            $updateData['suggested_selling_price'] = $this->calculateSuggestedPrice();
            $updateData['minimum_selling_price'] = $this->calculateMinimumPrice();
        }

        if (isset($data['internal_notes'])) {
            $updateData['internal_notes'] = $data['internal_notes'];
        }

        $this->update($updateData);

        return true;
    }

    public function makeAvailableForSale(): bool
    {
        if (!in_array($this->status, ['inspected', 'available_for_sale'], true)) {
            return false;
        }

        return DB::transaction(function () {
            $defectiveProduct = static::whereKey($this->id)->lockForUpdate()->firstOrFail();
            $alreadyAvailable = $defectiveProduct->status === 'available_for_sale';

            $barcode = $defectiveProduct->barcode()->lockForUpdate()->first();
            $originalBatch = $defectiveProduct->batch()->lockForUpdate()->first();
            $metadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
            $description = strtolower((string) $defectiveProduct->defect_description);
            $isUsedOnly = !empty($metadata['is_used_item'])
                && strtolower((string) $defectiveProduct->defect_type) === 'other'
                && !str_contains($description, 'defect');

            if ($isUsedOnly) {
                // Used-only items are not moved into an EXTRA resale batch anymore.
                // Keep the barcode attached to its current batch and only ensure the
                // used metadata exists. This prevents duplicate stock mutations when
                // older records are manually made available.
                if ($barcode) {
                    $barcode->markAsUsed([
                        'store_id' => $defectiveProduct->store_id ?: $barcode->current_store_id,
                        'defect_description' => $defectiveProduct->defect_description ?: 'USED_ITEM',
                        'original_price' => $defectiveProduct->original_price,
                        'identified_by' => $defectiveProduct->identified_by,
                        'source' => 'defective_product_make_available',
                    ]);
                }

                $metadata['used_item_metadata_only'] = true;
                $metadata['barcode_reactivated_for_pos_and_packing'] = true;
                $metadata['made_sellable_at'] = $metadata['made_sellable_at'] ?? now()->toISOString();
                $defectiveProduct->metadata = $metadata;
                if (!$alreadyAvailable) {
                    $defectiveProduct->status = 'available_for_sale';
                }
                $defectiveProduct->save();
                $this->forceFill($defectiveProduct->fresh()->getAttributes());
                return true;
            }

            if (!$originalBatch && $barcode && $barcode->batch_id) {
                $originalBatch = ProductBatch::whereKey($barcode->batch_id)->lockForUpdate()->first();
            }

            if ($barcode && $originalBatch) {
                if (!$defectiveProduct->product_batch_id) {
                    $defectiveProduct->product_batch_id = $originalBatch->id;
                }
                $resaleBatch = $this->resolveExtraItemResaleBatch($defectiveProduct, $originalBatch);

                if (!$alreadyAvailable) {
                    $resaleBatch->increment('quantity', 1);
                }

                $locationMetadata = is_array($barcode->location_metadata ?? null) ? $barcode->location_metadata : [];
                $barcode->update([
                    'batch_id' => $resaleBatch->id,
                    'current_store_id' => $defectiveProduct->store_id ?: $originalBatch->store_id,
                    'current_status' => 'in_shop',
                    'is_active' => true,
                    'is_defective' => false,
                    'location_updated_at' => now(),
                    'location_metadata' => array_merge($locationMetadata, [
                        'extra_item_resale_available_at' => now()->toDateTimeString(),
                        'defective_product_id' => $defectiveProduct->id,
                        'original_batch_id' => $originalBatch->id,
                        'resale_batch_id' => $resaleBatch->id,
                        'is_used_item' => (bool) data_get($defectiveProduct->metadata, 'is_used_item', false),
                    ]),
                ]);

                if (!$alreadyAvailable) {
                    ProductMovement::create([
                        'product_batch_id' => $resaleBatch->id,
                        'product_barcode_id' => $barcode->id,
                        'from_store_id' => null,
                        'to_store_id' => $defectiveProduct->store_id ?: $originalBatch->store_id,
                        'movement_type' => 'adjustment',
                        'quantity' => 1,
                        'unit_cost' => $originalBatch->cost_price ?? 0,
                        'unit_price' => $defectiveProduct->suggested_selling_price ?: ($originalBatch->sell_price ?? 0),
                        'total_cost' => $originalBatch->cost_price ?? 0,
                        'total_value' => $defectiveProduct->suggested_selling_price ?: ($originalBatch->sell_price ?? 0),
                        'reference_number' => 'EXTRA-' . $defectiveProduct->id,
                        'reference_type' => 'defective_product',
                        'reference_id' => $defectiveProduct->id,
                        'status_before' => 'defective',
                        'status_after' => 'in_shop',
                        'notes' => 'Display/Faulty/Used item made sellable from Extra Items Management.',
                        'performed_by' => auth()->id(),
                    ]);
                }

                $metadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
                $metadata['resale_batch_id'] = $resaleBatch->id;
                $metadata['made_sellable_at'] = $metadata['made_sellable_at'] ?? now()->toISOString();
                $metadata['barcode_reactivated_for_pos_and_packing'] = true;
                $defectiveProduct->metadata = $metadata;
            }

            if (!$alreadyAvailable) {
                $defectiveProduct->status = 'available_for_sale';
            }
            $defectiveProduct->save();

            $this->forceFill($defectiveProduct->fresh()->getAttributes());
            return true;
        });
    }

    private function resolveExtraItemResaleBatch(self $defectiveProduct, ProductBatch $originalBatch): ProductBatch
    {
        $storeId = $defectiveProduct->store_id ?: $originalBatch->store_id;
        $batchNumber = 'EXTRA-' . $defectiveProduct->id . '-' . $originalBatch->id;

        $existing = ProductBatch::where('batch_number', $batchNumber)->lockForUpdate()->first();
        if ($existing) {
            if (!$existing->source_purchase_order_id && $originalBatch->source_purchase_order_id) {
                $existing->forceFill([
                    'source_purchase_order_id' => $originalBatch->source_purchase_order_id,
                    'source_purchase_order_item_id' => $originalBatch->source_purchase_order_item_id,
                ])->save();
            }
            return $existing;
        }

        return ProductBatch::create([
            'product_id' => $defectiveProduct->product_id,
            'source_purchase_order_id' => $originalBatch->source_purchase_order_id,
            'source_purchase_order_item_id' => $originalBatch->source_purchase_order_item_id,
            'store_id' => $storeId,
            'batch_number' => $batchNumber,
            'quantity' => 0,
            'cost_price' => $originalBatch->cost_price ?? 0,
            'sell_price' => $defectiveProduct->suggested_selling_price ?: ($originalBatch->sell_price ?? 0),
            'tax_percentage' => $originalBatch->tax_percentage ?? 0,
            'manufactured_date' => $originalBatch->manufactured_date,
            'expiry_date' => $originalBatch->expiry_date,
            'availability' => true,
            'is_active' => true,
            'notes' => 'Auto-created resale batch for Display/Faulty/Used item from batch ' . $originalBatch->batch_number,
        ]);
    }

    public function markAsSold(Employee $seller, Order $order, float $sellingPrice, ?string $notes = null): bool
    {
        if ($this->status === 'sold') {
            return (int) $this->order_id === (int) $order->id;
        }

        if (!in_array($this->status, ['available_for_sale', 'inspected'])) {
            return false;
        }

        $this->update([
            'status' => 'sold',
            'sold_by' => $seller->id,
            'sold_at' => $order->order_date ?: now(),
            'order_id' => $order->id,
            'actual_selling_price' => $sellingPrice,
            'sale_notes' => $notes,
        ]);

        return true;
    }

    public function markAsDisposed(?string $notes = null): bool
    {
        if (in_array($this->status, ['sold', 'returned_to_vendor'])) {
            return false;
        }

        $this->update([
            'status' => 'disposed',
            'disposed_at' => now(),
            'disposal_notes' => $notes,
        ]);

        return true;
    }

    public function returnToVendor(Vendor $vendor, ?string $notes = null): bool
    {
        if (in_array($this->status, ['sold', 'disposed'])) {
            return false;
        }

        $this->update([
            'status' => 'returned_to_vendor',
            'vendor_id' => $vendor->id,
            'returned_to_vendor_at' => now(),
            'vendor_notes' => $notes,
        ]);

        return true;
    }

    public function isAvailableForSale(): bool
    {
        return $this->status === 'available_for_sale';
    }

    public function isSold(): bool
    {
        return $this->status === 'sold';
    }

    public function canBeSold(): bool
    {
        return in_array($this->status, ['available_for_sale', 'inspected']);
    }

    public function getPotentialDiscount(): float
    {
        return $this->original_price - $this->suggested_selling_price;
    }

    public function getDiscountPercentage(): float
    {
        if ($this->original_price == 0) return 0;
        return (($this->original_price - $this->suggested_selling_price) / $this->original_price) * 100;
    }

    public function getActualDiscountPercentage(): float
    {
        if (!$this->actual_selling_price || $this->original_price == 0) return 0;
        return (($this->original_price - $this->actual_selling_price) / $this->original_price) * 100;
    }

    // Accessors
    public function getStatusLabelAttribute(): string
    {
        return match($this->status) {
            'identified' => 'Identified',
            'inspected' => 'Inspected',
            'available_for_sale' => 'Available for Sale',
            'sold' => 'Sold',
            'disposed' => 'Disposed',
            'returned_to_vendor' => 'Returned to Vendor',
            default => 'Unknown'
        };
    }

    public function getSeverityLabelAttribute(): string
    {
        return match($this->severity) {
            'minor' => 'Minor',
            'moderate' => 'Moderate',
            'major' => 'Major',
            'critical' => 'Critical',
            default => 'Unknown'
        };
    }

    public function getSeverityColorAttribute(): string
    {
        return match($this->severity) {
            'minor' => 'warning',
            'moderate' => 'info',
            'major' => 'danger',
            'critical' => 'dark',
            default => 'secondary'
        };
    }
}
