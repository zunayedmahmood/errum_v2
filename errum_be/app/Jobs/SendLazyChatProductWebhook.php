<?php

namespace App\Jobs;

use App\Models\Product;
use App\Services\LazyChat\ProductPayloadBuilder;
use App\Services\LazyChat\LazyChatWebhookTestLogger;
use App\Services\LazyChat\LazyChatTestAuth;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendLazyChatProductWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public function __construct(
        public int $productId,
        public string $topic,
        public array $meta = []
    ) {
    }

    public function handle(ProductPayloadBuilder $payloadBuilder): void
    {
        if (!config('lazychat.enabled')) {
            $this->logTestResult([
                'ok' => false,
                'phase' => 'skipped',
                'error' => 'LazyChat integration is disabled. Set LAZYCHAT_ENABLED=true to send webhook requests.',
            ]);
            return;
        }

        try {
            if ($this->topic === 'product/delete') {
                $this->sendDeleteWebhook();
                return;
            }

            $product = Product::withTrashed()->find($this->productId);

            if (!$product) {
                $this->sendDeleteWebhook();
                return;
            }

            $payload = $payloadBuilder->build($product);
            $this->sendUpsertWebhook($payload);
        } catch (Throwable $e) {
            Log::warning('LazyChat product webhook failed without blocking Errum.', [
                'product_id' => $this->productId,
                'topic' => $this->topic,
                'error' => $e->getMessage(),
            ]);

            $this->logTestResult([
                'ok' => false,
                'phase' => 'exception',
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function sendUpsertWebhook(array $payload): void
    {
        $url = config('lazychat.product_upsert.url');
        $token = config('lazychat.product_upsert.token');

        if (!$url || !$token) {
            Log::warning('LazyChat product upsert webhook skipped because URL or token is missing.');
            $this->logTestResult([
                'ok' => false,
                'phase' => 'skipped',
                'endpoint' => $url,
                'error' => 'LazyChat product upsert URL or token is missing.',
                'payload_summary' => $this->summarizePayload($payload),
            ]);
            return;
        }

        $response = Http::timeout((int) config('lazychat.timeout', 5))
            ->withToken($token)
            ->withHeaders(array_merge(['X-Webhook-Topic' => $this->topic], $this->testAuthHeaders()))
            ->post($url, $payload);

        $innerError = $this->detectInnerError($response->json());

        $this->logTestResult([
            'ok' => $response->successful() && !$innerError,
            'phase' => 'sent',
            'endpoint' => $url,
            'http_status' => $response->status(),
            'response_body' => $this->truncate($response->body()),
            'lazychat_inner_error' => $innerError,
            'payload_summary' => $this->summarizePayload($payload),
        ]);

        if (!$response->successful()) {
            Log::warning('LazyChat product upsert webhook returned a non-success response.', [
                'product_id' => $this->productId,
                'topic' => $this->topic,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        }
    }

    private function sendDeleteWebhook(): void
    {
        $url = config('lazychat.product_delete.url');
        $token = config('lazychat.product_delete.token');

        if (!$url || !$token) {
            Log::warning('LazyChat product delete webhook skipped because URL or token is missing.');
            $this->logTestResult([
                'ok' => false,
                'phase' => 'skipped',
                'endpoint' => $url,
                'error' => 'LazyChat product delete URL or token is missing.',
            ]);
            return;
        }

        $response = Http::timeout((int) config('lazychat.timeout', 5))
            ->withToken($token)
            ->withHeaders(array_merge(['X-Webhook-Topic' => 'product/delete'], $this->testAuthHeaders()))
            ->post($url, ['product_id' => $this->productId]);

        $innerError = $this->detectInnerError($response->json());

        $this->logTestResult([
            'ok' => $response->successful() && !$innerError,
            'phase' => 'sent',
            'endpoint' => $url,
            'http_status' => $response->status(),
            'response_body' => $this->truncate($response->body()),
            'lazychat_inner_error' => $innerError,
            'payload_summary' => [
                'product_id' => $this->productId,
            ],
        ]);

        if (!$response->successful()) {
            Log::warning('LazyChat product delete webhook returned a non-success response.', [
                'product_id' => $this->productId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        }
    }


    private function testAuthHeaders(): array
    {
        if (empty($this->meta['run_id']) || !config('lazychat.testing.enabled')) {
            return [];
        }

        try {
            return app(LazyChatTestAuth::class)->headers();
        } catch (Throwable $e) {
            Log::warning('Could not attach Errum test auth token to LazyChat webhook.', [
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function detectInnerError($value): ?string
    {
        if (!is_array($value)) {
            return null;
        }

        $found = $this->findInnerError($value);

        return $found ? $this->truncate($found, 500) : null;
    }

    private function findInnerError(array $value, string $path = ''): ?string
    {
        if (array_key_exists('success', $value) && $value['success'] === false) {
            $message = $value['error']['message'] ?? $value['message'] ?? json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            return trim($path . ' ' . (string) $message);
        }

        if (isset($value['error'])) {
            if (is_array($value['error'])) {
                $message = $value['error']['message'] ?? $value['error']['code'] ?? null;
                if ($message) {
                    return trim($path . ' ' . (string) $message);
                }
            }

            if (is_string($value['error'])) {
                return trim($path . ' ' . $value['error']);
            }
        }

        foreach ($value as $key => $child) {
            if (is_array($child)) {
                $found = $this->findInnerError($child, $path === '' ? (string) $key : $path . '.' . $key);
                if ($found) {
                    return $found;
                }
            }
        }

        return null;
    }

    private function logTestResult(array $result): void
    {
        if (empty($this->meta['run_id'])) {
            return;
        }

        LazyChatWebhookTestLogger::append(array_merge($this->meta, $result, [
            'product_id' => $this->productId,
            'topic' => $this->topic,
            'job' => self::class,
        ]));
    }

    private function summarizePayload(array $payload): array
    {
        return [
            'id' => $payload['id'] ?? null,
            'sku' => $payload['sku'] ?? null,
            'name' => $payload['name'] ?? null,
            'price' => $payload['price'] ?? null,
            'available_inventory' => $payload['available_inventory'] ?? null,
            'in_stock' => $payload['in_stock'] ?? null,
            'is_archived' => $payload['is_archived'] ?? null,
            'image_count' => isset($payload['images']) && is_array($payload['images']) ? count($payload['images']) : null,
            'batch_count' => isset($payload['batches']) && is_array($payload['batches']) ? count($payload['batches']) : null,
        ];
    }

    private function truncate(?string $value, int $limit = 2000): ?string
    {
        if ($value === null || strlen($value) <= $limit) {
            return $value;
        }

        return substr($value, 0, $limit) . '... [truncated]';
    }
}
