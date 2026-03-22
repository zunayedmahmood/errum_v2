<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductBarcode;
use App\Models\ProductBatch;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class StoreFulfillmentController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api'); // Employee authentication
    }

    /**
     * Get orders assigned to employee's store
     */
    public function getAssignedOrders(Request $request): JsonResponse
    {
        try {
            $employeeId = auth('api')->id();
            $employee = Employee::with('store')->findOrFail($employeeId);

            if (!$employee->store_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Employee is not assigned to a store',
                ], 400);
            }

            $status = $request->query('status', 'assigned_to_store,picking');
            $perPage = $request->query('per_page', 15);

            // Convert comma-separated statuses to array
            $statuses = explode(',', $status);

            $orders = Order::where('store_id', $employee->store_id)
                ->whereIn('status', $statuses)
                ->where('order_type', 'ecommerce')
                ->with([
                    'customer',
                    'items.product.images',
                    'items.product.barcodes' => function($query) use ($employee) {
                        $query->where('current_store_id', $employee->store_id)
                              ->where('current_status', 'in_shop');
                    },
                ])
                ->orderBy('created_at', 'asc')
                ->paginate($perPage);

            // Add fulfillment progress for each order
            foreach ($orders as $order) {
                $totalItems = $order->items->count();
                $fulfilledItems = $order->items->filter(function($item) {
                    return !is_null($item->product_barcode_id);
                })->count();

                $order->fulfillment_progress = [
                    'total_items' => $totalItems,
                    'fulfilled_items' => $fulfilledItems,
                    'pending_items' => $totalItems - $fulfilledItems,
                    'percentage' => $totalItems > 0 ? round(($fulfilledItems / $totalItems) * 100, 2) : 0,
                    'is_complete' => $fulfilledItems === $totalItems,
                ];

                // Add item scan status
                $order->items->each(function($item) {
                    $item->scan_status = $item->product_barcode_id ? 'scanned' : 'pending';
                    $item->available_barcodes_count = $item->product->barcodes->count();
                });
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'store' => [
                        'id' => $employee->store->id,
                        'name' => $employee->store->name,
                        'address' => $employee->store->address,
                    ],
                    'orders' => $orders->items(),
                    'pagination' => [
                        'current_page' => $orders->currentPage(),
                        'total_pages' => $orders->lastPage(),
                        'per_page' => $orders->perPage(),
                        'total' => $orders->total(),
                    ],
                    'summary' => [
                        'total_orders' => $orders->total(),
                        'assigned_to_store_count' => Order::where('store_id', $employee->store_id)
                            ->where('status', 'assigned_to_store')
                            ->count(),
                        'picking_count' => Order::where('store_id', $employee->store_id)
                            ->where('status', 'picking')
                            ->count(),
                        'ready_for_shipment_count' => Order::where('store_id', $employee->store_id)
                            ->where('status', 'ready_for_shipment')
                            ->count(),
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch assigned orders',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get specific order details for fulfillment
     */
    public function getOrderDetails($orderId): JsonResponse
    {
        try {
            $employeeId = auth('api')->id();
            $employee = Employee::with('store')->findOrFail($employeeId);

            $order = Order::where('id', $orderId)
                ->where('store_id', $employee->store_id)
                ->with([
                    'customer',
                    'items.product.images',
                    'items.product.barcodes' => function($query) use ($employee) {
                        $query->where('current_store_id', $employee->store_id)
                              ->where('current_status', 'in_shop');
                    },
                    'items.barcode', // Already scanned barcode
                ])
                ->firstOrFail();

            // Add fulfillment details for each item
            $order->items->each(function($item) use ($employee) {
                $item->scan_status = $item->product_barcode_id ? 'scanned' : 'pending';
                $item->scanned_barcode = $item->barcode;
                $item->available_barcodes = $item->product->barcodes;
                $item->available_count = $item->product->barcodes->count();
            });

            $totalItems = $order->items->count();
            $fulfilledItems = $order->items->filter(fn($item) => !is_null($item->product_barcode_id))->count();

            return response()->json([
                'success' => true,
                'data' => [
                    'order' => $order,
                    'fulfillment_status' => [
                        'total_items' => $totalItems,
                        'fulfilled_items' => $fulfilledItems,
                        'pending_items' => $totalItems - $fulfilledItems,
                        'percentage' => $totalItems > 0 ? round(($fulfilledItems / $totalItems) * 100, 2) : 0,
                        'is_complete' => $fulfilledItems === $totalItems,
                        'can_ship' => $fulfilledItems === $totalItems,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch order details',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Scan barcode to fulfill order item
     */
    public function scanBarcode(Request $request, $orderId): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), [
                'barcode' => 'required|string',
                'order_item_id' => 'required|exists:order_items,id',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $employeeId = auth('api')->id();
            $employee = Employee::with('store')->findOrFail($employeeId);

            $order = Order::where('id', $orderId)
                ->where('store_id', $employee->store_id)
                ->whereIn('status', ['assigned_to_store', 'picking'])
                ->firstOrFail();

            $orderItem = OrderItem::where('id', $request->order_item_id)
                ->where('order_id', $orderId)
                ->with('product')
                ->firstOrFail();

            // Check if item already scanned
            if ($orderItem->product_barcode_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'This order item has already been scanned',
                    'data' => [
                        'scanned_barcode' => $orderItem->barcode->barcode ?? null,
                    ],
                ], 400);
            }

            // Find and validate barcode
            $barcode = ProductBarcode::where('barcode', $request->barcode)
                ->where('current_store_id', $employee->store_id)
                ->where('current_status', 'in_shop')
                ->with('product', 'batch')
                ->first();

            if (!$barcode) {
                return response()->json([
                    'success' => false,
                    'message' => 'Barcode not found or not available in this store',
                ], 404);
            }

            // Validate barcode belongs to the correct product
            if ($barcode->product_id !== $orderItem->product_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Scanned barcode does not match the order item product',
                    'data' => [
                        'expected_product' => $orderItem->product->name,
                        'scanned_product' => $barcode->product->name,
                    ],
                ], 400);
            }

            DB::beginTransaction();

            try {
                // Check if stock was already deducted (batch_id existed before scanning)
                $stockAlreadyDeducted = !is_null($orderItem->product_batch_id);
                
                // Update order item with scanned barcode and batch
                $orderItem->update([
                    'product_barcode_id' => $barcode->id,
                    'product_batch_id' => $barcode->batch_id,
                ]);

                // Update barcode status
                $barcode->update([
                    'current_status' => 'in_shipment',
                    'location_metadata' => array_merge($barcode->location_metadata ?? [], [
                        'order_id' => $order->id,
                        'order_number' => $order->order_number,
                        'scanned_at' => now()->toISOString(),
                        'scanned_by' => $employeeId,
                    ]),
                ]);

                // Deduct from batch quantity ONLY if not already deducted at order creation
                // For social commerce orders without initial store_id, stock is deducted here
                if ($barcode->batch && !$stockAlreadyDeducted) {
                    $barcode->batch->decrement('quantity', 1);
                    
                    \Log::info('Stock deducted at barcode scanning', [
                        'order_id' => $order->id,
                        'order_item_id' => $orderItem->id,
                        'batch_id' => $barcode->batch_id,
                        'quantity' => 1,
                    ]);
                }

                // Update order status to picking if this is first scan
                if ($order->status === 'assigned_to_store') {
                    $order->update(['status' => 'picking']);
                }

                // Check if all items are scanned
                $allItemsScanned = $order->items()->whereNull('product_barcode_id')->count() === 0;
                
                if ($allItemsScanned) {
                    $order->update([
                        'status' => 'ready_for_shipment',
                        'fulfilled_at' => now(),
                        'fulfilled_by' => $employeeId,
                    ]);
                }

                DB::commit();

                // Reload relationships
                $orderItem->load('barcode', 'batch');
                $order->load('items');

                $fulfilledItems = $order->items->filter(fn($item) => !is_null($item->product_barcode_id))->count();
                $totalItems = $order->items->count();

                return response()->json([
                    'success' => true,
                    'message' => 'Barcode scanned successfully',
                    'data' => [
                        'order_item' => $orderItem,
                        'scanned_barcode' => $barcode,
                        'order_status' => $order->status,
                        'fulfillment_progress' => [
                            'fulfilled_items' => $fulfilledItems,
                            'total_items' => $totalItems,
                            'percentage' => round(($fulfilledItems / $totalItems) * 100, 2),
                            'is_complete' => $fulfilledItems === $totalItems,
                        ],
                    ],
                ], 200);

            } catch (\Exception $e) {
                DB::rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to scan barcode',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Mark order as ready for shipment manually
     */
    public function markReadyForShipment($orderId): JsonResponse
    {
        try {
            $employeeId = auth('api')->id();
            $employee = Employee::with('store')->findOrFail($employeeId);

            $order = Order::where('id', $orderId)
                ->where('store_id', $employee->store_id)
                ->with('items')
                ->firstOrFail();

            // Verify all items are scanned
            $unscannedItems = $order->items()->whereNull('product_barcode_id')->count();
            
            if ($unscannedItems > 0) {
                return response()->json([
                    'success' => false,
                    'message' => "Cannot mark as ready for shipment. {$unscannedItems} items are not yet scanned.",
                ], 400);
            }

            $order->update([
                'status' => 'ready_for_shipment',
                'fulfilled_at' => now(),
                'fulfilled_by' => $employeeId,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Order marked as ready for shipment',
                'data' => ['order' => $order],
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark order as ready for shipment',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}

