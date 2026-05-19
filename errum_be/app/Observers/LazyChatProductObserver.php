<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\Product;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatProductObserver
{
    public function created(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/create');
    }

    public function updated(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/update');
    }

    public function deleted(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/delete');
    }

    public function restored(Product $product): void
    {
        $this->dispatchWebhook($product->id, 'product/update');
    }

    private function dispatchWebhook(int $productId, string $topic): void
    {
        try {
            SendLazyChatProductWebhook::dispatch($productId, $topic);
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product webhook job.', [
                'product_id' => $productId,
                'topic' => $topic,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
