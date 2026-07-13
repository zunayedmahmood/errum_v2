<?php

namespace App\Traits;

use Illuminate\Support\Facades\Auth;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * Automatic record-level audit logging.
 *
 * Every create/update/delete records the actor, request context, a readable
 * business description, and the exact before/after fields changed.
 */
trait AutoLogsActivity
{
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly($this->getLoggableAttributes())
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName($this->getTable())
            ->setDescriptionForEvent(fn (string $eventName) => $this->getLogDescription($eventName));
    }

    protected function getLoggableAttributes(): array
    {
        $attributes = $this->getFillable();

        if ($this->timestamps) {
            $attributes[] = 'created_at';
            $attributes[] = 'updated_at';
        }

        if (in_array('Illuminate\\Database\\Eloquent\\SoftDeletes', class_uses_recursive($this), true)) {
            $attributes[] = 'deleted_at';
        }

        $excludeFields = [
            'password', 'remember_token', 'api_token', 'access_token',
            'refresh_token', 'secret', 'client_secret',
        ];

        return array_values(array_unique(array_diff($attributes, $excludeFields)));
    }

    protected function getLogDescription(string $eventName): string
    {
        $modelName = $this->getReadableModelName();
        $identifier = $this->getLogIdentifier();
        $suffix = $identifier ? ": {$identifier}" : '';

        if ($eventName === 'updated') {
            $semantic = $this->semanticUpdateDescription($modelName, $suffix);
            if ($semantic) {
                return $semantic;
            }
        }

        return match ($eventName) {
            'created' => "Created {$modelName}{$suffix}",
            'updated' => "Edited {$modelName}{$suffix}",
            'deleted' => "Deleted {$modelName}{$suffix}",
            'restored' => "Restored {$modelName}{$suffix}",
            default => ucfirst(str_replace('_', ' ', $eventName)) . " {$modelName}{$suffix}",
        };
    }

    protected function semanticUpdateDescription(string $modelName, string $suffix): ?string
    {
        $dirty = array_merge($this->getChanges(), $this->getDirty());

        if (array_key_exists('status', $dirty)) {
            $oldStatus = $this->getOriginal('status');
            $newStatus = $this->getAttribute('status');
            $verb = $this->statusVerb((string) $newStatus);

            if ($verb) {
                return "{$verb} {$modelName}{$suffix}"
                    . ($oldStatus !== null ? ' (' . $this->humanizeValue($oldStatus) . ' → ' . $this->humanizeValue($newStatus) . ')' : '');
            }

            return "Changed {$modelName}{$suffix} status from "
                . $this->humanizeValue($oldStatus) . ' to ' . $this->humanizeValue($newStatus);
        }

        if (array_key_exists('store_id', $dirty)) {
            $old = $this->getOriginal('store_id');
            $new = $this->getAttribute('store_id');
            if ($new && !$old) {
                return "Assigned {$modelName}{$suffix} to store #{$new}";
            }
            if (!$new && $old) {
                return "Removed store assignment from {$modelName}{$suffix}";
            }
            return "Reassigned {$modelName}{$suffix} from store #{$old} to store #{$new}";
        }

        if (array_key_exists('payment_status', $dirty)) {
            return "Changed payment status for {$modelName}{$suffix} from "
                . $this->humanizeValue($this->getOriginal('payment_status')) . ' to '
                . $this->humanizeValue($this->getAttribute('payment_status'));
        }

        if (array_key_exists('fulfillment_status', $dirty)) {
            return "Changed fulfilment status for {$modelName}{$suffix} from "
                . $this->humanizeValue($this->getOriginal('fulfillment_status')) . ' to '
                . $this->humanizeValue($this->getAttribute('fulfillment_status'));
        }

        return null;
    }

    protected function statusVerb(string $status): ?string
    {
        return match (strtolower($status)) {
            'approved' => 'Approved',
            'received', 'fully_received', 'partially_received' => 'Received',
            'dispatched', 'shipped', 'in_transit' => 'Dispatched',
            'delivered' => 'Delivered',
            'cancelled', 'canceled' => 'Cancelled',
            'rejected' => 'Rejected',
            'returned' => 'Returned',
            'exchanged', 'exchange_completed' => 'Completed exchange for',
            'completed' => 'Completed',
            'processed' => 'Processed',
            'fulfilled' => 'Fulfilled',
            'ready_for_shipment', 'ready_to_ship' => 'Marked ready for shipment',
            'pending' => 'Marked pending',
            'confirmed' => 'Confirmed',
            'in_progress', 'processing' => 'Started processing',
            'failed' => 'Marked failed',
            'refunded' => 'Refunded',
            default => null,
        };
    }

    protected function getReadableModelName(): string
    {
        return match (class_basename($this)) {
            'Order' => $this->readableOrderType(),
            'OrderItem' => 'Order Item',
            'OrderPayment' => 'Order Payment',
            'PurchaseOrder' => 'Purchase Order',
            'PurchaseOrderItem' => 'Purchase Order Item',
            'ProductDispatch' => 'Product Dispatch',
            'ProductDispatchItem' => 'Dispatch Item',
            'ProductReturn' => 'Product Return / Exchange',
            'ServiceOrder' => 'Service Order',
            'ServiceOrderItem' => 'Service Order Item',
            'ServiceOrderPayment' => 'Service Order Payment',
            'ProductBarcode' => 'Product Barcode',
            'ProductBatch' => 'Product Batch',
            'ProductMovement' => 'Stock Movement',
            'InventoryRebalancing' => 'Inventory Rebalancing',
            default => trim(preg_replace('/(?<!^)[A-Z]/', ' $0', class_basename($this))),
        };
    }

    protected function readableOrderType(): string
    {
        $type = strtolower((string) ($this->getAttribute('order_type') ?? ''));
        $isPreorder = (bool) ($this->getAttribute('is_preorder') ?? false);

        if ($isPreorder) {
            return 'Pre-order';
        }

        return match ($type) {
            'offline', 'pos', 'counter', 'offline_sale' => 'Offline / POS Order',
            'social', 'social_commerce' => 'Social Commerce Order',
            'ecommerce', 'e-commerce', 'online' => 'E-commerce Order',
            'service' => 'Service Order',
            default => 'Order',
        };
    }

    protected function getLogIdentifier(): string
    {
        $identifierFields = [
            'order_number', 'po_number', 'dispatch_number', 'return_number',
            'service_order_number', 'shipment_number', 'invoice_number',
            'barcode', 'sku', 'name', 'title', 'email', 'phone',
        ];

        foreach ($identifierFields as $field) {
            $value = $this->getAttribute($field);
            if ($value !== null && $value !== '') {
                return (string) $value;
            }
        }

        return $this->getKey() ? "#{$this->getKey()}" : '';
    }

    public function tapActivity($activity, string $eventName): void
    {
        if (Auth::guard('api')->check()) {
            $activity->causer_type = 'App\\Models\\Employee';
            $activity->causer_id = Auth::guard('api')->id();
        } elseif (Auth::guard('customer')->check()) {
            $activity->causer_type = 'App\\Models\\Customer';
            $activity->causer_id = Auth::guard('customer')->id();
        }

        $businessAction = $this->inferBusinessAction($eventName);

        $activity->properties = $activity->properties
            ->put('business_action', $businessAction)
            ->put('action_label', $this->getLogDescription($eventName))
            ->put('category', $this->activityCategory($businessAction))
            ->put('subject_label', $this->getReadableModelName())
            ->put('subject_identifier', $this->getLogIdentifier())
            ->put('ip_address', request()->ip())
            ->put('user_agent', request()->userAgent())
            ->put('url', request()->fullUrl())
            ->put('method', request()->method())
            ->put('route', optional(request()->route())->uri())
            ->put('route_name', optional(request()->route())->getName());
    }

    protected function inferBusinessAction(string $eventName): string
    {
        if ($eventName === 'updated') {
            if ($this->wasChanged('status') || $this->isDirty('status')) {
                $status = strtolower((string) $this->getAttribute('status'));
                return match ($status) {
                    'approved' => 'approved',
                    'received', 'fully_received', 'partially_received' => 'received',
                    'dispatched', 'shipped', 'in_transit' => 'dispatched',
                    'delivered' => 'delivered',
                    'cancelled', 'canceled' => 'cancelled',
                    'rejected' => 'rejected',
                    'returned' => 'returned',
                    'exchanged', 'exchange_completed' => 'exchanged',
                    'completed' => 'completed',
                    'fulfilled' => 'fulfilled',
                    'refunded' => 'refunded',
                    default => 'status_changed',
                };
            }

            if ($this->wasChanged('store_id') || $this->isDirty('store_id')) {
                return 'assigned';
            }

            return 'edited';
        }

        return match ($eventName) {
            'created' => 'created',
            'deleted' => 'deleted',
            'restored' => 'restored',
            default => $eventName,
        };
    }

    protected function activityCategory(?string $businessAction = null): string
    {
        $model = class_basename($this);

        if ($model === 'Order' && $businessAction === 'assigned') {
            return 'store-assignments';
        }

        return match (true) {
            in_array($model, ['Order', 'OrderItem', 'OrderPayment'], true) => 'orders',
            in_array($model, ['PurchaseOrder', 'PurchaseOrderItem', 'VendorPayment', 'VendorPaymentItem'], true) => 'purchase-orders',
            in_array($model, ['ProductDispatch', 'ProductDispatchItem'], true) => 'product-dispatches',
            in_array($model, ['ProductReturn', 'Refund'], true) => 'returns-exchanges',
            in_array($model, ['ServiceOrder', 'ServiceOrderItem', 'ServiceOrderPayment'], true) => 'service-orders',
            $model === 'Shipment' => 'shipments',
            in_array($model, ['Product', 'ProductBatch', 'ProductBarcode', 'ProductMovement', 'MasterInventory'], true) => 'products',
            default => 'other',
        };
    }

    protected function humanizeValue($value): string
    {
        if ($value === null || $value === '') {
            return 'Not set';
        }

        return ucwords(str_replace(['_', '-'], ' ', (string) $value));
    }
}
