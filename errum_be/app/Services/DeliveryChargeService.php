<?php

namespace App\Services;

use App\Models\Setting;

class DeliveryChargeService
{
    public const SETTING_KEY = 'ecommerce_delivery_charges';

    public const DEFAULTS = [
        'inside_dhaka' => 60.00,
        'outside_dhaka' => 120.00,
    ];

    public function getSettings(): array
    {
        $setting = Setting::where('key', self::SETTING_KEY)->first();
        $stored = is_array($setting?->value) ? $setting->value : [];

        return $this->normalizeSettings($stored);
    }

    public function updateSettings(array $settings): array
    {
        $normalized = $this->normalizeSettings($settings);

        Setting::updateOrCreate(
            ['key' => self::SETTING_KEY],
            [
                'value' => $normalized,
                'group' => 'ecommerce',
            ]
        );

        return $normalized;
    }

    public function chargeForCity(?string $city): float
    {
        $settings = $this->getSettings();

        return $this->isInsideDhaka($city)
            ? (float) $settings['inside_dhaka']
            : (float) $settings['outside_dhaka'];
    }

    public function isInsideDhaka(?string $city): bool
    {
        $normalized = mb_strtolower(trim((string) $city), 'UTF-8');

        if ($normalized === '') {
            return true;
        }

        return str_contains($normalized, 'dhaka') || str_contains($normalized, 'ঢাকা');
    }

    private function normalizeSettings(array $settings): array
    {
        return [
            'inside_dhaka' => $this->normalizeMoney($settings['inside_dhaka'] ?? self::DEFAULTS['inside_dhaka']),
            'outside_dhaka' => $this->normalizeMoney($settings['outside_dhaka'] ?? self::DEFAULTS['outside_dhaka']),
        ];
    }

    private function normalizeMoney(mixed $value): float
    {
        if (!is_numeric($value)) {
            return 0.00;
        }

        return round(max(0, (float) $value), 2);
    }
}
