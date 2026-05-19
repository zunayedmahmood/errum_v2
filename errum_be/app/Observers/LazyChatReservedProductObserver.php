<?php

namespace App\Observers;

use App\Jobs\SendLazyChatProductWebhook;
use App\Models\ReservedProduct;
use Illuminate\Support\Facades\Log;
use Throwable;

class LazyChatReservedProductObserver
{
    public function saved(ReservedProduct $reservedProduct): void
    {
        $this->dispatchProductUpdate($reservedProduct->product_id);
    }

    private function dispatchProductUpdate(?int $productId): void
    {
        if (!$productId) {
            return;
        }

        try {
            SendLazyChatProductWebhook::dispatch($productId, 'product/update');
        } catch (Throwable $e) {
            Log::warning('Could not dispatch LazyChat reserved product webhook job.', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
