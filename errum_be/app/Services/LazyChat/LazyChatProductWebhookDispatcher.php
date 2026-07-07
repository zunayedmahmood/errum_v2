<?php

namespace App\Services\LazyChat;

use App\Jobs\SendLazyChatProductWebhook;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatProductWebhookDispatcher
{
    /** @var array<string,array{product_id:int,topic:string,meta:array}> */
    private static array $pending = [];

    private static bool $flushRegistered = false;

    public static function dispatch(int $productId, string $topic, array $meta = []): void
    {
        if ($productId <= 0) {
            return;
        }

        try {
            if (LazyChatWebhookTestContext::isActive()) {
                SendLazyChatProductWebhook::dispatchSync($productId, $topic, $meta);
                return;
            }

            $enqueue = fn () => self::enqueue($productId, $topic, $meta);

            if (DB::connection()->transactionLevel() > 0) {
                DB::afterCommit($enqueue);
            } else {
                $enqueue();
            }
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product webhook job.', [
                'product_id' => $productId,
                'topic' => $topic,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private static function enqueue(int $productId, string $topic, array $meta): void
    {
        $key = $topic . ':' . $productId;

        if (isset(self::$pending[$key])) {
            self::$pending[$key]['meta']['coalesced_count'] = (int) ((self::$pending[$key]['meta']['coalesced_count'] ?? 1) + 1);
            self::$pending[$key]['meta']['coalesced_sources'][] = $meta;
        } else {
            self::$pending[$key] = [
                'product_id' => $productId,
                'topic' => $topic,
                'meta' => $meta,
            ];
        }

        if (!self::$flushRegistered) {
            self::$flushRegistered = true;
            app()->terminating(fn () => self::flush());
        }
    }

    public static function flush(): void
    {
        $jobs = self::$pending;
        self::$pending = [];
        self::$flushRegistered = false;

        foreach ($jobs as $job) {
            SendLazyChatProductWebhook::dispatch($job['product_id'], $job['topic'], $job['meta']);
        }
    }
}
