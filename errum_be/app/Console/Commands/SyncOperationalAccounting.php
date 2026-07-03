<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\ProductReturn;
use App\Models\PurchaseOrder;
use App\Models\Refund;
use App\Models\Shipment;
use App\Models\Transaction;
use App\Models\VendorPayment;
use App\Services\AccountingPostingService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncOperationalAccounting extends Command
{
    protected $signature = 'accounting:sync-operational
                            {--dry-run : Show planned accounting sync without writing transactions}
                            {--force : Cancel existing managed event rows and rebuild where safe}
                            {--from= : Optional created/order/payment date lower bound YYYY-MM-DD}
                            {--to= : Optional created/order/payment date upper bound YYYY-MM-DD}';

    protected $description = 'Backfill/sync the full operational accounting workflow: PO commitments, PO receiving, vendor payments, sales/advance/COD/SSL, COGS, Pathao fee, returns.';

    public function handle(AccountingPostingService $posting): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $from = $this->option('from');
        $to = $this->option('to');

        $stats = [
            'po_commitments' => 0,
            'po_receipts' => 0,
            'vendor_payments' => 0,
            'order_payments' => 0,
            'order_completion_revenue' => 0,
            'order_cogs' => 0,
            'pathao_fees' => 0,
            'refunds' => 0,
            'returns' => 0,
            'skipped' => 0,
            'errors' => 0,
        ];

        $this->info('Running full operational accounting sync' . ($dryRun ? ' [DRY RUN]' : '') . ($force ? ' [FORCE]' : ''));

        if (!$dryRun) {
            $posting->ensureWorkbookAccounts();
        }

        $this->syncPurchaseOrders($posting, $dryRun, $force, $from, $to, $stats);
        $this->syncVendorPayments($posting, $dryRun, $force, $from, $to, $stats);
        $this->syncOrderPayments($posting, $dryRun, $force, $from, $to, $stats);
        $this->syncCompletedOrders($posting, $dryRun, $force, $from, $to, $stats);
        $this->syncShipments($posting, $dryRun, $force, $from, $to, $stats);
        $this->syncRefundsAndReturns($posting, $dryRun, $force, $from, $to, $stats);

        $this->table(['Area', 'Count'], collect($stats)->map(fn ($v, $k) => [$k, $v])->values()->all());
        return $stats['errors'] > 0 ? Command::FAILURE : Command::SUCCESS;
    }

    private function scopeDates($query, ?string $from, ?string $to, string $column = 'created_at')
    {
        if ($from) {
            $query->whereDate($column, '>=', $from);
        }
        if ($to) {
            $query->whereDate($column, '<=', $to);
        }
        return $query;
    }

    private function syncPurchaseOrders(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $query = PurchaseOrder::with(['items', 'vendor', 'store'])->orderBy('id');
        $this->scopeDates($query, $from, $to, 'created_at');

        $query->chunkById(50, function ($pos) use ($posting, $dryRun, $force, &$stats) {
            foreach ($pos as $po) {
                try {
                    $remaining = $posting->purchaseOrderRemainingCommitmentAmount($po);
                    $received = $posting->purchaseOrderReceivedLedgerAmount($po);
                    $receivedQty = (int) $po->items->sum('quantity_received');
                    $commitmentEventKey = "purchase_order:{$po->id}:created_commitment";
                    $receiptEventKey = "purchase_order:{$po->id}:receipt:backfill_total_received";
                    $cancelEventKey = "purchase_order:{$po->id}:cancel_remaining_commitment";

                    if ($dryRun) {
                        $this->line("PO {$po->po_number}: commitment total {$po->total_amount}, received {$received}, remaining {$remaining}, status {$po->status}");

                        if (in_array($po->status, ['cancelled', 'returned'], true)) {
                            if ($remaining > 0 && ($force || !$this->eventExists($cancelEventKey))) {
                                $stats['po_commitments']++;
                            }
                            continue;
                        }

                        if ($receivedQty <= 0 && (float) ($po->total_amount ?? 0) > 0 && ($force || !$this->eventExists($commitmentEventKey))) {
                            $stats['po_commitments']++;
                        }

                        // Historical POs that are already received can be safely backfilled as actual Inventory/AP.
                        // With --force, the command also rebuilds the temporary commitment and settles it.
                        if ($force && $receivedQty > 0 && (float) ($po->total_amount ?? 0) > 0 && !$this->eventExists($commitmentEventKey)) {
                            $stats['po_commitments']++;
                        }

                        if ($received > 0 && ($force || !$this->eventExists($receiptEventKey))) {
                            $stats['po_receipts']++;
                        }

                        continue;
                    }

                    if (in_array($po->status, ['cancelled', 'returned'], true)) {
                        if ($posting->postPurchaseOrderCancellation($po)) {
                            $stats['po_commitments']++;
                        }
                    } else {
                        if ($po->items->sum('quantity_received') <= 0) {
                            if ($posting->syncPurchaseOrderCommitment($po, $force)) {
                                $stats['po_commitments']++;
                            }
                        } else {
                            // Ensure old POs that were already received still have an initial commitment when forcing a rebuild.
                            if ($force) {
                                Transaction::where('reference_type', PurchaseOrder::class)
                                    ->where('reference_id', $po->id)
                                    ->whereIn('status', ['pending', 'completed'])
                                    ->where(function ($q) {
                                        $q->where('metadata->source', 'purchase_order_receipt')
                                            ->orWhere('metadata->source', 'purchase_order_commitment')
                                            ->orWhere('metadata->source', 'purchase_order_cancellation');
                                    })
                                    ->update(['status' => 'cancelled']);
                                $posting->syncPurchaseOrderCommitment($po, true, true);
                                $stats['po_commitments']++;
                            }
                        }

                        if ($received > 0) {
                            $eventKey = "purchase_order:{$po->id}:receipt:backfill_total_received";
                            if ($force) {
                                Transaction::where('metadata->event_key', $eventKey)->update(['status' => 'cancelled']);
                            }
                            if ($posting->postPurchaseOrderReceipt($po, $received, [
                                'event_key' => $eventKey,
                                'receipt_type' => 'operational_backfill_total_received',
                                'backfilled_by_command' => 'accounting:sync-operational',
                            ])) {
                                $stats['po_receipts']++;
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("PO {$po->po_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function syncVendorPayments(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $query = VendorPayment::with(['paymentMethod', 'vendor'])->whereNotIn('status', ['cancelled', 'failed'])->orderBy('id');
        $this->scopeDates($query, $from, $to, 'created_at');
        $query->chunkById(100, function ($payments) use ($posting, $dryRun, $force, &$stats) {
            foreach ($payments as $payment) {
                try {
                    if ($dryRun) {
                        $this->line("Vendor payment {$payment->payment_number}: {$payment->amount} {$payment->status}");
                        if ($force || (!$this->eventExists("vendor_payment:{$payment->id}:completed") && !$this->activeReferenceRowsExist(VendorPayment::class, (int) $payment->id))) {
                            $stats['vendor_payments']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('reference_type', VendorPayment::class)->where('reference_id', $payment->id)->update(['status' => 'cancelled']);
                    }
                    if ($posting->postVendorPayment($payment)) {
                        $stats['vendor_payments']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Vendor payment {$payment->payment_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function syncOrderPayments(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $query = OrderPayment::with(['order.shipments', 'paymentMethod', 'customer'])->whereNotIn('status', ['cancelled', 'failed'])->orderBy('id');
        $this->scopeDates($query, $from, $to, 'created_at');
        $query->chunkById(100, function ($payments) use ($posting, $dryRun, $force, &$stats) {
            foreach ($payments as $payment) {
                try {
                    if ($dryRun) {
                        $this->line("Order payment {$payment->payment_number}: {$payment->amount} {$payment->status}");
                        if ($force || !$this->activeReferenceRowsExist(OrderPayment::class, (int) $payment->id)) {
                            $stats['order_payments']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('reference_type', OrderPayment::class)->where('reference_id', $payment->id)->update(['status' => 'cancelled']);
                    }
                    if ($posting->postOrderPayment($payment)) {
                        $stats['order_payments']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Order payment {$payment->payment_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function syncCompletedOrders(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $query = Order::with(['items', 'payments'])->whereIn('status', ['confirmed', 'delivered', 'completed'])->orderBy('id');
        $this->scopeDates($query, $from, $to, 'created_at');
        $query->chunkById(100, function ($orders) use ($posting, $dryRun, $force, &$stats) {
            foreach ($orders as $order) {
                try {
                    if ($dryRun) {
                        $this->line("Order {$order->order_number}: {$order->order_type}, status {$order->status}, total {$order->total_amount}");
                        if ($order->order_type !== 'counter' && in_array($order->status, ['delivered', 'completed'], true) && ($force || !$this->eventExists("order:{$order->id}:advance_revenue_recognised"))) {
                            $stats['order_completion_revenue']++;
                        }
                        if (round((float) $order->items->sum('cogs'), 2) > 0 && ($force || !$this->eventExists("order:{$order->id}:cogs"))) {
                            $stats['order_cogs']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('reference_type', Order::class)
                            ->where('reference_id', $order->id)
                            ->whereIn('status', ['pending', 'completed'])
                            ->where(function ($q) {
                                $q->where('metadata->source', 'order_cogs')
                                  ->orWhere('metadata->source', 'order_completion_revenue');
                            })
                            ->update(['status' => 'cancelled']);
                    }
                    if (in_array($order->status, ['delivered', 'completed'], true) && $posting->postOrderCompletionRevenue($order)) {
                        $stats['order_completion_revenue']++;
                    }
                    if ($posting->postOrderCOGS($order)) {
                        $stats['order_cogs']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Order {$order->order_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function syncShipments(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $query = Shipment::with('order')->where('delivery_fee', '>', 0)->orderBy('id');
        $this->scopeDates($query, $from, $to, 'created_at');
        $query->chunkById(100, function ($shipments) use ($posting, $dryRun, $force, &$stats) {
            foreach ($shipments as $shipment) {
                try {
                    if ($dryRun) {
                        $this->line("Shipment {$shipment->shipment_number}: fee {$shipment->delivery_fee}, status {$shipment->status}");
                        if ($force || !$this->eventExists("shipment:{$shipment->id}:pathao_delivery_fee")) {
                            $stats['pathao_fees']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('metadata->event_key', "shipment:{$shipment->id}:pathao_delivery_fee")->update(['status' => 'cancelled']);
                    }
                    if ($posting->postPathaoFeeForShipment($shipment)) {
                        $stats['pathao_fees']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Shipment {$shipment->shipment_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function syncRefundsAndReturns(AccountingPostingService $posting, bool $dryRun, bool $force, ?string $from, ?string $to, array &$stats): void
    {
        $refundQuery = Refund::with(['order', 'customer'])->whereNotIn('status', ['cancelled', 'failed'])->orderBy('id');
        $this->scopeDates($refundQuery, $from, $to, 'created_at');
        $refundQuery->chunkById(100, function ($refunds) use ($posting, $dryRun, $force, &$stats) {
            foreach ($refunds as $refund) {
                try {
                    if ($dryRun) {
                        $this->line("Refund {$refund->refund_number}: {$refund->refund_amount} {$refund->status}");
                        if ($force || !$this->eventExists("refund:{$refund->id}:sales_return")) {
                            $stats['refunds']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('reference_type', Refund::class)->where('reference_id', $refund->id)->update(['status' => 'cancelled']);
                    }
                    if ($posting->postRefund($refund)) {
                        $stats['refunds']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Refund {$refund->refund_number} failed: {$e->getMessage()}");
                }
            }
        });

        $returnQuery = ProductReturn::with('order')->whereIn('status', ['completed', 'refunded'])->orderBy('id');
        $this->scopeDates($returnQuery, $from, $to, 'created_at');
        $returnQuery->chunkById(100, function ($returns) use ($posting, $dryRun, $force, &$stats) {
            foreach ($returns as $return) {
                try {
                    if ($dryRun) {
                        $this->line("Return {$return->return_number}: {$return->total_return_value} {$return->status}");
                        if ($force || !$this->eventExists("product_return:{$return->id}:restock_cogs_reversal")) {
                            $stats['returns']++;
                        }
                        continue;
                    }
                    if ($force) {
                        Transaction::where('metadata->event_key', "product_return:{$return->id}:restock_cogs_reversal")->update(['status' => 'cancelled']);
                    }
                    if ($posting->postReturnRestock($return)) {
                        $stats['returns']++;
                    }
                } catch (\Throwable $e) {
                    $stats['errors']++;
                    $this->error("Return {$return->return_number} failed: {$e->getMessage()}");
                }
            }
        });
    }

    private function eventExists(string $eventKey): bool
    {
        return Transaction::where('metadata->event_key', $eventKey)
            ->whereIn('status', ['pending', 'completed'])
            ->exists();
    }

    private function activeReferenceRowsExist(string $referenceType, int $referenceId): bool
    {
        return Transaction::where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->whereIn('status', ['pending', 'completed'])
            ->exists();
    }
}
