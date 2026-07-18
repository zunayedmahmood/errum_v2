<?php

namespace App\Services;

use App\Models\CashDenomination;
use App\Models\DefectiveProduct;
use App\Models\LoyaltyPointTransaction;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\PaymentSplit;
use App\Models\ProductBarcode;
use App\Models\ProductMovement;
use App\Models\Transaction;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Synchronises the selected POS/offline sale date across every record created
 * as part of that sale. The real action time remains in activity logs and in
 * metadata.actual_* fields; operational reports use the selected business date.
 */
class SaleBusinessDateService
{
    private const OFFLINE_ORDER_TYPES = [
        'counter', 'offline', 'pos', 'offline_sale', 'retail', 'branch',
    ];

    public function sync(Order $order, Carbon|string|null $businessAt = null): Order
    {
        if (!in_array(strtolower((string) $order->order_type), self::OFFLINE_ORDER_TYPES, true)) {
            return $order;
        }

        $timezone = config('app.timezone', 'Asia/Dhaka');
        $businessAt = $businessAt instanceof Carbon
            ? $businessAt->copy()->setTimezone($timezone)
            : Carbon::parse($businessAt ?: $order->order_date ?: $order->created_at ?: now($timezone), $timezone);
        $businessDate = $businessAt->toDateString();
        $actualSyncAt = now($timezone);

        $metadata = is_array($order->metadata ?? null) ? $order->metadata : [];
        $metadata['actual_recorded_at'] = $metadata['actual_recorded_at']
            ?? optional($order->getRawOriginal('created_at') ? Carbon::parse($order->getRawOriginal('created_at'), $timezone) : null)?->toISOString()
            ?? $actualSyncAt->toISOString();
        $metadata['selected_sale_datetime'] = $businessAt->toISOString();
        $metadata['business_date_last_synchronised_at'] = $actualSyncAt->toISOString();
        $metadata['business_date_source'] = 'orders.order_date';

        $orderFields = [
            'order_date' => $businessAt,
            'created_at' => $businessAt,
            'updated_at' => $businessAt,
            'metadata' => $metadata,
        ];
        if ($order->confirmed_at || in_array(strtolower((string) $order->status), ['confirmed', 'completed'], true)) {
            $orderFields['confirmed_at'] = $businessAt;
        }

        $order->forceFill($orderFields)->saveQuietly();

        DB::table('order_items')
            ->where('order_id', $order->id)
            ->update(['created_at' => $businessAt, 'updated_at' => $businessAt]);

        $payments = OrderPayment::withTrashed()
            ->where('order_id', $order->id)
            ->get();
        $paymentIds = $payments->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($payments as $payment) {
            $paymentData = is_array($payment->payment_data ?? null) ? $payment->payment_data : [];
            $paymentData['payment_date'] = $businessAt->toDateTimeString();
            $paymentData['business_date'] = $businessDate;

            $paymentMetadata = is_array($payment->metadata ?? null) ? $payment->metadata : [];
            $paymentMetadata['actual_recorded_at'] = $paymentMetadata['actual_recorded_at']
                ?? optional($payment->getRawOriginal('created_at') ? Carbon::parse($payment->getRawOriginal('created_at'), $timezone) : null)?->toISOString()
                ?? $actualSyncAt->toISOString();
            $paymentMetadata['cash_sheet_order_date'] = $businessAt->toDateTimeString();
            $paymentMetadata['business_date_last_synchronised_at'] = $actualSyncAt->toISOString();

            $fields = [
                'payment_received_date' => $businessDate,
                'payment_data' => $paymentData,
                'metadata' => $paymentMetadata,
                'created_at' => $businessAt,
                'updated_at' => $businessAt,
            ];
            if ($payment->processed_at) {
                $fields['processed_at'] = $businessAt;
            }
            if ($payment->completed_at || strtolower((string) $payment->status) === 'completed') {
                $fields['completed_at'] = $businessAt;
            }
            $payment->forceFill($fields)->saveQuietly();
        }

        $splits = empty($paymentIds)
            ? collect()
            : PaymentSplit::whereIn('order_payment_id', $paymentIds)->get();
        $splitIds = $splits->pluck('id')->map(fn ($id) => (int) $id)->all();

        foreach ($splits as $split) {
            $splitData = is_array($split->payment_data ?? null) ? $split->payment_data : [];
            $splitData['payment_date'] = $businessAt->toDateTimeString();
            $splitData['business_date'] = $businessDate;

            $splitMetadata = is_array($split->metadata ?? null) ? $split->metadata : [];
            $splitMetadata['actual_recorded_at'] = $splitMetadata['actual_recorded_at']
                ?? optional($split->getRawOriginal('created_at') ? Carbon::parse($split->getRawOriginal('created_at'), $timezone) : null)?->toISOString()
                ?? $actualSyncAt->toISOString();
            $splitMetadata['cash_sheet_order_date'] = $businessAt->toDateTimeString();
            $splitMetadata['business_date_last_synchronised_at'] = $actualSyncAt->toISOString();

            $fields = [
                'payment_data' => $splitData,
                'metadata' => $splitMetadata,
                'created_at' => $businessAt,
                'updated_at' => $businessAt,
            ];
            if ($split->processed_at) {
                $fields['processed_at'] = $businessAt;
            }
            if ($split->completed_at || strtolower((string) $split->status) === 'completed') {
                $fields['completed_at'] = $businessAt;
            }
            $split->forceFill($fields)->saveQuietly();
        }

        if (Schema::hasTable('cash_denominations') && (!empty($paymentIds) || !empty($splitIds))) {
            CashDenomination::query()
                ->where(function ($query) use ($paymentIds, $splitIds) {
                    if (!empty($paymentIds)) {
                        $query->whereIn('order_payment_id', $paymentIds);
                    }
                    if (!empty($splitIds)) {
                        $method = empty($paymentIds) ? 'whereIn' : 'orWhereIn';
                        $query->{$method}('payment_split_id', $splitIds);
                    }
                })
                ->update(['created_at' => $businessAt, 'updated_at' => $businessAt]);
        }

        if (Schema::hasTable('transactions') && !empty($paymentIds)) {
            Transaction::whereIn('reference_type', [OrderPayment::class, 'OrderPayment'])
                ->whereIn('reference_id', $paymentIds)
                ->update([
                    'transaction_date' => $businessDate,
                    'created_at' => $businessAt,
                    'updated_at' => $businessAt,
                ]);
        }

        if (Schema::hasTable('transactions')) {
            Transaction::whereIn('reference_type', [Order::class, 'Order'])
                ->where('reference_id', $order->id)
                ->update([
                    'transaction_date' => $businessDate,
                    'created_at' => $businessAt,
                    'updated_at' => $businessAt,
                ]);
        }

        if (Schema::hasTable('loyalty_point_transactions')) {
            LoyaltyPointTransaction::where('order_id', $order->id)
                ->update(['created_at' => $businessAt, 'updated_at' => $businessAt]);
        }

        if (Schema::hasTable('product_movements')
            && Schema::hasColumn('product_movements', 'reference_type')
            && Schema::hasColumn('product_movements', 'reference_id')) {
            ProductMovement::where('reference_id', $order->id)
                ->whereIn('reference_type', ['order', Order::class, 'Order'])
                ->update([
                    'movement_date' => $businessAt,
                    'created_at' => $businessAt,
                    'updated_at' => $businessAt,
                ]);
        }

        $barcodeIds = DB::table('order_items')
            ->where('order_id', $order->id)
            ->whereNotNull('product_barcode_id')
            ->pluck('product_barcode_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach (Schema::hasTable('product_barcodes') ? ProductBarcode::whereIn('id', $barcodeIds)->get() : collect() as $barcode) {
            $barcodeMetadata = is_array($barcode->location_metadata ?? null) ? $barcode->location_metadata : [];
            if ((int) ($barcodeMetadata['order_id'] ?? 0) !== (int) $order->id
                && (string) ($barcodeMetadata['order_number'] ?? '') !== (string) $order->order_number) {
                continue;
            }
            $barcodeMetadata['sale_date'] = $businessAt->toISOString();
            $barcodeMetadata['business_date_last_synchronised_at'] = $actualSyncAt->toISOString();
            $barcode->forceFill([
                'location_updated_at' => $businessAt,
                'location_metadata' => $barcodeMetadata,
            ])->saveQuietly();
        }

        if (Schema::hasTable('defective_products')) {
            DefectiveProduct::where('order_id', $order->id)
                ->where('status', 'sold')
                ->update(['sold_at' => $businessAt, 'updated_at' => $businessAt]);
        }

        return $order->fresh();
    }
}
