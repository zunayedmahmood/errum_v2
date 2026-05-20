<?php

namespace App\Services\LazyChat;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatWebhookTestLogger
{
    public static function append(array $entry): void
    {
        if (empty($entry['run_id'])) {
            return;
        }

        try {
            File::ensureDirectoryExists(dirname(self::path()));

            $entry['logged_at'] = now()->toIso8601String();

            File::append(
                self::path(),
                json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL
            );
        } catch (Throwable $e) {
            Log::warning('Could not write LazyChat webhook test log.', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    public static function read(?string $runId = null, int $limit = 500): array
    {
        if (!File::exists(self::path())) {
            return [];
        }

        $lines = file(self::path(), FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $entries = [];

        foreach ($lines as $line) {
            $decoded = json_decode($line, true);

            if (!is_array($decoded)) {
                continue;
            }

            if ($runId && ($decoded['run_id'] ?? null) !== $runId) {
                continue;
            }

            $entries[] = $decoded;
        }

        return array_slice($entries, -1 * max(1, $limit));
    }

    public static function path(): string
    {
        return storage_path('logs/lazychat-test-webhooks.jsonl');
    }
}
