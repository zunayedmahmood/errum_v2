<?php

namespace App\Models;

use App\Traits\AutoLogsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentCommissionRate extends Model
{
    use HasFactory, AutoLogsActivity;

    public const REFUND_KEEP = 'keep_original';
    public const REFUND_REVERSE = 'reverse_proportionally';

    protected $fillable = [
        'payment_method_id',
        'channel_code',
        'percentage_rate',
        'effective_from',
        'is_active',
        'refund_policy',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'percentage_rate' => 'decimal:4',
        'effective_from' => 'date',
        'is_active' => 'boolean',
    ];

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'updated_by');
    }
}
