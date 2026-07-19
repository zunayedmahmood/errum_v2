<?php

namespace App\Models;

use App\Traits\AutoLogsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentCommissionEntry extends Model
{
    use HasFactory, AutoLogsActivity;

    public const SOURCE_PAYMENT = 'order_payment';
    public const SOURCE_SPLIT = 'payment_split';

    protected $fillable = [
        'source_type',
        'source_id',
        'order_id',
        'order_payment_id',
        'payment_split_id',
        'store_id',
        'payment_method_id',
        'channel_code',
        'commission_rate_id',
        'business_date',
        'gross_amount',
        'commission_rate',
        'commission_amount',
        'reversed_commission_amount',
        'net_commission_amount',
        'net_amount',
        'refund_policy',
        'status',
        'accounting_transaction_id',
        'created_by',
        'metadata',
    ];

    protected $casts = [
        'business_date' => 'date',
        'gross_amount' => 'decimal:2',
        'commission_rate' => 'decimal:4',
        'commission_amount' => 'decimal:2',
        'reversed_commission_amount' => 'decimal:2',
        'net_commission_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function orderPayment(): BelongsTo
    {
        return $this->belongsTo(OrderPayment::class);
    }

    public function paymentSplit(): BelongsTo
    {
        return $this->belongsTo(PaymentSplit::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function rate(): BelongsTo
    {
        return $this->belongsTo(PaymentCommissionRate::class, 'commission_rate_id');
    }

    public function accountingTransaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class, 'accounting_transaction_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by');
    }
}
