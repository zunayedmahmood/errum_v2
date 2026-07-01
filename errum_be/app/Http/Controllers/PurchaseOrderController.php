<?php

namespace App\Http\Controllers;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PurchaseOrderController extends Controller
{
    use DatabaseAgnosticSearch;
    /**
     * Create a new purchase order
     */
    public function create(Request $request)
    {
        $validated = $request->validate([
            'vendor_id' => 'required|exists:vendors,id',
            'store_id' => 'required|exists:stores,id',
            'expected_delivery_date' => 'nullable|date|after_or_equal:today',
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity_ordered' => 'required|integer|min:1',
            'items.*.unit_cost' => 'nullable|numeric|min:0',
            'items.*.unit_sell_price' => 'nullable|numeric|min:0',
            'items.*.tax_amount' => 'nullable|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'items.*.notes' => 'nullable|string',
        ]);

        // Verify store is a warehouse
        $store = Store::findOrFail($validated['store_id']);
        if (!$store->is_warehouse) {
            return response()->json([
                'success' => false,
                'message' => 'Only warehouse can receive products from vendors'
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Create purchase order
            $po = PurchaseOrder::create([
                'po_number' => PurchaseOrder::generatePONumber(),
                'vendor_id' => $validated['vendor_id'],
                'store_id' => $validated['store_id'],
                'created_by' => auth()->id(),
                'order_date' => now()->format('Y-m-d'),
                'expected_delivery_date' => $validated['expected_delivery_date'] ?? null,
                'status' => 'draft',
                'payment_status' => 'unpaid',
                'tax_amount' => $validated['tax_amount'] ?? 0,
                'discount_amount' => $validated['discount_amount'] ?? 0,
                'shipping_cost' => $validated['shipping_cost'] ?? 0,
                'notes' => $validated['notes'] ?? null,
                'terms_and_conditions' => $validated['terms_and_conditions'] ?? null,
            ]);

            // Create purchase order items
            foreach ($validated['items'] as $itemData) {
                $product = Product::findOrFail($itemData['product_id']);
                
                PurchaseOrderItem::create([
                    'purchase_order_id' => $po->id,
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'quantity_ordered' => $itemData['quantity_ordered'],
                    'unit_cost' => $itemData['unit_cost'] ?? 0,
                    'unit_sell_price' => $itemData['unit_sell_price'] ?? $product->price,
                    'tax_amount' => $itemData['tax_amount'] ?? 0,
                    'discount_amount' => $itemData['discount_amount'] ?? 0,
                    'notes' => $itemData['notes'] ?? null,
                ]);
            }

            // Calculate totals
            $po->calculateTotals();
            $po->save();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Purchase order created successfully',
                'data' => $po->load('items', 'vendor', 'store')
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create purchase order: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get all purchase orders with filters.
     *
     * No migration is needed for the product-wise filters below. They use the existing
     * purchase_order_items.product_id/product_name/product_sku columns and, when needed,
     * the existing products.category_id relation.
     */
    public function index(Request $request)
    {
        $query = PurchaseOrder::with(['vendor', 'store', 'createdBy', 'items.product.category']);

        $this->applyPurchaseOrderListFilters($query, $request);

        // Sorting - whitelist so query params cannot break the SQL.
        $allowedSortFields = [
            'id',
            'po_number',
            'vendor_id',
            'store_id',
            'order_date',
            'expected_delivery_date',
            'status',
            'payment_status',
            'total_amount',
            'paid_amount',
            'outstanding_amount',
            'created_at',
            'updated_at',
        ];
        $sortBy = in_array($request->get('sort_by'), $allowedSortFields, true)
            ? $request->get('sort_by')
            : 'created_at';
        $sortDirection = strtolower($request->get('sort_direction', 'desc')) === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sortBy, $sortDirection);

        $perPage = min(max((int) $request->get('per_page', $request->get('limit', 15)), 1), 200);
        $purchaseOrders = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $purchaseOrders
        ]);
    }

    /**
     * Get single purchase order with details
     */
    public function show($id)
    {
        $po = PurchaseOrder::with([
            'vendor',
            'store',
            'createdBy',
            'approvedBy',
            'receivedBy',
            'items.product',
            'items.productBatch',
            'payments.vendorPayment'
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $po
        ]);
    }

    /**
     * Update purchase order (only in draft status)
     */
    public function update(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only update draft purchase orders'
            ], 422);
        }

        $validated = $request->validate([
            'vendor_id' => 'sometimes|exists:vendors,id',
            'expected_delivery_date' => 'nullable|date',
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
        ]);

        $po->update($validated);
        $po->calculateTotals();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Purchase order updated successfully',
            'data' => $po->load('items', 'vendor', 'store')
        ]);
    }

    /**
     * Bulk update purchase order fields and items (including adding/removing items)
     */
    public function bulkUpdate(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only update draft purchase orders'
            ], 422);
        }

        $validated = $request->validate([
            // PO Fields
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            
            // Items to Update
            'items' => 'nullable|array',
            'items.*.id' => 'required|exists:purchase_order_items,id',
            'items.*.quantity_ordered' => 'required|integer|min:1',
            'items.*.unit_cost' => 'required|numeric|min:0',
            'items.*.unit_sell_price' => 'nullable|numeric|min:0',
            'items.*.tax_amount' => 'nullable|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'items.*.notes' => 'nullable|string',
            
            // Items to Add
            'new_items' => 'nullable|array',
            'new_items.*.product_id' => 'required|exists:products,id',
            'new_items.*.quantity_ordered' => 'required|integer|min:1',
            'new_items.*.unit_cost' => 'required|numeric|min:0',
            'new_items.*.unit_sell_price' => 'nullable|numeric|min:0',
            'new_items.*.tax_amount' => 'nullable|numeric|min:0',
            'new_items.*.discount_amount' => 'nullable|numeric|min:0',
            'new_items.*.notes' => 'nullable|string',
            
            // Items to Remove
            'remove_item_ids' => 'nullable|array',
            'remove_item_ids.*' => 'exists:purchase_order_items,id',
        ]);

        DB::beginTransaction();
        try {
            // 1. Update PO fields
            $poFields = collect($validated)->only([
                'tax_amount', 'discount_amount', 'shipping_cost', 'notes', 'terms_and_conditions'
            ])->filter(fn($v) => !is_null($v))->toArray();
            
            if (!empty($poFields)) {
                $po->update($poFields);
            }

            // 2. Remove items
            if (!empty($validated['remove_item_ids'])) {
                PurchaseOrderItem::whereIn('id', $validated['remove_item_ids'])
                    ->where('purchase_order_id', $po->id)
                    ->delete();
            }

            // 3. Update existing items
            if (!empty($validated['items'])) {
                foreach ($validated['items'] as $itemData) {
                    $item = PurchaseOrderItem::where('id', $itemData['id'])
                        ->where('purchase_order_id', $po->id)
                        ->first();
                    
                    if ($item) {
                        $updateData = collect($itemData)->only([
                            'quantity_ordered', 'unit_cost', 'unit_sell_price', 'tax_amount', 'discount_amount', 'notes'
                        ])->filter(fn($v) => !is_null($v))->toArray();
                        
                        $item->update($updateData);
                    }
                }
            }

            // 4. Add new items
            if (!empty($validated['new_items'])) {
                foreach ($validated['new_items'] as $itemData) {
                    $product = Product::findOrFail($itemData['product_id']);
                    PurchaseOrderItem::create([
                        'purchase_order_id' => $po->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'product_sku' => $product->sku,
                        'quantity_ordered' => $itemData['quantity_ordered'],
                        'unit_cost' => $itemData['unit_cost'],
                        'unit_sell_price' => $itemData['unit_sell_price'] ?? $product->price,
                        'tax_amount' => $itemData['tax_amount'] ?? 0,
                        'discount_amount' => $itemData['discount_amount'] ?? 0,
                        'notes' => $itemData['notes'] ?? null,
                    ]);
                }
            }

            // 5. Final recalculation
            $po->refresh(); 
            $po->calculateTotals();
            $po->save();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Purchase order updated successfully',
                'data' => $po->load('items', 'vendor', 'store')
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to update purchase order: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Add item to purchase order
     */
    public function addItem(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only add items to draft purchase orders'
            ], 422);
        }

        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'quantity_ordered' => 'required|integer|min:1',
            'unit_cost' => 'nullable|numeric|min:0',
            'unit_sell_price' => 'nullable|numeric|min:0',
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $product = Product::findOrFail($validated['product_id']);

        $item = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'quantity_ordered' => $validated['quantity_ordered'],
            'unit_cost' => $validated['unit_cost'] ?? 0,
            'unit_sell_price' => $validated['unit_sell_price'] ?? $product->price,
            'tax_amount' => $validated['tax_amount'] ?? 0,
            'discount_amount' => $validated['discount_amount'] ?? 0,
            'notes' => $validated['notes'] ?? null,
        ]);

        $po->calculateTotals();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Item added to purchase order',
            'data' => $item
        ]);
    }

    /**
     * Update item in purchase order
     */
    public function updateItem(Request $request, $id, $itemId)
    {
        $po = PurchaseOrder::findOrFail($id);
        $item = PurchaseOrderItem::where('purchase_order_id', $id)
            ->findOrFail($itemId);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only update items in draft purchase orders'
            ], 422);
        }

        $validated = $request->validate([
            'quantity_ordered' => 'sometimes|integer|min:1',
            'unit_cost' => 'sometimes|numeric|min:0',
            'unit_sell_price' => 'nullable|numeric|min:0',
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        $item->update($validated);
        $po->calculateTotals();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Item updated successfully',
            'data' => $item
        ]);
    }

    /**
     * Remove item from purchase order
     */
    public function removeItem($id, $itemId)
    {
        $po = PurchaseOrder::findOrFail($id);
        $item = PurchaseOrderItem::where('purchase_order_id', $id)
            ->findOrFail($itemId);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only remove items from draft purchase orders'
            ], 422);
        }

        $item->delete();
        $po->calculateTotals();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Item removed successfully'
        ]);
    }

    /**
     * Approve purchase order
     */
    public function approve($id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Can only approve draft purchase orders'
            ], 422);
        }

        $po->status = 'approved';
        $po->approved_by = auth()->id();
        $po->approved_at = now();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Purchase order approved successfully',
            'data' => $po
        ]);
    }

    /**
     * Receive purchase order (create product batches)
     */
    public function receive(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if (!in_array($po->status, ['approved', 'partially_received'])) {
            return response()->json([
                'success' => false,
                'message' => 'Purchase order must be approved before receiving'
            ], 422);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|exists:purchase_order_items,id',
            'items.*.quantity_received' => 'required|integer|min:1',
            'items.*.batch_number' => 'nullable|string',
            'items.*.manufactured_date' => 'nullable|date',
            'items.*.expiry_date' => 'nullable|date',
        ]);

        try {
            $po->markAsReceived($validated['items']);
            
            // Update received_by and received_at
            $po->received_by = auth()->id();
            $po->received_at = now();
            $po->save();

            return response()->json([
                'success' => true,
                'message' => 'Products received successfully',
                'data' => $po->load('items.productBatch')
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to receive products: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Cancel purchase order
     */
    public function cancel(Request $request, $id)
    {
        $po = PurchaseOrder::findOrFail($id);

        if ($po->status === 'received') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot cancel received purchase order'
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string'
        ]);

        $po->cancel($validated['reason'] ?? null);
        $po->cancelled_at = now();
        $po->save();

        return response()->json([
            'success' => true,
            'message' => 'Purchase order cancelled successfully'
        ]);
    }

    /**
     * Get purchase order statistics
     */
    public function statistics(Request $request)
    {
        $query = PurchaseOrder::query();

        // Date range filter
        if ($request->has('from_date') && $request->has('to_date')) {
            $query->whereBetween('created_at', [$request->from_date, $request->to_date]);
        }

        $stats = [
            'total_purchase_orders' => $query->count(),
            'by_status' => (clone $query)->selectRaw('status, COUNT(*) as count')
                ->groupBy('status')
                ->get(),
            'by_payment_status' => (clone $query)->selectRaw('payment_status, COUNT(*) as count')
                ->groupBy('payment_status')
                ->get(),
            'total_amount' => (clone $query)->sum('total_amount'),
            'total_paid' => (clone $query)->sum('paid_amount'),
            'total_outstanding' => (clone $query)->sum('outstanding_amount'),
            'overdue_orders' => PurchaseOrder::overdue()->count(),
            'recent_orders' => PurchaseOrder::with('vendor')
                ->orderBy('created_at', 'desc')
                ->limit(5)
                ->get(),
        ];

        return response()->json([
            'success' => true,
            'data' => $stats
        ]);
    }



    /**
     * Product-wise purchase order report.
     *
     * This is intentionally built on existing tables only:
     * purchase_orders, purchase_order_items, products, vendors, stores and categories.
     * It gives product-wise ordered/received/pending/payment/AP visibility without a migration.
     */
    public function productWiseReport(Request $request)
    {
        $query = $this->buildProductWiseReportQuery($request);

        $sortBy = $request->get('report_sort_by', 'product_name');
        $sortDirection = strtolower($request->get('report_sort_direction', 'asc')) === 'desc' ? 'desc' : 'asc';
        $allowedSortFields = [
            'product_name',
            'product_sku',
            'po_count',
            'ordered_quantity',
            'received_quantity',
            'pending_quantity',
            'ordered_value',
            'received_value',
            'allocated_paid_amount',
            'allocated_outstanding_amount',
            'received_ap_balance',
            'last_po_at',
        ];
        if (!in_array($sortBy, $allowedSortFields, true)) {
            $sortBy = 'product_name';
        }

        $perPage = min(max((int) $request->get('per_page', 50), 1), 500);
        $rows = $query->orderBy($sortBy, $sortDirection)->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $rows,
        ]);
    }

    /**
     * Export the current product-wise PO report as CSV.
     */
    public function exportProductWiseReportCsv(Request $request)
    {
        $rows = $this->buildProductWiseReportQuery($request)
            ->orderBy('product_name', 'asc')
            ->get();

        $filename = 'product-wise-purchase-orders-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, [
                'Product ID',
                'Product Name',
                'SKU',
                'Category',
                'PO Count',
                'Ordered Qty',
                'Received Qty',
                'Pending Qty',
                'Ordered Value',
                'Received Value',
                'Allocated Paid',
                'Allocated Outstanding',
                'Received AP Balance',
                'First PO Date',
                'Last PO Date',
            ]);

            foreach ($rows as $row) {
                fputcsv($out, [
                    $row->product_id,
                    $row->product_name,
                    $row->product_sku,
                    $row->category_name,
                    $row->po_count,
                    $row->ordered_quantity,
                    $row->received_quantity,
                    $row->pending_quantity,
                    number_format((float) $row->ordered_value, 2, '.', ''),
                    number_format((float) $row->received_value, 2, '.', ''),
                    number_format((float) $row->allocated_paid_amount, 2, '.', ''),
                    number_format((float) $row->allocated_outstanding_amount, 2, '.', ''),
                    number_format((float) $row->received_ap_balance, 2, '.', ''),
                    $row->first_po_at,
                    $row->last_po_at,
                ]);
            }

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Apply list filters to the main PO list.
     */
    private function applyPurchaseOrderListFilters($query, Request $request): void
    {
        if ($request->filled('vendor_id')) {
            $query->where('vendor_id', $request->vendor_id);
        }

        if ($request->filled('store_id')) {
            $query->where('store_id', $request->store_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('payment_status')) {
            $paymentStatus = (string) $request->payment_status;
            if (in_array($paymentStatus, ['partial', 'partially_paid'], true)) {
                // Existing data may contain either value depending on older code path.
                $query->whereIn('payment_status', ['partial', 'partially_paid']);
            } else {
                $query->where('payment_status', $paymentStatus);
            }
        }

        if ($request->filled('search')) {
            $this->whereLike($query, 'po_number', (string) $request->search);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        if ($request->filled('product_id')) {
            $query->whereHas('items', function ($itemQuery) use ($request) {
                $itemQuery->where('product_id', (int) $request->product_id);
            });
        }

        if ($request->filled('product_search')) {
            $search = trim((string) $request->product_search);
            $operator = $this->getLikeOperator(false);
            $pattern = $this->buildLikePattern($search);
            $query->whereHas('items', function ($itemQuery) use ($operator, $pattern) {
                $itemQuery->where(function ($q) use ($operator, $pattern) {
                    $q->where('product_name', $operator, $pattern)
                        ->orWhere('product_sku', $operator, $pattern)
                        ->orWhereHas('product', function ($productQuery) use ($operator, $pattern) {
                            $productQuery->where('name', $operator, $pattern)
                                ->orWhere('sku', $operator, $pattern);
                        });
                });
            });
        }

        if ($request->filled('sku')) {
            $sku = trim((string) $request->sku);
            $operator = $this->getLikeOperator(false);
            $pattern = $this->buildLikePattern($sku);
            $query->whereHas('items', function ($itemQuery) use ($operator, $pattern) {
                $itemQuery->where(function ($q) use ($operator, $pattern) {
                    $q->where('product_sku', $operator, $pattern)
                        ->orWhereHas('product', function ($productQuery) use ($operator, $pattern) {
                            $productQuery->where('sku', $operator, $pattern);
                        });
                });
            });
        }

        if ($request->filled('category_id')) {
            $query->whereHas('items.product', function ($productQuery) use ($request) {
                $productQuery->where('category_id', (int) $request->category_id);
            });
        }
    }

    /**
     * Build the grouped product-wise PO report query.
     */
    private function buildProductWiseReportQuery(Request $request)
    {
        $lineTotal = "COALESCE(purchase_order_items.total_cost, ((COALESCE(purchase_order_items.unit_cost, 0) * COALESCE(purchase_order_items.quantity_ordered, 0)) - COALESCE(purchase_order_items.discount_amount, 0) + COALESCE(purchase_order_items.tax_amount, 0)))";
        $receivedRatio = "CASE WHEN COALESCE(purchase_order_items.quantity_ordered, 0) > 0 THEN (COALESCE(purchase_order_items.quantity_received, 0) / purchase_order_items.quantity_ordered) ELSE 0 END";
        $receivedValue = "((COALESCE(purchase_order_items.unit_cost, 0) * COALESCE(purchase_order_items.quantity_received, 0)) - (COALESCE(purchase_order_items.discount_amount, 0) * {$receivedRatio}) + (COALESCE(purchase_order_items.tax_amount, 0) * {$receivedRatio}))";
        $paidRatio = "CASE WHEN COALESCE(po.total_amount, 0) > 0 THEN (COALESCE(po.paid_amount, 0) / po.total_amount) ELSE 0 END";
        $outstandingRatio = "CASE WHEN COALESCE(po.total_amount, 0) > 0 THEN (COALESCE(po.outstanding_amount, 0) / po.total_amount) ELSE 0 END";
        $allocatedPaid = "({$lineTotal} * {$paidRatio})";
        $allocatedOutstanding = "({$lineTotal} * {$outstandingRatio})";
        $pendingQty = "CASE WHEN COALESCE(purchase_order_items.quantity_pending, (COALESCE(purchase_order_items.quantity_ordered, 0) - COALESCE(purchase_order_items.quantity_received, 0))) < 0 THEN 0 ELSE COALESCE(purchase_order_items.quantity_pending, (COALESCE(purchase_order_items.quantity_ordered, 0) - COALESCE(purchase_order_items.quantity_received, 0))) END";
        $receivedApBalance = "CASE WHEN ({$receivedValue} - {$allocatedPaid}) < 0 THEN 0 ELSE ({$receivedValue} - {$allocatedPaid}) END";

        $query = PurchaseOrderItem::query()
            ->join('purchase_orders as po', 'purchase_order_items.purchase_order_id', '=', 'po.id')
            ->leftJoin('products as p', 'purchase_order_items.product_id', '=', 'p.id')
            ->leftJoin('categories as c', 'p.category_id', '=', 'c.id')
            ->leftJoin('vendors as v', 'po.vendor_id', '=', 'v.id')
            ->leftJoin('stores as s', 'po.store_id', '=', 's.id')
            ->selectRaw("
                purchase_order_items.product_id as product_id,
                MIN(COALESCE(p.name, purchase_order_items.product_name)) as product_name,
                MIN(COALESCE(p.sku, purchase_order_items.product_sku)) as product_sku,
                MIN(p.category_id) as category_id,
                MIN(c.name) as category_name,
                COUNT(DISTINCT po.id) as po_count,
                SUM(COALESCE(purchase_order_items.quantity_ordered, 0)) as ordered_quantity,
                SUM(COALESCE(purchase_order_items.quantity_received, 0)) as received_quantity,
                SUM({$pendingQty}) as pending_quantity,
                SUM(COALESCE(purchase_order_items.unit_cost, 0) * COALESCE(purchase_order_items.quantity_ordered, 0)) as gross_ordered_value,
                SUM({$lineTotal}) as ordered_value,
                SUM({$receivedValue}) as received_value,
                SUM({$allocatedPaid}) as allocated_paid_amount,
                SUM({$allocatedOutstanding}) as allocated_outstanding_amount,
                SUM({$receivedApBalance}) as received_ap_balance,
                MIN(po.created_at) as first_po_at,
                MAX(po.created_at) as last_po_at
            ")
            ->whereNotNull('purchase_order_items.product_id')
            ->groupBy('purchase_order_items.product_id');

        $this->applyPurchaseOrderJoinFilters($query, $request);

        return $query;
    }

    /**
     * Apply the same filters to the grouped report query, where purchase_orders is joined as po.
     */
    private function applyPurchaseOrderJoinFilters($query, Request $request): void
    {
        if ($request->filled('vendor_id')) {
            $query->where('po.vendor_id', $request->vendor_id);
        }

        if ($request->filled('store_id')) {
            $query->where('po.store_id', $request->store_id);
        }

        if ($request->filled('status')) {
            $query->where('po.status', $request->status);
        }

        if ($request->filled('payment_status')) {
            $paymentStatus = (string) $request->payment_status;
            if (in_array($paymentStatus, ['partial', 'partially_paid'], true)) {
                $query->whereIn('po.payment_status', ['partial', 'partially_paid']);
            } else {
                $query->where('po.payment_status', $paymentStatus);
            }
        }

        if ($request->filled('search')) {
            $operator = $this->getLikeOperator(false);
            $pattern = $this->buildLikePattern((string) $request->search);
            $query->where('po.po_number', $operator, $pattern);
        }

        if ($request->filled('from_date')) {
            $query->whereDate('po.created_at', '>=', $request->from_date);
        }

        if ($request->filled('to_date')) {
            $query->whereDate('po.created_at', '<=', $request->to_date);
        }

        if ($request->filled('product_id')) {
            $query->where('purchase_order_items.product_id', (int) $request->product_id);
        }

        if ($request->filled('product_search')) {
            $operator = $this->getLikeOperator(false);
            $pattern = $this->buildLikePattern(trim((string) $request->product_search));
            $query->where(function ($q) use ($operator, $pattern) {
                $q->where('purchase_order_items.product_name', $operator, $pattern)
                    ->orWhere('purchase_order_items.product_sku', $operator, $pattern)
                    ->orWhere('p.name', $operator, $pattern)
                    ->orWhere('p.sku', $operator, $pattern);
            });
        }

        if ($request->filled('sku')) {
            $operator = $this->getLikeOperator(false);
            $pattern = $this->buildLikePattern(trim((string) $request->sku));
            $query->where(function ($q) use ($operator, $pattern) {
                $q->where('purchase_order_items.product_sku', $operator, $pattern)
                    ->orWhere('p.sku', $operator, $pattern);
            });
        }

        if ($request->filled('category_id')) {
            $query->where('p.category_id', (int) $request->category_id);
        }
    }

    /**
     * Delete purchase order permanently
     * Deletes related barcodes, batches, and updates inventory.
     */
    public function destroy(Request $request, $id)
    {
        $user = request()->user();
        if (!$user || !in_array($user->role?->slug, ['super-admin', 'admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Admin access required.'
            ], 403);
        }

        $po = PurchaseOrder::with(['items.product'])->findOrFail($id);

        if ($po->payment_status !== 'unpaid' && $po->paid_amount > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete purchase order because it has been partially or fully paid.'
            ], 422);
        }

        // Verify password
        $validated = $request->validate([
            'password' => 'required|string',
        ]);

        if (!\Illuminate\Support\Facades\Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Incorrect password.'
            ], 403);
        }

        DB::beginTransaction();
        try {
            $productIdsToSync = [];
            $batchIdsToDelete = [];

            // 1. Collect batch IDs from items
            foreach ($po->items as $item) {
                if ($item->product_id) {
                    $productIdsToSync[] = $item->product_id;
                }

                if ($item->product_batch_id) {
                    $batchIdsToDelete[] = $item->product_batch_id;
                }
            }

            // 2. Delete the purchase order items first (to remove foreign keys to product_batches)
            \DB::table('purchase_order_items')->where('purchase_order_id', $po->id)->delete();

            // 3. Delete barcodes and batches safely
            if (!empty($batchIdsToDelete)) {
                // Delete barcodes for these batches
                \DB::table('product_barcodes')->whereIn('batch_id', $batchIdsToDelete)->delete();
                // Delete the batches themselves
                \DB::table('product_batches')->whereIn('id', $batchIdsToDelete)->delete();
            }

            // 4. Cancel accounting entries created for this PO receipt before deleting the PO.
            \App\Models\Transaction::where('reference_type', PurchaseOrder::class)
                ->where('reference_id', $po->id)
                ->update(['status' => 'cancelled']);

            // 5. Delete the purchase order
            $po->delete();

            DB::commit();

            // 6. Update quantity of all products affected by this PO
            $productIdsToSync = array_unique($productIdsToSync);
            foreach ($productIdsToSync as $productId) {
                if (method_exists(\App\Models\MasterInventory::class, 'syncProductInventory')) {
                    \App\Models\MasterInventory::syncProductInventory($productId);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Purchase order permanently deleted.'
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete purchase order: ' . $e->getMessage()
            ], 500);
        }
    }
}
