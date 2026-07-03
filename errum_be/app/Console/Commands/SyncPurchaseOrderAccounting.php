<?php

namespace App\Console\Commands;

use App\Models\PurchaseOrder;
use App\Models\Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SyncPurchaseOrderAccounting extends Command
{
    protected $signature = 'accounting:sync-purchase-orders
                            {--dry-run : Show what would be created without writing ledger entries}
                            {--force : Cancel existing PO receipt entries and recreate them from current received quantities}
                            {--repair-partial : Repair missing Inventory/AP side even when some PO receipt ledger already exists}';

    protected $description = 'Backfill/repair missing Inventory and Accounts Payable ledger entries for received purchase orders.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $repairPartial = (bool) $this->option('repair-partial') || $force;

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

        $inventoryAccountId = Transaction::getInventoryAccountId();
        $accountsPayableAccountId = Transaction::getAccountsPayableAccountId();

        $this->info("Scanning {$total} received purchase order(s)...");
        $this->line("Inventory account ID: {$inventoryAccountId}");
        $this->line("Accounts Payable account ID: {$accountsPayableAccountId}");

        $createdGroups = 0;
        $repairedRows = 0;
        $skipped = 0;
        $cancelled = 0;
        $errors = 0;

        $query->chunkById(50, function ($purchaseOrders) use (
            $dryRun,
            $force,
            $repairPartial,
            $inventoryAccountId,
            $accountsPayableAccountId,
            &$createdGroups,
            &$repairedRows,
            &$skipped,
            &$cancelled,
            &$errors
        ) {
            foreach ($purchaseOrders as $po) {
                try {
                    $receiptLedgerLines = $this->buildReceiptLedgerLines($po);
                    $targetAmount = round($po->calculateReceiptLedgerAmount($receiptLedgerLines), 2);

                    if ($targetAmount <= 0) {
                        $skipped++;
                        $this->line("SKIP {$po->po_number}: received value is zero.");
                        continue;
                    }

                    $existingQuery = Transaction::where('reference_type', PurchaseOrder::class)
                        ->where('reference_id', $po->id)
                        ->where('metadata->source', 'purchase_order_receipt')
                        ->where('status', 'completed');

                    $existingRows = (clone $existingQuery)->get();
                    $inventoryDebit = round((float) $existingRows
                        ->where('account_id', $inventoryAccountId)
                        ->where('type', 'debit')
                        ->sum('amount'), 2);
                    $apCredit = round((float) $existingRows
                        ->where('account_id', $accountsPayableAccountId)
                        ->where('type', 'credit')
                        ->sum('amount'), 2);

                    if ($force && $existingRows->count() > 0) {
                        if ($dryRun) {
                            $this->line("DRY {$po->po_number}: would cancel {$existingRows->count()} old PO receipt row(s) and recreate Dr Inventory / Cr AP BDT " . number_format($targetAmount, 2));
                        } else {
                            DB::transaction(function () use ($existingQuery, $existingRows, $po, $targetAmount, $receiptLedgerLines, &$cancelled, &$createdGroups) {
                                $existingQuery->update(['status' => 'cancelled']);
                                $cancelled += $existingRows->count();
                                Transaction::createFromPurchaseOrderReceipt(
                                    $po,
                                    $targetAmount,
                                    [
                                        'receipt_type' => 'po_accounting_force_rebuild',
                                        'received_lines' => $receiptLedgerLines,
                                        'received_gross_amount' => round(array_sum(array_column($receiptLedgerLines, 'gross_amount')), 2),
                                        'backfilled_by_command' => 'accounting:sync-purchase-orders --force',
                                    ]
                                );
                                $createdGroups++;
                            });
                            $this->info("REBUILT {$po->po_number}: Dr Inventory / Cr Accounts Payable BDT " . number_format($targetAmount, 2));
                        }
                        continue;
                    }

                    $missingInventory = round(max(0, $targetAmount - $inventoryDebit), 2);
                    $missingAp = round(max(0, $targetAmount - $apCredit), 2);

                    if ($existingRows->count() === 0) {
                        if ($dryRun) {
                            $this->line("DRY {$po->po_number}: would create Dr Inventory / Cr Accounts Payable BDT " . number_format($targetAmount, 2));
                        } else {
                            Transaction::createFromPurchaseOrderReceipt(
                                $po,
                                $targetAmount,
                                [
                                    'receipt_type' => 'po_accounting_backfill',
                                    'received_lines' => $receiptLedgerLines,
                                    'received_gross_amount' => round(array_sum(array_column($receiptLedgerLines, 'gross_amount')), 2),
                                    'backfilled_by_command' => 'accounting:sync-purchase-orders',
                                ]
                            );
                            $createdGroups++;
                            $this->info("CREATED {$po->po_number}: Dr Inventory / Cr Accounts Payable BDT " . number_format($targetAmount, 2));
                        }
                        continue;
                    }

                    if ($missingInventory <= 0 && $missingAp <= 0) {
                        $skipped++;
                        $this->line("OK {$po->po_number}: Inventory debit and AP credit already exist for BDT " . number_format($targetAmount, 2));
                        continue;
                    }

                    if (!$repairPartial) {
                        $skipped++;
                        $this->warn(
                            "PARTIAL {$po->po_number}: target BDT " . number_format($targetAmount, 2) .
                            ", Inventory debit BDT " . number_format($inventoryDebit, 2) .
                            ", AP credit BDT " . number_format($apCredit, 2) .
                            ". Run with --repair-partial or --force."
                        );
                        continue;
                    }

                    if ($dryRun) {
                        if ($missingInventory > 0) {
                            $this->line("DRY {$po->po_number}: would add missing Dr Inventory BDT " . number_format($missingInventory, 2));
                        }
                        if ($missingAp > 0) {
                            $this->line("DRY {$po->po_number}: would add missing Cr Accounts Payable BDT " . number_format($missingAp, 2));
                        }
                        continue;
                    }

                    DB::transaction(function () use (
                        $po,
                        $existingRows,
                        $inventoryAccountId,
                        $accountsPayableAccountId,
                        $missingInventory,
                        $missingAp,
                        $targetAmount,
                        $receiptLedgerLines,
                        &$repairedRows
                    ) {
                        $groupId = $this->existingGroupId($existingRows) ?: (string) Str::uuid();
                        $metadata = [
                            'source' => 'purchase_order_receipt',
                            'po_number' => $po->po_number,
                            'vendor_id' => $po->vendor_id,
                            'vendor_name' => $po->vendor->name ?? null,
                            'group_id' => $groupId,
                            'receipt_type' => 'po_accounting_partial_repair',
                            'received_lines' => $receiptLedgerLines,
                            'received_gross_amount' => round(array_sum(array_column($receiptLedgerLines, 'gross_amount')), 2),
                            'target_receipt_amount' => $targetAmount,
                            'repaired_by_command' => 'accounting:sync-purchase-orders --repair-partial',
                        ];

                        if ($missingInventory > 0) {
                            Transaction::create([
                                'transaction_date' => $po->received_at ?? $po->actual_delivery_date ?? now(),
                                'amount' => $missingInventory,
                                'type' => 'debit',
                                'account_id' => $inventoryAccountId,
                                'reference_type' => PurchaseOrder::class,
                                'reference_id' => $po->id,
                                'description' => "PO Received - Inventory Repair - {$po->po_number}",
                                'store_id' => $po->store_id,
                                'created_by' => auth()->id() ?: $po->received_by ?: $po->created_by,
                                'metadata' => $metadata,
                                'status' => 'completed',
                            ]);
                            $repairedRows++;
                        }

                        if ($missingAp > 0) {
                            Transaction::create([
                                'transaction_date' => $po->received_at ?? $po->actual_delivery_date ?? now(),
                                'amount' => $missingAp,
                                'type' => 'credit',
                                'account_id' => $accountsPayableAccountId,
                                'reference_type' => PurchaseOrder::class,
                                'reference_id' => $po->id,
                                'description' => "PO Received - Accounts Payable Repair - {$po->po_number}",
                                'store_id' => $po->store_id,
                                'created_by' => auth()->id() ?: $po->received_by ?: $po->created_by,
                                'metadata' => $metadata,
                                'status' => 'completed',
                            ]);
                            $repairedRows++;
                        }
                    });

                    $this->info(
                        "REPAIRED {$po->po_number}: added Inventory BDT " . number_format($missingInventory, 2) .
                        " / AP BDT " . number_format($missingAp, 2)
                    );
                } catch (\Throwable $e) {
                    $errors++;
                    $this->error("ERROR {$po->po_number}: {$e->getMessage()}");
                }
            }
        });

        $this->newLine();
        $this->info('Purchase order accounting sync finished.');
        $this->table(
            ['Created Groups', 'Repaired Rows', 'Skipped', 'Cancelled Existing Rows', 'Errors'],
            [[$createdGroups, $repairedRows, $skipped, $cancelled, $errors]]
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

    private function existingGroupId($existingRows): ?string
    {
        foreach ($existingRows as $row) {
            $metadata = is_array($row->metadata) ? $row->metadata : [];
            if (!empty($metadata['group_id'])) {
                return (string) $metadata['group_id'];
            }
        }

        return null;
    }
}
