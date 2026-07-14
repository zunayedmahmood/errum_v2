<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\AutoLogsActivity;

class LoyaltySetting extends Model
{
    use AutoLogsActivity;

    protected $fillable = [
        'points_per_thousand',
        'points_per_taka_discount',
        'updated_by',
    ];

    protected $casts = [
        'points_per_thousand' => 'decimal:4',
        'points_per_taka_discount' => 'integer',
    ];

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'updated_by');
    }
}
