<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use App\Models\OrderPayment;
use App\Models\ProductDispatch;
use App\Models\ProductReturn;
use App\Models\Refund;
use App\Models\PurchaseOrder;
use App\Models\ServiceOrder;
use App\Models\Shipment;
use App\Models\VendorPayment;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Creates one semantic, operation-level audit record for every mutating API call.
 *
 * Model activity logging remains responsible for field-by-field before/after data.
 * This middleware covers the business action itself (approve, receive, dispatch,
 * cancel, exchange, delete, etc.), including code paths that use bulk updates and
 * therefore do not fire Eloquent model events.
 */
class AuditMutatingRequests
{
    private const CONTROLLER_SUBJECTS = [
        'OrderController' => [Order::class, 'Order'],
        'OrderPaymentController' => [OrderPayment::class, 'Order Payment'],
        'PaymentController' => [OrderPayment::class, 'Order Payment'],
        'EcommerceOrderController' => [Order::class, 'E-commerce Order'],
        'GuestCheckoutController' => [Order::class, 'Guest Order'],
        'LazyChatOrderController' => [Order::class, 'LazyChat Order'],
        'OrderManagementController' => [Order::class, 'Order'],
        'StoreFulfillmentController' => [Order::class, 'Order Fulfilment'],
        'MultiStoreOrderController' => [Order::class, 'Multi-store Order'],
        'MultiStoreShipmentController' => [Order::class, 'Multi-store Shipment'],
        'PreOrderController' => [Order::class, 'Pre-order'],
        'PurchaseOrderController' => [PurchaseOrder::class, 'Purchase Order'],
        'VendorPaymentController' => [VendorPayment::class, 'Vendor Payment'],
        'ProductDispatchController' => [ProductDispatch::class, 'Product Dispatch'],
        'ProductReturnController' => [ProductReturn::class, 'Product Return'],
        'ExchangeController' => [ProductReturn::class, 'Exchange'],
        'ServiceOrderController' => [ServiceOrder::class, 'Service Order'],
        'ShipmentController' => [Shipment::class, 'Shipment'],
        'RefundController' => [Refund::class, 'Refund'],
    ];

    private const SENSITIVE_KEYS = [
        'password', 'password_confirmation', 'current_password', 'new_password',
        'token', 'access_token', 'refresh_token', 'api_token', 'authorization',
        'secret', 'client_secret', 'card_number', 'cvv', 'pin',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $response = $next($request);

        if (!$this->shouldAudit($request)) {
            return $response;
        }

        try {
            $this->writeAuditLog($request, $response, $startedAt);
        } catch (Throwable $e) {
            // Auditing must never break the business operation.
            report($e);
        }

        return $response;
    }

