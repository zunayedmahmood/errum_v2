<?php

namespace App\Observers;

use App\Models\ProductImage;
use App\Services\LazyChat\LazyChatProductWebhookDispatcher;
use App\Services\LazyChat\LazyChatWebhookTestContext;

class LazyChatProductImageObserver
{
    public function saved(ProductImage $image): void
    {
        $this->dispatchProductUpdate($image->product_id, 'saved');
    }

    public function deleted(ProductImage $image): void
    {
        $this->dispatchProductUpdate($image->product_id, 'deleted');
    }

    private function dispatchProductUpdate(?int $productId, string $event): void
    {
        if (!$productId) {
            return;
        }

        LazyChatProductWebhookDispatcher::dispatch((int) $productId, 'product/update', LazyChatWebhookTestContext::meta([
            'model' => ProductImage::class,
            'observer' => self::class,
            'model_event' => $event,
        ]));
    }
}
