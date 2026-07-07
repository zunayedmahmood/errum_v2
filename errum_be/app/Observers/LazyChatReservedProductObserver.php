<?php

namespace App\Observers;

use App\Models\ReservedProduct;
use App\Services\LazyChat\LazyChatProductWebhookDispatcher;
use App\Services\LazyChat\LazyChatWebhookTestContext;

class LazyChatReservedProductObserver
{
    public function saved(ReservedProduct $reservedProduct): void
    {
        $this->dispatchProductUpdate($reservedProduct->product_id, 'saved');
    }

    private function dispatchProductUpdate(?int $productId, string $event): void
    {
        if (!$productId) {
            return;
        }

        LazyChatProductWebhookDispatcher::dispatch((int) $productId, 'product/update', LazyChatWebhookTestContext::meta([
            'model' => ReservedProduct::class,
            'observer' => self::class,
            'model_event' => $event,
        ]));
    }
}
