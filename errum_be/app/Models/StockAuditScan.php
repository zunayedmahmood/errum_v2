<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockAuditScan extends Model
{
    use HasFactory;

    protected $fillable = [
        'stock_audit_session_id',
        'product_barcode_id',
        'barcode_text',
        'product_id',
        'batch_id',
        'expected_store_id',
        'system_store_id',
        'system_status',
        'scan_status',
        'is_duplicate',
        'scanned_by',
        'scanned_at',
        'notes',
    ];

    protected $casts = [
        'is_duplicate' => 'boolean',
        'scanned_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(StockAuditSession::class, 'stock_audit_session_id');
    }

    public function barcode(): BelongsTo
    {
        return $this->belongsTo(ProductBarcode::class, 'product_barcode_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(ProductBatch::class, 'batch_id');
    }

    public function expectedStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'expected_store_id');
    }

    public function systemStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'system_store_id');
    }
}
