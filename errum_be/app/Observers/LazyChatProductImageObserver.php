<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\ProductImage;
use App\Services\LazyChat\LazyChatWebhookTestContext;
use Illuminate\Support\Facades\Log;
use Throwable;

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

        $meta = LazyChatWebhookTestContext::meta([
            'model' => ProductImage::class,
            'observer' => self::class,
            'model_event' => $event,
        ]);

        try {
            if (LazyChatWebhookTestContext::isActive()) {
                SendLazyChatProductWebhook::dispatchSync($productId, 'product/update', $meta);
                return;
            }

            $dispatch = SendLazyChatProductWebhook::dispatch($productId, 'product/update', $meta);
            if (method_exists($dispatch, 'afterCommit')) {
                $dispatch->afterCommit();
            }
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product image webhook job.', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
