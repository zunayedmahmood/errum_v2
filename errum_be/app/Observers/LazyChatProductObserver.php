<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\Product;
use App\Services\LazyChat\LazyChatWebhookTestContext;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatProductObserver
{
    public function created(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/create', 'created');
    }

    public function updated(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/update', 'updated');
    }

    public function deleted(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/delete', 'deleted');
    }

    public function restored(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/update', 'restored');
    }

    private function dispatchWebhook(int $productId, string $topic, string $event): void
    {
        $meta = LazyChatWebhookTestContext::meta([
            'model' => Product::class,
            'observer' => self::class,
            'model_event' => $event,
        ]);

        try {
            if (LazyChatWebhookTestContext::isActive()) {
                SendLazyChatProductWebhook::dispatchSync($productId, $topic, $meta);
                return;
            }

            $dispatch = SendLazyChatProductWebhook::dispatch($productId, $topic, $meta);
            if (method_exists($dispatch, 'afterCommit')) {
                $dispatch->afterCommit();
            }
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product webhook job.', [
                'product_id' => $productId,
                'topic' => $topic,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
