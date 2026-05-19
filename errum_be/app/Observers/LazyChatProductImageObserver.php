<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\ProductImage;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatProductImageObserver
{
    public function saved(ProductImage $image): void
    {
        $this->dispatchProductUpdate($image->product_id);
    }

    public function deleted(ProductImage $image): void
    {
        $this->dispatchProductUpdate($image->product_id);
    }

    private function dispatchProductUpdate(?int $productId): void
    {
        if (!$productId) {
            return;
        }

        try {
            SendLazyChatProductWebhook::dispatch($productId, 'product/update');
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat product image webhook job.', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
