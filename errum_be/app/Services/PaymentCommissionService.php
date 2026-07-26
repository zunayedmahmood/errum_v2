<?php

namespace App\Services;

use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\PaymentCommissionEntry;
use App\Models\PaymentCommissionRate;
use App\Models\PaymentMethod;
use App\Models\PaymentSplit;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class PaymentCommissionService
{
    private const CANCELLED_ORDER_STATUSES = ['cancelled', 'canceled', 'void', 'deleted'];
    private const CANCELLED_PAYMENT_STATUSES = ['cancelled', 'failed'];
    private const COMMISSION_ELIGIBLE_STATUSES = ['completed', 'partially_refunded', 'refunded'];
    private const VIRTUAL_PAYMENT_TYPES = ['exchange_balance', 'store_credit', 'balance_carryover'];
    private const VIRTUAL_METHOD_CODES = ['exchange_balance', 'store_credit', 'balance_carryover', 'gift_card'];

    public function preparePaymentSnapshot(OrderPayment $payment, bool $force = false): void
    {
        $order = $payment->relationLoaded('order') ? $payment->order : Order::find($payment->order_id);
        $method = $payment->payment_method_id
            ? ($payment->relationLoaded('paymentMethod') ? $payment->paymentMethod : PaymentMethod::find($payment->payment_method_id))
            : $this->resolveMethodForGatewayPayment($payment, $order);

        // Split-payment parents deliberately have no single payment method. Gateway
        // payments historically did too, so resolve only explicit gateway/provider
        // metadata and otherwise keep the parent at zero commission.
        if (!$method) {
            $payment->commission_channel_code = 'default';
            $payment->commission_rate_id = null;
            $payment->commission_rate = null;
            $payment->commission_amount = 0;
            $payment->reversed_commission_amount = (float) ($payment->reversed_commission_amount ?? 0);
            $payment->commission_refund_policy = PaymentCommissionRate::REFUND_KEEP;
            if (!isset($payment->fee_amount)) {
                $payment->fee_amount = 0;
            }
            if (!isset($payment->net_amount) && isset($payment->amount)) {
                $payment->net_amount = $payment->amount;
            }
            return;
        }

        if (!$payment->payment_method_id) {
            $payment->payment_method_id = $method->id;
            $payment->setRelation('paymentMethod', $method);
        }

        if (!$force && $payment->commission_rate !== null && $payment->commission_amount !== null) {
            $payment->fee_amount = (float) $payment->commission_amount;
            $payment->net_amount = round((float) $payment->amount - (float) $payment->commission_amount + (float) ($payment->reversed_commission_amount ?? 0), 2);
            return;
        }

        if (!$order) {
            return;
        }

        $this->applySnapshotFields($payment, $method, $order, $force);
    }

    public function prepareSplitSnapshot(PaymentSplit $split, bool $force = false): void
    {
        if (!$force && $split->commission_rate !== null && $split->commission_amount !== null) {
            $split->fee_amount = (float) $split->commission_amount;
            $split->net_amount = round((float) $split->amount - (float) $split->commission_amount + (float) ($split->reversed_commission_amount ?? 0), 2);
            return;
        }

        $payment = $split->relationLoaded('orderPayment')
            ? $split->orderPayment
            : OrderPayment::with('order')->find($split->order_payment_id);
        $order = $payment?->order;
        $method = $split->relationLoaded('paymentMethod') ? $split->paymentMethod : PaymentMethod::find($split->payment_method_id);
        if (!$payment || !$order || !$method) {
            return;
        }

        $this->applySnapshotFields($split, $method, $order, $force);
    }

    public function syncPayment(OrderPayment $payment, bool $forceRate = false): void
    {
        $payment = $payment->fresh(['order', 'paymentMethod', 'paymentSplits.paymentMethod']) ?: $payment;
        $order = $payment->order;
        if (!$order) {
            return;
        }

        if ($this->orderIsCancelled($order) || in_array((string) $payment->status, self::CANCELLED_PAYMENT_STATUSES, true) || $payment->trashed()) {
            $this->cancelPayment($payment, 'Payment/order no longer active.');
            return;
        }

        $activeSplits = $payment->paymentSplits
            ->filter(fn (PaymentSplit $split) => !in_array((string) $split->status, self::CANCELLED_PAYMENT_STATUSES, true));

        if ($activeSplits->isNotEmpty()) {
            $this->cancelSource(PaymentCommissionEntry::SOURCE_PAYMENT, (int) $payment->id, 'Split parent has instrument-level commission rows.');
            foreach ($activeSplits as $split) {
                $this->syncSplit($split, $forceRate, false);
            }
            $this->syncParentTotals($payment);
        } else {
            $this->preparePaymentSnapshot($payment, $forceRate);
            $payment->saveQuietly();

            // A pending/processing authorization is not money received yet. Keep the
            // snapshot on the payment, but do not create a cash-sheet expense or an
            // accounting journal until the instrument is completed.
            if (!$this->statusIsCommissionEligible((string) $payment->status)) {
                $this->cancelSource(PaymentCommissionEntry::SOURCE_PAYMENT, (int) $payment->id, 'Payment is not completed.');
            } else {
                $this->syncInstrumentEntry($payment, $order, $payment->paymentMethod, PaymentCommissionEntry::SOURCE_PAYMENT);
            }
        }

        $this->syncRefundReversalForOrder($order);
    }

    public function syncSplit(PaymentSplit $split, bool $forceRate = false, bool $syncRefunds = true): void
    {
        $split = $split->fresh(['orderPayment.order', 'paymentMethod']) ?: $split;
        $payment = $split->orderPayment;
        $order = $payment?->order;
        if (!$payment || !$order) {
            return;
        }

        if ($this->orderIsCancelled($order)
            || in_array((string) $payment->status, self::CANCELLED_PAYMENT_STATUSES, true)
            || in_array((string) $split->status, self::CANCELLED_PAYMENT_STATUSES, true)) {
            $this->cancelSource(PaymentCommissionEntry::SOURCE_SPLIT, (int) $split->id, 'Payment split no longer active.');
            $this->syncParentTotals($payment);
            return;
        }

        $this->prepareSplitSnapshot($split, $forceRate);
        $split->saveQuietly();
        if (!$this->statusIsCommissionEligible((string) $split->status)) {
            $this->cancelSource(PaymentCommissionEntry::SOURCE_SPLIT, (int) $split->id, 'Payment split is not completed.');
        } else {
            $this->syncInstrumentEntry($split, $order, $split->paymentMethod, PaymentCommissionEntry::SOURCE_SPLIT);
        }
        $this->syncParentTotals($payment);

        if ($syncRefunds) {
            $this->syncRefundReversalForOrder($order);
        }
    }

    public function syncOrder(Order $order, bool $forceRate = false): void
    {
        $order = $order->fresh(['payments.paymentMethod', 'payments.paymentSplits.paymentMethod']) ?: $order;
        if ($this->orderIsCancelled($order) || $order->trashed()) {
            $this->cancelOrder($order, 'Order cancelled/deleted.');
            return;
        }

        foreach ($order->payments as $payment) {
            $this->syncPayment($payment, $forceRate);
        }
    }

    public function cancelOrder(Order $order, string $reason = 'Order cancelled.'): void
    {
        PaymentCommissionEntry::where('order_id', $order->id)
            ->where('status', '!=', 'cancelled')
            ->get()
            ->each(fn (PaymentCommissionEntry $entry) => $this->cancelEntry($entry, $reason));
    }

    public function cancelPayment(OrderPayment $payment, string $reason = 'Payment cancelled.'): void
    {
        PaymentCommissionEntry::where('order_payment_id', $payment->id)
            ->where('status', '!=', 'cancelled')
            ->get()
            ->each(fn (PaymentCommissionEntry $entry) => $this->cancelEntry($entry, $reason));
    }

    public function cancelSplit(PaymentSplit $split, string $reason = 'Payment split cancelled.'): void
    {
        $this->cancelSource(PaymentCommissionEntry::SOURCE_SPLIT, (int) $split->id, $reason);
        if ($split->orderPayment) {
            $this->syncParentTotals($split->orderPayment);
        }
    }

    public function syncRefundReversalForOrder(Order $order): void
    {
        $order = $order->fresh() ?: $order;
        if ($this->orderIsCancelled($order)) {
            return;
        }

        $entries = PaymentCommissionEntry::with(['orderPayment', 'paymentSplit', 'paymentMethod'])
            ->where('order_id', $order->id)
            ->where('status', '!=', 'cancelled')
            ->orderBy('id')
            ->get();

        if ($entries->isEmpty()) {
            return;
        }

        $allocations = [];
        foreach ($entries as $entry) {
            $source = $entry->source_type === PaymentCommissionEntry::SOURCE_SPLIT
                ? $entry->paymentSplit
                : $entry->orderPayment;
            $allocations[$entry->id] = min(
                (float) $entry->gross_amount,
                max(0, (float) ($source?->refunded_amount ?? 0))
            );
        }

        // A refund can be written only on the split parent instead of its child
        // instruments. Distribute that parent-level amount over the actual card/MFS
        // splits so a proportional commission reversal cannot silently disappear.
        $splitGroups = $entries
            ->filter(fn (PaymentCommissionEntry $entry) => $entry->source_type === PaymentCommissionEntry::SOURCE_SPLIT)
            ->groupBy('order_payment_id');
        foreach ($splitGroups as $paymentId => $group) {
            $parent = $group->first()?->orderPayment;
            $groupGross = (float) $group->sum(fn (PaymentCommissionEntry $entry) => (float) $entry->gross_amount);
            $alreadyAllocated = (float) $group->sum(fn (PaymentCommissionEntry $entry) => (float) ($allocations[$entry->id] ?? 0));
            $parentRefund = min($groupGross, max(0, (float) ($parent?->refunded_amount ?? 0)));
            $parentAdditional = max(0, $parentRefund - $alreadyAllocated);
            if ($parentAdditional > 0) {
                $this->allocateRefundAcrossEntries($group->values(), $allocations, $parentAdditional);
            }
        }

        $directTotal = (float) collect($allocations)->sum();
        $workflowQuery = DB::table('refunds')
            ->where('order_id', $order->id)
            ->where('status', 'completed');
        if (Schema::hasColumn('refunds', 'deleted_at')) {
            $workflowQuery->whereNull('deleted_at');
        }
        $workflowTotal = (float) $workflowQuery->sum('refund_amount');

        // Several Errum refund paths mirror one another. The larger total is the
        // effective refunded gross; summing both would reverse commission twice.
        $targetRefundTotal = min(
            (float) $entries->sum(fn (PaymentCommissionEntry $entry) => (float) $entry->gross_amount),
            max($directTotal, $workflowTotal)
        );
        $additional = max(0, $targetRefundTotal - $directTotal);
        if ($additional > 0) {
            $this->allocateRefundAcrossEntries($entries->values(), $allocations, $additional);
        }

        foreach ($entries as $entry) {
            $gross = max(0.01, (float) $entry->gross_amount);
            $refundedGross = min($gross, max(0, (float) ($allocations[$entry->id] ?? 0)));
            $desiredReversal = $entry->refund_policy === PaymentCommissionRate::REFUND_REVERSE
                ? round((float) $entry->commission_amount * ($refundedGross / $gross), 2)
                : 0.0;
            $desiredReversal = min((float) $entry->commission_amount, max(0, $desiredReversal));

            $entry->reversed_commission_amount = $desiredReversal;
            $entry->net_commission_amount = round((float) $entry->commission_amount - $desiredReversal, 2);
            $entry->net_amount = round((float) $entry->gross_amount - (float) $entry->commission_amount + $desiredReversal, 2);
            $entry->status = $desiredReversal >= (float) $entry->commission_amount && (float) $entry->commission_amount > 0
                ? 'reversed'
                : 'active';
            $entry->metadata = array_merge($entry->metadata ?? [], [
                'refunded_gross_amount' => round($refundedGross, 2),
                'workflow_refund_total' => round($workflowTotal, 2),
                'direct_refund_total' => round($directTotal, 2),
            ]);
            $entry->saveQuietly();

            $source = $entry->source_type === PaymentCommissionEntry::SOURCE_SPLIT
                ? $entry->paymentSplit
                : $entry->orderPayment;
            if ($source) {
                $source->reversed_commission_amount = $desiredReversal;
                $source->net_amount = $entry->net_amount;
                $source->saveQuietly();
            }

            $this->postEntryAccounting($entry);
        }

        foreach ($order->payments()->get() as $payment) {
            if ($payment->paymentSplits()->exists()) {
                $this->syncParentTotals($payment);
            }
        }
    }

    private function allocateRefundAcrossEntries($entries, array &$allocations, float $amount): void
    {
        $remainingCapacities = $entries->mapWithKeys(function (PaymentCommissionEntry $entry) use ($allocations) {
            return [$entry->id => max(0, (float) $entry->gross_amount - (float) ($allocations[$entry->id] ?? 0))];
        });
        $capacityTotal = (float) $remainingCapacities->sum();
        $remaining = min(max(0, $amount), $capacityTotal);
        if ($remaining <= 0 || $capacityTotal <= 0) {
            return;
        }

        $eligible = $entries
            ->filter(fn (PaymentCommissionEntry $entry) => (float) ($remainingCapacities[$entry->id] ?? 0) > 0)
            ->values();
        $originalAmount = $remaining;

        foreach ($eligible as $index => $entry) {
            $capacity = (float) $remainingCapacities[$entry->id];
            $isLast = $index === $eligible->count() - 1;
            $allocation = $isLast
                ? min($remaining, $capacity)
                : min($capacity, round($originalAmount * ($capacity / max(0.01, $capacityTotal)), 2));
            $allocations[$entry->id] = round((float) ($allocations[$entry->id] ?? 0) + $allocation, 2);
            $remaining = max(0, round($remaining - $allocation, 2));
        }
    }

    public function resolveRate(PaymentMethod $method, $businessDate, string $channelCode = 'default'): array
    {
        if (!$this->isCommissionableMethod($method)) {
            return [
                'rate_id' => null,
                'channel_code' => 'default',
                'rate' => 0.0,
                'refund_policy' => PaymentCommissionRate::REFUND_KEEP,
                'effective_from' => null,
            ];
        }

        $date = $this->normaliseBusinessDate($businessDate);
        $channel = $this->normaliseChannelCode($channelCode);
        $setting = PaymentCommissionRate::where('payment_method_id', $method->id)
            ->where('channel_code', $channel)
            ->where('is_active', true)
            ->whereDate('effective_from', '<=', $date)
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->first();

        // Provider-specific bKash/Nagad/Rocket settings override the generic
        // Mobile Banking rate. An unset provider falls back to the method default.
        if (!$setting && $channel !== 'default') {
            $setting = PaymentCommissionRate::where('payment_method_id', $method->id)
                ->where('channel_code', 'default')
                ->where('is_active', true)
                ->whereDate('effective_from', '<=', $date)
                ->orderByDesc('effective_from')
                ->orderByDesc('id')
                ->first();
        }

        return [
            'rate_id' => $setting?->id,
            'channel_code' => $channel,
            'rate' => max(0, (float) ($setting?->percentage_rate ?? $method->percentage_fee ?? 0)),
            'refund_policy' => $setting?->refund_policy ?: PaymentCommissionRate::REFUND_KEEP,
            'effective_from' => $setting?->effective_from?->toDateString(),
        ];
    }

    private function applySnapshotFields(Model $instrument, PaymentMethod $method, Order $order, bool $force): void
    {
        $businessDate = $this->businessDate($order, $instrument);
        $channel = $this->detectChannelCode($instrument, $method, $order);
        $resolved = $this->resolveRate($method, $businessDate, $channel);
        $gross = round(max(0, (float) ($instrument->amount ?? 0)), 2);
        $commission = round($gross * ((float) $resolved['rate'] / 100), 2);
        $reversed = $force ? 0.0 : min($commission, max(0, (float) ($instrument->reversed_commission_amount ?? 0)));

        $instrument->commission_channel_code = $resolved['channel_code'] ?? $channel;
        $instrument->commission_rate_id = $resolved['rate_id'];
        $instrument->commission_rate = round((float) $resolved['rate'], 4);
        $instrument->commission_amount = $commission;
        $instrument->reversed_commission_amount = $reversed;
        $instrument->commission_refund_policy = $resolved['refund_policy'];
        // Keep legacy fields aligned so every existing controller/API receives
        // the same snapshot without requiring a breaking response change.
        $instrument->fee_amount = $commission;
        $instrument->net_amount = round($gross - $commission + $reversed, 2);
    }

    private function syncInstrumentEntry(Model $instrument, Order $order, ?PaymentMethod $method, string $sourceType): void
    {
        if (!$method || !$this->isCommissionableMethod($method)) {
            $this->cancelSource($sourceType, (int) $instrument->id, 'Cash/internal method has no processor commission.');
            return;
        }

        $gross = round(max(0, (float) $instrument->amount), 2);
        $commission = round(max(0, (float) $instrument->commission_amount), 2);
        $reversed = round(min($commission, max(0, (float) $instrument->reversed_commission_amount)), 2);
        $entry = PaymentCommissionEntry::updateOrCreate(
            ['source_type' => $sourceType, 'source_id' => $instrument->id],
            [
                'order_id' => $order->id,
                'order_payment_id' => $sourceType === PaymentCommissionEntry::SOURCE_PAYMENT
                    ? $instrument->id
                    : $instrument->order_payment_id,
                'payment_split_id' => $sourceType === PaymentCommissionEntry::SOURCE_SPLIT ? $instrument->id : null,
                'store_id' => $order->store_id ?: ($instrument->store_id ?? null),
                'payment_method_id' => $method->id,
                'channel_code' => $instrument->commission_channel_code ?: 'default',
                'commission_rate_id' => $instrument->commission_rate_id,
                'business_date' => $this->businessDate($order, $instrument),
                'gross_amount' => $gross,
                'commission_rate' => (float) ($instrument->commission_rate ?? 0),
                'commission_amount' => $commission,
                'reversed_commission_amount' => $reversed,
                'net_commission_amount' => round($commission - $reversed, 2),
                'net_amount' => round($gross - $commission + $reversed, 2),
                'refund_policy' => $instrument->commission_refund_policy ?: PaymentCommissionRate::REFUND_KEEP,
                'status' => 'active',
                'created_by' => $instrument->processed_by ?? auth()->id() ?? $order->created_by,
                'metadata' => [
                    'payment_method_code' => $method->code,
                    'payment_method_name' => $method->name,
                    'channel_code' => $instrument->commission_channel_code ?: 'default',
                    'order_number' => $order->order_number,
                    'order_type' => $order->order_type,
                    'snapshot_created_at' => now()->toISOString(),
                ],
            ]
        );

        $offlineOrderTypes = ['counter', 'offline', 'pos', 'offline_sale', 'retail', 'branch'];
        if ($order->order_date && in_array(strtolower((string) $order->order_type), $offlineOrderTypes, true)) {
            $businessAt = Carbon::parse($order->order_date, config('app.timezone', 'Asia/Dhaka'));
            $entry->forceFill([
                'created_at' => $businessAt,
                'updated_at' => $businessAt,
            ])->saveQuietly();
        }

        $this->postEntryAccounting($entry);
    }

    private function postEntryAccounting(PaymentCommissionEntry $entry): void
    {
        try {
            $posting = app(AccountingPostingService::class);
            if ($entry->status === 'cancelled') {
                $posting->cancelEvent("payment_commission:{$entry->id}:expense", 'Commission source cancelled.');
                $posting->cancelEvent("payment_commission:{$entry->id}:reversal", 'Commission source cancelled.');
                return;
            }

            $transaction = $posting->postPaymentCommission($entry, true);
            if ($transaction && $entry->accounting_transaction_id !== $transaction->id) {
                $entry->accounting_transaction_id = $transaction->id;
                $entry->saveQuietly();
            }
            $posting->postPaymentCommissionReversal($entry, true);
        } catch (\Throwable $e) {
            Log::error('Payment commission accounting sync failed', [
                'commission_entry_id' => $entry->id,
                'order_id' => $entry->order_id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function syncParentTotals(OrderPayment $payment): void
    {
        $splits = $payment->paymentSplits()
            ->whereNotIn('status', self::CANCELLED_PAYMENT_STATUSES)
            ->get();
        if ($splits->isEmpty()) {
            return;
        }

        $gross = round((float) $splits->sum('amount'), 2);
        $commission = round((float) $splits->sum('commission_amount'), 2);
        $reversed = round((float) $splits->sum('reversed_commission_amount'), 2);
        $weightedRate = $gross > 0 ? round(($commission / $gross) * 100, 4) : 0;

        $payment->forceFill([
            'amount' => $gross,
            'commission_channel_code' => $splits->pluck('commission_channel_code')->unique()->count() === 1
                ? (string) ($splits->first()->commission_channel_code ?: 'default')
                : 'mixed',
            'commission_rate_id' => null,
            'commission_rate' => $weightedRate,
            'commission_amount' => $commission,
            'reversed_commission_amount' => $reversed,
            'commission_refund_policy' => $splits->pluck('commission_refund_policy')->unique()->count() === 1
                ? (string) $splits->first()->commission_refund_policy
                : 'mixed',
            'fee_amount' => $commission,
            'net_amount' => round($gross - $commission + $reversed, 2),
        ])->saveQuietly();
    }

    private function cancelSource(string $sourceType, int $sourceId, string $reason): void
    {
        $entry = PaymentCommissionEntry::where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->first();
        if ($entry) {
            $this->cancelEntry($entry, $reason);
        }
    }

    private function cancelEntry(PaymentCommissionEntry $entry, string $reason): void
    {
        $entry->status = 'cancelled';
        $entry->metadata = array_merge($entry->metadata ?? [], [
            'cancelled_at' => now()->toISOString(),
            'cancellation_reason' => $reason,
        ]);
        $entry->saveQuietly();
        $this->postEntryAccounting($entry);
    }

    private function businessDate(Order $order, Model $instrument): string
    {
        $date = $order->order_date
            ?? data_get($instrument->metadata ?? [], 'cash_sheet_order_date')
            ?? data_get($instrument->payment_data ?? [], 'payment_date')
            ?? data_get($instrument->payment_data ?? [], 'business_date')
            ?? $instrument->payment_received_date
            ?? $instrument->completed_at
            ?? $instrument->created_at
            ?? now();

        return $this->normaliseBusinessDate($date);
    }

    private function normaliseBusinessDate($value): string
    {
        return Carbon::parse($value ?: now(), config('app.timezone', 'Asia/Dhaka'))->toDateString();
    }

    private function resolveMethodForGatewayPayment(OrderPayment $payment, ?Order $order): ?PaymentMethod
    {
        $values = [];
        foreach ([(array) ($payment->payment_data ?? []), (array) ($payment->metadata ?? [])] as $data) {
            foreach (['payment_method', 'actual_payment_method', 'wallet', 'channel', 'provider', 'display_method', 'source'] as $key) {
                if (!empty($data[$key])) {
                    $values[] = (string) $data[$key];
                }
            }
        }
        // Only use the order-level method as a gateway hint for online orders.
        // Counter split-payment parents intentionally have no method of their own.
        if ($order?->payment_method && in_array(strtolower((string) $order->order_type), ['ecommerce', 'online', 'web', 'website', 'social_commerce', 'lazychat'], true)) {
            $values[] = (string) $order->payment_method;
        }

        $haystack = strtolower(implode(' ', $values));
        $code = null;
        if (str_contains($haystack, 'ssl')) {
            $code = 'sslcommerz';
        } elseif (str_contains($haystack, 'bkash')) {
            $code = 'bkash';
        } elseif (str_contains($haystack, 'nagad')) {
            $code = 'nagad';
        } elseif (str_contains($haystack, 'rocket')) {
            $code = 'rocket';
        } elseif (preg_match('/\b(card|visa|mastercard|amex)\b/', $haystack)) {
            $code = 'card';
        }

        if (!$code) {
            return null;
        }

        $exact = PaymentMethod::where('code', $code)->first();
        if ($exact) {
            return $exact;
        }

        if (in_array($code, ['bkash', 'nagad', 'rocket'], true)) {
            return PaymentMethod::where('code', 'mobile_banking')->first()
                ?: PaymentMethod::where('type', 'mobile_banking')->first();
        }

        if ($code === 'sslcommerz') {
            return PaymentMethod::where('processor', 'sslcommerz')->first()
                ?: PaymentMethod::where('code', 'online_banking')->first()
                ?: PaymentMethod::where('type', 'online_banking')->first();
        }

        return PaymentMethod::where('code', 'card')->first()
            ?: PaymentMethod::where('type', 'card')->first();
    }

    private function detectChannelCode(Model $instrument, PaymentMethod $method, Order $order): string
    {
        $values = [];
        foreach ([(array) ($instrument->payment_data ?? []), (array) ($instrument->metadata ?? [])] as $data) {
            foreach (['wallet', 'channel', 'provider', 'actual_payment_method', 'display_method', 'payment_method'] as $key) {
                if (!empty($data[$key])) {
                    $values[] = (string) $data[$key];
                }
            }
        }
        if ($order->payment_method) {
            $values[] = (string) $order->payment_method;
        }

        $haystack = strtolower(implode(' ', $values));
        foreach (['bkash', 'nagad', 'rocket'] as $provider) {
            if (str_contains($haystack, $provider)) {
                return $provider;
            }
        }

        return 'default';
    }

    private function normaliseChannelCode(?string $channel): string
    {
        $channel = strtolower(trim((string) $channel));
        if ($channel === '' || in_array($channel, ['all', 'generic', 'method', 'none'], true)) {
            return 'default';
        }

        $channel = preg_replace('/[^a-z0-9_-]+/', '_', $channel) ?: 'default';
        return substr(trim($channel, '_'), 0, 64) ?: 'default';
    }

    private function statusIsCommissionEligible(string $status): bool
    {
        return in_array(strtolower(trim($status)), self::COMMISSION_ELIGIBLE_STATUSES, true);
    }

    private function orderIsCancelled(Order $order): bool
    {
        return in_array(strtolower((string) $order->status), self::CANCELLED_ORDER_STATUSES, true);
    }

    private function isCommissionableMethod(PaymentMethod $method): bool
    {
        $type = strtolower(trim((string) $method->type));
        $code = strtolower(trim((string) $method->code));
        return $type !== 'cash'
            && !in_array($type, self::VIRTUAL_PAYMENT_TYPES, true)
            && !in_array($code, self::VIRTUAL_METHOD_CODES, true);
    }
}
