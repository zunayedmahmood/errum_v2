<?php

namespace App\Http\Controllers;

use App\Models\PaymentCommissionEntry;
use App\Models\PaymentCommissionRate;
use App\Models\PaymentMethod;
use App\Models\Store;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PaymentCommissionController extends Controller
{
    private const ADMIN_ROLES = ['super-admin', 'superadmin', 'admin'];
    private const NON_COMMISSION_TYPES = ['cash', 'exchange_balance', 'store_credit', 'balance_carryover'];
    private const NON_COMMISSION_CODES = ['cash', 'exchange_balance', 'store_credit', 'balance_carryover', 'gift_card'];

    private function roleSlug(): string
    {
        $slug = (string) (Auth::guard('api')->user()?->role?->slug ?? '');
        return strtolower(str_replace('_', '-', trim($slug)));
    }

    private function denyUnlessAdmin()
    {
        if (!Auth::guard('api')->check()) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        if (!in_array($this->roleSlug(), self::ADMIN_ROLES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Only administrators can manage payment commissions.',
            ], 403);
        }

        return null;
    }

    /** GET /api/accounting/payment-commissions/settings */
    public function settings(Request $request)
    {
        if ($denied = $this->denyUnlessAdmin()) {
            return $denied;
        }

        $asOf = Carbon::parse($request->input('as_of', now('Asia/Dhaka')->toDateString()), 'Asia/Dhaka')->toDateString();
        $methods = PaymentMethod::with(['commissionRates' => function ($query) {
                $query->with(['createdBy:id,name', 'updatedBy:id,name'])
                    ->orderByDesc('effective_from')
                    ->orderByDesc('id');
            }])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function (PaymentMethod $method) use ($asOf) {
                $current = $method->commissionRates
                    ->first(fn (PaymentCommissionRate $rate) => $rate->channel_code === 'default' && $rate->is_active && $rate->effective_from->toDateString() <= $asOf);
                $channels = $this->channelsForMethod($method, $method->commissionRates);

                return [
                    'id' => $method->id,
                    'code' => $method->code,
                    'name' => $method->name,
                    'type' => $method->type,
                    'is_active' => (bool) $method->is_active,
                    'is_cash' => strtolower((string) $method->type) === 'cash',
                    'is_commissionable' => $this->isCommissionableMethod($method),
                    'current_rate' => $current ? (float) $current->percentage_rate : max(0, (float) $method->percentage_fee),
                    'current_refund_policy' => $current?->refund_policy ?: PaymentCommissionRate::REFUND_KEEP,
                    'current_effective_from' => $current?->effective_from?->toDateString(),
                    'channel_profiles' => collect($channels)->map(function (array $channel) use ($method, $asOf) {
                        $channelCurrent = $method->commissionRates
                            ->first(fn (PaymentCommissionRate $rate) => $rate->channel_code === $channel['code'] && $rate->is_active && $rate->effective_from->toDateString() <= $asOf);
                        if (!$channelCurrent && $channel['code'] !== 'default') {
                            $channelCurrent = $method->commissionRates
                                ->first(fn (PaymentCommissionRate $rate) => $rate->channel_code === 'default' && $rate->is_active && $rate->effective_from->toDateString() <= $asOf);
                        }
                        return [
                            'channel_code' => $channel['code'],
                            'channel_label' => $channel['label'],
                            'current_rate' => $channelCurrent ? (float) $channelCurrent->percentage_rate : max(0, (float) $method->percentage_fee),
                            'current_refund_policy' => $channelCurrent?->refund_policy ?: PaymentCommissionRate::REFUND_KEEP,
                            'current_effective_from' => $channelCurrent?->effective_from?->toDateString(),
                            'uses_default_fallback' => $channel['code'] !== 'default' && $channelCurrent?->channel_code === 'default',
                        ];
                    })->values(),
                    'rates' => $method->commissionRates->map(fn (PaymentCommissionRate $rate) => [
                        'channel_code' => $rate->channel_code,
                        'id' => $rate->id,
                        'percentage_rate' => (float) $rate->percentage_rate,
                        'effective_from' => $rate->effective_from->toDateString(),
                        'is_active' => (bool) $rate->is_active,
                        'refund_policy' => $rate->refund_policy,
                        'notes' => $rate->notes,
                        'created_by' => $rate->createdBy?->name,
                        'updated_by' => $rate->updatedBy?->name,
                        'created_at' => optional($rate->created_at)->toDateTimeString(),
                        'updated_at' => optional($rate->updated_at)->toDateTimeString(),
                    ])->values(),
                ];
            });

        return response()->json([
            'success' => true,
            'as_of' => $asOf,
            'payment_methods' => $methods,
            'refund_policies' => [
                ['value' => PaymentCommissionRate::REFUND_KEEP, 'label' => 'Keep original commission'],
                ['value' => PaymentCommissionRate::REFUND_REVERSE, 'label' => 'Reverse proportionally on refund'],
            ],
        ]);
    }

    /** POST /api/accounting/payment-commissions/settings */
    public function storeSetting(Request $request)
    {
        if ($denied = $this->denyUnlessAdmin()) {
            return $denied;
        }

        $validated = $this->validateSetting($request);
        $validated['channel_code'] = $this->normaliseChannelCode($validated['channel_code'] ?? 'default');
        $method = PaymentMethod::findOrFail($validated['payment_method_id']);

        if (!$this->isCommissionableMethod($method) && (float) $validated['percentage_rate'] > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cash, store-credit and exchange-balance methods cannot have a processor commission.',
            ], 422);
        }

        $rate = DB::transaction(function () use ($validated) {
            $rate = PaymentCommissionRate::updateOrCreate(
                [
                    'payment_method_id' => $validated['payment_method_id'],
                    'channel_code' => $validated['channel_code'],
                    'effective_from' => Carbon::parse($validated['effective_from'], 'Asia/Dhaka')->toDateString(),
                ],
                [
                    'percentage_rate' => round((float) $validated['percentage_rate'], 4),
                    'is_active' => (bool) ($validated['is_active'] ?? true),
                    'refund_policy' => $validated['refund_policy'] ?? PaymentCommissionRate::REFUND_KEEP,
                    'notes' => $validated['notes'] ?? null,
                    'created_by' => Auth::guard('api')->id(),
                    'updated_by' => Auth::guard('api')->id(),
                ]
            );

            $this->syncLegacyCurrentRate($rate);
            return $rate;
        });

        return response()->json([
            'success' => true,
            'message' => 'Commission rate saved. Existing payment snapshots were not rewritten.',
            'setting' => $rate->fresh(['paymentMethod:id,code,name,type', 'createdBy:id,name', 'updatedBy:id,name']),
        ], $rate->wasRecentlyCreated ? 201 : 200);
    }

    /** PUT /api/accounting/payment-commissions/settings/{id} */
    public function updateSetting(Request $request, int $id)
    {
        if ($denied = $this->denyUnlessAdmin()) {
            return $denied;
        }

        $rate = PaymentCommissionRate::findOrFail($id);
        $validated = $request->validate([
            'channel_code' => ['required', 'string', 'max:64', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'percentage_rate' => 'required|numeric|min:0|max:100',
            'effective_from' => [
                'required',
                'date',
                Rule::unique('payment_commission_rates', 'effective_from')
                    ->where(fn ($query) => $query
                        ->where('payment_method_id', $rate->payment_method_id)
                        ->where('channel_code', $this->normaliseChannelCode($request->input('channel_code', $rate->channel_code))))
                    ->ignore($rate->id),
            ],
            'is_active' => 'required|boolean',
            'refund_policy' => ['required', Rule::in([PaymentCommissionRate::REFUND_KEEP, PaymentCommissionRate::REFUND_REVERSE])],
            'notes' => 'nullable|string|max:1000',
        ]);

        $validated['channel_code'] = $this->normaliseChannelCode($validated['channel_code']);

        if (!$this->isCommissionableMethod($rate->paymentMethod) && (float) $validated['percentage_rate'] > 0) {
            return response()->json(['success' => false, 'message' => 'This internal/non-cash-settlement method cannot have a processor commission.'], 422);
        }

        DB::transaction(function () use ($rate, $validated) {
            $rate->update([
                'channel_code' => $validated['channel_code'],
                'percentage_rate' => round((float) $validated['percentage_rate'], 4),
                'effective_from' => Carbon::parse($validated['effective_from'], 'Asia/Dhaka')->toDateString(),
                'is_active' => (bool) $validated['is_active'],
                'refund_policy' => $validated['refund_policy'],
                'notes' => $validated['notes'] ?? null,
                'updated_by' => Auth::guard('api')->id(),
            ]);
            $this->syncLegacyCurrentRate($rate);
        });

        return response()->json([
            'success' => true,
            'message' => 'Commission setting updated. Saved payment snapshots remain unchanged.',
            'setting' => $rate->fresh(['paymentMethod:id,code,name,type', 'createdBy:id,name', 'updatedBy:id,name']),
        ]);
    }

    /** DELETE /api/accounting/payment-commissions/settings/{id} — audit-safe deactivation. */
    public function destroySetting(int $id)
    {
        if ($denied = $this->denyUnlessAdmin()) {
            return $denied;
        }

        $rate = PaymentCommissionRate::findOrFail($id);
        $rate->update([
            'is_active' => false,
            'updated_by' => Auth::guard('api')->id(),
        ]);
        $this->syncLegacyCurrentRate($rate);

        return response()->json([
            'success' => true,
            'message' => 'Commission setting deactivated. Historical snapshots and journals were retained.',
        ]);
    }

    /** GET /api/accounting/payment-commissions/report */
    public function report(Request $request)
    {
        if ($denied = $this->denyUnlessAdmin()) {
            return $denied;
        }

        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
            'store_id' => 'nullable|integer|exists:stores,id',
            'payment_method_id' => 'nullable|integer|exists:payment_methods,id',
            'channel_code' => ['nullable', 'string', 'max:64', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'status' => 'nullable|in:active,cancelled,reversed,all',
            'search' => 'nullable|string|max:100',
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $dateFrom = Carbon::parse($request->input('date_from', now('Asia/Dhaka')->startOfMonth()->toDateString()), 'Asia/Dhaka')->toDateString();
        $dateTo = Carbon::parse($request->input('date_to', now('Asia/Dhaka')->endOfMonth()->toDateString()), 'Asia/Dhaka')->toDateString();

        $base = PaymentCommissionEntry::query()
            ->with([
                'order:id,order_number,order_type,status,total_amount',
                'store:id,name',
                'paymentMethod:id,code,name,type',
                'createdBy:id,name',
                'accountingTransaction:id,transaction_number,status',
            ])
            ->whereBetween('business_date', [$dateFrom, $dateTo])
            ->when($request->filled('store_id'), fn ($query) => $query->where('store_id', $request->integer('store_id')))
            ->when($request->filled('payment_method_id'), fn ($query) => $query->where('payment_method_id', $request->integer('payment_method_id')))
            ->when($request->filled('channel_code'), fn ($query) => $query->where('channel_code', $this->normaliseChannelCode($request->input('channel_code'))))
            ->when($request->filled('status') && $request->input('status') !== 'all', fn ($query) => $query->where('status', $request->input('status')))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim((string) $request->input('search'));
                $query->where(function ($inner) use ($search) {
                    $inner->whereHas('order', fn ($order) => $order->where('order_number', 'like', "%{$search}%"))
                        ->orWhereHas('paymentMethod', fn ($method) => $method->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
                });
            });

        $summaryQuery = (clone $base)->setEagerLoads([]);
        $summary = $summaryQuery->selectRaw(
            'COALESCE(SUM(gross_amount),0) as gross_amount, '
            . 'COALESCE(SUM(commission_amount),0) as commission_amount, '
            . 'COALESCE(SUM(reversed_commission_amount),0) as reversed_commission_amount, '
            . 'COALESCE(SUM(net_commission_amount),0) as net_commission_amount, '
            . 'COALESCE(SUM(net_amount),0) as net_amount, COUNT(*) as entries_count'
        )->first();

        $byMethod = (clone $base)->setEagerLoads([])
            ->selectRaw('payment_method_id, channel_code, SUM(gross_amount) as gross_amount, SUM(net_commission_amount) as commission_amount, SUM(net_amount) as net_amount, COUNT(*) as entries_count')
            ->with('paymentMethod:id,code,name,type')
            ->groupBy('payment_method_id', 'channel_code')
            ->orderByDesc('commission_amount')
            ->get();

        $entries = $base->orderByDesc('business_date')
            ->orderByDesc('id')
            ->paginate((int) $request->input('per_page', 50));

        $gross = (float) ($summary->gross_amount ?? 0);
        $netCommission = (float) ($summary->net_commission_amount ?? 0);

        return response()->json([
            'success' => true,
            'filters' => ['date_from' => $dateFrom, 'date_to' => $dateTo],
            'summary' => [
                'gross_amount' => round($gross, 2),
                'commission_amount' => round((float) ($summary->commission_amount ?? 0), 2),
                'reversed_commission_amount' => round((float) ($summary->reversed_commission_amount ?? 0), 2),
                'net_commission_amount' => round($netCommission, 2),
                'net_amount' => round((float) ($summary->net_amount ?? 0), 2),
                'effective_rate' => $gross > 0 ? round(($netCommission / $gross) * 100, 4) : 0,
                'entries_count' => (int) ($summary->entries_count ?? 0),
            ],
            'by_method' => $byMethod,
            'entries' => $entries,
            'stores' => Store::orderBy('name')->get(['id', 'name']),
            'payment_methods' => PaymentMethod::orderBy('sort_order')->orderBy('name')->get(['id', 'code', 'name', 'type']),
        ]);
    }

    private function validateSetting(Request $request): array
    {
        return $request->validate([
            'payment_method_id' => 'required|integer|exists:payment_methods,id',
            'channel_code' => ['nullable', 'string', 'max:64', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'percentage_rate' => 'required|numeric|min:0|max:100',
            'effective_from' => [
                'required',
                'date',
                Rule::unique('payment_commission_rates', 'effective_from')
                    ->where(fn ($query) => $query
                        ->where('payment_method_id', $request->input('payment_method_id'))
                        ->where('channel_code', $this->normaliseChannelCode($request->input('channel_code', 'default')))),
            ],
            'is_active' => 'nullable|boolean',
            'refund_policy' => ['nullable', Rule::in([PaymentCommissionRate::REFUND_KEEP, PaymentCommissionRate::REFUND_REVERSE])],
            'notes' => 'nullable|string|max:1000',
        ]);
    }


    private function channelsForMethod(PaymentMethod $method, $rates): array
    {
        $channels = ['default' => 'Default / all providers'];
        $type = strtolower((string) $method->type);
        $code = strtolower((string) $method->code);
        if (in_array($type, ['mobile_banking', 'digital_wallet'], true) || in_array($code, ['mobile_banking', 'digital_wallet'], true)) {
            $channels += ['bkash' => 'bKash', 'nagad' => 'Nagad', 'rocket' => 'Rocket'];
        }
        foreach ($rates as $rate) {
            $channel = $this->normaliseChannelCode($rate->channel_code ?? 'default');
            $channels[$channel] = $channel === 'default' ? 'Default / all providers' : ucfirst($channel);
        }

        return collect($channels)->map(fn ($label, $code) => ['code' => $code, 'label' => $label])->values()->all();
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

    private function isCommissionableMethod(PaymentMethod $method): bool
    {
        $type = strtolower(trim((string) $method->type));
        $code = strtolower(trim((string) $method->code));

        return !in_array($type, self::NON_COMMISSION_TYPES, true)
            && !in_array($code, self::NON_COMMISSION_CODES, true);
    }

    private function syncLegacyCurrentRate(PaymentCommissionRate $changedRate): void
    {
        if ($changedRate->channel_code !== 'default') {
            return;
        }

        $method = $changedRate->paymentMethod;
        if (!$method) {
            return;
        }

        $today = now('Asia/Dhaka')->toDateString();
        $current = PaymentCommissionRate::where('payment_method_id', $method->id)
            ->where('channel_code', 'default')
            ->where('is_active', true)
            ->whereDate('effective_from', '<=', $today)
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->first();

        $method->forceFill([
            'percentage_fee' => $current ? (float) $current->percentage_rate : 0,
            'fixed_fee' => 0,
        ])->saveQuietly();
    }
}
