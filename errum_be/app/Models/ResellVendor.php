<?php

namespace App\Models;

use App\Traits\AutoLogsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResellVendor extends Model
{
    use HasFactory, AutoLogsActivity;

    protected $fillable = [
        'vendor_id',
        'marked_by',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class)->withTrashed();
    }

    public function markedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'marked_by');
    }

    public function products(): HasMany
    {
        return $this->hasMany(ResellProduct::class);
    }

    public function activeProducts(): HasMany
    {
        return $this->products()->where('is_active', true);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
