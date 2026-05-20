<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\ReservedProduct;
use App\Services\LazyChat\LazyChatWebhookTestContext;
use Illuminate\Support\Facades\Log;
use Throwable;

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

        $meta = LazyChatWebhookTestContext::meta([
            'model' => ReservedProduct::class,
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
            Log::warning('Could not dispatch LazyChat reserved product webhook job.', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
