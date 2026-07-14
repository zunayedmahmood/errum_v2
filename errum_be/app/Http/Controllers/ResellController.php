<?php

namespace App\Http\Controllers;

use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductReturn;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\ResellProduct;
use App\Models\ResellVendor;
use App\Models\Store;
use App\Models\Vendor;
use App\Models\VendorPayment;
use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ResellController extends Controller
{
    use DatabaseAgnosticSearch;

    private const EXCLUDED_SALE_STATUSES = [
        'pending',
        'pending_assignment',
        'assigned_to_store',
        'cancelled',
        'canceled',
        'refunded',
        'deleted',
        'void',
    ];

    private const RETURNED_STATUSES = ['approved', 'processing', 'completed', 'refunded'];

    public function summary(Request $request)
    {
        $rows = $this->buildProductReportRows($request);
        $vendorIds = ResellVendor::active()->pluck('vendor_id');

        $openPurchaseOrders = PurchaseOrder::whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['received', 'cancelled', 'returned'])
            ->count();

        return response()->json([
            'success' => true,
            'data' => [
                'vendors' => ResellVendor::active()->count(),
                'products' => ResellProduct::active()->count(),
                'open_purchase_orders' => $openPurchaseOrders,
                'stock_on_hand' => (int) $rows->sum('stock_on_hand'),
                'net_units_sold' => (int) $rows->sum('net_units_sold'),
                'net_sales' => round((float) $rows->sum('net_sales'), 2),
                'cogs' => round((float) $rows->sum('net_cogs'), 2),
                'gross_profit' => round((float) $rows->sum('gross_profit'), 2),
                'outstanding' => round((float) PurchaseOrder::whereIn('vendor_id', $vendorIds)
                    ->where('metadata->resell', true)
                    ->whereNotIn('status', ['cancelled', 'returned'])
                    ->sum('outstanding_amount'), 2),
            ],
        ]);
    }

    public function vendorCandidates(Request $request)
    {
        $query = Vendor::query()
            ->where('is_active', true)
            ->whereDoesntHave('resellProfile', fn ($q) => $q->where('is_active', true));

        if ($request->filled('search')) {
            $this->whereAnyLike($query, ['name', 'email', 'phone', 'contact_person'], (string) $request->search);
        }

        $vendors = $query->orderBy('name')->limit(100)->get();

        return response()->json(['success' => true, 'data' => $vendors]);
    }

    public function vendors(Request $request)
    {
        $query = ResellVendor::with(['vendor', 'markedBy'])
            ->withCount(['activeProducts as product_count']);

        if (!$request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        if ($request->filled('search')) {
            $search = (string) $request->search;
            $query->whereHas('vendor', function ($vendorQuery) use ($search) {
                $this->whereAnyLike($vendorQuery, ['name', 'email', 'phone', 'contact_person'], $search);
            });
        }

        $profiles = $query->orderByDesc('created_at')->get();
        $vendorIds = $profiles->pluck('vendor_id');

        $poStats = PurchaseOrder::whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->selectRaw('vendor_id, COUNT(*) as po_count, SUM(total_amount) as po_value, SUM(paid_amount) as paid_amount, SUM(outstanding_amount) as outstanding_amount')
            ->groupBy('vendor_id')
            ->get()
            ->keyBy('vendor_id');

        $data = $profiles->map(function (ResellVendor $profile) use ($poStats) {
            $stats = $poStats->get($profile->vendor_id);
            return [
                'id' => $profile->id,
                'vendor_id' => $profile->vendor_id,
                'vendor' => $profile->vendor,
                'is_active' => $profile->is_active,
                'notes' => $profile->notes,
                'marked_by' => $profile->markedBy,
                'product_count' => (int) $profile->product_count,
                'po_count' => (int) ($stats->po_count ?? 0),
                'po_value' => round((float) ($stats->po_value ?? 0), 2),
                'paid_amount' => round((float) ($stats->paid_amount ?? 0), 2),
                'outstanding_amount' => round((float) ($stats->outstanding_amount ?? 0), 2),
                'created_at' => $profile->created_at,
                'updated_at' => $profile->updated_at,
            ];
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function markVendor(Request $request)
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $validated = $request->validate([
            'vendor_id' => 'required|exists:vendors,id',
            'notes' => 'nullable|string|max:2000',
        ]);

        $vendor = Vendor::findOrFail($validated['vendor_id']);
        if (!$vendor->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'Activate the vendor before marking it as a resell vendor.',
            ], 422);
        }

        $profile = ResellVendor::updateOrCreate(
            ['vendor_id' => $vendor->id],
            [
                'is_active' => true,
                'notes' => $validated['notes'] ?? null,
                'marked_by' => auth()->id(),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Vendor marked as a resell vendor. It is now hidden from regular vendor and PO selectors.',
            'data' => $profile->load('vendor', 'markedBy'),
        ], 201);
    }

    public function unmarkVendor($id)
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $profile = ResellVendor::with('vendor')->findOrFail($id);

        if ($profile->activeProducts()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Remove or reassign all active resell-product tags for this vendor first.',
            ], 422);
        }

        $openPoExists = PurchaseOrder::where('vendor_id', $profile->vendor_id)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['received', 'cancelled', 'returned'])
            ->exists();

        if ($openPoExists || PurchaseOrder::where('vendor_id', $profile->vendor_id)
            ->where('metadata->resell', true)
            ->where('outstanding_amount', '>', 0)
            ->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This vendor still has open purchase orders or an outstanding balance.',
            ], 422);
        }

        $profile->update(['is_active' => false, 'marked_by' => auth()->id()]);

        return response()->json([
            'success' => true,
            'message' => 'Resell tag removed. Historical resell records remain available in reports.',
        ]);
    }

    public function products(Request $request)
    {
        $query = ResellProduct::with([
            'product.category',
            'product.images',
            'resellVendor.vendor',
            'markedBy',
        ]);

        if (!$request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        if ($request->filled('resell_vendor_id')) {
            $query->where('resell_vendor_id', (int) $request->resell_vendor_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->whereHas('product', function ($productQuery) use ($search) {
                $this->whereAnyLike($productQuery, ['name', 'sku', 'brand'], $search);
            });
        }

        $perPage = min(max((int) $request->get('per_page', 50), 1), 200);
        $rows = $query->orderByDesc('created_at')->paginate($perPage);
        $productIds = collect($rows->items())->pluck('product_id');

        $stock = DB::table('product_batches')
            ->whereIn('product_id', $productIds)
            ->selectRaw('product_id, SUM(quantity) as stock_on_hand')
            ->groupBy('product_id')
            ->pluck('stock_on_hand', 'product_id');

        $rows->getCollection()->transform(function (ResellProduct $tag) use ($stock) {
            $data = $tag->toArray();
            $data['stock_on_hand'] = (int) ($stock[$tag->product_id] ?? 0);
            return $data;
        });

        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function markProduct(Request $request)
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'resell_vendor_id' => 'required|exists:resell_vendors,id',
            'notes' => 'nullable|string|max:2000',
        ]);

        $vendorProfile = ResellVendor::active()->findOrFail($validated['resell_vendor_id']);
        $product = Product::withTrashed()->findOrFail($validated['product_id']);

        if ($product->trashed()) {
            return response()->json([
                'success' => false,
                'message' => 'Restore the product before marking it as a resell product.',
            ], 422);
        }

        $existingTag = ResellProduct::where('product_id', $product->id)->first();
        if ($existingTag && (int) $existingTag->resell_vendor_id !== (int) $vendorProfile->id) {
            $hasStock = DB::table('product_batches')->where('product_id', $product->id)->where('quantity', '>', 0)->exists();
            $hasResellPoHistory = PurchaseOrderItem::where('product_id', $product->id)
                ->whereHas('purchaseOrder', fn ($query) => $query->where('metadata->resell', true))
                ->exists();
            $hasSaleHistory = OrderItem::where('product_id', $product->id)->exists();

            if ($hasStock || $hasResellPoHistory || $hasSaleHistory) {
                return response()->json([
                    'success' => false,
                    'message' => 'This product already has stock, resell PO history, or sales under another resell vendor. Reassignment is blocked to preserve historical reporting.',
                ], 422);
            }
        }

        $tag = ResellProduct::updateOrCreate(
            ['product_id' => $product->id],
            [
                'resell_vendor_id' => $vendorProfile->id,
                'is_active' => true,
                'notes' => $validated['notes'] ?? null,
                'marked_by' => auth()->id(),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Product marked as a resell product. Its normal catalogue and inventory behavior is unchanged.',
            'data' => $tag->load('product.category', 'resellVendor.vendor'),
        ], 201);
    }

    public function unmarkProduct($id)
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $tag = ResellProduct::with(['product', 'resellVendor'])->findOrFail($id);

        $stockOnHand = DB::table('product_batches')->where('product_id', $tag->product_id)->sum('quantity');
        $openPoItemExists = PurchaseOrderItem::where('product_id', $tag->product_id)
            ->whereHas('purchaseOrder', function ($query) use ($tag) {
                $query->where('vendor_id', $tag->resellVendor->vendor_id)
                    ->where('metadata->resell', true)
                    ->whereNotIn('status', ['received', 'cancelled', 'returned']);
            })
            ->exists();

        if ($stockOnHand > 0 || $openPoItemExists) {
            return response()->json([
                'success' => false,
                'message' => 'This product still has stock or an open resell PO. Clear those obligations before removing the tag.',
            ], 422);
        }

        $tag->update(['is_active' => false, 'marked_by' => auth()->id()]);

        return response()->json(['success' => true, 'message' => 'Resell product tag removed.']);
    }

    public function purchaseOrders(Request $request)
    {
        $vendorIds = ResellVendor::query()->pluck('vendor_id');
        $query = PurchaseOrder::with(['vendor', 'store', 'createdBy', 'approvedBy', 'receivedBy', 'items.product', 'items.productBatch'])
            ->whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true);

        if ($request->filled('vendor_id')) {
            $query->where('vendor_id', (int) $request->vendor_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }
        if ($request->filled('search')) {
            $this->whereLike($query, 'po_number', (string) $request->search);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('order_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('order_date', '<=', $request->to_date);
        }

        $perPage = min(max((int) $request->get('per_page', 25), 1), 200);
        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('created_at')->paginate($perPage),
        ]);
    }

    public function createPurchaseOrder(Request $request)
    {
        $validated = $request->validate([
            'resell_vendor_id' => 'required|exists:resell_vendors,id',
            'store_id' => 'required|exists:stores,id',
            'order_date' => 'nullable|date',
            'expected_delivery_date' => 'nullable|date',
            'payment_due_date' => 'nullable|date',
            'reference_number' => 'nullable|string|max:255',
            'tax_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_cost' => 'nullable|numeric|min:0',
            'other_charges' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'terms_and_conditions' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|integer|distinct|exists:products,id',
            'items.*.quantity_ordered' => 'required|integer|min:1',
            'items.*.unit_cost' => 'required|numeric|min:0',
            'items.*.unit_sell_price' => 'nullable|numeric|min:0',
            'items.*.tax_amount' => 'nullable|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'items.*.notes' => 'nullable|string',
        ]);

        $profile = ResellVendor::active()->with('vendor')->findOrFail($validated['resell_vendor_id']);
        $store = Store::findOrFail($validated['store_id']);
        if (!$store->is_warehouse) {
            return response()->json(['success' => false, 'message' => 'Only a warehouse can receive resell products.'], 422);
        }

        $productIds = collect($validated['items'])->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->values();
        $validProductIds = ResellProduct::active()
            ->where('resell_vendor_id', $profile->id)
            ->whereIn('product_id', $productIds)
            ->pluck('product_id');

        if ($validProductIds->count() !== $productIds->count()) {
            return response()->json([
                'success' => false,
                'message' => 'Every PO item must be an active resell product assigned to the selected resell vendor.',
            ], 422);
        }

        DB::beginTransaction();
        try {
            $po = PurchaseOrder::create([
                'po_number' => PurchaseOrder::generatePONumber(),
                'vendor_id' => $profile->vendor_id,
                'store_id' => $store->id,
                'created_by' => auth()->id(),
                'order_date' => $validated['order_date'] ?? now()->toDateString(),
                'expected_delivery_date' => $validated['expected_delivery_date'] ?? null,
                'payment_due_date' => $validated['payment_due_date'] ?? null,
                'reference_number' => $validated['reference_number'] ?? null,
                'status' => 'draft',
                'payment_status' => 'unpaid',
                'tax_amount' => $validated['tax_amount'] ?? 0,
                'discount_amount' => $validated['discount_amount'] ?? 0,
                'shipping_cost' => $validated['shipping_cost'] ?? 0,
                'other_charges' => $validated['other_charges'] ?? 0,
                'notes' => $validated['notes'] ?? null,
                'terms_and_conditions' => $validated['terms_and_conditions'] ?? null,
                'metadata' => [
                    'resell' => true,
                    'resell_vendor_id' => $profile->id,
                    'created_from' => 'resell_panel',
                ],
            ]);

            $products = Product::whereIn('id', $productIds)->get()->keyBy('id');
            foreach ($validated['items'] as $itemData) {
                $product = $products->get((int) $itemData['product_id']);
                PurchaseOrderItem::create([
                    'purchase_order_id' => $po->id,
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'quantity_ordered' => $itemData['quantity_ordered'],
                    'unit_cost' => $itemData['unit_cost'],
                    'unit_sell_price' => $itemData['unit_sell_price'] ?? 0,
                    'tax_amount' => $itemData['tax_amount'] ?? 0,
                    'discount_amount' => $itemData['discount_amount'] ?? 0,
                    'notes' => $itemData['notes'] ?? null,
                    'metadata' => ['resell' => true],
                ]);
            }

            $po->load('items');
            $po->calculateTotals();
            $po->save();
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Resell purchase order created successfully.',
                'data' => $po->load('vendor', 'store', 'items.product'),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create resell purchase order: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function payments(Request $request)
    {
        $vendorIds = ResellVendor::query()->pluck('vendor_id');
        $query = VendorPayment::with(['vendor', 'paymentMethod', 'account', 'employee', 'paymentItems.purchaseOrder'])
            ->whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true);

        if ($request->filled('vendor_id')) {
            $query->where('vendor_id', (int) $request->vendor_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('payment_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('payment_date', '<=', $request->to_date);
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('payment_date')->paginate(min(max((int) $request->get('per_page', 25), 1), 200)),
        ]);
    }

    public function createPayment(Request $request)
    {
        $validated = $request->validate([
            'resell_vendor_id' => 'required|exists:resell_vendors,id',
            'payment_method_id' => 'required|exists:payment_methods,id',
            'account_id' => 'nullable|exists:accounts,id',
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'required|date',
            'reference_number' => 'nullable|string|max:255',
            'transaction_id' => 'nullable|string|max:255',
            'cheque_number' => 'nullable|string|max:255',
            'cheque_date' => 'nullable|date',
            'bank_name' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'allocations' => 'required|array|min:1',
            'allocations.*.purchase_order_id' => 'required|integer|distinct|exists:purchase_orders,id',
            'allocations.*.amount' => 'required|numeric|min:0.01',
            'allocations.*.notes' => 'nullable|string',
        ]);

        $profile = ResellVendor::active()->findOrFail($validated['resell_vendor_id']);
        $totalAllocated = round((float) collect($validated['allocations'])->sum('amount'), 2);
        if (abs($totalAllocated - (float) $validated['amount']) > 0.001) {
            return response()->json(['success' => false, 'message' => 'Payment amount must exactly match the sum of PO allocations.'], 422);
        }

        $allocationPoIds = collect($validated['allocations'])->pluck('purchase_order_id')->map(fn ($id) => (int) $id);
        $eligiblePos = PurchaseOrder::where('vendor_id', $profile->vendor_id)
            ->where('metadata->resell', true)
            ->whereIn('id', $allocationPoIds)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->get()
            ->keyBy('id');
        if ($eligiblePos->count() !== $allocationPoIds->unique()->count()) {
            return response()->json(['success' => false, 'message' => 'Every allocation must belong to an active resell PO for this vendor.'], 422);
        }

        foreach ($validated['allocations'] as $allocation) {
            $po = $eligiblePos->get((int) $allocation['purchase_order_id']);
            if (!$po || (float) $allocation['amount'] > (float) $po->outstanding_amount + 0.001) {
                return response()->json([
                    'success' => false,
                    'message' => 'A PO allocation exceeds its current outstanding balance. Refresh the page and try again.',
                ], 422);
            }
        }

        DB::beginTransaction();
        try {
            $payment = VendorPayment::create([
                'payment_number' => VendorPayment::generatePaymentNumber(),
                'reference_number' => $validated['reference_number'] ?? null,
                'vendor_id' => $profile->vendor_id,
                'payment_method_id' => $validated['payment_method_id'],
                'account_id' => $validated['account_id'] ?? null,
                'employee_id' => auth()->id(),
                'amount' => $validated['amount'],
                'allocated_amount' => 0,
                'unallocated_amount' => $validated['amount'],
                'status' => 'pending',
                'payment_type' => 'purchase_order',
                'transaction_id' => $validated['transaction_id'] ?? null,
                'cheque_number' => $validated['cheque_number'] ?? null,
                'cheque_date' => $validated['cheque_date'] ?? null,
                'bank_name' => $validated['bank_name'] ?? null,
                'payment_date' => $validated['payment_date'],
                'notes' => $validated['notes'] ?? null,
                'metadata' => ['resell' => true, 'resell_vendor_id' => $profile->id],
            ]);

            $payment->allocateToPurchaseOrders($validated['allocations']);
            $payment->complete();
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Resell vendor payment recorded successfully.',
                'data' => $payment->load('vendor', 'paymentMethod', 'paymentItems.purchaseOrder'),
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Failed to record payment: ' . $e->getMessage()], 500);
        }
    }

    public function report(Request $request)
    {
        if ($denied = $this->requireAdmin()) {
            return $denied;
        }

        $rows = $this->buildProductReportRows($request);
        $rowsByVendor = $rows->groupBy('resell_vendor_id');

        $vendorProfileQuery = ResellVendor::with('vendor');
        if (!$request->boolean('include_inactive')) {
            $vendorProfileQuery->where('is_active', true);
        }
        if ($request->filled('resell_vendor_id')) {
            $vendorProfileQuery->whereKey((int) $request->resell_vendor_id);
        }
        if ($request->filled('vendor_id')) {
            $vendorProfileQuery->where('vendor_id', (int) $request->vendor_id);
        }
        if ($request->filled('search')) {
            $vendorProfileQuery->whereIn('id', $rows->pluck('resell_vendor_id')->unique());
        }

        $vendorRows = $vendorProfileQuery->get()->map(function (ResellVendor $profile) use ($rowsByVendor) {
            $vendorProducts = $rowsByVendor->get($profile->id, collect());
            return [
                'vendor_id' => $profile->vendor_id,
                'resell_vendor_id' => $profile->id,
                'vendor_name' => $profile->vendor?->name ?? 'Deleted Vendor',
                'product_count' => $vendorProducts->count(),
                'received_quantity' => (int) $vendorProducts->sum('received_quantity'),
                'stock_on_hand' => (int) $vendorProducts->sum('stock_on_hand'),
                'gross_units_sold' => (int) $vendorProducts->sum('gross_units_sold'),
                'returned_quantity' => (int) $vendorProducts->sum('returned_quantity'),
                'net_units_sold' => (int) $vendorProducts->sum('net_units_sold'),
                'net_sales' => round((float) $vendorProducts->sum('net_sales'), 2),
                'net_cogs' => round((float) $vendorProducts->sum('net_cogs'), 2),
                'gross_profit' => round((float) $vendorProducts->sum('gross_profit'), 2),
            ];
        })->values();

        $vendorIds = $vendorRows->pluck('vendor_id');
        $financials = PurchaseOrder::whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->selectRaw('vendor_id, COUNT(*) as po_count, SUM(total_amount) as total_po_value, SUM(paid_amount) as paid_amount, SUM(outstanding_amount) as outstanding_amount')
            ->groupBy('vendor_id')
            ->get()->keyBy('vendor_id');

        $vendorRows = $vendorRows->map(function ($row) use ($financials) {
            $financial = $financials->get($row['vendor_id']);
            $row['po_count'] = (int) ($financial->po_count ?? 0);
            $row['total_po_value'] = round((float) ($financial->total_po_value ?? 0), 2);
            $row['paid_amount'] = round((float) ($financial->paid_amount ?? 0), 2);
            $row['outstanding_amount'] = round((float) ($financial->outstanding_amount ?? 0), 2);
            return $row;
        });

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'vendors' => $vendorRows->count(),
                    'products' => $rows->count(),
                    'received_quantity' => (int) $rows->sum('received_quantity'),
                    'stock_on_hand' => (int) $rows->sum('stock_on_hand'),
                    'gross_units_sold' => (int) $rows->sum('gross_units_sold'),
                    'returned_quantity' => (int) $rows->sum('returned_quantity'),
                    'net_units_sold' => (int) $rows->sum('net_units_sold'),
                    'net_sales' => round((float) $rows->sum('net_sales'), 2),
                    'net_cogs' => round((float) $rows->sum('net_cogs'), 2),
                    'gross_profit' => round((float) $rows->sum('gross_profit'), 2),
                    'outstanding_amount' => round((float) $vendorRows->sum('outstanding_amount'), 2),
                ],
                'vendors' => $vendorRows,
                'products' => $rows->values(),
                'rules' => [
                    'deleted_offline_sales' => 'Excluded using orders.deleted_at.',
                    'cancelled_online_orders' => 'Excluded using order status.',
                    'returns' => 'Approved/processing/completed/refunded return quantities and values are subtracted.',
                    'exchanges' => 'Returned items are subtracted and the replacement order is counted as a new valid sale.',
                    'cogs' => 'Uses order_items.cogs; falls back to the sold batch cost when needed.',
                ],
            ],
        ]);
    }

    private function buildProductReportRows(Request $request): Collection
    {
        $tagQuery = ResellProduct::with(['product.category', 'resellVendor.vendor'])
            ->whereHas('resellVendor');

        if (!$request->boolean('include_inactive')) {
            $tagQuery->where('is_active', true)->whereHas('resellVendor', fn ($q) => $q->where('is_active', true));
        }
        if ($request->filled('resell_vendor_id')) {
            $tagQuery->where('resell_vendor_id', (int) $request->resell_vendor_id);
        }
        if ($request->filled('vendor_id')) {
            $tagQuery->whereHas('resellVendor', fn ($q) => $q->where('vendor_id', (int) $request->vendor_id));
        }
        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $tagQuery->whereHas('product', function ($query) use ($search) {
                $this->whereAnyLike($query, ['name', 'sku', 'brand'], $search);
            });
        }

        $tags = $tagQuery->get();
        if ($tags->isEmpty()) {
            return collect();
        }

        $productIds = $tags->pluck('product_id')->unique()->values();

        $stock = DB::table('product_batches')
            ->whereIn('product_id', $productIds)
            ->selectRaw('product_id, SUM(quantity) as stock_on_hand, SUM(quantity * cost_price) as stock_cost_value')
            ->groupBy('product_id')->get()->keyBy('product_id');

        $poQuery = DB::table('purchase_order_items as poi')
            ->join('purchase_orders as po', 'poi.purchase_order_id', '=', 'po.id')
            ->whereIn('poi.product_id', $productIds)
            ->where('po.metadata->resell', true)
            ->whereNotIn('po.status', ['cancelled', 'returned']);
        $this->applyDateRange($poQuery, $request, 'po.order_date');
        $poStats = $poQuery->selectRaw('poi.product_id, SUM(poi.quantity_ordered) as ordered_quantity, SUM(poi.quantity_received) as received_quantity, SUM(poi.quantity_received * poi.unit_cost) as received_cost, MAX(COALESCE(po.actual_delivery_date, po.received_at, po.order_date)) as last_received_at')
            ->groupBy('poi.product_id')->get()->keyBy('product_id');

        $salesQuery = DB::table('order_items as oi')
            ->join('orders as o', 'oi.order_id', '=', 'o.id')
            ->leftJoin('product_batches as pb', 'oi.product_batch_id', '=', 'pb.id')
            ->whereIn('oi.product_id', $productIds)
            ->whereNull('o.deleted_at')
            ->whereNotIn('o.status', self::EXCLUDED_SALE_STATUSES);
        $this->applyDateRange($salesQuery, $request, 'o.order_date');
        $sales = $salesQuery->selectRaw('oi.product_id, SUM(oi.quantity) as gross_units_sold, SUM(oi.total_amount) as gross_sales, SUM(COALESCE(oi.cogs, COALESCE(pb.cost_price, 0) * oi.quantity)) as gross_cogs, COUNT(DISTINCT o.id) as order_count, MAX(o.order_date) as last_sale_at')
            ->groupBy('oi.product_id')->get()->keyBy('product_id');

        $returnQuery = ProductReturn::query()
            ->with('order')
            ->whereIn('status', self::RETURNED_STATUSES)
            ->whereHas('order', function ($query) {
                $query->whereNull('deleted_at')->whereNotIn('status', self::EXCLUDED_SALE_STATUSES);
            });
        if ($request->filled('from_date')) {
            $returnQuery->whereDate('return_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $returnQuery->whereDate('return_date', '<=', $request->to_date);
        }
        $returns = $returnQuery->get();

        $returnItems = collect();
        foreach ($returns as $return) {
            foreach (($return->return_items ?? []) as $item) {
                $productId = (int) ($item['product_id'] ?? 0);
                if (!$productIds->contains($productId)) {
                    continue;
                }
                $returnItems->push([
                    'product_id' => $productId,
                    'order_item_id' => isset($item['order_item_id']) ? (int) $item['order_item_id'] : null,
                    'product_batch_id' => isset($item['product_batch_id']) ? (int) $item['product_batch_id'] : null,
                    'quantity' => (int) ($item['quantity'] ?? 0),
                    'value' => (float) ($item['total_price'] ?? ((float) ($item['unit_price'] ?? 0) * (int) ($item['quantity'] ?? 0))),
                ]);
            }
        }

        $orderItemIds = $returnItems->pluck('order_item_id')->filter()->unique()->values();
        $orderItems = OrderItem::with('batch')->whereIn('id', $orderItemIds)->get()->keyBy('id');
        $returnBatchIds = $returnItems->pluck('product_batch_id')->filter()->unique()->values();
        $returnBatchCosts = DB::table('product_batches')->whereIn('id', $returnBatchIds)->pluck('cost_price', 'id');
        $returnStats = $returnItems->groupBy('product_id')->map(function (Collection $items) use ($orderItems, $returnBatchCosts) {
            $returnedCogs = 0.0;
            foreach ($items as $item) {
                $orderItem = $item['order_item_id'] ? $orderItems->get($item['order_item_id']) : null;
                $unitCogs = 0.0;
                if ($orderItem) {
                    $unitCogs = (float) ($orderItem->cogs ?? 0) / max(1, (int) $orderItem->quantity);
                    if ($unitCogs <= 0 && $orderItem->batch) {
                        $unitCogs = (float) $orderItem->batch->cost_price;
                    }
                }
                if ($unitCogs <= 0 && $item['product_batch_id']) {
                    $unitCogs = (float) ($returnBatchCosts[$item['product_batch_id']] ?? 0);
                }
                $returnedCogs += $unitCogs * (int) $item['quantity'];
            }
            return [
                'returned_quantity' => (int) $items->sum('quantity'),
                'returned_sales' => round((float) $items->sum('value'), 2),
                'returned_cogs' => round($returnedCogs, 2),
            ];
        });

        return $tags->map(function (ResellProduct $tag) use ($stock, $poStats, $sales, $returnStats) {
            $product = $tag->product;
            $vendor = optional($tag->resellVendor)->vendor;
            $stockRow = $stock->get($tag->product_id);
            $po = $poStats->get($tag->product_id);
            $sale = $sales->get($tag->product_id);
            $returned = $returnStats->get($tag->product_id, [
                'returned_quantity' => 0,
                'returned_sales' => 0,
                'returned_cogs' => 0,
            ]);

            $grossQty = (int) ($sale->gross_units_sold ?? 0);
            $grossSales = (float) ($sale->gross_sales ?? 0);
            $grossCogs = (float) ($sale->gross_cogs ?? 0);
            $netQty = max(0, $grossQty - (int) $returned['returned_quantity']);
            $netSales = max(0, $grossSales - (float) $returned['returned_sales']);
            $netCogs = max(0, $grossCogs - (float) $returned['returned_cogs']);

            return [
                'resell_product_id' => $tag->id,
                'resell_vendor_id' => $tag->resell_vendor_id,
                'vendor_id' => optional($tag->resellVendor)->vendor_id,
                'vendor_name' => $vendor->name ?? 'Unknown Vendor',
                'product_id' => $tag->product_id,
                'product_name' => $product->name ?? 'Deleted Product',
                'sku' => $product->sku ?? null,
                'brand' => $product->brand ?? null,
                'category' => optional($product->category)->name,
                'is_active' => $tag->is_active,
                'ordered_quantity' => (int) ($po->ordered_quantity ?? 0),
                'received_quantity' => (int) ($po->received_quantity ?? 0),
                'received_cost' => round((float) ($po->received_cost ?? 0), 2),
                'stock_on_hand' => (int) ($stockRow->stock_on_hand ?? 0),
                'stock_cost_value' => round((float) ($stockRow->stock_cost_value ?? 0), 2),
                'order_count' => (int) ($sale->order_count ?? 0),
                'gross_units_sold' => $grossQty,
                'gross_sales' => round($grossSales, 2),
                'gross_cogs' => round($grossCogs, 2),
                'returned_quantity' => (int) $returned['returned_quantity'],
                'returned_sales' => round((float) $returned['returned_sales'], 2),
                'returned_cogs' => round((float) $returned['returned_cogs'], 2),
                'net_units_sold' => $netQty,
                'net_sales' => round($netSales, 2),
                'net_cogs' => round($netCogs, 2),
                'gross_profit' => round($netSales - $netCogs, 2),
                'margin_percent' => $netSales > 0 ? round((($netSales - $netCogs) / $netSales) * 100, 2) : 0,
                'sell_through_percent' => (int) ($po->received_quantity ?? 0) > 0
                    ? round(($netQty / (int) $po->received_quantity) * 100, 2)
                    : 0,
                'last_received_at' => $po->last_received_at ?? null,
                'last_sale_at' => $sale->last_sale_at ?? null,
            ];
        })->sortByDesc('net_sales')->values();
    }

    private function requireAdmin()
    {
        $user = request()->user();
        if (!$user || !in_array($user->role?->slug, ['super-admin', 'admin'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Admin access is required for this resell operation.',
            ], 403);
        }

        return null;
    }

    private function applyDateRange($query, Request $request, string $column): void
    {
        if ($request->filled('from_date')) {
            $query->whereDate($column, '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate($column, '<=', $request->to_date);
        }
    }
}
