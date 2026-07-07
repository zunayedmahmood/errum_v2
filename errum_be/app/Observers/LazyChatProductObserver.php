<?php

namespace App\Observers;

use App\Models\Product;
use App\Services\LazyChat\LazyChatProductWebhookDispatcher;
use App\Services\LazyChat\LazyChatWebhookTestContext;

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
        LazyChatProductWebhookDispatcher::dispatch($productId, $topic, LazyChatWebhookTestContext::meta([
            'model' => Product::class,
            'observer' => self::class,
            'model_event' => $event,
        ]));
    }
}
