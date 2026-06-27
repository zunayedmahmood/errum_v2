<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockAuditSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_number',
        'store_id',
        'status',
        'started_by',
        'started_at',
        'paused_at',
        'completed_at',
        'notes',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function scans(): HasMany
    {
        return $this->hasMany(StockAuditScan::class);
    }

    public function scopeOpen($query)
    {
        return $query->whereIn('status', ['active', 'paused']);
    }
}
