<?php

namespace App\Observers;

use App\Models\OrderPayment;
use App\Models\Transaction as AccountingTransaction;

class OrderPaymentObserver
{
    /**
     * Handle the OrderPayment "created" event.
     */
    public function created(OrderPayment $orderPayment): void
    {
        if ($this->shouldSkipPayment($orderPayment)) {
            return;
        }

        // Split-payment parent rows are created before their split rows exist.
        // Wait until the parent becomes completed, then build ledger from the splits.
        if (empty($orderPayment->payment_method_id)) {
            return;
        }

        AccountingTransaction::createFromOrderPayment($orderPayment);
    }

    /**
     * Handle the OrderPayment "updated" event.
     */
    public function updated(OrderPayment $orderPayment): void
    {
        if ($this->shouldSkipPayment($orderPayment)) {
            $this->cancelPaymentSaleEntries($orderPayment);
            return;
        }

        if ($orderPayment->wasChanged('status')) {
            if ($orderPayment->status === 'completed') {
                // Rebuild the sale/payment ledger when payment becomes final.
                // This fixes split payments: cash split goes to Cash, bKash/card/bank split goes to Bank.
                $this->cancelPaymentSaleEntries($orderPayment);
                AccountingTransaction::createFromOrderPayment($orderPayment);
            } elseif (in_array($orderPayment->status, ['cancelled', 'failed', 'refunded'], true)) {
                $this->cancelPaymentSaleEntries($orderPayment);
            }
        }

        // Handle payment-level refunds (partial refund applied directly to this payment record)
        if ($orderPayment->wasChanged('refunded_amount') && $orderPayment->refunded_amount > 0) {
            $refundAmount  = (float) $orderPayment->refunded_amount;
            $order         = $orderPayment->order;
            $groupId       = (string) \Illuminate\Support\Str::uuid();

            if ($order && $order->total_amount > 0 && $order->tax_amount > 0) {
                $taxRatio  = (float) $order->tax_amount / (float) $order->total_amount;
                $taxAmount = round($refundAmount * $taxRatio, 2);
            } else {
                $taxAmount = 0;
            }
            $revenueAmount = $refundAmount - $taxAmount;

            $metadata = [
                'event' => 'payment_refund',
                'payment_method'  => $orderPayment->paymentMethod->name ?? 'Unknown',
                'order_number'    => $order->order_number ?? null,
                'refund_reason'   => 'Payment refund',
                'includes_tax_reversal' => $taxAmount > 0,
                'tax_amount_reversed'   => $taxAmount,
                'group_id'        => $groupId,
            ];

            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount'           => $refundAmount,
                'type'             => 'credit',
                'account_id'       => AccountingTransaction::getCashAccountId($orderPayment->store_id),
                'reference_type'   => OrderPayment::class,
                'reference_id'     => $orderPayment->id,
                'description'      => "Refund (Cash Out) - {$orderPayment->payment_number}",
                'store_id'         => $orderPayment->store_id,
                'created_by'       => auth()->id(),
                'metadata'         => $metadata,
                'status'           => 'completed',
            ]);

            AccountingTransaction::create([
                'transaction_date' => now(),
                'amount'           => $revenueAmount,
                'type'             => 'debit',
                'account_id'       => AccountingTransaction::getSalesRevenueAccountId(),
                'reference_type'   => OrderPayment::class,
                'reference_id'     => $orderPayment->id,
                'description'      => "Refund - Revenue Reversal (excl. tax) - {$orderPayment->payment_number}",
                'store_id'         => $orderPayment->store_id,
                'created_by'       => auth()->id(),
                'metadata'         => $metadata,
                'status'           => 'completed',
            ]);

            if ($taxAmount > 0) {
                AccountingTransaction::create([
                    'transaction_date' => now(),
                    'amount'           => $taxAmount,
                    'type'             => 'debit',
                    'account_id'       => AccountingTransaction::getTaxLiabilityAccountId(),
                    'reference_type'   => OrderPayment::class,
                    'reference_id'     => $orderPayment->id,
                    'description'      => "Refund - Tax Reversal - {$orderPayment->payment_number}",
                    'store_id'         => $orderPayment->store_id,
                    'created_by'       => auth()->id(),
                    'metadata'         => $metadata,
                    'status'           => 'completed',
                ]);
            }
        }
    }

    public function deleted(OrderPayment $orderPayment): void
    {
        AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)
            ->update(['status' => 'cancelled']);
    }

    public function restored(OrderPayment $orderPayment): void
    {
        if ($orderPayment->status === 'completed' && !$this->shouldSkipPayment($orderPayment)) {
            $this->cancelPaymentSaleEntries($orderPayment);
            AccountingTransaction::createFromOrderPayment($orderPayment);
        }
    }

    public function forceDeleted(OrderPayment $orderPayment): void
    {
        AccountingTransaction::byReference(OrderPayment::class, $orderPayment->id)->delete();
    }

    private function shouldSkipPayment(OrderPayment $orderPayment): bool
    {
        $nonCashTypes = ['exchange_balance', 'store_credit', 'balance_carryover', 'exchange_surplus'];
        return in_array($orderPayment->payment_type, $nonCashTypes, true);
    }

    private function cancelPaymentSaleEntries(OrderPayment $orderPayment): void
    {
        AccountingTransaction::where('reference_type', OrderPayment::class)
            ->where('reference_id', $orderPayment->id)
            ->where(function ($q) {
                $q->where('metadata->event', 'order_payment')
                  ->orWhere('description', 'like', 'Order Payment%')
                  ->orWhere('description', 'like', 'Order Revenue%')
                  ->orWhere('description', 'like', 'Sales Tax Collected%');
            })
            ->update(['status' => 'cancelled']);
    }
}
