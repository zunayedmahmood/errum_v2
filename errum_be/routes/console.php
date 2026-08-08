<?php

use App\Models\Product;
use App\Models\ReservedProduct;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('inventory:reconcile-reserved-stock', function () {
    $reservationStatuses = [
        'pending_assignment',
        'pending',
        'assigned_to_store',
        'picking',
        'processing',
        'ready_for_pickup',
        'ready_for_shipment',
    ];

    // Rebuild reservation truth from online orders that still hold stock.
    $reservedByProduct = DB::table('order_items')
        ->join('orders', 'orders.id', '=', 'order_items.order_id')
        ->whereIn('orders.order_type', ['social_commerce', 'ecommerce'])
        ->whereIn('orders.status', $reservationStatuses)
        ->whereNull('orders.deleted_at')
        ->whereRaw("LOWER(order_items.product_name) NOT LIKE '%[defective/used resale]%'")
        ->whereRaw("LOWER(order_items.product_name) NOT LIKE '%[defective]%'")
        ->groupBy('order_items.product_id')
        ->select('order_items.product_id', DB::raw('SUM(order_items.quantity) AS reserved_quantity'))
        ->pluck('reserved_quantity', 'order_items.product_id');

    $productsProcessed = 0;
    $rowsChanged = 0;
    $rowsCreated = 0;

    Product::select('id')
        ->orderBy('id')
        ->chunkById(500, function ($products) use ($reservedByProduct, &$productsProcessed, &$rowsChanged, &$rowsCreated) {
            DB::transaction(function () use ($products, $reservedByProduct, &$productsProcessed, &$rowsChanged, &$rowsCreated) {
                foreach ($products as $product) {
                    $productId = (int) $product->id;
                    $reservedInventory = max(0, (int) ($reservedByProduct[$productId] ?? 0));

                    $before = ReservedProduct::where('product_id', $productId)
                        ->lockForUpdate()
                        ->first();

                    $beforeValues = $before ? [
                        (int) $before->total_inventory,
                        (int) $before->reserved_inventory,
                        (int) $before->available_inventory,
                    ] : null;

                    $snapshot = ReservedProduct::syncSnapshot($productId, $reservedInventory, false);
                    $afterValues = [
                        (int) $snapshot->total_inventory,
                        (int) $snapshot->reserved_inventory,
                        (int) $snapshot->available_inventory,
                    ];

                    if ($beforeValues === null) {
                        $rowsCreated++;
                    } elseif ($beforeValues !== $afterValues) {
                        $rowsChanged++;
                    }

                    $productsProcessed++;
                }
            });
        });

    $this->info("Reconciliation complete: {$productsProcessed} products repaired, {$rowsChanged} snapshots corrected, {$rowsCreated} snapshots created.");
})->purpose('Repair reserved_products from active sellable batches and reservation-holding online orders');
