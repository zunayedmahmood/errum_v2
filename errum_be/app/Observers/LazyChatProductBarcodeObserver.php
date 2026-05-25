<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\ProductBarcode;
use App\Services\LazyChat\LazyChatWebhookTestContext;
use Illuminate\Support\Facades\Log;
use Throwable;

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

        $meta = LazyChatWebhookTestContext::meta([
            'model' => ProductBarcode::class,
            'observer' => self::class,
            'model_event' => $event,
        ]);

        try {
            if (LazyChatWebhookTestContext::isActive()) {
                SendLazyChatProductWebhook::dispatchSync((int) $barcode->product_id, 'product/update', $meta);
                return;
            }

            $dispatch = SendLazyChatProductWebhook::dispatch((int) $barcode->product_id, 'product/update', $meta);
            if (method_exists($dispatch, 'afterCommit')) {
                $dispatch->afterCommit();
            }
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product barcode webhook job.', [
                'product_id' => $barcode->product_id,
                'barcode_id' => $barcode->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
