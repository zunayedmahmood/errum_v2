<?php

namespace App\Observers;

use App\Models\ProductBarcode;
use App\Services\LazyChat\LazyChatProductWebhookDispatcher;
use App\Services\LazyChat\LazyChatWebhookTestContext;

class LazyChatProductBarcodeObserver
{
    public function saved(ProductBarcode $barcode): void
    {
        $this->dispatchProductUpdate($barcode, 'saved');
    }

    public function deleted(ProductBarcode $barcode): void
    {
        $this->dispatchProductUpdate($barcode, 'deleted');
    }

    private function dispatchProductUpdate(ProductBarcode $barcode, string $event): void
    {
        if (!$barcode->product_id) {
            return;
        }

        LazyChatProductWebhookDispatcher::dispatch((int) $barcode->product_id, 'product/update', LazyChatWebhookTestContext::meta([
            'model' => ProductBarcode::class,
            'observer' => self::class,
            'model_event' => $event,
        ]));
    }
}
