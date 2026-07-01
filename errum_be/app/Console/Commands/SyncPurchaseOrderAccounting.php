<?php

namespace App\Console\Commands;

use App\Models\PurchaseOrder;
use App\Models\Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncPurchaseOrderAccounting extends Command
{
    protected $signature = 'accounting:sync-purchase-orders
                            {--dry-run : Show what would be created without writing ledger entries}
                            {--force : Cancel existing PO receipt entries and recreate them from current received quantities}';

    protected $description = 'Backfill missing Inventory / Accounts Payable ledger entries for received purchase orders.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        $query = PurchaseOrder::with(['items', 'vendor', 'store'])
            ->whereIn('status', ['received', 'partially_received'])
            ->whereHas('items', function ($q) {
                $q->where('quantity_received', '>', 0);
            })
            ->orderBy('id');

        $total = (clone $query)->count();
        if ($total === 0) {
            $this->info('No received purchase orders found.');
            return Command::SUCCESS;
        }

        $this->info("Scanning {$total} received purchase order(s)...");

        $created = 0;
        $skipped = 0;
        $cancelled = 0;
        $errors = 0;

        $query->chunkById(50, function ($purchaseOrders) use ($dryRun, $force, &$created, &$skipped, &$cancelled, &$errors) {
            foreach ($purchaseOrders as $po) {
                try {
                    $existingQuery = Transaction::where('reference_type', PurchaseOrder::class)
                        ->where('reference_id', $po->id)
                        ->where('metadata->source', 'purchase_order_receipt')
                        ->where('status', 'completed');

                    $existingCount = (clone $existingQuery)->count();
                    if ($existingCount > 0 && !$force) {
                        $skipped++;
                        $this->line("SKIP {$po->po_number}: receipt ledger already exists ({$existingCount} transaction row(s)).");
                        continue;
                    }

                    $receiptLedgerLines = $this->buildReceiptLedgerLines($po);
                    $receivedAccountingValue = $po->calculateReceiptLedgerAmount($receiptLedgerLines);

                    // Legacy safety: older code booked paid vendor bills as Dr Inventory / Cr Cash.
                    // Backfill only the unpaid portion, otherwise paid historical POs would double-count inventory.
                    $legacyPaidAmount = round(abs((float) $po->paid_amount), 2);
                    $amount = round(max(0, $receivedAccountingValue - $legacyPaidAmount), 2);

                    if ($amount <= 0) {
                        $skipped++;
                        $this->line("SKIP {$po->po_number}: no unpaid received value to backfill. Received value BDT " . number_format($receivedAccountingValue, 2) . ", already paid BDT " . number_format($legacyPaidAmount, 2) . ".");
                        continue;
                    }

                    if ($dryRun) {
                        $this->line("DRY {$po->po_number}: would create Dr Inventory / Cr Accounts Payable for unpaid received value BDT " . number_format($amount, 2));
                        continue;
                    }

                    DB::transaction(function () use ($po, $force, $existingQuery, $receiptLedgerLines, $amount, $receivedAccountingValue, $legacyPaidAmount, &$cancelled) {
                        if ($force) {
                            $rows = (clone $existingQuery)->count();
                            if ($rows > 0) {
                                $existingQuery->update(['status' => 'cancelled']);
                                $cancelled += $rows;
                            }
                        }

                        Transaction::createFromPurchaseOrderReceipt(
                            $po,
                            $amount,
                            [
                                'receipt_type' => 'po_accounting_backfill',
                                'received_lines' => $receiptLedgerLines,
                                'received_gross_amount' => round(array_sum(array_column($receiptLedgerLines, 'gross_amount')), 2),
                                'received_accounting_value_before_legacy_paid_offset' => $receivedAccountingValue,
                                'legacy_paid_amount_offset' => $legacyPaidAmount,
                                'backfilled_by_command' => 'accounting:sync-purchase-orders',
                            ]
                        );
                    });

                    $created++;
                    $this->info("CREATED {$po->po_number}: Dr Inventory / Cr Accounts Payable BDT " . number_format($amount, 2));
                } catch (\Throwable $e) {
                    $errors++;
                    $this->error("ERROR {$po->po_number}: {$e->getMessage()}");
                }
            }
        });

        $this->newLine();
        $this->info('Purchase order accounting sync finished.');
        $this->table(
            ['Created', 'Skipped', 'Cancelled Existing Rows', 'Errors'],
            [[$created, $skipped, $cancelled, $errors]]
        );

        return $errors > 0 ? Command::FAILURE : Command::SUCCESS;
    }

    private function buildReceiptLedgerLines(PurchaseOrder $po): array
    {
        $lines = [];

        foreach ($po->items as $item) {
            $receivedQuantity = (int) $item->quantity_received;
            if ($receivedQuantity <= 0) {
                continue;
            }

            $orderedQuantity = max(1, (int) $item->quantity_ordered);
            $lineGross = round(((float) $item->unit_cost) * $receivedQuantity, 2);
            $lineTax = round(((float) $item->tax_amount) * ($receivedQuantity / $orderedQuantity), 2);
            $lineDiscount = round(((float) $item->discount_amount) * ($receivedQuantity / $orderedQuantity), 2);

            $lines[] = [
                'item_id' => $item->id,
                'product_id' => $item->product_id,
                'quantity_received' => $receivedQuantity,
                'unit_cost' => (float) $item->unit_cost,
                'gross_amount' => $lineGross,
                'tax_amount' => $lineTax,
                'discount_amount' => $lineDiscount,
                'net_amount' => round($lineGross + $lineTax - $lineDiscount, 2),
            ];
        }

        return $lines;
    }
}
