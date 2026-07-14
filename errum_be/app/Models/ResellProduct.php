<?php

namespace App\Models;

use App\Traits\AutoLogsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellProduct extends Model
{
    use HasFactory, AutoLogsActivity;

    protected $fillable = [
        'product_id',
        'resell_vendor_id',
        'marked_by',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function resellVendor(): BelongsTo
    {
        return $this->belongsTo(ResellVendor::class);
    }

    public function markedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'marked_by');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