    private function shouldAudit(Request $request): bool
    {
        if (in_array(strtoupper($request->method()), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return false;
        }

        $path = trim($request->path(), '/');
        $excludedFragments = [
            'login', 'signup', 'reset-password', 'forgot-password',
            'activity-logs', 'business-history',
        ];

        foreach ($excludedFragments as $fragment) {
            if (str_contains($path, $fragment)) {
                return false;
            }
        }

        return true;
    }

    private function writeAuditLog(Request $request, Response $response, float $startedAt): void
    {
        [$controller, $method] = $this->controllerAndMethod($request);
        $controllerBase = $controller ? class_basename($controller) : null;
        [$modelClass, $subjectLabel] = self::CONTROLLER_SUBJECTS[$controllerBase] ?? [null, $this->labelFromPath($request->path())];

        $action = $this->businessAction($method, $request);
        $failed = $response->getStatusCode() >= 400;
        $event = $failed ? $action . '_failed' : $action;

        $subject = $this->resolveSubject($request, $response, $modelClass);
        $identifier = $this->resolveIdentifier($request, $response, $subject);
        $category = $this->categoryFor($controllerBase, $subject, $action);

        $description = ($failed ? 'Failed to ' : '')
            . $this->actionPhrase($action)
            . ' ' . $subjectLabel
            . ($identifier ? ' ' . $identifier : '');

        $properties = [
            'business_action' => $action,
            'action_label' => $this->humanize($action),
            'category' => $category,
            'subject_label' => $subjectLabel,
            'subject_identifier' => $identifier,
            'controller' => $controllerBase,
            'controller_action' => $method,
            'route' => optional($request->route())->uri(),
            'route_name' => optional($request->route())->getName(),
            'method' => strtoupper($request->method()),
            'url' => $request->fullUrl(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_data' => $this->sanitize($request->all()),
            'route_parameters' => $this->sanitize(optional($request->route())->parameters() ?? []),
            'response_status' => $response->getStatusCode(),
            'successful' => !$failed,
            'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
        ];

        $logger = activity('business_operations')
            ->event($event)
            ->withProperties($properties);

        if ($subject instanceof Model && $subject->exists) {
            $logger->performedOn($subject);
        }

        $causer = $this->resolveCauser();
        if ($causer instanceof Model) {
            $logger->causedBy($causer);
        }

        $logger->log(trim($description));
    }

    private function controllerAndMethod(Request $request): array
    {
        $actionName = optional($request->route())->getActionName();
        if (!$actionName || $actionName === 'Closure' || !str_contains($actionName, '@')) {
            return [null, null];
        }

        return explode('@', $actionName, 2);
    }

    private function resolveCauser(): ?Model
    {
        if (Auth::guard('api')->check()) {
            return Auth::guard('api')->user();
        }

        if (Auth::guard('customer')->check()) {
            return Auth::guard('customer')->user();
        }

        $defaultUser = Auth::user();
        return $defaultUser instanceof Model ? $defaultUser : null;
    }

    private function resolveSubject(Request $request, Response $response, ?string $modelClass): ?Model
    {
        foreach ((optional($request->route())->parameters() ?? []) as $parameter) {
            if ($parameter instanceof Model) {
                return $parameter;
            }
        }

        if (!$modelClass || !class_exists($modelClass)) {
            return null;
        }

        $id = $this->findLikelyId(optional($request->route())->parameters() ?? []);
        if (!$id) {
            $id = $this->findLikelyId($this->responsePayload($response));
        }

        if (!$id) {
            return null;
        }

        $usesSoftDeletes = in_array(
            \Illuminate\Database\Eloquent\SoftDeletes::class,
            class_uses_recursive($modelClass),
            true
        );

        $query = $usesSoftDeletes ? $modelClass::withTrashed() : $modelClass::query();
        return $query->find($id);
    }

    private function findLikelyId($data): ?int
    {
        if ($data instanceof Model) {
            return (int) $data->getKey();
        }

        if (!is_array($data)) {
            return is_numeric($data) ? (int) $data : null;
        }

        $priority = [
            'order_id', 'orderId', 'purchase_order_id', 'purchaseOrderId',
            'dispatch_id', 'dispatchId', 'return_id', 'returnId',
            'service_order_id', 'shipment_id', 'id',
        ];

        foreach ($priority as $key) {
            if (isset($data[$key]) && is_numeric($data[$key])) {
                return (int) $data[$key];
            }
        }

        foreach (['data', 'order', 'purchase_order', 'dispatch', 'return', 'shipment', 'service_order'] as $key) {
            if (isset($data[$key])) {
                $nested = $this->findLikelyId($data[$key]);
                if ($nested) {
                    return $nested;
                }
            }
        }

        return null;
    }

    private function resolveIdentifier(Request $request, Response $response, ?Model $subject): ?string
    {
        if ($subject) {
            foreach (['order_number', 'po_number', 'dispatch_number', 'return_number', 'service_order_number', 'shipment_number', 'invoice_number', 'name', 'sku'] as $field) {
                $value = $subject->getAttribute($field);
                if ($value !== null && $value !== '') {
                    return (string) $value;
                }
            }
            return '#' . $subject->getKey();
        }

        $sources = [$request->all(), optional($request->route())->parameters() ?? [], $this->responsePayload($response)];
        $keys = ['order_number', 'po_number', 'dispatch_number', 'return_number', 'service_order_number', 'shipment_number', 'invoice_number'];
        foreach ($sources as $source) {
            $value = $this->findRecursiveValue($source, $keys);
            if ($value !== null && $value !== '') {
                return (string) $value;
            }
        }

        $id = $this->findLikelyId(optional($request->route())->parameters() ?? []);
        return $id ? '#' . $id : null;
    }

    private function findRecursiveValue($data, array $keys)
    {
        if ($data instanceof Model) {
            $data = $data->toArray();
        }
        if (!is_array($data)) {
            return null;
        }
        foreach ($keys as $key) {
            if (array_key_exists($key, $data)) {
                return $data[$key];
            }
        }
        foreach ($data as $value) {
            if (is_array($value)) {
                $found = $this->findRecursiveValue($value, $keys);
                if ($found !== null) {
                    return $found;
                }
            }
        }
        return null;
    }

    private function responsePayload(Response $response): array
    {
        $contentType = $response->headers->get('Content-Type', '');
        if (!str_contains($contentType, 'json')) {
            return [];
        }

        $decoded = json_decode($response->getContent(), true);
        return is_array($decoded) ? $decoded : [];
    }

    private function businessAction(?string $method, Request $request): string
    {
        $method = strtolower((string) $method);

        $rules = [
            'voidofflinesale' => 'voided',
            'bulkmarkasdelivered' => 'bulk_delivered',
            'markasdelivered' => 'delivered',
            'markdelivered' => 'delivered',
            'markdispatched' => 'dispatched',
            'readyforshipment' => 'ready_for_shipment',
            'markstockavailable' => 'stock_available',
            'revertassignment' => 'assignment_reverted',
            'autoassign' => 'assigned',
            'assign' => 'assigned',
            'removeitem' => 'item_removed',
            'additem' => 'item_added',
            'updateitem' => 'item_edited',
            'receivebarcode' => 'barcode_received',
            'scanbarcode' => 'barcode_scanned',
            'scantoadd' => 'barcode_scanned',
            'qualitycheck' => 'quality_checked',
            'createshipment' => 'shipment_created',
            'approve' => 'approved',
            'receive' => 'received',
            'dispatch' => 'dispatched',
            'deliver' => 'delivered',
            'cancel' => 'cancelled',
            'reject' => 'rejected',
            'exchange' => 'exchanged',
            'return' => 'returned',
            'refund' => 'refunded',
            'fulfill' => 'fulfilled',
            'complete' => 'completed',
            'process' => 'processed',
            'destroy' => 'deleted',
            'delete' => 'deleted',
            'edit' => 'edited',
            'update' => 'edited',
            'create' => 'created',
            'store' => 'created',
            'checkout' => 'created',
        ];

        foreach ($rules as $needle => $action) {
            if (str_contains($method, $needle)) {
                return $action;
            }
        }

        return match (strtoupper($request->method())) {
            'POST' => 'created',
            'PUT', 'PATCH' => 'edited',
            'DELETE' => 'deleted',
            default => 'changed',
        };
    }

    private function actionPhrase(string $action): string
    {
        return match ($action) {
            'created' => 'Create',
            'edited' => 'Edit',
            'deleted' => 'Delete',
            'voided' => 'Void',
            'approved' => 'Approve',
            'received' => 'Receive',
            'dispatched' => 'Dispatch',
            'delivered', 'bulk_delivered' => 'Deliver',
            'cancelled' => 'Cancel',
            'rejected' => 'Reject',
            'returned' => 'Return',
            'exchanged' => 'Process exchange for',
            'refunded' => 'Refund',
            'fulfilled' => 'Fulfil',
            'completed' => 'Complete',
            'processed' => 'Process',
            'assigned' => 'Assign',
            'assignment_reverted' => 'Revert assignment for',
            'ready_for_shipment' => 'Mark ready for shipment',
            'stock_available' => 'Mark stock available for',
            'item_added' => 'Add item to',
            'item_removed' => 'Remove item from',
            'item_edited' => 'Edit item in',
            'barcode_scanned' => 'Scan barcode for',
            'barcode_received' => 'Receive barcode for',
            'quality_checked' => 'Complete quality check for',
            'shipment_created' => 'Create shipment for',
            default => $this->humanize($action),
        };
    }

    private function categoryFor(?string $controllerBase, ?Model $subject, string $action): string
    {
        $type = $subject ? class_basename($subject) : '';
        $name = strtolower(($controllerBase ?? '') . ' ' . $type);

        if (in_array($action, ['assigned', 'assignment_reverted'], true) && str_contains($name, 'order')) {
            return 'store-assignments';
        }

        return match (true) {
            str_contains($name, 'purchase'), str_contains($name, 'vendorpayment') => 'purchase-orders',
            str_contains($name, 'dispatch') => 'product-dispatches',
            str_contains($name, 'return'), str_contains($name, 'exchange'), str_contains($name, 'refund') => 'returns-exchanges',
            str_contains($name, 'serviceorder') => 'service-orders',
            str_contains($name, 'shipment') => 'shipments',
            str_contains($name, 'order'), str_contains($name, 'orderpayment') => 'orders',
            default => 'other',
        };
    }

    private function labelFromPath(string $path): string
    {
        $segments = array_values(array_filter(explode('/', trim($path, '/')), fn ($segment) => !is_numeric($segment)));
        $last = end($segments) ?: 'Record';
        return $this->humanize($last);
    }

    private function humanize(string $value): string
    {
        return ucwords(str_replace(['_', '-'], ' ', $value));
    }

    private function sanitize($value, int $depth = 0)
    {
        if ($depth > 4) {
            return '[Nested data omitted]';
        }

        if ($value instanceof UploadedFile) {
            return [
                'file_name' => $value->getClientOriginalName(),
                'mime_type' => $value->getClientMimeType(),
                'size_bytes' => $value->getSize(),
            ];
        }

        if ($value instanceof Model) {
            return [
                'model' => class_basename($value),
                'id' => $value->getKey(),
            ];
        }

        if (is_array($value)) {
            $result = [];
            $count = 0;
            foreach ($value as $key => $item) {
                if ($count++ >= 50) {
                    $result['_truncated'] = 'Additional entries omitted';
                    break;
                }

                if (in_array(strtolower((string) $key), self::SENSITIVE_KEYS, true)) {
                    $result[$key] = '[REDACTED]';
                    continue;
                }

                $result[$key] = $this->sanitize($item, $depth + 1);
            }
            return $result;
        }

        if (is_string($value) && mb_strlen($value) > 1000) {
            return mb_substr($value, 0, 1000) . '…';
        }

        if (is_object($value)) {
            return $this->sanitize((array) $value, $depth + 1);
        }

        return $value;
    }
}
