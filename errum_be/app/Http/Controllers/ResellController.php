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
use App\Models\VendorPaymentItem;
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
        $activeProfiles = ResellVendor::active()->get(['id', 'vendor_id']);
        $vendorIds = $activeProfiles->pluck('vendor_id');
        $resellVendorIds = $activeProfiles->pluck('id');

        // Settlement is intentionally all-time and includes historical/inactive product tags.
        // A product may be untagged after its stock is cleared, but an unpaid sold-cost liability
        // must not disappear from the vendor balance.
        $settlementRequest = Request::create('/', 'GET', ['include_inactive' => true]);
        $settlementRows = $this->buildProductReportRows($settlementRequest)
            ->whereIn('resell_vendor_id', $resellVendorIds);
        $paymentStats = $this->resellPaymentStats($vendorIds);
        $vendorEarned = round((float) $settlementRows->sum('net_cogs'), 2);
        $paidAmount = round((float) $paymentStats->sum('paid_amount'), 2);
        $vendorDue = round(max(0, $vendorEarned - $paidAmount), 2);

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
                'stock_cost_value' => round((float) $rows->sum('stock_cost_value'), 2),
                'net_units_sold' => (int) $rows->sum('net_units_sold'),
                'net_sales' => round((float) $rows->sum('net_sales'), 2),
                'cogs' => round((float) $rows->sum('net_cogs'), 2),
                'gross_profit' => round((float) $rows->sum('gross_profit'), 2),
                'vendor_earned' => $vendorEarned,
                'paid_amount' => $paidAmount,
                'outstanding' => $vendorDue,
                'vendor_due' => $vendorDue,
                'overpaid_amount' => round(max(0, $paidAmount - $vendorEarned), 2),
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
        $profileIds = $profiles->pluck('id');

        $poStats = PurchaseOrder::whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->selectRaw('vendor_id, COUNT(*) as po_count, SUM(total_amount) as po_value')
            ->groupBy('vendor_id')
            ->get()
            ->keyBy('vendor_id');

        $settlementRequest = Request::create('/', 'GET', ['include_inactive' => true]);
        $settlementRows = $this->buildProductReportRows($settlementRequest)
            ->whereIn('resell_vendor_id', $profileIds)
            ->groupBy('resell_vendor_id');
        $paymentStats = $this->resellPaymentStats($vendorIds);

        $data = $profiles->map(function (ResellVendor $profile) use ($poStats, $settlementRows, $paymentStats) {
            $stats = $poStats->get($profile->vendor_id);
            $productRows = $settlementRows->get($profile->id, collect());
            $payments = $paymentStats->get($profile->vendor_id);
            $vendorEarned = round((float) $productRows->sum('net_cogs'), 2);
            $paidAmount = round((float) ($payments->paid_amount ?? 0), 2);
            $vendorDue = round(max(0, $vendorEarned - $paidAmount), 2);
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
                'received_quantity' => (int) $productRows->sum('received_quantity'),
                'stock_on_hand' => (int) $productRows->sum('stock_on_hand'),
                'stock_cost_value' => round((float) $productRows->sum('stock_cost_value'), 2),
                'net_units_sold' => (int) $productRows->sum('net_units_sold'),
                'vendor_earned' => $vendorEarned,
                'paid_amount' => $paidAmount,
                // Keep outstanding_amount as a compatibility alias for older clients.
                'outstanding_amount' => $vendorDue,
                'vendor_due' => $vendorDue,
                'overpaid_amount' => round(max(0, $paidAmount - $vendorEarned), 2),
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

        $settlement = $this->currentVendorSettlement($profile);
        if ($openPoExists || $settlement['vendor_due'] > 0.001) {
            return response()->json([
                'success' => false,
                'message' => 'This vendor still has open purchase orders or unpaid sold-item cost.',
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
        $metrics = $this->buildProductReportRows($request)->keyBy('product_id');

        $rows->getCollection()->transform(function (ResellProduct $tag) use ($metrics) {
            $data = $tag->toArray();
            $row = $metrics->get($tag->product_id);
            $data['received_quantity'] = (int) ($row['received_quantity'] ?? 0);
            $data['stock_on_hand'] = (int) ($row['stock_on_hand'] ?? 0);
            $data['stock_cost_value'] = round((float) ($row['stock_cost_value'] ?? 0), 2);
            $data['net_units_sold'] = (int) ($row['net_units_sold'] ?? 0);
            $data['net_sales'] = round((float) ($row['net_sales'] ?? 0), 2);
            $data['vendor_earned'] = round((float) ($row['net_cogs'] ?? 0), 2);
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
        if ($request->filled('search')) {
            $this->whereLike($query, 'po_number', (string) $request->search);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('order_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('order_date', '<=', $request->to_date);
        }

        $purchaseOrders = $query->orderByDesc('created_at')->get();
        $settlements = $this->buildPoSettlementRows($purchaseOrders)->keyBy('purchase_order_id');

        $data = $purchaseOrders->map(function (PurchaseOrder $po) use ($settlements) {
            $settlement = $settlements->get($po->id, []);
            $orderedCost = $po->items->sum(fn (PurchaseOrderItem $item) => (int) $item->quantity_ordered * (float) $item->unit_cost);
            $receivedCost = $po->items->sum(fn (PurchaseOrderItem $item) => (int) $item->quantity_received * (float) $item->unit_cost);

            $row = $po->toArray();
            $row['received_cost_value'] = round((float) $receivedCost, 2);
            $row['consignment_value'] = round((float) $orderedCost, 2);
            $row['received_quantity'] = (int) ($settlement['received_quantity'] ?? 0);
            $row['gross_units_sold'] = (int) ($settlement['gross_units_sold'] ?? 0);
            $row['returned_quantity'] = (int) ($settlement['returned_quantity'] ?? 0);
            $row['net_units_sold'] = (int) ($settlement['net_units_sold'] ?? 0);
            $row['stock_on_hand'] = (int) ($settlement['stock_on_hand'] ?? 0);
            $row['stock_cost_value'] = round((float) ($settlement['stock_cost_value'] ?? 0), 2);
            $row['sold_cost'] = round((float) ($settlement['sold_cost'] ?? 0), 2);
            $row['vendor_earned'] = $row['sold_cost'];
            $row['resell_paid_amount'] = round((float) ($settlement['paid_amount'] ?? 0), 2);
            $row['vendor_due'] = round((float) ($settlement['vendor_due'] ?? 0), 2);
            $row['resell_payment_status'] = $settlement['payment_status'] ?? 'not_due';
            // Resell clients must never interpret the normal PO payment columns as the consignment settlement.
            $row['payment_status'] = $row['resell_payment_status'];
            return $row;
        });

        if ($request->filled('payment_status')) {
            $wanted = strtolower((string) $request->payment_status);
            if ($wanted === 'partial') {
                $wanted = 'partially_paid';
            }
            $data = $data->filter(fn ($row) => strtolower((string) $row['resell_payment_status']) === $wanted)->values();
        }

        $perPage = min(max((int) $request->get('per_page', 25), 1), 200);
        $page = max((int) $request->get('page', 1), 1);
        $paginator = new \Illuminate\Pagination\LengthAwarePaginator(
            $data->forPage($page, $perPage)->values(),
            $data->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        return response()->json(['success' => true, 'data' => $paginator]);
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
        ]);

        DB::beginTransaction();
        try {
            $profile = ResellVendor::active()
                ->whereKey($validated['resell_vendor_id'])
                ->lockForUpdate()
                ->first();
            if (!$profile) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'The selected resell vendor is not active.'], 422);
            }

            $settlement = $this->currentVendorSettlement($profile);
            $amount = round((float) $validated['amount'], 2);
            if ($amount > $settlement['vendor_due'] + 0.001) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Payment cannot exceed the vendor due from sold resell items.',
                    'data' => $settlement,
                ], 422);
            }

            $purchaseOrders = PurchaseOrder::with('items')
                ->where('vendor_id', $profile->vendor_id)
                ->where('metadata->resell', true)
                ->orderBy('order_date')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            $poRows = $this->buildPoSettlementRows($purchaseOrders)
                ->sortBy(fn ($row) => sprintf('%s-%020d', $row['order_date'] ?? '', $row['purchase_order_id']))
                ->values();

            $payment = VendorPayment::create([
                'payment_number' => VendorPayment::generatePaymentNumber(),
                'reference_number' => $validated['reference_number'] ?? null,
                'vendor_id' => $profile->vendor_id,
                'payment_method_id' => $validated['payment_method_id'],
                'account_id' => $validated['account_id'] ?? null,
                'employee_id' => auth()->id(),
                'amount' => $amount,
                'allocated_amount' => $amount,
                'unallocated_amount' => 0,
                'status' => 'pending',
                'payment_type' => 'purchase_order',
                'transaction_id' => $validated['transaction_id'] ?? null,
                'cheque_number' => $validated['cheque_number'] ?? null,
                'cheque_date' => $validated['cheque_date'] ?? null,
                'bank_name' => $validated['bank_name'] ?? null,
                'payment_date' => $validated['payment_date'],
                'notes' => $validated['notes'] ?? null,
                'metadata' => [
                    'resell' => true,
                    'resell_vendor_id' => $profile->id,
                    'settlement_basis' => 'net_sold_po_cost',
                    'allocation_method' => 'fifo_po_due',
                    'vendor_earned_before' => $settlement['vendor_earned'],
                    'vendor_due_before' => $settlement['vendor_due'],
                    'vendor_due_after' => round(max(0, $settlement['vendor_due'] - $amount), 2),
                ],
            ]);

            $remaining = $amount;
            foreach ($poRows as $poRow) {
                if ($remaining <= 0.001) {
                    break;
                }
                $due = round((float) ($poRow['vendor_due'] ?? 0), 2);
                if ($due <= 0) {
                    continue;
                }

                $allocation = round(min($remaining, $due), 2);
                VendorPaymentItem::create([
                    'vendor_payment_id' => $payment->id,
                    'purchase_order_id' => $poRow['purchase_order_id'],
                    'allocated_amount' => $allocation,
                    'po_total_at_payment' => $poRow['sold_cost'],
                    'po_outstanding_before' => $due,
                    'po_outstanding_after' => round(max(0, $due - $allocation), 2),
                    'allocation_type' => $allocation + 0.001 >= $due ? 'full' : 'partial',
                    'notes' => 'Automatic FIFO allocation of resell sold-cost liability.',
                    'metadata' => [
                        'resell' => true,
                        'settlement_basis' => 'net_sold_po_cost',
                    ],
                ]);
                $remaining = round($remaining - $allocation, 2);
            }

            if ($remaining > 0.001) {
                throw new \RuntimeException('Could not allocate the full payment to current resell PO liabilities. Refresh and retry.');
            }

            $payment->complete();
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Resell vendor payment recorded and allocated to sold-item PO liabilities.',
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
                'received_cost' => round((float) $vendorProducts->sum('received_cost'), 2),
                'stock_on_hand' => (int) $vendorProducts->sum('stock_on_hand'),
                'stock_cost_value' => round((float) $vendorProducts->sum('stock_cost_value'), 2),
                'gross_units_sold' => (int) $vendorProducts->sum('gross_units_sold'),
                'returned_quantity' => (int) $vendorProducts->sum('returned_quantity'),
                'net_units_sold' => (int) $vendorProducts->sum('net_units_sold'),
                'net_sales' => round((float) $vendorProducts->sum('net_sales'), 2),
                'net_cogs' => round((float) $vendorProducts->sum('net_cogs'), 2),
                'vendor_earned' => round((float) $vendorProducts->sum('net_cogs'), 2),
                'gross_profit' => round((float) $vendorProducts->sum('gross_profit'), 2),
            ];
        })->values();

        $vendorIds = $vendorRows->pluck('vendor_id');
        $financials = PurchaseOrder::whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->selectRaw('vendor_id, COUNT(*) as po_count, SUM(total_amount) as total_po_value')
            ->groupBy('vendor_id')
            ->get()->keyBy('vendor_id');
        $paymentStats = $this->resellPaymentStats($vendorIds, $request);

        $vendorRows = $vendorRows->map(function ($row) use ($financials, $paymentStats) {
            $financial = $financials->get($row['vendor_id']);
            $payments = $paymentStats->get($row['vendor_id']);
            $paidAmount = round((float) ($payments->paid_amount ?? 0), 2);
            $vendorEarned = round((float) $row['vendor_earned'], 2);
            $vendorDue = round(max(0, $vendorEarned - $paidAmount), 2);
            $row['po_count'] = (int) ($financial->po_count ?? 0);
            $row['total_po_value'] = round((float) ($financial->total_po_value ?? 0), 2);
            $row['paid_amount'] = $paidAmount;
            $row['vendor_due'] = $vendorDue;
            $row['overpaid_amount'] = round(max(0, $paidAmount - $vendorEarned), 2);
            // Compatibility alias for older report clients.
            $row['outstanding_amount'] = $vendorDue;
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
                    'stock_cost_value' => round((float) $rows->sum('stock_cost_value'), 2),
                    'gross_units_sold' => (int) $rows->sum('gross_units_sold'),
                    'returned_quantity' => (int) $rows->sum('returned_quantity'),
                    'net_units_sold' => (int) $rows->sum('net_units_sold'),
                    'net_sales' => round((float) $rows->sum('net_sales'), 2),
                    'net_cogs' => round((float) $rows->sum('net_cogs'), 2),
                    'vendor_earned' => round((float) $vendorRows->sum('vendor_earned'), 2),
                    'paid_amount' => round((float) $vendorRows->sum('paid_amount'), 2),
                    'gross_profit' => round((float) $rows->sum('gross_profit'), 2),
                    'outstanding_amount' => round((float) $vendorRows->sum('vendor_due'), 2),
                    'vendor_due' => round((float) $vendorRows->sum('vendor_due'), 2),
                    'overpaid_amount' => round((float) $vendorRows->sum('overpaid_amount'), 2),
                ],
                'vendors' => $vendorRows,
                'products' => $rows->values(),
                'rules' => [
                    'deleted_offline_sales' => 'Excluded using orders.deleted_at.',
                    'cancelled_online_orders' => 'Excluded using order status.',
                    'returns' => 'Approved/processing/completed/refunded return quantities and values are subtracted.',
                    'exchanges' => 'Returned items are subtracted and the replacement order is counted as a new valid sale.',
                    'cogs' => 'Resell COGS uses the original source purchase-order item cost for each sold unit.',
                    'vendor_payable' => 'Vendor payable is net sold source-PO cost minus completed resell vendor payments. Unsold consignment inventory cost is tracked separately and is not payable.',
                ],
            ],
        ]);
    }

    private function buildProductReportRows(Request $request): Collection
    {
        $tagQuery = ResellProduct::with(['product.category', 'resellVendor.vendor'])->whereHas('resellVendor');
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

        $vendorIds = $tags->pluck('resellVendor.vendor_id')->filter()->unique()->values();
        $productIds = $tags->pluck('product_id')->unique()->values();
        $poQuery = PurchaseOrder::with(['items' => fn ($q) => $q->whereIn('product_id', $productIds)])
            ->whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true);
        if ($request->filled('from_date')) {
            $poQuery->whereDate('order_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $poQuery->whereDate('order_date', '<=', $request->to_date);
        }
        $purchaseOrders = $poQuery->get()->filter(fn (PurchaseOrder $po) => $po->items->isNotEmpty())->values();
        $poRows = $this->buildPoSettlementRows($purchaseOrders, $request);

        $itemRows = $poRows->flatMap(fn ($poRow) => collect($poRow['items'] ?? []));
        $byProduct = $itemRows->groupBy('product_id');

        return $tags->map(function (ResellProduct $tag) use ($byProduct) {
            $product = $tag->product;
            $vendor = optional($tag->resellVendor)->vendor;
            $rows = $byProduct->get($tag->product_id, collect());
            $received = (int) $rows->sum('received_quantity');
            $netSales = round((float) $rows->sum('net_sales'), 2);
            $netCogs = round((float) $rows->sum('net_cogs'), 2);

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
                'ordered_quantity' => (int) $rows->sum('ordered_quantity'),
                'received_quantity' => $received,
                'received_cost' => round((float) $rows->sum('received_cost'), 2),
                'stock_on_hand' => (int) $rows->sum('stock_on_hand'),
                'stock_cost_value' => round((float) $rows->sum('stock_cost_value'), 2),
                'order_count' => (int) $rows->sum('order_count'),
                'gross_units_sold' => (int) $rows->sum('gross_units_sold'),
                'gross_sales' => round((float) $rows->sum('gross_sales'), 2),
                'gross_cogs' => round((float) $rows->sum('gross_cogs'), 2),
                'returned_quantity' => (int) $rows->sum('returned_quantity'),
                'returned_sales' => round((float) $rows->sum('returned_sales'), 2),
                'returned_cogs' => round((float) $rows->sum('returned_cogs'), 2),
                'net_units_sold' => (int) $rows->sum('net_units_sold'),
                'net_sales' => $netSales,
                'net_cogs' => $netCogs,
                'gross_profit' => round($netSales - $netCogs, 2),
                'margin_percent' => $netSales > 0 ? round((($netSales - $netCogs) / $netSales) * 100, 2) : 0,
                'sell_through_percent' => $received > 0 ? round(((int) $rows->sum('net_units_sold') / $received) * 100, 2) : 0,
                'last_received_at' => $rows->pluck('last_received_at')->filter()->max(),
                'last_sale_at' => $rows->pluck('last_sale_at')->filter()->max(),
            ];
        })->sortByDesc('net_sales')->values();
    }

    private function buildPoSettlementRows(Collection $purchaseOrders, ?Request $request = null): Collection
    {
        if ($purchaseOrders->isEmpty()) {
            return collect();
        }

        $purchaseOrders->loadMissing('items');
        $poIds = $purchaseOrders->pluck('id')->map(fn ($id) => (int) $id)->values();
        $items = $purchaseOrders->flatMap(fn (PurchaseOrder $po) => $po->items)->keyBy('id');
        $itemIds = $items->keys()->map(fn ($id) => (int) $id)->values();

        $stock = DB::table('product_batches')
            ->whereIn('source_purchase_order_id', $poIds)
            ->whereIn('source_purchase_order_item_id', $itemIds)
            ->selectRaw('source_purchase_order_id, source_purchase_order_item_id, SUM(quantity) as stock_on_hand')
            ->groupBy('source_purchase_order_id', 'source_purchase_order_item_id')
            ->get()
            ->keyBy(fn ($row) => $row->source_purchase_order_id . ':' . $row->source_purchase_order_item_id);

        $salesQuery = DB::table('order_items as oi')
            ->join('orders as o', 'oi.order_id', '=', 'o.id')
            ->leftJoin('product_batches as pb', 'oi.product_batch_id', '=', 'pb.id')
            ->leftJoin('product_barcodes as pbc', 'oi.product_barcode_id', '=', 'pbc.id')
            ->whereNull('o.deleted_at')
            ->whereNotIn('o.status', self::EXCLUDED_SALE_STATUSES)
            ->where(function ($query) use ($poIds) {
                $query->whereIn('pbc.source_purchase_order_id', $poIds)
                    ->orWhereIn('pb.source_purchase_order_id', $poIds);
            });
        if ($request) {
            $this->applyDateRange($salesQuery, $request, 'o.order_date');
        }
        $saleLines = $salesQuery->get([
            'oi.id as order_item_id', 'oi.order_id', 'oi.product_id', 'oi.quantity', 'oi.total_amount',
            'o.order_date',
            'pbc.source_purchase_order_id as barcode_po_id',
            'pbc.source_purchase_order_item_id as barcode_po_item_id',
            'pb.source_purchase_order_id as batch_po_id',
            'pb.source_purchase_order_item_id as batch_po_item_id',
        ]);

        $sales = $saleLines->map(function ($row) {
            $row->source_purchase_order_id = (int) ($row->barcode_po_id ?: $row->batch_po_id ?: 0);
            $row->source_purchase_order_item_id = (int) ($row->barcode_po_item_id ?: $row->batch_po_item_id ?: 0);
            return $row;
        })->filter(fn ($row) => $row->source_purchase_order_id > 0 && $row->source_purchase_order_item_id > 0)
            ->groupBy(fn ($row) => $row->source_purchase_order_id . ':' . $row->source_purchase_order_item_id)
            ->map(function (Collection $rows) {
                return [
                    'gross_units_sold' => (int) $rows->sum('quantity'),
                    'gross_sales' => round((float) $rows->sum('total_amount'), 2),
                    'order_count' => $rows->pluck('order_id')->unique()->count(),
                    'last_sale_at' => $rows->pluck('order_date')->filter()->max(),
                ];
            });

        $returnQuery = ProductReturn::query()
            ->with('order')
            ->whereIn('status', self::RETURNED_STATUSES)
            ->whereHas('order', function ($query) {
                $query->whereNull('deleted_at')->whereNotIn('status', self::EXCLUDED_SALE_STATUSES);
            });
        if ($request) {
            $this->applyDateRange($returnQuery, $request, 'return_date');
        }
        $returns = $returnQuery->get();
        $returnItems = collect();
        foreach ($returns as $return) {
            foreach (($return->return_items ?? []) as $item) {
                $returnItems->push([
                    'order_item_id' => isset($item['order_item_id']) ? (int) $item['order_item_id'] : null,
                    'product_batch_id' => isset($item['product_batch_id']) ? (int) $item['product_batch_id'] : null,
                    'returned_barcode_ids' => array_values(array_filter(array_map('intval', (array) ($item['returned_barcode_ids'] ?? [])))),
                    'quantity' => (int) ($item['quantity'] ?? 0),
                    'value' => (float) ($item['total_price'] ?? ((float) ($item['unit_price'] ?? 0) * (int) ($item['quantity'] ?? 0))),
                ]);
            }
        }

        $returnOrderItemIds = $returnItems->pluck('order_item_id')->filter()->unique()->values();
        $returnOrderItems = collect();
        if ($returnOrderItemIds->isNotEmpty()) {
            $returnOrderItems = DB::table('order_items as oi')
                ->leftJoin('product_batches as pb', 'oi.product_batch_id', '=', 'pb.id')
                ->leftJoin('product_barcodes as pbc', 'oi.product_barcode_id', '=', 'pbc.id')
                ->whereIn('oi.id', $returnOrderItemIds)
                ->get([
                    'oi.id',
                    'pbc.source_purchase_order_id as barcode_po_id', 'pbc.source_purchase_order_item_id as barcode_po_item_id',
                    'pb.source_purchase_order_id as batch_po_id', 'pb.source_purchase_order_item_id as batch_po_item_id',
                ])->keyBy('id');
        }
        $returnBatchIds = $returnItems->pluck('product_batch_id')->filter()->unique()->values();
        $returnBatches = $returnBatchIds->isEmpty() ? collect() : DB::table('product_batches')->whereIn('id', $returnBatchIds)->get(['id', 'source_purchase_order_id', 'source_purchase_order_item_id'])->keyBy('id');
        $returnBarcodeIds = $returnItems->flatMap(fn ($item) => $item['returned_barcode_ids'])->unique()->values();
        $returnBarcodes = $returnBarcodeIds->isEmpty() ? collect() : DB::table('product_barcodes')->whereIn('id', $returnBarcodeIds)->get(['id', 'source_purchase_order_id', 'source_purchase_order_item_id'])->keyBy('id');

        $returnStats = collect();
        foreach ($returnItems as $item) {
            $sourcePoId = 0;
            $sourceItemId = 0;
            foreach ($item['returned_barcode_ids'] as $barcodeId) {
                $barcode = $returnBarcodes->get($barcodeId);
                if ($barcode?->source_purchase_order_id) {
                    $sourcePoId = (int) $barcode->source_purchase_order_id;
                    $sourceItemId = (int) $barcode->source_purchase_order_item_id;
                    break;
                }
            }
            if (!$sourcePoId && $item['order_item_id']) {
                $orderItem = $returnOrderItems->get($item['order_item_id']);
                if ($orderItem) {
                    $sourcePoId = (int) ($orderItem->barcode_po_id ?: $orderItem->batch_po_id ?: 0);
                    $sourceItemId = (int) ($orderItem->barcode_po_item_id ?: $orderItem->batch_po_item_id ?: 0);
                }
            }
            if (!$sourcePoId && $item['product_batch_id']) {
                $batch = $returnBatches->get($item['product_batch_id']);
                if ($batch) {
                    $sourcePoId = (int) ($batch->source_purchase_order_id ?? 0);
                    $sourceItemId = (int) ($batch->source_purchase_order_item_id ?? 0);
                }
            }
            if (!$poIds->contains($sourcePoId) || !$items->has($sourceItemId)) {
                continue;
            }

            $key = $sourcePoId . ':' . $sourceItemId;
            $current = $returnStats->get($key, ['returned_quantity' => 0, 'returned_sales' => 0.0]);
            $current['returned_quantity'] += max(0, (int) $item['quantity']);
            $current['returned_sales'] += max(0, (float) $item['value']);
            $returnStats->put($key, $current);
        }

        $actualPaid = DB::table('vendor_payment_items as vpi')
            ->join('vendor_payments as vp', 'vpi.vendor_payment_id', '=', 'vp.id')
            ->whereIn('vpi.purchase_order_id', $poIds)
            ->where('vp.metadata->resell', true)
            ->where('vp.status', 'completed')
            ->where('vp.payment_type', '!=', 'refund')
            ->selectRaw('vpi.purchase_order_id, SUM(vpi.allocated_amount) as paid_amount')
            ->groupBy('vpi.purchase_order_id')
            ->pluck('paid_amount', 'vpi.purchase_order_id');

        $rows = $purchaseOrders->map(function (PurchaseOrder $po) use ($stock, $sales, $returnStats, $actualPaid) {
            $itemRows = $po->items->map(function (PurchaseOrderItem $item) use ($po, $stock, $sales, $returnStats) {
                $key = $po->id . ':' . $item->id;
                $stockRow = $stock->get($key);
                $sale = $sales->get($key, []);
                $returned = $returnStats->get($key, ['returned_quantity' => 0, 'returned_sales' => 0]);
                $grossQty = (int) ($sale['gross_units_sold'] ?? 0);
                $returnedQty = min($grossQty, (int) $returned['returned_quantity']);
                $netQty = max(0, $grossQty - $returnedQty);
                $unitCost = (float) $item->unit_cost;
                $grossSales = (float) ($sale['gross_sales'] ?? 0);
                $returnedSales = min($grossSales, (float) $returned['returned_sales']);
                $netSales = max(0, $grossSales - $returnedSales);
                $stockQty = max(0, (int) ($stockRow->stock_on_hand ?? 0));

                return [
                    'purchase_order_id' => $po->id,
                    'purchase_order_item_id' => $item->id,
                    'product_id' => $item->product_id,
                    'product_name' => $item->product_name,
                    'product_sku' => $item->product_sku,
                    'unit_cost' => round($unitCost, 2),
                    'ordered_quantity' => (int) $item->quantity_ordered,
                    'received_quantity' => (int) $item->quantity_received,
                    'received_cost' => round((int) $item->quantity_received * $unitCost, 2),
                    'stock_on_hand' => $stockQty,
                    'stock_cost_value' => round($stockQty * $unitCost, 2),
                    'gross_units_sold' => $grossQty,
                    'returned_quantity' => $returnedQty,
                    'net_units_sold' => $netQty,
                    'gross_sales' => round($grossSales, 2),
                    'returned_sales' => round($returnedSales, 2),
                    'net_sales' => round($netSales, 2),
                    'gross_cogs' => round($grossQty * $unitCost, 2),
                    'returned_cogs' => round($returnedQty * $unitCost, 2),
                    'net_cogs' => round($netQty * $unitCost, 2),
                    'order_count' => (int) ($sale['order_count'] ?? 0),
                    'last_received_at' => $po->actual_delivery_date ?? $po->received_at ?? ($item->quantity_received > 0 ? $po->order_date : null),
                    'last_sale_at' => $sale['last_sale_at'] ?? null,
                ];
            })->values();

            $soldCost = round((float) $itemRows->sum('net_cogs'), 2);
            $paid = round((float) ($actualPaid[$po->id] ?? 0), 2);
            return [
                'purchase_order_id' => $po->id,
                'po_number' => $po->po_number,
                'vendor_id' => $po->vendor_id,
                'order_date' => optional($po->order_date)->toDateString() ?? (string) $po->order_date,
                'received_quantity' => (int) $itemRows->sum('received_quantity'),
                'stock_on_hand' => (int) $itemRows->sum('stock_on_hand'),
                'stock_cost_value' => round((float) $itemRows->sum('stock_cost_value'), 2),
                'gross_units_sold' => (int) $itemRows->sum('gross_units_sold'),
                'returned_quantity' => (int) $itemRows->sum('returned_quantity'),
                'net_units_sold' => (int) $itemRows->sum('net_units_sold'),
                'gross_sales' => round((float) $itemRows->sum('gross_sales'), 2),
                'returned_sales' => round((float) $itemRows->sum('returned_sales'), 2),
                'net_sales' => round((float) $itemRows->sum('net_sales'), 2),
                'sold_cost' => $soldCost,
                'paid_amount' => $paid,
                'vendor_due' => round(max(0, $soldCost - $paid), 2),
                'payment_status' => $this->resellPaymentStatus($soldCost, $paid),
                'items' => $itemRows->all(),
            ];
        })->values();

        // Older resell payments were vendor-level and had no VendorPaymentItem allocation.
        // Also, a later return can make a previously allocated payment exceed that PO's current
        // earned amount. Keep valid PO allocations in place, then apply only legacy/uncovered
        // vendor credit FIFO so PO dues still add up to the vendor-level due.
        $vendorIds = $rows->pluck('vendor_id')->unique()->values();
        $paymentStats = $this->resellPaymentStats($vendorIds);
        $rows = $rows->groupBy('vendor_id')->flatMap(function (Collection $vendorRows, $vendorId) use ($paymentStats) {
            $totalPaid = round((float) ($paymentStats->get($vendorId)->paid_amount ?? 0), 2);
            $actualAllocated = round((float) $vendorRows->sum('paid_amount'), 2);
            $creditRemaining = round(max(0, $totalPaid - $actualAllocated), 2);
            $sorted = $vendorRows->sortBy(fn ($row) => sprintf('%s-%020d', $row['order_date'] ?? '', $row['purchase_order_id']))->values();

            $sorted = $sorted->map(function ($row) use (&$creditRemaining) {
                $allocated = round((float) $row['paid_amount'], 2);
                $earned = round((float) $row['sold_cost'], 2);
                $effectivePaid = round(min($allocated, $earned), 2);
                $creditRemaining = round($creditRemaining + max(0, $allocated - $effectivePaid), 2);
                $row['paid_amount'] = $effectivePaid;
                return $row;
            });

            return $sorted->map(function ($row) use (&$creditRemaining) {
                if ($creditRemaining > 0.001) {
                    $unpaidEarned = round(max(0, $row['sold_cost'] - $row['paid_amount']), 2);
                    $virtual = round(min($creditRemaining, $unpaidEarned), 2);
                    $row['paid_amount'] = round($row['paid_amount'] + $virtual, 2);
                    $creditRemaining = round($creditRemaining - $virtual, 2);
                }
                $row['vendor_due'] = round(max(0, $row['sold_cost'] - $row['paid_amount']), 2);
                $row['payment_status'] = $this->resellPaymentStatus($row['sold_cost'], $row['paid_amount']);
                return $row;
            });
        })->values();

        return $rows;
    }

    private function resellPaymentStatus(float $soldCost, float $paidAmount): string
    {
        if ($soldCost <= 0.001) {
            return 'not_due';
        }
        if ($paidAmount <= 0.001) {
            return 'unpaid';
        }
        if ($paidAmount + 0.001 >= $soldCost) {
            return 'paid';
        }
        return 'partially_paid';
    }

    private function resellPaymentStats(Collection $vendorIds, ?Request $request = null): Collection
    {
        if ($vendorIds->isEmpty()) {
            return collect();
        }

        $query = VendorPayment::query()
            ->whereIn('vendor_id', $vendorIds)
            ->where('metadata->resell', true)
            ->where('status', 'completed')
            ->where('payment_type', '!=', 'refund');

        if ($request) {
            $this->applyDateRange($query, $request, 'payment_date');
        }

        return $query
            ->selectRaw('vendor_id, SUM(amount) as paid_amount, COUNT(*) as payment_count')
            ->groupBy('vendor_id')
            ->get()
            ->keyBy('vendor_id');
    }

    private function currentVendorSettlement(ResellVendor $profile): array
    {
        $purchaseOrders = PurchaseOrder::with('items')
            ->where('vendor_id', $profile->vendor_id)
            ->where('metadata->resell', true)
            ->get();
        $poRows = $this->buildPoSettlementRows($purchaseOrders);
        $paymentStats = $this->resellPaymentStats(collect([$profile->vendor_id]));
        $payments = $paymentStats->get($profile->vendor_id);

        $vendorEarned = round((float) $poRows->sum('sold_cost'), 2);
        $paidAmount = round((float) ($payments->paid_amount ?? 0), 2);

        return [
            'resell_vendor_id' => $profile->id,
            'vendor_id' => $profile->vendor_id,
            'received_quantity' => (int) $poRows->sum('received_quantity'),
            'stock_on_hand' => (int) $poRows->sum('stock_on_hand'),
            'stock_cost_value' => round((float) $poRows->sum('stock_cost_value'), 2),
            'net_units_sold' => (int) $poRows->sum('net_units_sold'),
            'vendor_earned' => $vendorEarned,
            'paid_amount' => $paidAmount,
            'vendor_due' => round(max(0, $vendorEarned - $paidAmount), 2),
            'overpaid_amount' => round(max(0, $paidAmount - $vendorEarned), 2),
        ];
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
