<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ProductBatch;
use App\Models\ReservedProduct;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class OrderManagementController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:api'); // Employee authentication
    }

    /**
     * Get orders pending store assignment
     * Includes both ecommerce and social_commerce orders
     */
    public function getPendingAssignmentOrders(Request $request): JsonResponse
    {
        try {
            $perPage = $request->query('per_page', 15);
            $sortOrder = $request->query('sort_order', 'asc');
            
            // Validate sort order to prevent SQL injection or invalid values
            if (!in_array(strtolower($sortOrder), ['asc', 'desc'])) {
                $sortOrder = 'asc';
            }
            
            $orders = Order::where('status', 'pending_assignment')
                ->whereIn('order_type', ['ecommerce', 'social_commerce'])
                ->with(['customer', 'items.product'])
                ->orderBy('created_at', $sortOrder)
                ->paginate($perPage);

            // Add summary for each order
            foreach ($orders as $order) {
                $order->items_summary = $order->items->map(function ($item) {
                    return [
                        'product_id' => $item->product_id,
                        'product_name' => $item->product_name,
                        'quantity' => $item->quantity,
                    ];
                });
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'orders' => $orders->items(),
                    'pagination' => [
                        'current_page' => $orders->currentPage(),
                        'total_pages' => $orders->lastPage(),
                        'per_page' => $orders->perPage(),
                        'total' => $orders->total(),
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch pending orders',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get available stores for an order based on inventory
     */
    public function getAvailableStores($orderId): JsonResponse
    {
        try {
            $order = Order::with('items.product')->findOrFail($orderId);

            if ($order->status !== 'pending_assignment') {
                return response()->json([
                    'success' => false,
                    'message' => 'Order is not pending assignment',
                ], 400);
            }

            // Get all active stores
            $stores = Store::where('is_warehouse', false)
                ->where('is_online', true)
                ->get();

            $storeInventory = [];

            foreach ($stores as $store) {
                $canFulfill = true;
                $storeData = [
                    'store_id' => $store->id,
                    'store_name' => $store->name,
                    'store_address' => $store->address,
                    'inventory_details' => [],
                    'total_items_available' => 0,
                    'total_items_required' => $order->items->sum('quantity'),
                ];

                // Check inventory for each order item
                foreach ($order->items as $orderItem) {
                    // Critical: Ensure store assignment operates only on active variant product_ids.
                    if (!$orderItem->product || $orderItem->product->is_archived) {
                        $storeData['inventory_details'][] = [
                            'product_id' => $orderItem->product_id,
                            'product_name' => $orderItem->product_name,
                            'product_sku' => $orderItem->product_sku,
                            'required_quantity' => $orderItem->quantity,
                            'available_quantity' => 0,
                            'can_fulfill' => false,
                            'batches' => [],
                        ];
                        $canFulfill = false;
                        continue;
                    }

                    $availableBatches = ProductBatch::where('product_id', $orderItem->product_id)
                        ->where('store_id', $store->id)
                        ->where('availability', true)
                        ->where('quantity', '>', 0)
                        ->where(function($query) {
                            $query->whereNull('expiry_date')
                                ->orWhere('expiry_date', '>', now());
                        })
                        ->orderBy('expiry_date', 'asc') // FIFO
                        ->orderBy('created_at', 'asc')
                        ->get();

                    $totalAvailableForProduct = $availableBatches->sum('quantity');
                    $requiredQuantity = $orderItem->quantity;

                    $inventoryDetail = [
                        'product_id' => $orderItem->product_id,
                        'product_name' => $orderItem->product_name,
                        'product_sku' => $orderItem->product_sku,
                        'required_quantity' => $requiredQuantity,
                        'available_quantity' => $totalAvailableForProduct,
                        'can_fulfill' => $totalAvailableForProduct >= $requiredQuantity,
                        'batches' => $availableBatches->map(function($batch) {
                            return [
                                'batch_id' => $batch->id,
                                'batch_number' => $batch->batch_number,
                                'quantity' => $batch->quantity,
                                'sell_price' => $batch->sell_price,
                                'expiry_date' => $batch->expiry_date,
                            ];
                        }),
                    ];

                    $storeData['inventory_details'][] = $inventoryDetail;
                    $storeData['total_items_available'] += $totalAvailableForProduct;

                    if ($totalAvailableForProduct < $requiredQuantity) {
                        $canFulfill = false;
                    }
                }

                $storeData['can_fulfill_entire_order'] = $canFulfill;
                $storeData['fulfillment_percentage'] = $storeData['total_items_required'] > 0
                    ? min(100, round(($storeData['total_items_available'] / $storeData['total_items_required']) * 100, 2))
                    : 0;

                $storeInventory[] = $storeData;
            }

            // Sort by fulfillment capability (stores that can fulfill entire order first)
            usort($storeInventory, function($a, $b) {
                if ($a['can_fulfill_entire_order'] !== $b['can_fulfill_entire_order']) {
                    return $b['can_fulfill_entire_order'] <=> $a['can_fulfill_entire_order'];
                }
                return $b['fulfillment_percentage'] <=> $a['fulfillment_percentage'];
            });

            return response()->json([
                'success' => true,
                'data' => [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'total_items' => $order->items->sum('quantity'),
                    'stores' => $storeInventory,
                    'recommendation' => $this->getRecommendation($storeInventory),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch available stores',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Assign order to a specific store
     */
    public function assignOrderToStore(Request $request, $orderId): JsonResponse
    {
        try {
            $validator = Validator::make($request->all(), [
                'store_id' => 'required|exists:stores,id',
                'notes' => 'nullable|string|max:500',
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors(),
                ], 422);
            }

            $order = Order::with('items.product')->findOrFail($orderId);

            if ($order->status !== 'pending_assignment') {
                return response()->json([
                    'success' => false,
                    'message' => 'Order is not pending assignment',
                ], 400);
            }

            $storeId = $request->store_id;
            $store = Store::findOrFail($storeId);

            // Validate inventory availability
            foreach ($order->items as $orderItem) {
                $availableQuantity = ProductBatch::where('product_id', $orderItem->product_id)
                    ->where('store_id', $storeId)
                    ->where('availability', true)
                    ->where('quantity', '>', 0)
                    ->where(function($query) {
                        $query->whereNull('expiry_date')
                            ->orWhere('expiry_date', '>', now());
                    })
                    ->sum('quantity');

                if ($availableQuantity < $orderItem->quantity) {
                    return response()->json([
                        'success' => false,
                        'message' => "Insufficient inventory for product: {$orderItem->product_name}",
                        'data' => [
                            'product' => $orderItem->product_name,
                            'required' => $orderItem->quantity,
                            'available' => $availableQuantity,
                        ],
                    ], 400);
                }
            }

            DB::beginTransaction();

            try {
                // Note: Stock batches will be determined dynamically during the barcode scanning phase at the branch.
                // Reserved inventory remains untouched; it will be released during barcode scanning.


                // Update order status to assigned_to_store
                $order->update([
                    'store_id' => $storeId,
                    'status' => 'assigned_to_store',
                    'fulfillment_status' => 'pending_fulfillment', // Required for warehouse fulfillment workflow
                    'processed_by' => auth('api')->id(),
                    'metadata' => array_merge($order->metadata ?? [], [
                        'assigned_at' => now()->toISOString(),
                        'assigned_by' => auth('api')->id(),
                        'assignment_notes' => $request->notes,
                    ]),
                ]);

                DB::commit();

                $order->load(['customer', 'items.product', 'store']);

                return response()->json([
                    'success' => true,
                    'message' => "Order successfully assigned to {$store->name}",
                    'data' => [
                        'order' => $order,
                    ],
                ], 200);

            } catch (\Exception $e) {
                DB::rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to assign order to store',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get recommendation for best store to assign order
     */
    private function getRecommendation(array $storeInventory): ?array
    {
        // Find stores that can fulfill entire order
        $canFulfillStores = array_filter($storeInventory, function($store) {
            return $store['can_fulfill_entire_order'];
        });

        if (empty($canFulfillStores)) {
            // No store can fulfill entire order
            // Recommend store with highest fulfillment percentage
            $bestStore = reset($storeInventory);
            return [
                'store_id' => $bestStore['store_id'],
                'store_name' => $bestStore['store_name'],
                'reason' => 'Highest partial fulfillment capability',
                'fulfillment_percentage' => $bestStore['fulfillment_percentage'],
                'note' => 'Consider splitting order or restocking before assignment',
            ];
        }

        // Among stores that can fulfill, find the one with the earliest expiring required batch
        $bestStore = null;
        $earliestExpiry = null;
        
        foreach ($canFulfillStores as $store) {
            $storeEarliest = null;
            // Get expiry of the batches this store would use for exact variant ID
            foreach ($store['inventory_details'] ?? [] as $detail) {
                foreach ($detail['batches'] ?? [] as $batch) {
                    if (!empty($batch['expiry_date'])) {
                        $expiryTime = strtotime($batch['expiry_date']);
                        if ($storeEarliest === null || $expiryTime < $storeEarliest) {
                            $storeEarliest = $expiryTime;
                        }
                    }
                }
            }
            
            // If this store has an earlier expiry than our current best, or if we haven't found one yet
            if (!$bestStore || ($storeEarliest !== null && ($earliestExpiry === null || $storeEarliest < $earliestExpiry))) {
                $earliestExpiry = $storeEarliest;
                $bestStore = $store;
            }
        }
        
        // Fallback to the first store if logic failed
        if (!$bestStore) {
            $bestStore = reset($canFulfillStores);
        }

        return [
            'store_id' => $bestStore['store_id'],
            'store_name' => $bestStore['store_name'],
            'reason' => 'Can fulfill entire order' . ($earliestExpiry ? ' (Optimized FIFO expiry)' : ''),
            'fulfillment_percentage' => 100,
        ];
    }
}

