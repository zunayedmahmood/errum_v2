<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\AutoLogsActivity;

class LoyaltyPointTransaction extends Model
{
    use AutoLogsActivity;

    protected $fillable = [
        'customer_id',
        'order_id',
        'type',
        'points_delta',
        'balance_after',
        'eligible_amount',
        'taka_discount',
        'points_per_thousand_snapshot',
        'points_per_taka_snapshot',
        'idempotency_key',
        'description',
        'created_by',
        'metadata',
    ];

    protected $casts = [
        'points_delta' => 'integer',
        'balance_after' => 'integer',
        'eligible_amount' => 'decimal:2',
        'taka_discount' => 'decimal:2',
        'points_per_thousand_snapshot' => 'decimal:4',
        'points_per_taka_snapshot' => 'integer',
        'metadata' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by');
    }
}
