<?php

namespace App\Services\LazyChat;

class LazyChatWebhookTestContext
{
    private static ?array $context = null;

    public static function set(string $runId, array $meta = []): void
    {
        self::$context = array_merge($meta, [
            'run_id' => $runId,
        ]);
    }

    public static function clear(): void
    {
        self::$context = null;
    }

    public static function isActive(): bool
    {
        return self::$context !== null;
    }

    public static function meta(array $eventMeta = []): array
    {
        if (!self::isActive()) {
            return $eventMeta;
        }

        return array_merge(self::$context, $eventMeta);
    }
}
