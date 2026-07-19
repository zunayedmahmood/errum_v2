<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\PaymentCommissionService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncPaymentCommissions extends Command
{
    protected $signature = 'payment-commissions:sync
        {--from= : First order business date (YYYY-MM-DD)}
        {--to= : Last order business date (YYYY-MM-DD)}
        {--order_id= : Sync one order only}
        {--force-rate : Re-resolve rate snapshots from effective-dated settings}
        {--dry-run : Count matching orders without writing}';

    protected $description = 'Build or repair payment commission snapshots, accounting entries and cash-sheet net amounts.';

    public function handle(PaymentCommissionService $service): int
    {
        $query = Order::query()->withTrashed()->orderBy('id');

        if ($this->option('order_id')) {
            $query->whereKey((int) $this->option('order_id'));
        } else {
            if ($this->option('from')) {
                $query->whereDate('order_date', '>=', Carbon::parse($this->option('from'))->toDateString());
            }
            if ($this->option('to')) {
                $query->whereDate('order_date', '<=', Carbon::parse($this->option('to'))->toDateString());
            }
        }

        $count = (clone $query)->count();
        if ($this->option('dry-run')) {
            $this->info("{$count} order(s) would be scanned.");
            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($count);
        $bar->start();
        $force = (bool) $this->option('force-rate');
        $failed = 0;

        $query->chunkById(100, function ($orders) use ($service, $force, $bar, &$failed) {
            foreach ($orders as $order) {
                try {
                    if ($order->trashed()) {
                        $service->cancelOrder($order, 'Order is soft-deleted.');
                    } else {
                        $service->syncOrder($order, $force);
                    }
                } catch (\Throwable $e) {
                    $failed++;
                    $this->newLine();
                    $this->error("Order {$order->id}: {$e->getMessage()}");
                }
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);
        $this->info("Commission sync completed. Orders: {$count}; failures: {$failed}.");
        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
