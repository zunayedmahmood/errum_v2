<?php

namespace App\Jobs;

use App\Models\Product;
use App\Services\LazyChat\ProductPayloadBuilder;
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

    public bool $afterCommit = true;

    public int $tries = 1;

    public function __construct(
        public int $productId,
        public string $topic
    ) {
    }

    public function handle(ProductPayloadBuilder $payloadBuilder): void
    {
        if (!config('lazychat.enabled')) {
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

            $this->sendUpsertWebhook($payloadBuilder->build($product));
        } catch (Throwable $e) {
            Log::warning('LazyChat product webhook failed without blocking Errum.', [
                'product_id' => $this->productId,
                'topic' => $this->topic,
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
            return;
        }

        $response = Http::timeout((int) config('lazychat.timeout', 5))
            ->withToken($token)
            ->withHeaders(['X-Webhook-Topic' => $this->topic])
            ->post($url, $payload);

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
            return;
        }

        $response = Http::timeout((int) config('lazychat.timeout', 5))
            ->withToken($token)
            ->withHeaders(['X-Webhook-Topic' => 'product/delete'])
            ->post($url, ['product_id' => $this->productId]);

        if (!$response->successful()) {
            Log::warning('LazyChat product delete webhook returned a non-success response.', [
                'product_id' => $this->productId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        }
    }
}
