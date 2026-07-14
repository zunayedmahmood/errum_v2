<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\LoyaltySetting;
use App\Models\Order;
use App\Models\ProductReturn;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class LoyaltyCardService
{
    public function normalizePhone(?string $phone): string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone) ?? '';

        if (str_starts_with($digits, '00880')) {
            $digits = substr($digits, 5);
        } elseif (str_starts_with($digits, '880')) {
            $digits = substr($digits, 3);
        } elseif (str_starts_with($digits, '88') && strlen($digits) === 13) {
            $digits = substr($digits, 2);
        }

        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            $digits = '0' . $digits;
        }

        return $digits;
    }

    /** @return array<int, string> */
    public function phoneCandidates(?string $phone): array
    {
        $normalized = $this->normalizePhone($phone);
        if ($normalized === '') {
            return [];
        }

        $candidates = [$normalized, '+88' . $normalized, '88' . $normalized, '+880' . ltrim($normalized, '0')];
        return array_values(array_unique(array_filter($candidates)));
    }

    public function findCustomerByPhone(?string $phone, bool $withTrashed = false): ?Customer
    {
        $query = $withTrashed ? Customer::withTrashed() : Customer::query();
        $candidates = $this->phoneCandidates($phone);

        if (empty($candidates)) {
            return null;
        }

        $normalized = $this->normalizePhone($phone);
        $digitCandidates = array_values(array_unique([
            $normalized,
            '88' . $normalized,
            '880' . ltrim($normalized, '0'),
            '00880' . ltrim($normalized, '0'),
        ]));
        $digitsExpression = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')";

        return $query
            ->where(function ($inner) use ($candidates, $digitCandidates, $digitsExpression) {
                $inner->whereIn('phone', $candidates)
                    ->orWhereIn(DB::raw($digitsExpression), $digitCandidates);
            })
            ->orderByDesc('has_loyalty_card')
            ->first();
    }

    public function settings(bool $lock = false): LoyaltySetting
    {
        $query = LoyaltySetting::query()->whereKey(1);
        if ($lock) {
            $query->lockForUpdate();
        }

        $setting = $query->first();
        if ($setting) {
            return $setting;
        }

        return LoyaltySetting::firstOrCreate(
            ['id' => 1],
            ['points_per_thousand' => 10, 'points_per_taka_discount' => 10]
        );
    }

    public function activateCard(string $phone, array $details = [], ?int $actorId = null): Customer
    {
        return DB::transaction(function () use ($phone, $details, $actorId) {
            $normalized = $this->normalizePhone($phone);
            if ($normalized === '') {
                throw new \InvalidArgumentException('A valid customer phone number is required.');
            }

            $phoneCandidates = $this->phoneCandidates($phone);
            $digitCandidates = array_values(array_unique([
                $normalized,
                '88' . $normalized,
                '880' . ltrim($normalized, '0'),
                '00880' . ltrim($normalized, '0'),
            ]));
            $digitsExpression = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')";

            $customer = Customer::withTrashed()
                ->where(function ($inner) use ($phoneCandidates, $digitCandidates, $digitsExpression) {
                    $inner->whereIn('phone', $phoneCandidates)
                        ->orWhereIn(DB::raw($digitsExpression), $digitCandidates);
                })
                ->lockForUpdate()
                ->orderByDesc('has_loyalty_card')
                ->first();

            if (!$customer) {
                $customer = new Customer();
                $customer->customer_type = $details['customer_type'] ?? 'counter';
                $customer->name = trim((string) ($details['name'] ?? '')) ?: 'Loyalty Customer ' . $normalized;
                $customer->phone = $normalized;
                $customer->email = $details['email'] ?? null;
                $customer->password = Hash::make(bin2hex(random_bytes(16)));
                $customer->address = $details['address'] ?? null;
                $customer->city = $details['city'] ?? null;
                $customer->state = $details['state'] ?? null;
                $customer->postal_code = $details['postal_code'] ?? null;
                $customer->country = $details['country'] ?? 'Bangladesh';
                $customer->status = 'active';
                $customer->created_by = $actorId;
            } else {
                if ($customer->trashed()) {
                    $customer->restore();
                }

                foreach (['name', 'email', 'address', 'city', 'state', 'postal_code', 'country'] as $field) {
                    if (array_key_exists($field, $details) && trim((string) $details[$field]) !== '') {
                        $customer->{$field} = $details[$field];
                    }
                }
                if (!empty($details['customer_type'])) {
                    $customer->customer_type = $details['customer_type'];
                }
                $customer->phone = $normalized;
                $customer->status = $customer->status === 'blocked' ? 'blocked' : 'active';
            }

            $customer->has_loyalty_card = true;
            $customer->loyalty_card_activated_at = $customer->loyalty_card_activated_at ?: now();
            $customer->loyalty_card_activated_by = $customer->loyalty_card_activated_by ?: $actorId;
            $customer->save();

            return $customer->fresh(['loyaltyCardActivatedBy']);
        });
    }

    public function deactivateCard(Customer $customer): Customer
    {
        $customer->update(['has_loyalty_card' => false]);
        return $customer->fresh();
    }

    public function preview(?Customer $customer, float $eligibleAmount): array
    {
        $setting = $this->settings();
        $eligibleWholeTaka = (int) floor(max(0, $eligibleAmount));
        $rawBalance = (int) ($customer?->loyalty_points_balance ?? 0);
        $balance = max(0, $rawBalance);
        $pointsPerTaka = max(1, (int) $setting->points_per_taka_discount);
        $availableTaka = (int) floor($balance / $pointsPerTaka);
        $redeemableTaka = $customer?->has_loyalty_card ? min($availableTaka, $eligibleWholeTaka) : 0;
        $pointsToRedeem = $redeemableTaka * $pointsPerTaka;

        return [
            'customer_found' => (bool) $customer,
            'has_loyalty_card' => (bool) ($customer?->has_loyalty_card ?? false),
            'customer_id' => $customer?->id,
            'customer_name' => $customer?->name,
            'phone' => $customer?->phone,
            'points_balance' => $rawBalance,
            'points_per_thousand' => (float) $setting->points_per_thousand,
            'points_per_taka_discount' => $pointsPerTaka,
            'eligible_amount' => round(max(0, $eligibleAmount), 2),
            'redeemable_taka' => $redeemableTaka,
            'points_to_redeem' => $pointsToRedeem,
            'can_redeem' => $redeemableTaka > 0,
        ];
    }

    public function initializeOrder(
        Order $order,
        ?Customer $customer,
        bool $usePoints = false,
        ?int $actorId = null,
        ?int $expectedPoints = null,
        ?float $expectedDiscount = null
    ): Order {
        return DB::transaction(function () use ($order, $customer, $usePoints, $actorId, $expectedPoints, $expectedDiscount) {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($lockedOrder->loyalty_points_per_thousand_snapshot !== null) {
                return $lockedOrder->fresh();
            }

            $setting = $this->settings(true);
            $lockedCustomer = $customer
                ? Customer::query()->whereKey($customer->id)->lockForUpdate()->first()
                : null;

            $isEligible = (bool) ($lockedCustomer?->has_loyalty_card ?? false);
            $lockedOrder->loyalty_card_eligible = $isEligible;
            $lockedOrder->loyalty_points_per_thousand_snapshot = (float) $setting->points_per_thousand;
            $lockedOrder->loyalty_points_per_taka_snapshot = (int) $setting->points_per_taka_discount;

            if ($usePoints && $isEligible && $lockedCustomer) {
                $idempotencyKey = 'redeem:order:' . $lockedOrder->id;
                $existing = LoyaltyPointTransaction::where('idempotency_key', $idempotencyKey)->first();

                if (!$existing) {
                    $eligibleAmount = max(0, (float) $lockedOrder->total_amount - (float) $lockedOrder->shipping_amount);
                    $preview = $this->previewWithSetting($lockedCustomer, $eligibleAmount, $setting);
                    $points = (int) $preview['points_to_redeem'];
                    $discount = (float) $preview['redeemable_taka'];

                    if (($expectedPoints !== null && max(0, $expectedPoints) !== $points)
                        || ($expectedDiscount !== null && abs(max(0, $expectedDiscount) - $discount) > 0.009)) {
                        throw new \RuntimeException('The loyalty balance or checkout amount changed. Refresh the checkout before redeeming points.');
                    }

                    if ($points > 0 && $discount > 0) {
                        if ((int) $lockedCustomer->loyalty_points_balance < $points) {
                            throw new \RuntimeException('The customer no longer has enough loyalty points. Refresh the checkout and try again.');
                        }

                        $lockedCustomer->loyalty_points_balance = (int) $lockedCustomer->loyalty_points_balance - $points;
                        $lockedCustomer->save();

                        $newTotal = max(0, round((float) $lockedOrder->total_amount - $discount, 2));
                        $paid = min((float) $lockedOrder->paid_amount, $newTotal);

                        $lockedOrder->loyalty_points_redeemed = $points;
                        $lockedOrder->loyalty_discount_amount = $discount;
                        $lockedOrder->loyalty_redeemed_at = now();
                        $lockedOrder->total_amount = $newTotal;
                        $lockedOrder->paid_amount = $paid;
                        $lockedOrder->outstanding_amount = max(0, round($newTotal - $paid, 2));
                        $lockedOrder->payment_status = $newTotal <= 0 ? 'paid' : ($paid > 0 ? 'partial' : 'pending');

                        LoyaltyPointTransaction::create([
                            'customer_id' => $lockedCustomer->id,
                            'order_id' => $lockedOrder->id,
                            'type' => 'redeemed',
                            'points_delta' => -$points,
                            'balance_after' => (int) $lockedCustomer->loyalty_points_balance,
                            'eligible_amount' => $eligibleAmount,
                            'taka_discount' => $discount,
                            'points_per_thousand_snapshot' => (float) $setting->points_per_thousand,
                            'points_per_taka_snapshot' => (int) $setting->points_per_taka_discount,
                            'idempotency_key' => $idempotencyKey,
                            'description' => "Redeemed {$points} loyalty points for ৳{$discount} discount on order {$lockedOrder->order_number}",
                            'created_by' => $actorId,
                            'metadata' => ['redemption_is_non_refundable' => true],
                        ]);
                    }
                }
            }

            $lockedOrder->saveQuietly();
            return $lockedOrder->fresh();
        });
    }

    public function awardForOrder(Order $order, ?float $basisOverride = null, ?int $actorId = null): Order
    {
        return DB::transaction(function () use ($order, $basisOverride, $actorId) {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $idempotencyKey = 'earn:order:' . $lockedOrder->id;

            if (LoyaltyPointTransaction::where('idempotency_key', $idempotencyKey)->exists()) {
                return $lockedOrder->fresh();
            }

            if (!$lockedOrder->loyalty_card_eligible || !$lockedOrder->customer_id) {
                return $lockedOrder;
            }

            $customer = Customer::query()->whereKey($lockedOrder->customer_id)->lockForUpdate()->first();
            if (!$customer) {
                return $lockedOrder;
            }

            $metadata = is_array($lockedOrder->metadata) ? $lockedOrder->metadata : [];
            $isExchangeReplacement = (bool) ($metadata['is_exchange_replacement'] ?? false);

            if ($basisOverride !== null) {
                $basis = max(0, $basisOverride);
            } elseif ($isExchangeReplacement) {
                $basis = (float) $lockedOrder->payments()
                    ->where('payment_type', 'exchange_surplus')
                    ->where('status', 'completed')
                    ->sum('amount');
            } else {
                $basis = max(0, (float) $lockedOrder->total_amount - (float) $lockedOrder->shipping_amount);
            }

            $rate = $lockedOrder->loyalty_points_per_thousand_snapshot !== null
                ? (float) $lockedOrder->loyalty_points_per_thousand_snapshot
                : (float) $this->settings()->points_per_thousand;
            $points = (int) floor(($basis * max(0, $rate)) / 1000);

            if ($points > 0) {
                $customer->loyalty_points_balance = (int) $customer->loyalty_points_balance + $points;
                $customer->save();
            }

            LoyaltyPointTransaction::create([
                'customer_id' => $customer->id,
                'order_id' => $lockedOrder->id,
                'type' => 'earned',
                'points_delta' => $points,
                'balance_after' => (int) $customer->loyalty_points_balance,
                'eligible_amount' => round($basis, 2),
                'taka_discount' => 0,
                'points_per_thousand_snapshot' => $rate,
                'points_per_taka_snapshot' => $lockedOrder->loyalty_points_per_taka_snapshot,
                'idempotency_key' => $idempotencyKey,
                'description' => $points > 0
                    ? "Earned {$points} loyalty points from order {$lockedOrder->order_number}"
                    : "Order {$lockedOrder->order_number} completed with zero loyalty points after rounding down",
                'created_by' => $actorId,
                'metadata' => [
                    'exchange_replacement' => $isExchangeReplacement,
                    'basis_source' => $isExchangeReplacement ? 'exchange_surplus_paid' : 'final_total_minus_delivery',
                ],
            ]);

            $lockedOrder->loyalty_points_earned = $points;
            $lockedOrder->loyalty_earning_basis = round($basis, 2);
            $lockedOrder->loyalty_earned_at = now();
            $lockedOrder->saveQuietly();

            return $lockedOrder->fresh();
        });
    }


    public function reverseEarnedForReturn(ProductReturn $productReturn, ?int $actorId = null): void
    {
        DB::transaction(function () use ($productReturn, $actorId) {
            $lockedReturn = ProductReturn::query()->whereKey($productReturn->id)->lockForUpdate()->first();
            if (!$lockedReturn || !in_array($lockedReturn->status, ['completed', 'refunded'], true)) {
                return;
            }

            $idempotencyKey = 'reverse:return:' . $lockedReturn->id;
            if (LoyaltyPointTransaction::where('idempotency_key', $idempotencyKey)->exists()) {
                return;
            }

            $order = Order::withTrashed()->whereKey($lockedReturn->order_id)->lockForUpdate()->first();
            if (!$order || !$order->customer_id) {
                return;
            }

            $earned = LoyaltyPointTransaction::query()
                ->where('order_id', $order->id)
                ->where('type', 'earned')
                ->where('points_delta', '>', 0)
                ->first();
            if (!$earned) {
                return;
            }

            $customer = Customer::withTrashed()->whereKey($order->customer_id)->lockForUpdate()->first();
            if (!$customer) {
                return;
            }

            $originalBasis = max(0, (float) $earned->eligible_amount);
            $returnValue = max(0, (float) ($lockedReturn->total_return_value ?: $lockedReturn->total_refund_amount));
            $preLoyaltyEligible = max(0, $originalBasis + (float) $order->loyalty_discount_amount);
            $proportionalBasis = $preLoyaltyEligible > 0
                ? $originalBasis * min(1, $returnValue / $preLoyaltyEligible)
                : 0;
            $priorBasis = (float) LoyaltyPointTransaction::query()
                ->where('order_id', $order->id)
                ->where('type', 'reversed_return')
                ->sum('eligible_amount');
            $remainingBasis = max(0, $originalBasis - $priorBasis);
            $basis = min($proportionalBasis, $remainingBasis);

            $rate = max(0, (float) ($earned->points_per_thousand_snapshot ?? $order->loyalty_points_per_thousand_snapshot ?? 0));
            $priorReversedPoints = abs((int) LoyaltyPointTransaction::query()
                ->where('order_id', $order->id)
                ->whereIn('type', ['reversed_return', 'reversed_order'])
                ->where('points_delta', '<', 0)
                ->sum('points_delta'));
            $originalPoints = max(0, (int) $earned->points_delta);
            $cumulativeReturnBasis = min($originalBasis, $priorBasis + $basis);
            $targetReversed = min($originalPoints, (int) floor(($cumulativeReturnBasis * $rate) / 1000));
            $pointsToReverse = max(0, $targetReversed - $priorReversedPoints);

            if ($pointsToReverse > 0) {
                $customer->loyalty_points_balance = (int) $customer->loyalty_points_balance - $pointsToReverse;
                $customer->save();
            }

            LoyaltyPointTransaction::create([
                'customer_id' => $customer->id,
                'order_id' => $order->id,
                'type' => 'reversed_return',
                'points_delta' => -$pointsToReverse,
                'balance_after' => (int) $customer->loyalty_points_balance,
                'eligible_amount' => round($basis, 2),
                'taka_discount' => 0,
                'points_per_thousand_snapshot' => $rate,
                'points_per_taka_snapshot' => $earned->points_per_taka_snapshot,
                'idempotency_key' => $idempotencyKey,
                'description' => $pointsToReverse > 0
                    ? "Reversed {$pointsToReverse} earned points for return {$lockedReturn->return_number}"
                    : "Return {$lockedReturn->return_number} required no additional whole-point reversal",
                'created_by' => $actorId,
                'metadata' => [
                    'return_id' => $lockedReturn->id,
                    'return_number' => $lockedReturn->return_number,
                    'redeemed_points_restored' => false,
                    'non_refundable_redemption_policy' => true,
                ],
            ]);
        });
    }

    public function reverseAllEarnedForOrder(Order $order, string $reason, ?int $actorId = null): void
    {
        DB::transaction(function () use ($order, $reason, $actorId) {
            $lockedOrder = Order::withTrashed()->whereKey($order->id)->lockForUpdate()->first();
            if (!$lockedOrder || !$lockedOrder->customer_id) {
                return;
            }

            $safeReason = preg_replace('/[^a-z0-9_-]+/i', '_', strtolower($reason)) ?: 'voided';
            $idempotencyKey = 'reverse:order:' . $lockedOrder->id . ':' . $safeReason;
            if (LoyaltyPointTransaction::where('idempotency_key', $idempotencyKey)->exists()) {
                return;
            }

            $earned = LoyaltyPointTransaction::query()
                ->where('order_id', $lockedOrder->id)
                ->where('type', 'earned')
                ->where('points_delta', '>', 0)
                ->first();
            if (!$earned) {
                return;
            }

            $alreadyReversed = abs((int) LoyaltyPointTransaction::query()
                ->where('order_id', $lockedOrder->id)
                ->whereIn('type', ['reversed_return', 'reversed_order'])
                ->where('points_delta', '<', 0)
                ->sum('points_delta'));
            $pointsToReverse = max(0, (int) $earned->points_delta - $alreadyReversed);
            $customer = Customer::withTrashed()->whereKey($lockedOrder->customer_id)->lockForUpdate()->first();
            if (!$customer) {
                return;
            }

            if ($pointsToReverse > 0) {
                $customer->loyalty_points_balance = (int) $customer->loyalty_points_balance - $pointsToReverse;
                $customer->save();
            }

            LoyaltyPointTransaction::create([
                'customer_id' => $customer->id,
                'order_id' => $lockedOrder->id,
                'type' => 'reversed_order',
                'points_delta' => -$pointsToReverse,
                'balance_after' => (int) $customer->loyalty_points_balance,
                'eligible_amount' => max(0, (float) $earned->eligible_amount),
                'taka_discount' => 0,
                'points_per_thousand_snapshot' => $earned->points_per_thousand_snapshot,
                'points_per_taka_snapshot' => $earned->points_per_taka_snapshot,
                'idempotency_key' => $idempotencyKey,
                'description' => $pointsToReverse > 0
                    ? "Reversed {$pointsToReverse} earned points because order {$lockedOrder->order_number} was {$reason}"
                    : "Order {$lockedOrder->order_number} was {$reason}; earned points were already fully reversed",
                'created_by' => $actorId,
                'metadata' => [
                    'reason' => $reason,
                    'redeemed_points_restored' => false,
                    'non_refundable_redemption_policy' => true,
                ],
            ]);
        });
    }

    private function previewWithSetting(Customer $customer, float $eligibleAmount, LoyaltySetting $setting): array
    {
        $eligibleWholeTaka = (int) floor(max(0, $eligibleAmount));
        $pointsPerTaka = max(1, (int) $setting->points_per_taka_discount);
        $availableTaka = (int) floor(max(0, (int) $customer->loyalty_points_balance) / $pointsPerTaka);
        $redeemableTaka = min($availableTaka, $eligibleWholeTaka);

        return [
            'redeemable_taka' => $redeemableTaka,
            'points_to_redeem' => $redeemableTaka * $pointsPerTaka,
        ];
    }
}
