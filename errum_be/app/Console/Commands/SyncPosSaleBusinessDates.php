<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\SaleBusinessDateService;
use Illuminate\Console\Command;

class SyncPosSaleBusinessDates extends Command
{
    protected $signature = 'cash-sheet:sync-pos-business-dates
        {--order_id= : Repair one order only}
        {--from= : Selected order date from YYYY-MM-DD}
        {--to= : Selected order date to YYYY-MM-DD}
        {--dry-run : Show matching orders without changing data}';

    protected $description = 'Synchronise existing POS/offline sales and their linked records to orders.order_date';

    public function handle(SaleBusinessDateService $service): int
    {
        $query = Order::query()
            ->whereIn('order_type', ['counter', 'offline', 'pos', 'offline_sale', 'retail', 'branch'])
            ->whereNotNull('order_date')
            ->orderBy('id');

        if ($this->option('order_id')) {
            $query->whereKey((int) $this->option('order_id'));
        }
        if ($this->option('from')) {
            $query->whereDate('order_date', '>=', $this->option('from'));
        }
        if ($this->option('to')) {
            $query->whereDate('order_date', '<=', $this->option('to'));
        }

        $count = (clone $query)->count();
        if ($count === 0) {
            $this->info('No matching POS/offline sales found.');
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->table(
                ['Order ID', 'Order Number', 'Selected Sale Date', 'Current Created At'],
                $query->limit(500)->get(['id', 'order_number', 'order_date', 'created_at'])->map(fn (Order $order) => [
                    $order->id,
                    $order->order_number,
                    optional($order->order_date)->format('Y-m-d H:i:s'),
                    optional($order->created_at)->format('Y-m-d H:i:s'),
                ])->all()
            );
            $this->info("{$count} order(s) would be synchronised.");
            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($count);
        $bar->start();
        $updated = 0;
        $failed = 0;

        $query->chunkById(100, function ($orders) use ($service, $bar, &$updated, &$failed) {
            foreach ($orders as $order) {
                try {
                    $service->sync($order, $order->order_date);
                    $updated++;
                } catch (\Throwable $e) {
                    $failed++;
                    $this->newLine();
                    $this->error("Order {$order->id} failed: {$e->getMessage()}");
                }
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);
        $this->info("Synchronised {$updated} order(s). Failed: {$failed}.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
