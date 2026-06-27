<?php

namespace App\Observers;

use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\ProductReturn;
use App\Models\Refund;
use App\Models\Transaction as AccountingTransaction;
use App\Services\SalesTargetAggregationService;

class OrderObserver
{
    protected $aggregationService;

    public function __construct(SalesTargetAggregationService $aggregationService)
    {
        $this->aggregationService = $aggregationService;
    }

    public function created(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order);
    }

    public function updated(Order $order): void
    {
        if ($order->wasChanged(['status', 'created_by', 'salesman_id', 'store_id', 'total_amount', 'order_date'])) {
            $this->aggregationService->syncOrderChange($order, $order->getOriginal());
        }

        if ($order->wasChanged('status')) {
            if (in_array($order->status, ['cancelled', 'refunded'], true)) {
                $this->cancelAccountingForOrder($order);
            } elseif (in_array($order->status, ['completed', 'delivered'], true)) {
                $this->restoreAccountingForOrder($order);
            }
        }
    }

    public function deleted(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order, $order->toArray());
        $this->cancelAccountingForOrder($order);
    }

    public function restored(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order);
        if (!in_array($order->status, ['cancelled', 'refunded'], true)) {
            $this->restoreAccountingForOrder($order);
        }
    }

    public function forceDeleted(Order $order): void
    {
        $this->aggregationService->syncOrderChange($order, $order->toArray());
        $this->deleteAccountingForOrder($order);
    }

    private function cancelAccountingForOrder(Order $order): void
    {
        $paymentIds = $order->payments()->withTrashed()->pluck('id')->all();
        $returnIds = $order->returns()->pluck('id')->all();
        $refundIds = $order->refunds()->pluck('id')->all();

        AccountingTransaction::where(function ($q) use ($order, $paymentIds, $returnIds, $refundIds) {
            $q->where(function ($qq) use ($order) {
                $qq->where('reference_type', Order::class)->where('reference_id', $order->id);
            });

            if (!empty($paymentIds)) {
                $q->orWhere(function ($qq) use ($paymentIds) {
                    $qq->where('reference_type', OrderPayment::class)->whereIn('reference_id', $paymentIds);
                });
            }

            if (!empty($returnIds)) {
                $q->orWhere(function ($qq) use ($returnIds) {
                    $qq->where('reference_type', ProductReturn::class)->whereIn('reference_id', $returnIds);
                });
            }

            if (!empty($refundIds)) {
                $q->orWhere(function ($qq) use ($refundIds) {
                    $qq->where('reference_type', Refund::class)->whereIn('reference_id', $refundIds);
                });
            }
        })->update(['status' => 'cancelled']);
    }

    private function restoreAccountingForOrder(Order $order): void
    {
        $paymentIds = $order->payments()->withTrashed()->where('status', 'completed')->pluck('id')->all();

        if (!empty($paymentIds)) {
            AccountingTransaction::where('reference_type', OrderPayment::class)
                ->whereIn('reference_id', $paymentIds)
                ->where('status', 'cancelled')
                ->where(function ($q) {
                    $q->where('metadata->event', 'order_payment')
                      ->orWhere('description', 'like', 'Order Payment%')
                      ->orWhere('description', 'like', 'Order Revenue%')
                      ->orWhere('description', 'like', 'Sales Tax Collected%');
                })
                ->update(['status' => 'completed']);
        }

        AccountingTransaction::where('reference_type', Order::class)
            ->where('reference_id', $order->id)
            ->where('status', 'cancelled')
            ->update(['status' => 'completed']);
    }

    private function deleteAccountingForOrder(Order $order): void
    {
        $paymentIds = $order->payments()->withTrashed()->pluck('id')->all();
        $returnIds = $order->returns()->pluck('id')->all();
        $refundIds = $order->refunds()->pluck('id')->all();

        AccountingTransaction::where(function ($q) use ($order, $paymentIds, $returnIds, $refundIds) {
            $q->where(function ($qq) use ($order) {
                $qq->where('reference_type', Order::class)->where('reference_id', $order->id);
            });
            if (!empty($paymentIds)) {
                $q->orWhere(function ($qq) use ($paymentIds) {
                    $qq->where('reference_type', OrderPayment::class)->whereIn('reference_id', $paymentIds);
                });
            }
            if (!empty($returnIds)) {
                $q->orWhere(function ($qq) use ($returnIds) {
                    $qq->where('reference_type', ProductReturn::class)->whereIn('reference_id', $returnIds);
                });
            }
            if (!empty($refundIds)) {
                $q->orWhere(function ($qq) use ($refundIds) {
                    $qq->where('reference_type', Refund::class)->whereIn('reference_id', $refundIds);
                });
            }
        })->delete();
    }
}
