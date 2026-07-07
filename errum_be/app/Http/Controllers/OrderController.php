<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\Store;
use App\Models\Employee;
use App\Models\PaymentMethod;
use App\Models\Transaction;
use App\Models\ReservedProduct;
use App\Models\ProductBarcode;
use App\Models\ProductMovement;
use App\Models\ProductReturn;
use App\Models\DefectiveProduct;
use App\Traits\DatabaseAgnosticSearch;
use App\Services\InventoryReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Carbon\Carbon;

class OrderController extends Controller
{
    use DatabaseAgnosticSearch;

    /**
     * POS/offline sale date selected in the frontend is the source of truth.
     * Date-only inputs keep the selected day but use the current clock time.
     */
    private function resolveTrustedOrderDate(Request $request): Carbon
    {
        $timezone = config('app.timezone', 'Asia/Dhaka');
        $rawDate = $request->input('order_date') ?: $request->input('sale_date');

        if (!$rawDate) {
            return now($timezone);
        }

        try {
            $rawDate = trim((string) $rawDate);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawDate)) {
                $now = now($timezone);
                return Carbon::parse($rawDate, $timezone)->setTime($now->hour, $now->minute, $now->second);
            }

            return Carbon::parse($rawDate, $timezone);
        } catch (\Throwable $e) {
            throw new \InvalidArgumentException('Invalid order_date. Use YYYY-MM-DD or a valid date/time.');
        }
    }
    /**
     * List all orders with filters
     * 
     * GET /api/orders?order_type=counter&status=pending&payment_status=partially_paid
     */
    public function index(Request $request)
    {
        $query = Order::with([
            'customer',
            'store', // Nullable - E-commerce orders have no store until manually assigned
            'items.product',
            'items.batch',
            'payments.paymentMethod',
            'payments.processedBy',
            'payments.paymentSplits.paymentMethod',
            'createdBy',
            'salesman',
        ]);

        // Filter by order type (counter, social_commerce, ecommerce). Accepts either one order_type
        // or order_types as an array/comma-separated string for breakdown screens.
        if ($request->filled('order_types')) {
            $types = $request->input('order_types');
            $types = is_array($types) ? $types : preg_split('/[,|]/', (string) $types);
            $types = collect($types)->map(fn ($type) => trim((string) $type))->filter()->values()->all();
            if (!empty($types)) {
                $query->whereIn('order_type', $types);
            }
        } elseif ($request->filled('order_type')) {
            $query->where('order_type', $request->order_type);
        }

        if ($request->filled('source_tag') || $request->filled('order_source')) {
            $this->applyOrderSourceFilter($query, $request->input('source_tag', $request->input('order_source')));
        }

        // Filter by status
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Filter by payment status
        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        // Filter by fulfillment status
        if ($request->filled('fulfillment_status')) {
            $query->where('fulfillment_status', $request->fulfillment_status);
        }

        // Filter by store
        if ($request->filled('store_id')) {
            if ($request->store_id === 'unassigned' || $request->store_id === 'null') {
                $query->whereNull('store_id');
            } else {
                $query->where('store_id', $request->store_id);
            }
        }

        // Filter unassigned orders (pending store assignment)
        // Includes both ecommerce and social_commerce orders
        if ($request->boolean('pending_assignment')) {
            $status = $request->input('status', 'pending_assignment');
            $query->whereNull('store_id')
                  ->whereIn('order_type', ['ecommerce', 'social_commerce'])
                  ->where('status', $status);
        }

        // Filter by customer
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        // Filter by salesman/employee
        if ($request->filled('created_by')) {
            $query->where('created_by', $request->created_by);
        }

        // Filter by date range using date-only comparisons.
        // This makes same-day filters inclusive for every time on that date.
        if ($request->filled('exact_date')) {
            $query->whereDate('order_date', $request->exact_date);
        } else {
            $dateFrom = $request->input('date_from');
            $dateTo = $request->input('date_to');

            if ($dateFrom && $dateTo && $dateFrom > $dateTo) {
                [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
            }

            if ($dateFrom) {
                $query->whereDate('order_date', '>=', $dateFrom);
            }

            if ($dateTo) {
                $query->whereDate('order_date', '<=', $dateTo);
            }
        }

        // Search by order number or customer name
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $this->whereLike($q, 'order_number', $request->search);
                $q->orWhereHas('customer', function ($customerQuery) use ($request) {
                    $this->whereLike($customerQuery, 'name', $request->search);
                    $this->orWhereLike($customerQuery, 'phone', $request->search);
                });
            });
        }

        // Filter overdue payments
        if ($request->boolean('overdue')) {
            $query->where('payment_status', 'overdue');
        }

        // Filter installment orders
        if ($request->boolean('installment_only')) {
            $query->where('is_installment_payment', true);
        }

        // Sort
        $sortBy = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $orders = $query->paginate($request->input('per_page', 20));

        $formattedOrders = [];
        foreach ($orders as $order) {
            $formattedOrders[] = $this->formatOrderResponse($order);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'current_page' => $orders->currentPage(),
                'data' => $formattedOrders,
                'first_page_url' => $orders->url(1),
                'from' => $orders->firstItem(),
                'last_page' => $orders->lastPage(),
                'last_page_url' => $orders->url($orders->lastPage()),
                'next_page_url' => $orders->nextPageUrl(),
                'path' => $orders->path(),
                'per_page' => $orders->perPage(),
                'prev_page_url' => $orders->previousPageUrl(),
                'to' => $orders->lastItem(),
                'total' => $orders->total(),
            ]
        ]);
    }

    /**
     * Get specific order details
     * 
     * GET /api/orders/{id}
     */
    public function show($id)
    {
        $order = Order::with([
            'customer',
            'store',
            'items.product.reservedProduct',
            'items.batch',
            'items.barcode',
            'payments.paymentMethod',
            'payments.processedBy',
            'payments.paymentSplits.paymentMethod',
            'payments.cashDenominations',
            'createdBy',
            'salesman',
        ])->find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => $this->formatOrderResponse($order, true)
        ]);
    }

    /**
     * Create new order
     * Handles all 3 sales channels: counter, social_commerce, ecommerce
     * 
     * POST /api/orders
     * Body: {
     *   "order_type": "counter|social_commerce|ecommerce",
     *   "customer_id": 1,  // Or create on-the-fly
     *   "customer": {...},  // If customer doesn't exist
     *   "store_id": 1,
     *   "items": [
     *     {
     *       "product_id": 1,
     *       "batch_id": 1,  // Specific batch to sell from
     *       "quantity": 2,
     *       "unit_price": 750.00,
     *       "discount_amount": 50.00
     *     }
     *   ],
     *   "discount_amount": 100.00,
     *   "shipping_amount": 50.00,
     *   "notes": "Customer wants delivery tomorrow",
     *   "shipping_address": {...},
     *   "payment": {  // Optional: immediate payment
     *     "payment_method_id": 1,
     *     "amount": 1000.00,
     *     "payment_type": "partial|full|installment"
     *   },
     *   "installment_plan": {  // Optional: setup installments
     *     "total_installments": 3,
     *     "installment_amount": 500.00,
     *     "start_date": "2024-12-01"
     *   }
     * }
     */
    public function create(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'order_type' => 'required|in:counter,social_commerce,ecommerce',
            'customer_id' => 'nullable|exists:customers,id',
            'customer' => 'nullable|array',  // Made optional - will use walk-in customer if not provided
            'customer.name' => 'required_with:customer|string',
            'customer.phone' => 'required_with:customer|string',
            'customer.email' => 'nullable|email',
            'customer.address' => 'nullable|string',
            'store_id' => 'nullable|exists:stores,id',  // Required for counter, optional for social_commerce/ecommerce
            'salesman_id' => 'nullable|exists:employees,id',  // Manual salesman entry for POS
            'order_date' => 'nullable|date',
            'sale_date' => 'nullable|date',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.batch_id' => 'nullable|exists:product_batches,id',  // Optional for pre-orders
            'items.*.barcode' => 'nullable|string|exists:product_barcodes,barcode',  // Optional barcode for tracking
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.unit_price' => 'required|numeric|min:0',
            'items.*.discount_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'shipping_address' => 'nullable|array',
            'payment' => 'nullable|array',
            'payment.payment_method_id' => 'required_with:payment|exists:payment_methods,id',
            'payment.amount' => 'required_with:payment|numeric|min:0.01',
            'payment.payment_type' => 'nullable|in:full,partial,installment,advance',
            'installment_plan' => 'nullable|array',
            'installment_plan.total_installments' => 'required_with:installment_plan|integer|min:2',
            'installment_plan.installment_amount' => 'required_with:installment_plan|numeric|min:0.01',
            'installment_plan.start_date' => 'nullable|date',
            'store_id' => 'nullable|exists:stores,id',
            'store_assignment_mode' => 'nullable|string|max:50',
            'order_source' => 'nullable|string|max:50',
            'source_tag' => 'nullable|string|max:50',
            'tags' => 'nullable|array',
            'tags.*' => 'nullable|string|max:50',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $orderSourceTag = $this->extractOrderSourceTag($request);
        if ($request->order_type === 'social_commerce' && !$orderSourceTag) {
            return response()->json([
                'success' => false,
                'message' => 'Social commerce orders require one source tag: Facebook, Instagram, WhatsApp, or Internal Order.',
                'errors' => ['order_source' => ['Please select Facebook, Instagram, WhatsApp, or Internal Order.']],
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Determine store_id based on order type
            $storeId = $request->store_id;
            
            // For counter/POS orders: require store_id (from employee's store or explicitly provided)
            if ($request->order_type === 'counter') {
                if (!$storeId) {
                    // Get store from authenticated employee
                    $employee = Auth::user();
                    if (!$employee || !$employee->store_id) {
                        throw new \Exception('Counter orders require a store. Employee must be assigned to a store or store_id must be provided.');
                    }
                    $storeId = $employee->store_id;
                }
            }
            
            // For social_commerce and ecommerce: store_id should be NULL (assigned later)
            // If provided, we'll use it, but it's optional
            if (in_array($request->order_type, ['social_commerce', 'ecommerce'])) {
                // Allow store_id to be null - will be assigned during fulfillment
                $storeId = $storeId ?? null;
            }
            
            // Get or create customer
            if ($request->filled('customer_id')) {
                $customer = Customer::findOrFail($request->customer_id);
            } elseif ($request->filled('customer')) {
                // Create customer on-the-fly based on order type
                $customerData = $request->customer;
                $customerData['created_by'] = Auth::id();
                
                // Check if customer exists by phone
                $existing = Customer::where('phone', $customerData['phone'])->first();
                if ($existing) {
                    $updates = [];
                    if (!empty($customerData['name']) && $customerData['name'] !== $existing->name) {
                        $updates['name'] = $customerData['name'];
                    }
                    if (!empty($customerData['email']) && $customerData['email'] !== $existing->email) {
                        $updates['email'] = $customerData['email'];
                    }
                    if (!empty($customerData['address']) && $customerData['address'] !== $existing->address) {
                        $updates['address'] = $customerData['address'];
                    }
                    if (!empty($updates)) {
                        $existing->fill($updates)->save();
                    }
                    $customer = $existing->fresh();
                } else {
                    if ($request->order_type === 'counter') {
                        $customer = Customer::create([
                            'name' => $customerData['name'],
                            'phone' => $customerData['phone'],
                            'email' => $customerData['email'] ?? null,
                            'address' => $customerData['address'] ?? null,
                            'customer_type' => 'counter',
                            'status' => 'active',
                            'created_by' => Auth::id(),
                        ]);
                    } elseif ($request->order_type === 'social_commerce') {
                        $customer = Customer::create([
                            'name' => $customerData['name'],
                            'phone' => $customerData['phone'],
                            'email' => $customerData['email'] ?? null,
                            'address' => $customerData['address'] ?? null,
                            'customer_type' => 'social_commerce',
                            'status' => 'active',
                            'created_by' => Auth::id(),
                        ]);
                    } else {
                        $customer = Customer::create([
                            'name' => $customerData['name'],
                            'phone' => $customerData['phone'],
                            'email' => $customerData['email'] ?? null,
                            'address' => $customerData['address'] ?? null,
                            'customer_type' => 'ecommerce',
                            'status' => 'active',
                            'created_by' => Auth::id(),
                        ]);
                    }
                }
            } else {
                // No customer provided - use or create walk-in customer for counter orders
                if ($request->order_type === 'counter') {
                    $customer = Customer::firstOrCreate(
                        ['phone' => 'WALK-IN'],
                        [
                            'name' => 'Walk-in Customer',
                            'customer_type' => 'counter',
                            'status' => 'active',
                            'created_by' => Auth::id(),
                        ]
                    );
                } else {
                    // For non-counter orders, customer is required
                    throw new \Exception('Customer information is required for ' . $request->order_type . ' orders');
                }
            }

            // Get salesman (employee receiving the sale credit)
            // Keep created_by as the authenticated actor for audit purposes.
            if ($request->filled('salesman_id')) {
                $salesmanId = (int) $request->salesman_id;
                $salesman = Employee::findOrFail($salesmanId);
            } else {
                $salesmanId = (int) Auth::id();
                $salesman = Employee::find($salesmanId);
            }

            $actorId = (int) Auth::id();
            $orderDate = $this->resolveTrustedOrderDate($request);

            // Determine fulfillment status based on order type
            // Counter orders: immediate fulfillment (barcode scanned at POS)
            // Social/Ecommerce: deferred fulfillment (warehouse scans barcodes later)
            $fulfillmentStatus = null;
            if (in_array($request->order_type, ['social_commerce', 'ecommerce'])) {
                $fulfillmentStatus = 'pending_fulfillment';
            }

            // Determine initial status based on order type and store assignment
            // Orders without store need assignment first
            $initialStatus = 'pending';
            if (in_array($request->order_type, ['social_commerce', 'ecommerce'])) {
                if ($storeId === null) {
                    $initialStatus = 'pending_assignment'; // Waiting for store assignment
                } elseif ($request->order_type === 'social_commerce') {
                    $initialStatus = 'assigned_to_store'; // Direct store assignment
                }
            }

            $orderMetadata = array_merge(
                ['discount_amount_role' => 'order_level'],
                $this->buildOrderSourceMetadata($orderSourceTag)
            );

            // Create order. The selected POS sale date must be trusted for order date,
            // timestamps, receipts, and same-day cash sheet reporting.
            $order = new Order([
                'customer_id' => $customer->id,
                'store_id' => $storeId,  // Use calculated store_id (null for social_commerce/ecommerce)
                'order_type' => $request->order_type,
                'status' => $initialStatus,
                'payment_status' => 'pending',
                'fulfillment_status' => $fulfillmentStatus,
                'discount_amount' => $request->discount_amount ?? 0,
                'shipping_amount' => $request->shipping_amount ?? 0,
                'notes' => $request->notes,
                'shipping_address' => $request->shipping_address,
                'metadata' => $orderMetadata,
                'created_by' => $actorId,
                'salesman_id' => $salesmanId,
                'order_date' => $orderDate,
            ]);
            $order->created_at = $orderDate;
            $order->updated_at = $orderDate;
            $order->save();

            // Save shipping address to customer_addresses table if provided
            // This ensures Pathao integration data is stored for later use
            if ($request->filled('shipping_address') && is_array($request->shipping_address)) {
                $shippingData = $request->shipping_address;
                
                // Only create if we have essential address info (NOT NULL columns must have values)
                if (!empty($shippingData['address_line_1']) && !empty($shippingData['city'])) {
                    // Check if this exact address already exists for the customer
                    $existingAddress = \App\Models\CustomerAddress::where('customer_id', $customer->id)
                        ->where('address_line_1', $shippingData['address_line_1'])
                        ->where('city', $shippingData['city'])
                        ->first();
                    
                    if (!$existingAddress) {
                        \App\Models\CustomerAddress::create([
                            'customer_id' => $customer->id,
                            'type' => 'shipping',
                            'name' => $shippingData['name'] ?? $customer->name,
                            'phone' => $shippingData['phone'] ?? $customer->phone,
                            'address_line_1' => $shippingData['address_line_1'],
                            'address_line_2' => $shippingData['address_line_2'] ?? null,
                            'city' => $shippingData['city'],
                            'state' => $shippingData['state'] ?? '',  // NOT NULL - use empty string
                            'postal_code' => $shippingData['postal_code'] ?? '',  // NOT NULL - use empty string
                            'country' => $shippingData['country'] ?? 'Bangladesh',
                            'pathao_city_id' => $shippingData['pathao_city_id'] ?? null,
                            'pathao_zone_id' => $shippingData['pathao_zone_id'] ?? null,
                            'pathao_area_id' => $shippingData['pathao_area_id'] ?? null,
                            'landmark' => $shippingData['landmark'] ?? null,
                            'delivery_instructions' => $shippingData['delivery_instructions'] ?? null,
                            'is_default_shipping' => false,  // Don't override existing default
                            'is_default_billing' => false,
                        ]);
                    }
                }
            }

            // Add items
            $subtotal = 0;
            $taxTotal = 0;
            $totalItemDiscount = 0;
            $hasPreOrderItems = false;  // Track if any items don't have batches
            $defectiveOrderItemIds = [];
            $defectiveProductIdsByOrderItem = [];

            foreach ($request->items as $itemData) {
                $product = Product::findOrFail($itemData['product_id']);
                $isDefectiveResale = filter_var($itemData['is_defective'] ?? false, FILTER_VALIDATE_BOOLEAN)
                    || !empty($itemData['defective_product_id'])
                    || strtolower((string) ($itemData['source'] ?? '')) === 'defective_resale';
                
                // Batch is optional for pre-orders. Display/faulty/used resale orders
                // are different: they must resolve to the dedicated resale batch created
                // when the barcode was marked available_for_sale.
                $batch = !empty($itemData['batch_id'])
                    ? ProductBatch::findOrFail($itemData['batch_id'])
                    : null;

                $defectiveProduct = null;
                $usedOnlyResale = false;
                if ($isDefectiveResale) {
                    $defectiveProductId = (int) ($itemData['defective_product_id'] ?? 0);
                    if ($defectiveProductId <= 0) {
                        throw new \Exception("Missing defective/used product reference for {$product->name}");
                    }

                    $defectiveProduct = DefectiveProduct::with(['barcode', 'batch'])
                        ->whereKey($defectiveProductId)
                        ->lockForUpdate()
                        ->first();

                    if (!$defectiveProduct) {
                        throw new \Exception("Defective/used resale item not found for {$product->name}");
                    }

                    if ((int) $defectiveProduct->product_id !== (int) $product->id) {
                        throw new \Exception("Defective/used resale item does not match {$product->name}");
                    }

                    $defectiveMetadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
                    $description = strtolower((string) $defectiveProduct->defect_description);
                    $usedOnlyResale = !empty($defectiveMetadata['is_used_item'])
                        && strtolower((string) $defectiveProduct->defect_type) === 'other'
                        && !str_contains($description, 'defect');

                    if ($usedOnlyResale) {
                        // Used-only items are regular stock with a metadata tag. Older
                        // frontend builds may still send source=defective_resale; undo that
                        // here and continue through the normal stock/barcode path.
                        $isDefectiveResale = false;

                        if (empty($itemData['barcode']) && $defectiveProduct->barcode) {
                            $itemData['barcode'] = $defectiveProduct->barcode->barcode;
                        }

                        if (!$batch && $defectiveProduct->barcode && $defectiveProduct->barcode->batch) {
                            $batch = $defectiveProduct->barcode->batch;
                            $itemData['batch_id'] = $batch->id;
                        }
                    } else {
                        if (!in_array($defectiveProduct->status, ['available_for_sale', 'inspected'], true)) {
                            throw new \Exception("Defective item {$product->name} is not available for sale");
                        }

                        // Real defective/faulty resale still uses the dedicated EXTRA batch.
                        $resaleBatchId = data_get($defectiveProduct->metadata ?? [], 'resale_batch_id')
                            ?: optional($defectiveProduct->barcode)->batch_id;

                        if (!$resaleBatchId || !ProductBatch::whereKey($resaleBatchId)->exists()) {
                            if (!$defectiveProduct->makeAvailableForSale()) {
                                throw new \Exception("Defective item {$product->name} could not be prepared for resale");
                            }

                            $defectiveProduct = DefectiveProduct::with(['barcode', 'batch'])
                                ->whereKey($defectiveProductId)
                                ->lockForUpdate()
                                ->firstOrFail();

                            $resaleBatchId = data_get($defectiveProduct->metadata ?? [], 'resale_batch_id')
                                ?: optional($defectiveProduct->barcode)->batch_id;
                        }

                        if (!$resaleBatchId) {
                            throw new \Exception("Missing resale batch for defective item {$product->name}");
                        }

                        $resaleBatch = ProductBatch::whereKey($resaleBatchId)->lockForUpdate()->first();
                        if (!$resaleBatch) {
                            throw new \Exception("Resale batch not found for defective item {$product->name}");
                        }

                        if ($batch && (int) $batch->id !== (int) $resaleBatch->id) {
                            Log::info('Overriding stale defective resale batch_id with actual EXTRA resale batch', [
                                'product_id' => $product->id,
                                'defective_product_id' => $defectiveProduct->id,
                                'submitted_batch_id' => $batch->id,
                                'resale_batch_id' => $resaleBatch->id,
                            ]);
                        }

                        $batch = $resaleBatch;
                        $itemData['batch_id'] = $batch->id;

                        if ($batch->quantity < (int) ($itemData['quantity'] ?? 1)) {
                            throw new \Exception("Insufficient resale stock for {$product->name}. Available: {$batch->quantity}");
                        }

                        // Social-commerce resale used to omit barcode. Recover it from the
                        // defective record so completion can move the exact unit to with_customer.
                        if (empty($itemData['barcode']) && $defectiveProduct->barcode) {
                            $itemData['barcode'] = $defectiveProduct->barcode->barcode;
                        }
                    }
                }

                // Mark as pre-order if any normal item has no batch
                if (!$batch && !$isDefectiveResale) {
                    $hasPreOrderItems = true;
                }

                // Validate stock availability only if batch exists (not a pre-order).
                // Defective/used resale items are already removed from sellable inventory when marked defective,
                // so selling them again must not be blocked by normal batch/reserved stock checks.
                if ($batch && !$isDefectiveResale) {
                    if ($batch->quantity < $itemData['quantity']) {
                        throw new \Exception("Insufficient local stock for {$product->name}. Available: {$batch->quantity}");
                    }
                    
                    // NEW LOGIC: Check global reservation table
                    $reservedRecord = $this->reservedProductForAvailabilityCheck($product->id, $request->order_type);
                    $globalAvailable = $reservedRecord ? $reservedRecord->available_inventory : 0;
                    
                    if ($globalAvailable < $itemData['quantity']) {
                        throw new \Exception("Cannot sell {$product->name} (Global available inventory: {$globalAvailable}). Stock is reserved for online orders.");
                    }
                } elseif (!$isDefectiveResale && $request->order_type === 'social_commerce' && $request->store_id) {
                    // Check store-level stock for specific store assignment without batch
                    $storeStock = ProductBatch::where('product_id', $product->id)
                        ->where('store_id', $request->store_id)
                        ->sum('quantity');
                    
                    if ($storeStock < $itemData['quantity']) {
                        throw new \Exception("Insufficient stock for {$product->name} at the selected branch. Available: {$storeStock}");
                    }

                    // Check global available inventory too
                    $reservedRecord = $this->reservedProductForAvailabilityCheck($product->id, $request->order_type);
                    $globalAvailable = $reservedRecord ? $reservedRecord->available_inventory : 0;
                    
                    // Online orders (social commerce) ARE blocked by global reservations
                    if ($globalAvailable < $itemData['quantity']) {
                        throw new \Exception("Cannot sell {$product->name} (Global available inventory: {$globalAvailable}). Stock is reserved for online orders.");
                    }
                }

                // Validate batch belongs to the store (only if batch exists AND store_id is provided)
                // For social_commerce/ecommerce without store_id, skip this validation (store assigned later)
                if ($batch && $request->store_id && $batch->store_id != $request->store_id) {
                    throw new \Exception("Product batch not available at this store");
                }

                // Handle barcode if provided (optional for backward compatibility).
                // For display/faulty/used resale, the barcode is mandatory and can be
                // recovered from the defective_product_id when the frontend does not send it.
                $barcodeId = null;
                if (!empty($itemData['barcode']) && $batch) {
                    $barcode = ProductBarcode::where('barcode', $itemData['barcode'])
                        ->where('product_id', $product->id)
                        ->where('batch_id', $batch->id)
                        ->first();

                    if (!$barcode && $isDefectiveResale && $defectiveProduct && $defectiveProduct->barcode) {
                        $barcode = $defectiveProduct->barcode;
                    }
                    
                    if (!$barcode) {
                        throw new \Exception("Barcode {$itemData['barcode']} not found for product {$product->name}");
                    }

                    if ((int) $barcode->batch_id !== (int) $batch->id) {
                        throw new \Exception("Barcode {$itemData['barcode']} is not attached to the selected resale batch");
                    }
                    
                    // Check if barcode is already sold
                    if (in_array($barcode->current_status, ['sold', 'with_customer'])) {
                        throw new \Exception("Barcode {$itemData['barcode']} has already been sold");
                    }
                    
                    if ($barcode->is_defective && !$isDefectiveResale) {
                        throw new \Exception("Barcode {$itemData['barcode']} is marked as defective");
                    }
                    
                    $barcodeId = $barcode->id;
                } elseif ($isDefectiveResale) {
                    throw new \Exception("Missing barcode for defective/used resale item {$product->name}");
                }
                
                Log::info('Order item barcode capture', [
                    'barcode_value' => $itemData['barcode'] ?? 'NOT_PROVIDED',
                    'barcode_id' => $barcodeId,
                    'product_id' => $product->id,
                    'batch_id' => $batch?->id
                ]);

                $quantity = $itemData['quantity'];
                $unitPrice = $itemData['unit_price'];
                $discount = $itemData['discount_amount'] ?? 0;
                
                // Calculate tax using the helper method (respects TAX_MODE)
                $taxPercentage = $batch?->tax_percentage ?? 0;
                $taxCalculation = $this->calculateTax($unitPrice, $quantity, $taxPercentage);
                $tax = $taxCalculation['total_tax'];
                
                // For inclusive mode: subtotal includes tax
                // For exclusive mode: subtotal is base, tax added separately
                $itemSubtotal = $quantity * $unitPrice;
                $itemTotal = $itemSubtotal - $discount;

                // Calculate COGS from batch cost price (0 if no batch - pre-order)
                $cogs = $batch ? round(($batch->cost_price ?? 0) * $quantity, 2) : 0;
                
                Log::info('Order Item COGS at Creation', [
                    'product_name' => $product->name,
                    'batch_id' => $batch?->id,
                    'batch_cost_price' => $batch?->cost_price,
                    'quantity' => $quantity,
                    'calculated_cogs' => $cogs,
                    'is_preorder' => !$batch,
                ]);

                $orderItem = OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $product->id,
                    'product_batch_id' => $batch?->id,  // Nullable for pre-orders
                    'product_barcode_id' => $barcodeId,  // NEW: Store barcode if provided
                    'product_name' => $isDefectiveResale ? $product->name . ' [DEFECTIVE/USED RESALE]' : $product->name,
                    'product_sku' => $product->sku,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'discount_amount' => $discount,
                    'tax_amount' => $tax,
                    'cogs' => $cogs,
                    'total_amount' => $itemTotal,
                ]);
                $orderItem->forceFill([
                    'created_at' => $orderDate,
                    'updated_at' => $orderDate,
                ])->saveQuietly();

                if ($isDefectiveResale) {
                    $defectiveOrderItemIds[] = $orderItem->id;
                    if (!empty($itemData['defective_product_id'])) {
                        $defectiveProductIdsByOrderItem[$orderItem->id] = (int) $itemData['defective_product_id'];
                    }
                }

                $subtotal += $itemSubtotal;
                $taxTotal += $tax;
                $totalItemDiscount += $discount;

                // Stock deduction is centralized in OrderController@complete.
                // Online reservations are handled by OrderItemObserver; POS/counter
                // orders only refresh reserved_products availability snapshots.
                Log::info('Order item created', [
                    'order_id' => $order->id,
                    'product_id' => $product->id,
                    'quantity' => $quantity,
                    'order_type' => $order->order_type,
                ]);
            }

            // Calculate order totals based on tax mode
            $taxMode = config('app.tax_mode', 'inclusive');
            $orderDiscount = $request->discount_amount ?? 0;
            $shippingAmount = $request->shipping_amount ?? 0;
            
            $orderDiscount = min(max((float) $orderDiscount, 0), max(0, $subtotal - $totalItemDiscount));
            $grandDiscount = $totalItemDiscount + $orderDiscount;

            if ($taxMode === 'inclusive') {
                // Inclusive: tax already in subtotal. Item discounts and order-level discounts are separate.
                $totalAmount = max(0, $subtotal - $grandDiscount + $shippingAmount);
            } else {
                // Exclusive: add tax to subtotal after both discount layers.
                $totalAmount = max(0, $subtotal + $taxTotal - $grandDiscount + $shippingAmount);
            }

            $orderMetadata = is_array($order->metadata ?? null) ? $order->metadata : [];
            if (!empty($defectiveOrderItemIds)) {
                $orderMetadata['has_defective_resale_items'] = true;
                $orderMetadata['defective_order_item_ids'] = array_values(array_unique(array_map('intval', $defectiveOrderItemIds)));
                $orderMetadata['defective_product_ids_by_order_item'] = $defectiveProductIdsByOrderItem;
            }

            $paymentStatus = $totalAmount <= 0 ? 'paid' : 'pending';

            $order->update([
                'subtotal' => $subtotal,
                'tax_amount' => $taxTotal,
                'discount_amount' => $orderDiscount,
                'total_amount' => $totalAmount,
                'paid_amount' => 0,
                'outstanding_amount' => $totalAmount <= 0 ? 0 : $totalAmount,
                'payment_status' => $paymentStatus,
                'is_preorder' => $hasPreOrderItems,  // Mark order as pre-order if any items lack batches
                'metadata' => $orderMetadata,
            ]);
            $order->forceFill([
                'created_at' => $orderDate,
                'updated_at' => $orderDate,
            ])->saveQuietly();

            // Setup installment plan if requested
            if ($request->filled('installment_plan')) {
                $plan = $request->installment_plan;
                $order->setupInstallmentPlan(
                    $plan['total_installments'],
                    $plan['installment_amount'],
                    $plan['start_date'] ?? null
                );
            }

            // Process immediate payment if provided
            if ($request->filled('payment')) {
                $paymentMethod = PaymentMethod::findOrFail($request->payment['payment_method_id']);
                $payment = $order->addPayment(
                    $paymentMethod,
                    $request->payment['amount'],
                    array_merge($request->payment['payment_data'] ?? [], [
                        'payment_date' => $orderDate->toDateTimeString(),
                    ]),
                    $salesman
                );

                $payment->forceFill([
                    'payment_received_date' => $orderDate->toDateString(),
                    'created_at' => $orderDate,
                    'updated_at' => $orderDate,
                ])->saveQuietly();

                $payment->update([
                    'payment_type' => $request->payment['payment_type'] ?? 'partial',
                ]);
                $payment->forceFill([
                    'payment_received_date' => $orderDate->toDateString(),
                    'created_at' => $orderDate,
                    'updated_at' => $orderDate,
                ])->saveQuietly();

                // Update order payment status
                $order->updatePaymentStatus();
            }

            // Some downstream status/payment helpers touch updated_at. The POS-selected
            // date is the business timestamp for offline sales and must remain trusted.
            $order->forceFill([
                'order_date' => $orderDate,
                'created_at' => $orderDate,
                'updated_at' => $orderDate,
            ])->saveQuietly();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Order created successfully',
                'data' => $this->formatOrderResponse($order->fresh([
                    'customer',
                    'store',
                    'items.product',
                    'items.batch',
                    'payments.paymentMethod',
                    'createdBy',
                    'salesman'
                ]), true)
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create order: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POS/counter order creation only needs a non-blocking snapshot of global
     * available stock. It should not lock reserved_products because the POS sale
     * is completed immediately in the next call and does not create a reservation.
     * Online orders still lock this row because they actually reserve stock.
     */
    private function reservedProductForAvailabilityCheck(int $productId, string $orderType): ?ReservedProduct
    {
        $query = ReservedProduct::where('product_id', $productId);

        if ($orderType === 'counter') {
            return $query->first();
        }

        return $query->lockForUpdate()->first();
    }

    /**
     * Update order details (before completion/fulfillment)
     * 
     * PATCH /api/orders/{id}
     * 
     * Allowed updates:
     * - Customer information (name, phone, address)
     * - Shipping address
     * - Discount amount
     * - Shipping amount
     * - Notes
     * 
     * Cannot update:
     * - Items (use addItem/updateItem/removeItem)
     * - Status/payment after fulfillment
     * - Order type
     */
    public function update(Request $request, $id)
    {
        $order = Order::with('items')->find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        // Only allow updates for pending/confirmed orders
        if (!in_array($order->status, ['pending', 'pending_assignment', 'confirmed', 'assigned_to_store', 'picking', 'ready_for_shipment'])) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot update order in current status: ' . $order->status
            ], 400);
        }

        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'customer_phone' => 'nullable|string|max:20',
            'customer_email' => 'nullable|email',
            'customer_address' => 'nullable|string',
            'shipping_address' => 'nullable|array',
            'shipping_address.address_line1' => 'required_with:shipping_address|string',
            'shipping_address.address_line2' => 'nullable|string',
            'shipping_address.city' => 'required_with:shipping_address|string',
            'shipping_address.state' => 'nullable|string',
            'shipping_address.postal_code' => 'nullable|string',
            'shipping_address.country' => 'required_with:shipping_address|string',
            'discount_amount' => 'nullable|numeric|min:0',
            'shipping_amount' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'store_id' => 'nullable|exists:stores,id',
            'store_assignment_mode' => 'nullable|string|max:50',
            'order_source' => 'nullable|string|max:50',
            'source_tag' => 'nullable|string|max:50',
            'tags' => 'nullable|array',
            'tags.*' => 'nullable|string|max:50',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $hasOrderSourceInput = $request->has('order_source') || $request->has('source_tag') || $request->has('tags');
        $orderSourceTag = $hasOrderSourceInput ? $this->extractOrderSourceTag($request) : null;
        if ($hasOrderSourceInput && !$orderSourceTag) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid order source. Use Facebook, Instagram, WhatsApp, or Internal Order.',
                'errors' => ['order_source' => ['Invalid order source.']],
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Update customer information if provided
            if ($request->has('customer_name') || $request->has('customer_phone') || 
                $request->has('customer_email') || $request->has('customer_address')) {
                
                $customer = $order->customer;
                if ($customer && $customer->phone !== 'WALK-IN') {
                    if ($request->filled('customer_name')) {
                        $customer->name = $request->customer_name;
                    }
                    if ($request->filled('customer_phone')) {
                        $customer->phone = $request->customer_phone;
                    }
                    if ($request->filled('customer_email')) {
                        $customer->email = $request->customer_email;
                    }
                    if ($request->filled('customer_address')) {
                        $customer->address = $request->customer_address;
                    }
                    $customer->save();
                }
            }

            // Update order fields
            if ($request->has('shipping_address')) {
                $order->shipping_address = $request->shipping_address;
            }

            if ($request->has('store_id') && $order->needsFulfillment()) {
                $newStoreId = $request->filled('store_id') ? (int) $request->store_id : null;
                $oldStoreId = $order->store_id ? (int) $order->store_id : null;
                if ($newStoreId !== $oldStoreId) {
                    $this->clearOnlineOrderScans($order, 'store_changed_during_order_edit', true);
                    $order->store_id = $newStoreId;
                    $order->fulfillment_status = $newStoreId ? 'pending_fulfillment' : null;
                    $order->status = $newStoreId ? 'assigned_to_store' : 'pending_assignment';
                    $order->metadata = array_merge($order->metadata ?? [], [
                        'store_changed_during_edit_at' => now()->toISOString(),
                        'store_changed_during_edit_by' => auth()->id(),
                        'previous_store_id' => $oldStoreId,
                        'new_store_id' => $newStoreId,
                        'barcode_action' => 'cleared_scanned_barcodes_for_rescan_from_new_store',
                    ]);
                }
            }

            if ($hasOrderSourceInput && $orderSourceTag) {
                $order->metadata = array_merge($order->metadata ?? [], $this->buildOrderSourceMetadata($orderSourceTag));
            }

            if ($request->has('discount_amount')) {
                $oldDiscount = $order->discount_amount;
                $order->discount_amount = $request->discount_amount;
                $order->metadata = array_merge($order->metadata ?? [], [
                    'discount_amount_role' => 'order_level',
                ]);
                
                $totalItemDiscount = $order->items->sum('discount_amount');
                $taxTotal = $order->items->sum('tax_amount');
                $taxMode = config('app.tax_mode', 'inclusive');

                if ($taxMode === 'inclusive') {
                    $order->total_amount = max(0, $order->subtotal - $request->discount_amount - $totalItemDiscount + $order->shipping_amount);
                } else {
                    $order->total_amount = max(0, $order->subtotal + $taxTotal - $request->discount_amount - $totalItemDiscount + $order->shipping_amount);
                }
                $order->outstanding_amount = max(0, $order->total_amount - $order->paid_amount);
            }

            if ($request->has('shipping_amount')) {
                $oldShipping = $order->shipping_amount;
                $order->shipping_amount = $request->shipping_amount;
                
                $totalItemDiscount = $order->items->sum('discount_amount');
                $taxTotal = $order->items->sum('tax_amount');
                $taxMode = config('app.tax_mode', 'inclusive');

                if ($taxMode === 'inclusive') {
                    $order->total_amount = max(0, $order->subtotal - $order->discount_amount - $totalItemDiscount + $request->shipping_amount);
                } else {
                    $order->total_amount = max(0, $order->subtotal + $taxTotal - $order->discount_amount - $totalItemDiscount + $request->shipping_amount);
                }
                $order->outstanding_amount = max(0, $order->total_amount - $order->paid_amount);
            }

            if ($request->has('notes')) {
                $order->notes = $request->notes;
            }
            
            $order->save();
            $order->updatePaymentStatus();
            $this->refreshOnlineOrderFulfillmentState($order);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Order updated successfully',
                'data' => $order->load(['customer', 'items.product', 'payments'])
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to update order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Add item to existing order (before completion)
     * 
     * UPDATED: Supports both barcode scanning (for counter orders) and product selection (for social/ecommerce)
     * 
     * POST /api/orders/{id}/items
     * Body for COUNTER orders (barcode scanning):
     * {
     *   "barcode": "789012345023"  // Scan individual unit barcode
     *   OR
     *   "barcodes": ["789012345023", "789012345024"]  // Multiple units
     * }
     * 
     * Body for SOCIAL_COMMERCE/ECOMMERCE orders (product selection):
     * {
     *   "product_id": 1,
     *   "batch_id": 5,  // Optional - will use oldest batch if not provided
     *   "quantity": 2,
     *   "unit_price": 750.00,  // Optional - will use batch price
     *   "discount_amount": 0
     * }
     */
    public function addItem(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        // Can only add items to pending orders
        if (!in_array($order->status, ['pending', 'pending_assignment', 'confirmed', 'assigned_to_store', 'picking', 'ready_for_shipment'])) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot add items to ' . $order->status . ' orders'
            ], 422);
        }

        // NEW: Support BOTH barcode scanning AND product/batch selection
        // Counter orders: use barcodes
        // Social/Ecommerce orders: use product_id + batch_id + quantity
        $validator = Validator::make($request->all(), [
            // Barcode scanning (for counter orders)
            'barcode' => 'nullable|string|exists:product_barcodes,barcode',
            'barcodes' => 'nullable|array|min:1',
            'barcodes.*' => 'string|exists:product_barcodes,barcode',
            
            // Product selection (for social_commerce/ecommerce orders)
            'product_id' => 'nullable|exists:products,id',
            'batch_id' => 'nullable|exists:product_batches,id',
            'quantity' => 'required_with:product_id|integer|min:1',
            
            'unit_price' => 'nullable|numeric|min:0',  // Optional, use batch price if not provided
            'discount_amount' => 'nullable|numeric|min:0',
        ], [
            'barcode.exists' => 'Invalid barcode',
            'product_id.exists' => 'Product not found',
            'batch_id.exists' => 'Batch not found',
            'quantity.required_with' => 'Quantity is required when adding by product',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // Validate that at least one method is provided
        $hasBarcode = $request->filled('barcode') || $request->filled('barcodes');
        $hasProduct = $request->filled('product_id');
        
        if (!$hasBarcode && !$hasProduct) {
            return response()->json([
                'success' => false,
                'message' => 'Please provide either barcode(s) or product_id to add item'
            ], 422);
        }

        if ($hasBarcode && $hasProduct) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot provide both barcode and product_id. Choose one method.'
            ], 422);
        }

        DB::beginTransaction();
        try {
            $addedItems = [];
            
            // METHOD 1: Add by barcode (counter orders)
            if ($hasBarcode) {
                // Normalize to array
                $barcodesToAdd = $request->has('barcodes') 
                    ? $request->barcodes 
                    : [$request->barcode];
                
                foreach ($barcodesToAdd as $barcodeValue) {
                    $barcode = \App\Models\ProductBarcode::where('barcode', $barcodeValue)
                        ->with(['product', 'batch'])
                        ->first();

                    if (!$barcode) {
                        throw new \Exception("Barcode {$barcodeValue} not found");
                    }

                    // Validate barcode is available (not already sold/with customer)
                    if (in_array($barcode->current_status, ['sold', 'with_customer'])) {
                        throw new \Exception("Barcode {$barcodeValue} has already been sold and is not available");
                    }

                    // Validate barcode is not defective. A barcode that was made sellable from
                    // the Extra/Defect panel is reactivated as non-defective and has resale metadata.
                    if ($barcode->is_defective) {
                        throw new \Exception("Barcode {$barcodeValue} is marked as defective");
                    }

                    // Validate batch exists and has stock
                    if (!$barcode->batch) {
                        throw new \Exception("Barcode {$barcodeValue} is not associated with any batch");
                    }

                    $batch = $barcode->batch;
                    $product = $barcode->product;

                    // Validate batch has stock
                    if ($batch->quantity < 1) {
                        throw new \Exception("Product batch {$batch->batch_number} has no stock available");
                    }

                    // Validate store
                    if ($batch->store_id != $order->store_id) {
                        throw new \Exception("Product from batch {$batch->batch_number} not available at this store");
                    }

                    // Use provided price or batch price
                    $unitPrice = $request->unit_price ?? $batch->sell_price;
                    $discount = $request->discount_amount ?? 0;

                    // Calculate tax using the helper method (respects TAX_MODE)
                    $taxPercentage = $batch->tax_percentage ?? 0;
                    $taxCalculation = $this->calculateTax($unitPrice, 1, $taxPercentage);

                    // Create order item with barcode tracking
                    $orderItem = OrderItem::create([
                        'order_id' => $order->id,
                        'product_id' => $product->id,
                        'product_batch_id' => $batch->id,
                        'product_barcode_id' => $barcode->id,  // NEW: Track specific barcode
                        'product_name' => $product->name,
                        'product_sku' => $product->sku,
                        'quantity' => 1,  // Always 1 per barcode
                        'unit_price' => $unitPrice,
                        'discount_amount' => $discount,
                        'tax_amount' => $taxCalculation['total_tax'],
                        'cogs' => round(($batch->cost_price ?? 0) * 1, 2),
                        'total_amount' => $unitPrice - $discount,  // For inclusive, total = unitPrice - discount
                    ]);

                    $addedItems[] = $orderItem;
                }
            }
            
            // METHOD 2: Add by product_id (social_commerce/ecommerce orders)
            if ($hasProduct) {
                $product = Product::findOrFail($request->product_id);
                $quantity = $request->quantity;
                
                // 1. ALWAYS verify global available inventory first
                $reserved = \App\Models\ReservedProduct::where('product_id', $product->id)->first();
                $availableGlobal = $reserved ? $reserved->available_inventory : 0;
                
                if ($availableGlobal < $quantity) {
                    throw new \Exception("Insufficient global stock for product '{$product->name}'. Available: {$availableGlobal}, requested: {$quantity}");
                }

                $batch = null;
                // 2. Optional: Select a batch if possible (prioritize the order's store if set, else any batch)
                // This is a "soft" selection - even if no batch is found here, we allow adding the item
                // because fulfillment scanning will eventually pick a batch at the branch.
                if ($request->filled('batch_id')) {
                    $batch = ProductBatch::find($request->batch_id);
                    // Use it even if it's from another store, but respect its quantity if selected explicitly
                    if ($batch && $batch->quantity < $quantity) {
                        Log::warning("Manually selected batch {$batch->id} has less stock than requested. Proceeding as global assignment.");
                    }
                } else {
                    // Optimized batch selection: try current store first (FIFO), else any store (FIFO)
                    $batchQuery = ProductBatch::where('product_id', $product->id)
                        ->where('quantity', '>=', $quantity)
                        ->where('availability', true)
                        ->where(function($q) {
                            $q->whereNull('expiry_date')->orWhere('expiry_date', '>', now());
                        })
                        ->orderBy('expiry_date', 'asc');
                    
                    if ($order->store_id) {
                        $batch = (clone $batchQuery)->where('store_id', $order->store_id)->first() ?: $batchQuery->first();
                    } else {
                        $batch = $batchQuery->first();
                    }
                }

                if ($batch) {
                    Log::info("Auto-selected batch {$batch->id} for added item in order {$order->id}");
                } else {
                    Log::info("Adding item to order {$order->id} without pre-assigned batch (will be assigned at fulfillment)");
                }
                
                // Use provided price or batch price or product base price
                $unitPrice = $request->unit_price ?? ($batch ? $batch->sell_price : $product->base_price ?? 0);
                $discount = $request->discount_amount ?? 0;
                
                // Calculate tax using the helper method (respects TAX_MODE)
                $taxPercentage = $batch ? ($batch->tax_percentage ?? 0) : 0;
                $taxCalculation = $this->calculateTax($unitPrice, $quantity, $taxPercentage);
                
                // Check if this product already exists in the order
                $existingItem = OrderItem::where('order_id', $order->id)
                    ->where('product_id', $product->id)
                    ->where('product_batch_id', $batch ? $batch->id : null)
                    ->whereNull('product_barcode_id')
                    ->first();
                
                if ($existingItem) {
                    // Update existing item quantity
                    $existingItem->quantity += $quantity;
                    $existingItem->tax_amount = $this->calculateTax($existingItem->unit_price, $existingItem->quantity, $taxPercentage)['total_tax'];
                    $existingItem->total_amount = ($existingItem->unit_price * $existingItem->quantity) - $existingItem->discount_amount + $existingItem->tax_amount;
                    $existingItem->cogs = $batch ? round(($batch->cost_price ?? 0) * $existingItem->quantity, 2) : 0;
                    $existingItem->save();
                    
                    $orderItem = $existingItem;
                } else {
                    // Create new order item (without barcode - will be assigned during fulfillment)
                    $orderItem = OrderItem::create([
                        'order_id' => $order->id,
                        'product_id' => $product->id,
                        'product_batch_id' => $batch ? $batch->id : null,
                        'product_barcode_id' => null,  // No barcode yet - assigned during fulfillment
                        'product_name' => $product->name,
                        'product_sku' => $product->sku,
                        'quantity' => $quantity,
                        'unit_price' => $unitPrice,
                        'discount_amount' => $discount,
                        'tax_amount' => $taxCalculation['total_tax'],
                        'cogs' => $batch ? round(($batch->cost_price ?? 0) * $quantity, 2) : 0,
                        'total_amount' => ($unitPrice * $quantity) - $discount + $taxCalculation['total_tax'],
                    ]);
                }
                
                $addedItems[] = $orderItem;
            }

            // Recalculate order totals. New online items remain unscanned while already scanned items stay attached.
            $order->calculateTotals();
            $order->save();
            $order->updatePaymentStatus();
            $this->refreshOnlineOrderFulfillmentState($order);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => count($addedItems) . ' item(s) added successfully',
                'data' => [
                    'item' => [
                        'id' => $orderItem->id,
                        'product_name' => $orderItem->product_name,
                        'quantity' => $orderItem->quantity,
                        'unit_price' => number_format((float)$orderItem->unit_price, 2),
                        'total' => number_format((float)$orderItem->total_amount, 2),
                    ],
                    'order_totals' => [
                        'subtotal' => number_format((float)$order->fresh()->subtotal, 2),
                        'total_amount' => number_format((float)$order->fresh()->total_amount, 2),
                        'outstanding_amount' => number_format((float)$order->fresh()->outstanding_amount, 2),
                    ]
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Update item quantity/price
     * 
     * PUT /api/orders/{orderId}/items/{itemId}
     */
    public function updateItem(Request $request, $orderId, $itemId)
    {
        $order = Order::find($orderId);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        if (!in_array($order->status, ['pending', 'pending_assignment', 'confirmed', 'assigned_to_store', 'picking', 'ready_for_shipment'])) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot update items in ' . $order->status . ' orders'
            ], 422);
        }

        $item = OrderItem::where('order_id', $orderId)->find($itemId);

        if (!$item) {
            return response()->json([
                'success' => false,
                'message' => 'Item not found'
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'quantity' => 'nullable|integer|min:1',
            'unit_price' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            if ($request->filled('quantity')) {
                $newQuantity = (int) $request->quantity;
                $oldQuantity = (int) $item->quantity;
                $diff = $newQuantity - $oldQuantity;

                // Already-scanned online rows represent physical barcode units. Keep those barcodes.
                // If quantity increases, create a separate unscanned row for only the added quantity.
                if ($order->needsFulfillment() && $item->product_barcode_id) {
                    if ($newQuantity > $oldQuantity) {
                        $extraQty = $newQuantity - $oldQuantity;
                        $reserved = \App\Models\ReservedProduct::where('product_id', $item->product_id)->lockForUpdate()->first();
                        $available = $reserved ? $reserved->available_inventory : 0;
                        if ($available < $extraQty) {
                            throw new \Exception("Insufficient global stock to increase quantity for '{$item->product_name}'. Available: {$available}, needed: {$extraQty}");
                        }

                        OrderItem::create([
                            'order_id' => $order->id,
                            'product_id' => $item->product_id,
                            'product_batch_id' => null,
                            'product_barcode_id' => null,
                            'store_id' => $order->store_id,
                            'product_name' => $item->product_name,
                            'product_sku' => $item->product_sku,
                            'quantity' => $extraQty,
                            'unit_price' => $request->unit_price ?? $item->unit_price,
                            'discount_amount' => 0,
                            'tax_amount' => 0,
                            'cogs' => 0,
                            'total_amount' => ((float) ($request->unit_price ?? $item->unit_price)) * $extraQty,
                        ]);
                        $newQuantity = $oldQuantity;
                    } elseif ($newQuantity < $oldQuantity) {
                        throw new \Exception('Cannot reduce quantity on a scanned barcode row. Remove the scanned row to release that barcode.');
                    }
                } else {
                    // For increases, validate global available inventory
                    if ($diff > 0) {
                        $reserved = \App\Models\ReservedProduct::where('product_id', $item->product_id)->lockForUpdate()->first();
                        $available = $reserved ? $reserved->available_inventory : 0;
                        
                        if ($available < $diff) {
                            throw new \Exception("Insufficient global stock to increase quantity for '{$item->product_name}'. Available: {$available}, needed: {$diff}");
                        }
                    }

                    // Recalculate tax for the new quantity
                    $batch = $item->batch;
                    $taxPercentage = $batch ? ($batch->tax_percentage ?? 0) : 0;
                    $unitPrice = $request->unit_price ?? $item->unit_price;
                    $item->tax_amount = $this->calculateTax($unitPrice, $newQuantity, $taxPercentage)['total_tax'];
                    
                    $item->updateQuantity($newQuantity);
                }
            }

            if ($request->filled('unit_price')) {
                $item->unit_price = $request->unit_price;
            }

            if ($request->filled('discount_amount')) {
                $item->applyDiscount($request->discount_amount);
            }

            $item->save();

            $order->calculateTotals();
            $order->save();
            $order->updatePaymentStatus();
            $this->refreshOnlineOrderFulfillmentState($order);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Item updated successfully',
                'data' => [
                    'item' => [
                        'id' => $item->id,
                        'quantity' => $item->quantity,
                        'unit_price' => number_format((float)$item->unit_price, 2),
                        'total' => number_format((float)$item->total_amount, 2),
                    ],
                    'order_totals' => [
                        'total_amount' => number_format((float)$order->fresh()->total_amount, 2),
                    ]
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Remove item from order
     * 
     * DELETE /api/orders/{orderId}/items/{itemId}
     */
    public function removeItem($orderId, $itemId)
    {
        $order = Order::find($orderId);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        if (!in_array($order->status, ['pending', 'pending_assignment', 'confirmed', 'assigned_to_store', 'picking', 'ready_for_shipment'])) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot remove items from ' . $order->status . ' orders'
            ], 422);
        }

        $item = OrderItem::where('order_id', $orderId)->find($itemId);

        if (!$item) {
            return response()->json([
                'success' => false,
                'message' => 'Item not found'
            ], 404);
        }

        DB::beginTransaction();
        try {
            if ($order->items()->count() <= 1) {
                throw new \Exception('Cannot remove the last item from an order.');
            }

            if ($order->needsFulfillment() && $item->product_barcode_id) {
                $this->releaseScannedBarcodeFromItem($item, 'item_removed_during_order_edit', true);
            }

            $item->delete();
            
            $order->calculateTotals();
            $order->save();
            $order->updatePaymentStatus();
            $this->refreshOnlineOrderFulfillmentState($order);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Item removed successfully',
                'data' => [
                    'order_totals' => [
                        'total_amount' => number_format((float)$order->fresh()->total_amount, 2),
                        'outstanding_amount' => number_format((float)$order->fresh()->outstanding_amount, 2),
                    ]
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Complete order and reduce inventory
     * 
     * UPDATED: Handles both barcode-tracked and non-barcode orders
     * For barcode-tracked items: marks individual barcodes as sold
     * For non-barcode items: just reduces batch quantity
     * This is called after payment is complete or for credit sales
     * 
     * NEW: Validates fulfillment requirement for social/ecommerce orders
     * 
     * PATCH /api/orders/{id}/complete
     */
    public function complete($id)
    {
        $order = Order::with(['items.batch', 'items.barcode'])->find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        if (!in_array($order->status, ['pending', 'pending_assignment', 'assigned_to_store', 'confirmed', 'ready_for_shipment'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only pending, pending_assignment, confirmed, ready_for_shipment or store-assigned orders can be completed'
            ], 422);
        }

        // Validate fulfillment requirement for social commerce and ecommerce
        if ($order->needsFulfillment() && !$order->isFulfilled()) {
            return response()->json([
                'success' => false,
                'message' => 'Order must be fulfilled before completion. Please scan barcodes at warehouse first.',
                'hint' => 'Call POST /api/orders/' . $order->id . '/fulfill with barcode scans'
            ], 422);
        }

        DB::beginTransaction();
        try {
            $orderDate = $order->order_date ?: now();
            $metadata = is_array($order->metadata ?? null) ? $order->metadata : [];
            $defectiveOrderItemIds = array_map('intval', (array) ($metadata['defective_order_item_ids'] ?? []));
            $defectiveProductIdsByOrderItem = (array) ($metadata['defective_product_ids_by_order_item'] ?? []);

            // Reduce inventory for each item.
            // Keep item/barcode audit logs per unit, but batch stock and reservation
            // writes are grouped so online packing does not update the same batch
            // and reserved_products row once per scanned unit.
            $batchDeductions = [];
            $batchNotes = [];
            $reservationReleaseByProduct = [];
            $batchRemaining = [];

            foreach ($order->items as $item) {
                $batch = $item->batch;
                $isDefectiveResale = in_array((int) $item->id, $defectiveOrderItemIds, true)
                    || str_contains(strtolower((string) $item->product_name), '[defective/used resale]')
                    || str_contains(strtolower((string) $item->product_name), '[defective]');

                if (!$batch && !$isDefectiveResale) {
                    throw new \Exception("Batch not found for item {$item->product_name}");
                }

                if ($batch) {
                    $batchId = (int) $batch->id;
                    if (!array_key_exists($batchId, $batchRemaining)) {
                        $batchRemaining[$batchId] = (int) $batch->quantity;
                    }

                    if ($batchRemaining[$batchId] < (int) $item->quantity) {
                        $label = $isDefectiveResale ? 'resale stock' : 'stock';
                        throw new \Exception("Insufficient {$label} for {$item->product_name}. Available: {$batchRemaining[$batchId]}");
                    }

                    $batchRemaining[$batchId] -= (int) $item->quantity;
                }

                // Handle barcode-tracked items (check if barcode exists and is not null)
                if ($item->product_barcode_id && $item->barcode) {
                    $barcode = $item->barcode;
                    
                    // Validate barcode is still available (not already sold)
                    if ($barcode->current_status === 'sold' || $barcode->current_status === 'with_customer') {
                        throw new \Exception("Barcode {$barcode->barcode} for {$item->product_name} has already been sold.");
                    }

                    // Mark barcode as sold but keep it active for history/returns/refunds
                    // IMPORTANT: is_active stays TRUE to preserve history for returns/refunds/defects
                    $barcode->update([
                        'is_active' => true, // Keep active for history tracking
                        'current_status' => 'with_customer', // Tracks lifecycle state
                        'location_updated_at' => $orderDate,
                        'location_metadata' => [
                            'sold_via' => 'order',
                            'order_number' => $order->order_number,
                            'order_id' => $order->id,
                            'sale_date' => $orderDate->toISOString(),
                            'sold_by' => auth()->id(),
                        ]
                    ]);

                    // Log barcode sale
                    $note = sprintf(
                        "[%s] Sold 1 unit (Barcode: %s) via Order #%s",
                        now()->format('Y-m-d H:i:s'),
                        $barcode->barcode,
                        $order->order_number
                    );
                } else {
                    // Log non-barcode sale
                    $note = sprintf(
                        "[%s] Sold %d unit(s) (No barcode tracking) via Order #%s",
                        now()->format('Y-m-d H:i:s'),
                        $item->quantity,
                        $order->order_number
                    );
                }

                // Ensure COGS is stored/updated at the time of completion
                $calculatedCogs = ($batch ? ($batch->cost_price ?? 0) * $item->quantity : 0);
                
                Log::info('COGS Calculation', [
                    'order_item_id' => $item->id,
                    'product_name' => $item->product_name,
                    'batch_id' => $batch ? $batch->id : null,
                    'batch_cost_price' => $batch ? $batch->cost_price : null,
                    'quantity' => $item->quantity,
                    'calculated_cogs' => round($calculatedCogs, 2),
                    'existing_cogs' => $item->cogs,
                ]);
                
                $item->update(['cogs' => round($calculatedCogs, 2)]);

                if ($isDefectiveResale && $batch) {
                    $note = sprintf(
                        "[%s] Sold %d display/faulty/used resale unit(s) via Order #%s from resale batch",
                        now()->format('Y-m-d H:i:s'),
                        $item->quantity,
                        $order->order_number
                    );

                    $defectiveProductId = $defectiveProductIdsByOrderItem[$item->id] ?? $defectiveProductIdsByOrderItem[(string) $item->id] ?? null;
                    if ($defectiveProductId) {
                        $defectiveProduct = \App\Models\DefectiveProduct::whereKey($defectiveProductId)->lockForUpdate()->first();
                        if ($defectiveProduct && $defectiveProduct->status !== 'sold') {
                            $lineNet = max(0, (float) $item->total_amount);
                            $unitNet = $item->quantity > 0 ? round($lineNet / $item->quantity, 2) : (float) $item->unit_price;
                            $defectiveProduct->forceFill([
                                'status' => 'sold',
                                'sold_by' => auth()->id(),
                                'sold_at' => $orderDate,
                                'order_id' => $order->id,
                                'actual_selling_price' => $unitNet,
                                'sale_notes' => 'Sold via order #' . $order->order_number,
                            ])->save();
                        }
                    }

                    Log::info('Deducted resale batch stock for display/faulty/used item', [
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'product_id' => $item->product_id,
                        'batch_id' => $batch->id,
                    ]);
                } elseif ($batch && $order->order_type !== 'counter') {
                    $reservationReleaseByProduct[(int) $item->product_id] = ($reservationReleaseByProduct[(int) $item->product_id] ?? 0) + (int) $item->quantity;

                    Log::info('Reservation release queued at order completion', [
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'product_id' => $item->product_id,
                        'quantity' => $item->quantity,
                    ]);
                }

                if ($batch) {
                    $batchId = (int) $batch->id;
                    $batchDeductions[$batchId] = ($batchDeductions[$batchId] ?? 0) + (int) $item->quantity;
                    $batchNotes[$batchId][] = $note;
                }
            }

            foreach ($batchDeductions as $batchId => $quantityToDeduct) {
                /** @var \App\Models\ProductBatch|null $batch */
                $batch = \App\Models\ProductBatch::whereKey($batchId)->lockForUpdate()->first();
                if (!$batch) {
                    throw new \Exception("Batch {$batchId} not found while completing order {$order->order_number}");
                }

                if ((int) $batch->quantity < (int) $quantityToDeduct) {
                    throw new \Exception("Insufficient stock for batch {$batch->batch_number}. Available: {$batch->quantity}");
                }

                $batch->quantity = max(0, (int) $batch->quantity - (int) $quantityToDeduct);
                $batch->availability = $batch->quantity > 0;
                $batch->notes = trim(($batch->notes ? $batch->notes . "\n" : '') . implode("\n", $batchNotes[$batchId] ?? []));
                $batch->save();

                Log::info('Batch stock deducted at order completion', [
                    'order_id' => $order->id,
                    'batch_id' => $batch->id,
                    'quantity_deducted' => (int) $quantityToDeduct,
                    'quantity_remaining' => (int) $batch->quantity,
                ]);
            }

            foreach ($reservationReleaseByProduct as $productId => $quantityToRelease) {
                if ($reservedRecord = ReservedProduct::where('product_id', $productId)->lockForUpdate()->first()) {
                    $reservedRecord->reserved_inventory = max(0, (int) $reservedRecord->reserved_inventory - (int) $quantityToRelease);
                    $reservedRecord->available_inventory = max(0, (int) $reservedRecord->total_inventory - (int) $reservedRecord->reserved_inventory);
                    $reservedRecord->save();

                    Log::info('Reservation released at order completion', [
                        'order_id' => $order->id,
                        'product_id' => (int) $productId,
                        'quantity' => (int) $quantityToRelease,
                    ]);
                }
            }

            // Update order status to confirmed (delivered will be set when shipment is delivered).
            // Preserve the trusted POS/order date in both business and audit timestamps.
            $order->forceFill([
                'status' => 'confirmed',
                'confirmed_at' => $orderDate,
                'order_date' => $orderDate,
                'created_at' => $order->created_at ?: $orderDate,
                'updated_at' => $orderDate,
            ])->save();

            // Update customer purchase stats
            $order->customer->recordPurchase($order->total_amount, $order->id);

            // Create COGS accounting transactions
            // This posts the Cost of Goods Sold to the accounting system:
            // - Debit: COGS (Expense) - increases expense
            // - Credit: Inventory (Asset) - decreases inventory value
            try {
                $orderWithItems = $order->fresh(['items']);
                Transaction::createFromOrderCOGS($orderWithItems);
                $totalCogs = collect($orderWithItems->items)->sum('cogs');
                Log::info('COGS Transactions Created', [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'total_cogs' => $totalCogs,
                ]);
            } catch (\Exception $e) {
                Log::error('Failed to create COGS transactions', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
                // Don't fail the order completion if COGS transaction fails
                // Just log the error for manual correction
            }

            DB::commit();

            $message = 'Order completed successfully. Inventory updated.';
            $items = collect($order->items);
            $trackedCount = $items->filter(fn($item) => $item->product_barcode_id && $item->barcode)->count();
            $untrackedCount = $items->count() - $trackedCount;
            
            if ($trackedCount > 0) {
                $message .= " {$trackedCount} item(s) tracked with barcodes.";
            }
            if ($untrackedCount > 0) {
                $message .= " {$untrackedCount} item(s) completed without barcode tracking.";
            }

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => $this->formatOrderResponse($order->fresh([
                    'customer',
                    'store',
                    'items.product',
                    'items.batch',
                    'payments'
                ]), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }

    /**
     * Cancel order
     * 
     * PATCH /api/orders/{id}/cancel
     */
    public function cancel(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        if ($order->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Cannot cancel completed orders. Use returns instead.'
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Release reserved stock before changing status to cancelled.
            // OrderItemObserver only handles item create/update/delete, not order status changes.
            $reservationRelease = app(InventoryReservationService::class)
                ->releaseForCancelledOrder($order->loadMissing('items'));

            $order->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'notes' => ($order->notes ? $order->notes . "\n" : '') . 'Cancelled: ' . ($request->reason ?? 'No reason provided'),
                'metadata' => array_merge($order->metadata ?? [], [
                    'cancelled_by' => auth()->id(),
                    'reservation_release_on_cancel' => $reservationRelease,
                ]),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Order cancelled successfully',
                'data' => $this->formatOrderResponse($order->fresh(), true)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 422);
        }
    }





    private function releaseScannedBarcodeFromItem(OrderItem $item, string $reason = 'order_edit', bool $clearBatch = false): void
    {
        $barcode = $item->product_barcode_id
            ? ProductBarcode::whereKey($item->product_barcode_id)->lockForUpdate()->first()
            : null;

        if ($barcode) {
            $barcode->update([
                'is_active' => true,
                'current_status' => 'in_shop',
                'current_store_id' => $barcode->current_store_id ?: ($barcode->batch?->store_id),
                'location_updated_at' => now(),
                'location_metadata' => array_merge($barcode->location_metadata ?? [], [
                    'released_from_order_id' => $item->order_id,
                    'released_order_item_id' => $item->id,
                    'released_reason' => $reason,
                    'released_at' => now()->toDateTimeString(),
                    'released_by' => auth()->id(),
                ]),
            ]);
        }

        $payload = ['product_barcode_id' => null];
        if ($clearBatch) {
            $payload['product_batch_id'] = null;
        }
        $item->forceFill($payload)->saveQuietly();
    }

    private function clearOnlineOrderScans(Order $order, string $reason = 'order_edit', bool $clearBatch = true): array
    {
        $released = [];
        $items = $order->items()->with('barcode')->whereNotNull('product_barcode_id')->get();
        foreach ($items as $item) {
            $released[] = [
                'order_item_id' => (int) $item->id,
                'barcode' => $item->barcode?->barcode,
                'product_id' => (int) $item->product_id,
            ];
            $this->releaseScannedBarcodeFromItem($item, $reason, $clearBatch);
        }
        return $released;
    }

    private function refreshOnlineOrderFulfillmentState(Order $order): void
    {
        if (!$order->needsFulfillment() || in_array($order->status, ['cancelled', 'delivered'], true)) {
            return;
        }

        $order->refresh();
        $items = $order->items()->get();
        $totalQty = (int) $items->sum('quantity');
        $scannedQty = (int) $items->filter(fn ($item) => !empty($item->product_barcode_id))->sum('quantity');

        if (!$order->store_id) {
            $order->status = 'pending_assignment';
            $order->fulfillment_status = null;
            $order->fulfilled_at = null;
            $order->fulfilled_by = null;
        } elseif ($totalQty > 0 && $scannedQty >= $totalQty) {
            $order->status = 'ready_for_shipment';
            $order->fulfillment_status = 'fulfilled';
            $order->fulfilled_at = $order->fulfilled_at ?: now();
            $order->fulfilled_by = $order->fulfilled_by ?: auth()->id();
        } elseif ($scannedQty > 0) {
            $order->status = 'picking';
            $order->fulfillment_status = 'pending_fulfillment';
            $order->fulfilled_at = null;
            $order->fulfilled_by = null;
        } else {
            $order->status = 'assigned_to_store';
            $order->fulfillment_status = 'pending_fulfillment';
            $order->fulfilled_at = null;
            $order->fulfilled_by = null;
        }

        $order->metadata = array_merge($order->metadata ?? [], [
            'fulfillment_reconciled_at' => now()->toISOString(),
            'fulfillment_reconciled_by' => auth()->id(),
            'scanned_units' => $scannedQty,
            'total_units' => $totalQty,
        ]);
        $order->save();
    }

    /**
     * Edit safe offline/POS sale fields without changing sold item totals.
     * Editable: customer details, order date, and payment breakdown only.
     * The new payment breakdown must equal the amount already paid by the sale.
     */
    public function editOfflineSale(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'customer_phone' => 'nullable|string|max:30',
            'customer_email' => 'nullable|email|max:255',
            'customer_address' => 'nullable|string|max:1000',
            'order_date' => 'nullable|string|max:50',
            'payment_breakdown' => 'nullable|array',
            'payment_breakdown.*.payment_method_id' => 'required_with:payment_breakdown|exists:payment_methods,id',
            'payment_breakdown.*.amount' => 'required_with:payment_breakdown|numeric|min:0',
            'payment_breakdown.*.wallet' => 'nullable|string|max:50',
            'payment_breakdown.*.transaction_reference' => 'nullable|string|max:255',
            'payment_breakdown.*.notes' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        DB::beginTransaction();
        try {
            /** @var Order|null $order */
            $order = Order::with(['customer', 'items', 'payments.paymentSplits.paymentMethod', 'payments.paymentMethod'])
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$order) {
                throw new \Exception('Offline sale not found.');
            }

            if (!in_array($order->order_type, ['counter', 'offline', 'pos'], true)) {
                throw new \Exception('Only offline/POS sales can be edited from Offline Sale History.');
            }

            $metadata = is_array($order->metadata ?? null) ? $order->metadata : [];
            if (!empty($metadata['offline_sale_deleted']) || !empty($metadata['offline_sale_voided'])) {
                throw new \Exception('Deleted offline sales cannot be edited.');
            }

            $orderDate = $request->filled('order_date')
                ? $this->resolveTrustedOrderDate($request)
                : ($order->order_date ?: $order->created_at ?: now());

            if ($request->has('customer_name') || $request->has('customer_phone') || $request->has('customer_email') || $request->has('customer_address')) {
                $customer = $order->customer;
                if ($customer) {
                    if ($request->filled('customer_name')) $customer->name = $request->customer_name;
                    if ($request->filled('customer_phone')) $customer->phone = $request->customer_phone;
                    if ($request->has('customer_email')) $customer->email = $request->customer_email;
                    if ($request->has('customer_address')) $customer->address = $request->customer_address;
                    $customer->save();
                }
            }

            $oldDate = optional($order->order_date)->format('Y-m-d H:i:s');
            $order->order_date = $orderDate;
            $order->forceFill([
                'created_at' => $orderDate,
                'updated_at' => $orderDate,
            ]);
            $order->metadata = array_merge($metadata, [
                'offline_sale_last_edited_at' => now()->toISOString(),
                'offline_sale_last_edited_by' => auth()->id(),
                'offline_sale_previous_order_date' => $oldDate,
                'offline_sale_edit_scope' => 'customer_date_payment_breakdown_only',
            ]);
            $order->save();

            if ($request->has('payment_breakdown')) {
                $this->replaceOfflineSalePaymentBreakdown($order->fresh(['payments.paymentSplits']), $request->input('payment_breakdown') ?: [], $orderDate);
            } else {
                // Even date-only edits must move payment timestamps so the cash sheet follows the selected order day.
                $this->moveOfflineSalePaymentDates($order->fresh(['payments.paymentSplits']), $orderDate);
            }

            $order->refresh();
            $order->updatePaymentStatus();
            $order->forceFill(['updated_at' => $orderDate])->saveQuietly();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Offline sale updated. Item totals were not changed and cash sheet dates/payment breakdown were refreshed.',
                'data' => $this->formatOrderResponse($order->fresh([
                    'customer',
                    'store',
                    'items.product',
                    'items.batch',
                    'items.barcode',
                    'payments.paymentMethod',
                    'payments.paymentSplits.paymentMethod',
                    'createdBy',
                    'salesman',
                ]), true),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    private function replaceOfflineSalePaymentBreakdown(Order $order, array $breakdown, Carbon $paymentAt): void
    {
        $targetPaid = round((float) $order->paid_amount, 2);
        if ($targetPaid <= 0 && (float) $order->total_amount <= 0) {
            $targetPaid = 0.0;
        }

        $cleanBreakdown = collect($breakdown)
            ->map(function ($row) {
                return [
                    'payment_method_id' => (int) ($row['payment_method_id'] ?? 0),
                    'amount' => round((float) ($row['amount'] ?? 0), 2),
                    'wallet' => trim((string) ($row['wallet'] ?? '')),
                    'transaction_reference' => trim((string) ($row['transaction_reference'] ?? '')),
                    'notes' => trim((string) ($row['notes'] ?? '')),
                ];
            })
            ->filter(fn ($row) => $row['payment_method_id'] > 0 && $row['amount'] > 0)
            ->values();

        $newTotal = round((float) $cleanBreakdown->sum('amount'), 2);
        if (abs($newTotal - $targetPaid) > 0.01) {
            throw new \Exception("Payment breakdown total must remain ৳" . number_format($targetPaid, 2) . ". Current breakdown total is ৳" . number_format($newTotal, 2) . ".");
        }

        foreach ($order->payments as $payment) {
            \App\Models\Transaction::where('reference_type', \App\Models\OrderPayment::class)
                ->where('reference_id', $payment->id)
                ->update(['status' => 'cancelled']);

            foreach ($payment->paymentSplits as $split) {
                $split->status = 'cancelled';
                $split->save();
            }

            $payment->status = 'cancelled';
            $payment->metadata = array_merge($payment->metadata ?? [], [
                'replaced_by_offline_sale_edit_at' => now()->toISOString(),
                'replacement_order_date' => $paymentAt->toDateTimeString(),
            ]);
            $payment->save();
        }

        if ($targetPaid <= 0) {
            $order->forceFill([
                'paid_amount' => 0,
                'outstanding_amount' => max(0, (float) $order->total_amount),
                'payment_status' => (float) $order->total_amount <= 0 ? 'paid' : 'pending',
            ])->saveQuietly();
            return;
        }

        if ($cleanBreakdown->count() === 1) {
            $row = $cleanBreakdown->first();
            $method = PaymentMethod::findOrFail($row['payment_method_id']);
            $paymentData = $this->buildEditedPaymentData($row, $paymentAt);
            $payment = \App\Models\OrderPayment::create([
                'order_id' => $order->id,
                'payment_method_id' => $method->id,
                'customer_id' => $order->customer_id,
                'store_id' => $order->store_id,
                'processed_by' => auth()->id() ?: $order->created_by,
                'amount' => $targetPaid,
                'fee_amount' => $method->calculateFee($targetPaid),
                'net_amount' => $targetPaid - $method->calculateFee($targetPaid),
                'payment_type' => 'full',
                'payment_data' => $paymentData,
                'metadata' => ['offline_sale_payment_breakdown_edited' => true] + $paymentData,
                'notes' => $row['notes'] ?: 'Payment breakdown edited from Offline Sale History',
                'order_balance_before' => $targetPaid,
                'order_balance_after' => 0,
                'status' => 'pending',
            ]);
            $payment->forceFill([
                'payment_received_date' => $paymentAt->toDateString(),
                'processed_at' => $paymentAt,
                'created_at' => $paymentAt,
                'updated_at' => $paymentAt,
            ])->saveQuietly();
            $payment->process(auth()->user() instanceof Employee ? auth()->user() : null, $paymentAt);
            $payment->complete($row['transaction_reference'] ?: null, null, $paymentAt);
        } else {
            $payment = \App\Models\OrderPayment::create([
                'order_id' => $order->id,
                'payment_method_id' => null,
                'customer_id' => $order->customer_id,
                'store_id' => $order->store_id,
                'processed_by' => auth()->id() ?: $order->created_by,
                'amount' => $targetPaid,
                'fee_amount' => 0,
                'net_amount' => $targetPaid,
                'payment_type' => 'full',
                'payment_data' => ['payment_date' => $paymentAt->toDateTimeString()],
                'metadata' => ['offline_sale_payment_breakdown_edited' => true],
                'notes' => 'Split payment breakdown edited from Offline Sale History',
                'order_balance_before' => $targetPaid,
                'order_balance_after' => 0,
                'status' => 'pending',
            ]);
            $payment->forceFill([
                'payment_received_date' => $paymentAt->toDateString(),
                'processed_at' => $paymentAt,
                'created_at' => $paymentAt,
                'updated_at' => $paymentAt,
            ])->saveQuietly();

            $fees = 0;
            $seq = 1;
            foreach ($cleanBreakdown as $row) {
                $method = PaymentMethod::findOrFail($row['payment_method_id']);
                $split = \App\Models\PaymentSplit::createSplit($payment, $method, (float) $row['amount'], $seq++, $this->buildEditedPaymentData($row, $paymentAt));
                $split->forceFill([
                    'transaction_reference' => $row['transaction_reference'] ?: null,
                    'status' => 'completed',
                    'processed_at' => $paymentAt,
                    'completed_at' => $paymentAt,
                    'created_at' => $paymentAt,
                    'updated_at' => $paymentAt,
                    'metadata' => ['offline_sale_payment_breakdown_edited' => true] + $this->buildEditedPaymentData($row, $paymentAt),
                ])->saveQuietly();
                $fees += (float) $split->fee_amount;
            }

            $payment->fee_amount = $fees;
            $payment->net_amount = $targetPaid - $fees;
            $payment->save();
            $payment->process(auth()->user() instanceof Employee ? auth()->user() : null, $paymentAt);
            $payment->complete(null, null, $paymentAt);
        }

        $order->forceFill([
            'paid_amount' => $targetPaid,
            'outstanding_amount' => max(0, (float) $order->total_amount - $targetPaid),
            'payment_status' => $targetPaid + 0.01 >= (float) $order->total_amount ? 'paid' : ($targetPaid > 0 ? 'partial' : 'pending'),
        ])->saveQuietly();
    }

    private function buildEditedPaymentData(array $row, Carbon $paymentAt): array
    {
        $data = [
            'payment_date' => $paymentAt->toDateTimeString(),
            'edited_from_offline_sale_history' => true,
        ];

        if (!empty($row['wallet'])) {
            $wallet = strtolower($row['wallet']);
            $data['wallet'] = $wallet;
            $data['channel'] = $wallet;
            $data['provider'] = $wallet;
            $data['display_method'] = $wallet === 'bkash' ? 'bKash' : ($wallet === 'nagad' ? 'Nagad' : $row['wallet']);
        }

        if (!empty($row['transaction_reference'])) {
            $data['transaction_reference'] = $row['transaction_reference'];
        }

        return $data;
    }

    private function moveOfflineSalePaymentDates(Order $order, Carbon $paymentAt): void
    {
        foreach ($order->payments as $payment) {
            $payment->forceFill([
                'payment_received_date' => $paymentAt->toDateString(),
                'processed_at' => $payment->processed_at ? $paymentAt : null,
                'completed_at' => $payment->completed_at ? $paymentAt : null,
                'created_at' => $paymentAt,
                'updated_at' => $paymentAt,
            ])->saveQuietly();

            \App\Models\Transaction::where('reference_type', \App\Models\OrderPayment::class)
                ->where('reference_id', $payment->id)
                ->update(['transaction_date' => $paymentAt]);

            foreach ($payment->paymentSplits as $split) {
                $split->forceFill([
                    'processed_at' => $split->processed_at ? $paymentAt : null,
                    'completed_at' => $split->completed_at ? $paymentAt : null,
                    'created_at' => $paymentAt,
                    'updated_at' => $paymentAt,
                ])->saveQuietly();
            }
        }
    }

    /**
     * Safely void/delete an offline POS sale.
     * This is a soft-delete with inventory restoration and idempotency protection.
     */
    public function voidOfflineSale(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        DB::beginTransaction();
        try {
            /** @var Order|null $order */
            $order = Order::with([
                    'items.product',
                    'items.batch',
                    'items.barcode',
                    'returns',
                    'payments.paymentSplits',
                    'payments.paymentMethod',
                ])
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$order) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Offline sale not found.',
                ], 404);
            }

            if (!in_array($order->order_type, ['counter', 'offline', 'pos'], true)) {
                throw new \Exception('Only offline/POS sales can be deleted from Offline Sale History. Use normal cancellation for online/social orders.');
            }

            $metadata = is_array($order->metadata ?? null) ? $order->metadata : [];
            if (!empty($metadata['offline_sale_deleted'])) {
                DB::commit();
                return response()->json([
                    'success' => true,
                    'message' => 'Offline sale was already marked deleted earlier.',
                    'data' => $this->formatOrderResponse($order->fresh(['items.product', 'items.batch', 'items.barcode', 'payments.paymentSplits.paymentMethod']), true),
                ]);
            }

            $hasReturn = ProductReturn::where('order_id', $order->id)
                ->whereIn('status', ['pending', 'approved', 'processing', 'completed', 'refunded'])
                ->exists();

            if ($hasReturn) {
                throw new \Exception('This sale already has a return/exchange record. Delete is blocked to protect stock history. Use Lookup → Return/Exchange instead.');
            }

            $restoredItems = $this->restockDeletedOfflineSaleItems($order);
            $this->cancelOfflineSaleFinance($order);

            $originalFinancials = [
                'subtotal' => (float) $order->subtotal,
                'tax_amount' => (float) $order->tax_amount,
                'discount_amount' => (float) $order->discount_amount,
                'shipping_amount' => (float) $order->shipping_amount,
                'total_amount' => (float) $order->total_amount,
                'paid_amount' => (float) $order->paid_amount,
                'outstanding_amount' => (float) $order->outstanding_amount,
                'payment_status' => $order->payment_status,
                'status' => $order->status,
            ];

            $metadata['offline_sale_deleted'] = [
                'deleted_at' => now()->toISOString(),
                'deleted_by' => auth()->id(),
                'reason' => $request->reason ?: 'Deleted from Offline Sale History',
                'inventory_action' => 'restocked_to_new_batch',
                'finance_action' => 'cancelled_original_sale_ledger_and_payments',
                'cash_sheet_effective_date' => optional($order->order_date)->format('Y-m-d'),
                'original_financials' => $originalFinancials,
                'items' => $restoredItems,
                'return_exchange_blocked' => true,
            ];

            // Keep older key for lookup/front-end compatibility.
            $metadata['offline_sale_voided'] = [
                'voided_at' => $metadata['offline_sale_deleted']['deleted_at'],
                'voided_by' => auth()->id(),
                'reason' => $metadata['offline_sale_deleted']['reason'],
                'stock_restored_at' => now()->toISOString(),
                'restored_items' => $restoredItems,
                'inventory_action' => 'restocked_to_new_batch',
                'barcode_action' => 'reactivated_on_deleted_sale_batch',
            ];

            $order->status = 'cancelled';
            $order->payment_status = 'refunded';
            $order->paid_amount = 0;
            $order->outstanding_amount = 0;
            $order->cancelled_at = $order->cancelled_at ?: now();
            $order->notes = trim(($order->notes ? $order->notes . "\n" : '') . 'Deleted offline sale: ' . ($request->reason ?: 'No reason provided'));
            $order->metadata = $metadata;
            $order->save();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Offline sale marked deleted. A history record remains, stock was restored to a new batch, and original sale finance was cancelled for the original sale date.',
                'data' => $this->formatOrderResponse($order->fresh(['items.product', 'items.batch', 'items.barcode', 'payments.paymentSplits.paymentMethod']), true),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    private function restockDeletedOfflineSaleItems(Order $order): array
    {
        $restoredItems = [];

        foreach ($order->items as $item) {
            $originalBatch = $item->product_batch_id ? ProductBatch::whereKey($item->product_batch_id)->lockForUpdate()->first() : null;
            if (!$originalBatch) {
                $restoredItems[] = [
                    'order_item_id' => (int) $item->id,
                    'product_id' => (int) $item->product_id,
                    'quantity' => (int) $item->quantity,
                    'status' => 'skipped_no_original_batch',
                ];
                continue;
            }

            $restoreBatch = $this->resolveDeletedSaleRestoreBatch($originalBatch, $order);
            $quantity = max(1, (int) $item->quantity);
            $restoreBatch->increment('quantity', $quantity);

            $barcode = $item->barcode ?: ($item->product_barcode_id ? ProductBarcode::whereKey($item->product_barcode_id)->lockForUpdate()->first() : null);
            if ($barcode) {
                $barcode->update([
                    'batch_id' => $restoreBatch->id,
                    'current_store_id' => $restoreBatch->store_id,
                    'current_status' => 'in_shop',
                    'is_active' => true,
                    'is_defective' => false,
                    'location_updated_at' => now(),
                    'location_metadata' => array_merge($barcode->location_metadata ?? [], [
                        'restocked_from_deleted_offline_sale_at' => now()->toDateTimeString(),
                        'deleted_order_id' => $order->id,
                        'deleted_order_number' => $order->order_number,
                        'original_batch_id' => $originalBatch->id,
                        'restock_batch_id' => $restoreBatch->id,
                    ]),
                ]);

                ProductMovement::create([
                    'product_batch_id' => $restoreBatch->id,
                    'product_barcode_id' => $barcode->id,
                    'from_store_id' => null,
                    'to_store_id' => $restoreBatch->store_id,
                    'movement_type' => 'return',
                    'quantity' => 1,
                    'unit_cost' => $originalBatch->cost_price ?? 0,
                    'unit_price' => $item->unit_price ?? $originalBatch->sell_price ?? 0,
                    'total_cost' => $originalBatch->cost_price ?? 0,
                    'total_value' => $item->unit_price ?? $originalBatch->sell_price ?? 0,
                    'reference_number' => 'DEL-' . $order->order_number,
                    'reference_type' => 'offline_sale_delete',
                    'reference_id' => $order->id,
                    'status_before' => 'with_customer',
                    'status_after' => 'in_shop',
                    'notes' => 'Offline sale deleted; barcode restocked into new batch instead of original sale batch.',
                    'performed_by' => auth()->id(),
                ]);
            }

            $restoredItems[] = [
                'order_item_id' => (int) $item->id,
                'product_id' => (int) $item->product_id,
                'product_name' => $item->product_name,
                'quantity' => $quantity,
                'original_batch_id' => (int) $originalBatch->id,
                'restore_batch_id' => (int) $restoreBatch->id,
                'restore_batch_number' => $restoreBatch->batch_number,
                'barcode_id' => $barcode?->id,
                'barcode' => $barcode?->barcode,
                'status' => 'restocked_to_new_batch',
            ];
        }

        return $restoredItems;
    }

    private function resolveDeletedSaleRestoreBatch(ProductBatch $originalBatch, Order $order): ProductBatch
    {
        $base = 'DEL-' . $order->id . '-' . $originalBatch->id;
        $existing = ProductBatch::where('batch_number', $base)->lockForUpdate()->first();
        if ($existing) {
            return $existing;
        }

        return ProductBatch::create([
            'product_id' => $originalBatch->product_id,
            'store_id' => $originalBatch->store_id,
            'batch_number' => $base,
            'quantity' => 0,
            'cost_price' => $originalBatch->cost_price ?? 0,
            'sell_price' => $originalBatch->sell_price ?? 0,
            'tax_percentage' => $originalBatch->tax_percentage ?? 0,
            'manufactured_date' => $originalBatch->manufactured_date,
            'expiry_date' => $originalBatch->expiry_date,
            'availability' => true,
            'is_active' => true,
            'notes' => 'Auto-created batch for deleted offline sale ' . $order->order_number . ' from original batch ' . $originalBatch->batch_number,
        ]);
    }

    private function cancelOfflineSaleFinance(Order $order): void
    {
        foreach ($order->payments as $payment) {
            $metadata = is_array($payment->metadata ?? null) ? $payment->metadata : [];
            $metadata['offline_sale_deleted_cancelled_at'] = now()->toISOString();
            $metadata['offline_sale_deleted_order_id'] = $order->id;
            $payment->status = 'cancelled';
            $payment->metadata = $metadata;
            $payment->notes = trim(($payment->notes ? $payment->notes . "\n" : '') . 'Cancelled because offline sale was deleted.');
            $payment->save();

            if ($payment->relationLoaded('paymentSplits')) {
                foreach ($payment->paymentSplits as $split) {
                    $splitMetadata = is_array($split->metadata ?? null) ? $split->metadata : [];
                    $splitMetadata['offline_sale_deleted_cancelled_at'] = now()->toISOString();
                    $split->status = 'cancelled';
                    $split->metadata = $splitMetadata;
                    $split->save();
                }
            }

            Transaction::where('reference_type', \App\Models\OrderPayment::class)
                ->where('reference_id', $payment->id)
                ->update(['status' => 'cancelled']);
        }

        Transaction::where('reference_type', Order::class)
            ->where('reference_id', $order->id)
            ->update(['status' => 'cancelled']);
    }

    /**
     * Get order statistics
     * 
     * GET /api/orders/statistics
     */
    public function getStatistics(Request $request)
    {
        $query = Order::query();

        // Filter by date range using date-only comparisons.
        // This makes same-day filters inclusive for every time on that date.
        if ($request->filled('exact_date')) {
            $query->whereDate('order_date', $request->exact_date);
        } else {
            $dateFrom = $request->input('date_from');
            $dateTo = $request->input('date_to');

            if ($dateFrom && $dateTo && $dateFrom > $dateTo) {
                [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
            }

            if ($dateFrom) {
                $query->whereDate('order_date', '>=', $dateFrom);
            }

            if ($dateTo) {
                $query->whereDate('order_date', '<=', $dateTo);
            }
        }

        // Filter by store
        if ($request->filled('store_id')) {
            $query->where('store_id', $request->store_id);
        }

        // Filter by salesman
        if ($request->filled('created_by')) {
            $query->where('created_by', $request->created_by);
        }

        $stats = [
            'total_orders' => $query->count(),
            'by_type' => [
                'counter' => (clone $query)->where('order_type', 'counter')->count(),
                'social_commerce' => (clone $query)->where('order_type', 'social_commerce')->count(),
                'ecommerce' => (clone $query)->where('order_type', 'ecommerce')->count(),
            ],
            'by_status' => [
                'pending' => (clone $query)->where('status', 'pending')->count(),
                'confirmed' => (clone $query)->where('status', 'confirmed')->count(),
                'completed' => (clone $query)->where('status', 'completed')->count(),
                'cancelled' => (clone $query)->where('status', 'cancelled')->count(),
            ],
            'by_payment_status' => [
                'pending' => (clone $query)->where('payment_status', 'pending')->count(),
                'partially_paid' => (clone $query)->where('payment_status', 'partially_paid')->count(),
                'paid' => (clone $query)->where('payment_status', 'paid')->count(),
                'overdue' => (clone $query)->where('payment_status', 'overdue')->count(),
            ],
            'total_revenue' => (clone $query)->where('status', 'completed')->sum('total_amount'),
            'total_outstanding' => (clone $query)->whereIn('status', ['pending', 'confirmed', 'completed'])->sum('outstanding_amount'),
            'installment_orders' => (clone $query)->where('is_installment_payment', true)->count(),
        ];

        // Top salesmen
        if (!$request->filled('created_by')) {
            $stats['top_salesmen'] = Order::select('created_by')
                ->selectRaw('COUNT(*) as order_count')
                ->selectRaw('SUM(total_amount) as total_sales')
                ->with('createdBy:id,name')
                ->groupBy('created_by')
                ->orderByDesc('total_sales')
                ->limit(10)
                ->get()
                ->map(function ($item) {
                    return [
                        'employee_id' => $item->created_by,
                        'employee_name' => $item->createdBy->name ?? 'Unknown',
                        'order_count' => $item->order_count,
                        'total_sales' => number_format((float)$item->total_sales, 2),
                    ];
                });
        }

        return response()->json([
            'success' => true,
            'data' => $stats
        ]);
    }

    private const SOCIAL_ORDER_SOURCE_TAGS = ['fb', 'instagram', 'wp', 'internal'];

    private function normalizeOrderSourceTag($value): ?string
    {
        $raw = strtolower(trim((string) ($value ?? '')));
        $raw = str_replace([' ', '-'], '_', $raw);

        return match ($raw) {
            'facebook' => 'fb',
            'whatsapp', 'wa' => 'wp',
            'internal_order' => 'internal',
            default => in_array($raw, self::SOCIAL_ORDER_SOURCE_TAGS, true) ? $raw : null,
        };
    }

    private function extractOrderSourceTag(Request $request): ?string
    {
        $candidates = [
            $request->input('source_tag'),
            $request->input('order_source'),
        ];

        $tags = $request->input('tags', []);
        if (is_array($tags)) {
            $candidates = array_merge($candidates, $tags);
        }

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizeOrderSourceTag($candidate);
            if ($normalized) return $normalized;
        }

        return null;
    }

    private function extractOrderSourceTagFromMetadata(array $metadata): ?string
    {
        $candidates = [
            $metadata['source_tag'] ?? null,
            $metadata['order_source'] ?? null,
        ];
        if (!empty($metadata['tags']) && is_array($metadata['tags'])) {
            $candidates = array_merge($candidates, $metadata['tags']);
        }

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizeOrderSourceTag($candidate);
            if ($normalized) return $normalized;
        }

        return null;
    }

    private function buildOrderSourceMetadata(?string $sourceTag): array
    {
        if (!$sourceTag) return [];
        return [
            'order_source' => $sourceTag,
            'source_tag' => $sourceTag,
            'tags' => [$sourceTag],
        ];
    }

    private function applyOrderSourceFilter($query, $source): void
    {
        $sourceTag = $this->normalizeOrderSourceTag($source);
        if (!$sourceTag) return;

        $driver = DB::connection()->getDriverName();
        $query->where(function ($q) use ($sourceTag, $driver) {
            if ($driver === 'pgsql') {
                $q->whereRaw("metadata->>'order_source' = ?", [$sourceTag])
                    ->orWhereRaw("metadata->>'source_tag' = ?", [$sourceTag])
                    ->orWhereRaw("(metadata->'tags') ? ?", [$sourceTag]);
                return;
            }

            if ($driver === 'mysql') {
                $q->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.order_source')) = ?", [$sourceTag])
                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source_tag')) = ?", [$sourceTag])
                    ->orWhereRaw("JSON_CONTAINS(COALESCE(JSON_EXTRACT(metadata, '$.tags'), JSON_ARRAY()), JSON_QUOTE(?))", [$sourceTag]);
                return;
            }

            $q->where('metadata', 'like', '%"order_source":"' . $sourceTag . '"%')
                ->orWhere('metadata', 'like', '%"source_tag":"' . $sourceTag . '"%')
                ->orWhere('metadata', 'like', '%"' . $sourceTag . '"%');
        });
    }

    /**
     * Helper function to format order response
     */
    private function formatOrderPaymentResponse($payment): array
    {
        $splits = collect();

        if ($payment->relationLoaded('paymentSplits')) {
            $splits = $payment->paymentSplits;
        } elseif ($payment->hasSplits()) {
            $splits = $payment->paymentSplits()->with('paymentMethod')->get();
        }

        $paymentData = [
            'id' => $payment->id,
            'amount' => number_format((float)$payment->amount, 2),
            'payment_method_id' => $payment->payment_method_id,
            'payment_method' => $this->formatPaymentMethodLabel($payment->paymentMethod ?? null, $payment->payment_data ?? [], $payment->metadata ?? []),
            'payment_type' => $payment->payment_type,
            'status' => $payment->status,
            'processed_by' => $payment->processedBy?->name,
            'created_at' => $payment->created_at?->format('Y-m-d H:i:s'),
            'is_split_payment' => $splits->isNotEmpty(),
            'splits' => [],
        ];

        if ($splits->isNotEmpty()) {
            $sortedSplits = $splits->sortBy('split_sequence')->values();
            $mobileWithoutWallet = 0;
            $mobileTotal = $sortedSplits->filter(fn ($split) => $this->isMobileBankingMethod($split->paymentMethod ?? null))->count();

            $paymentData['splits'] = $sortedSplits
                ->map(function ($split) use (&$mobileWithoutWallet, $mobileTotal) {
                    $method = $split->paymentMethod ?? null;
                    $paymentData = is_array($split->payment_data ?? null) ? $split->payment_data : [];
                    $metadata = is_array($split->metadata ?? null) ? $split->metadata : [];
                    $label = $this->formatPaymentMethodLabel($method, $paymentData, $metadata);

                    // Old POS split payments stored both bKash and Nagad as generic
                    // Mobile Banking without metadata. The POS sends bKash first, Nagad second;
                    // keep that legacy data readable in history breakdowns.
                    if ($label === 'Mobile Banking' && $this->isMobileBankingMethod($method) && $mobileTotal > 1) {
                        $mobileWithoutWallet++;
                        $label = $mobileWithoutWallet === 1 ? 'bKash' : ($mobileWithoutWallet === 2 ? 'Nagad' : 'Mobile Banking');
                    }

                    return [
                        'payment_method_id' => $split->payment_method_id,
                        'payment_method' => $label,
                        'wallet' => strtolower((string) (($paymentData['wallet'] ?? $metadata['wallet'] ?? $paymentData['channel'] ?? $metadata['channel'] ?? ''))),
                        'amount' => number_format((float)$split->amount, 2),
                        'status' => $split->status,
                    ];
                })
                ->values();
        }

        return $paymentData;
    }

    private function formatPaymentMethodLabel($method, array $paymentData = [], array $metadata = []): string
    {
        $methodName = $method?->name ?? 'Unknown';
        $wallet = strtolower((string) (
            $paymentData['wallet']
            ?? $paymentData['channel']
            ?? $paymentData['provider']
            ?? $metadata['wallet']
            ?? $metadata['channel']
            ?? $metadata['provider']
            ?? ''
        ));

        if ($this->isMobileBankingMethod($method)) {
            if (str_contains($wallet, 'bkash') || str_contains($wallet, 'b-kash')) {
                return 'bKash';
            }
            if (str_contains($wallet, 'nagad')) {
                return 'Nagad';
            }
            if (preg_match('/bkash/i', json_encode($paymentData + $metadata))) {
                return 'bKash';
            }
            if (preg_match('/nagad/i', json_encode($paymentData + $metadata))) {
                return 'Nagad';
            }
            return 'Mobile Banking';
        }

        return $methodName;
    }

    private function isMobileBankingMethod($method): bool
    {
        $name = strtolower((string) ($method?->name ?? ''));
        $code = strtolower((string) ($method?->code ?? ''));
        $type = strtolower((string) ($method?->type ?? ''));

        return str_contains($name, 'mobile')
            || str_contains($code, 'mobile')
            || str_contains($type, 'mobile')
            || in_array($code, ['bkash', 'nagad'], true)
            || in_array($type, ['bkash', 'nagad'], true)
            || str_contains($name, 'bkash')
            || str_contains($name, 'nagad');
    }

    private function formatOrderResponse(Order $order, $detailed = false)
    {
        // Calculate COGS and gross margin for all responses
        $totalCogs = $order->items->sum(function ($i) {
            return $i->cogs ?? (($i->batch?->cost_price ?? 0) * $i->quantity);
        });
        $grossMargin = (float)$order->total_amount - $totalCogs;

        $metadata = is_array($order->metadata ?? null) ? $order->metadata : [];
        $sourceTag = $this->extractOrderSourceTagFromMetadata($metadata);
        $salesman = $order->salesman ?: $order->createdBy;

        $isDeletedOfflineSale = !empty($metadata['offline_sale_deleted']) || !empty($metadata['offline_sale_voided']);

        $response = [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'order_type' => $order->order_type,
            'order_type_label' => match($order->order_type) {
                'counter' => 'In-Person Sale',
                'social_commerce' => 'Social Commerce',
                'ecommerce' => 'E-commerce',
                default => $order->order_type,
            },
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'is_deleted_offline_sale' => $isDeletedOfflineSale,
            'offline_sale_deleted' => $metadata['offline_sale_deleted'] ?? ($metadata['offline_sale_voided'] ?? null),
            'return_exchange_blocked' => $isDeletedOfflineSale || in_array(strtolower((string) $order->status), ['cancelled', 'canceled', 'deleted', 'void'], true),
            'return_exchange_block_reason' => $isDeletedOfflineSale ? 'This offline sale was deleted and cannot be returned or exchanged.' : null,
            'notes' => $order->notes,
            'customer' => [
                'id' => $order->customer->id,
                'name' => $order->customer->name,
                'phone' => $order->customer->phone,
                'email' => $order->customer->email,
                'address' => $order->customer->address,
                'customer_code' => $order->customer->customer_code,
            ],
            'store' => $order->store ? [
                'id' => $order->store->id,
                'name' => $order->store->name,
                'address' => $order->store->address,
                'phone' => $order->store->phone,
            ] : null,
            'salesman' => $salesman ? [
                'id' => $salesman->id,
                'name' => $salesman->name,
            ] : null,
            'metadata' => $metadata,
            'order_source' => $sourceTag,
            'source_tag' => $sourceTag,
            'tags' => $metadata['tags'] ?? ($sourceTag ? [$sourceTag] : []),
            'subtotal' => number_format((float)$order->subtotal, 2),
            'tax_amount' => number_format((float)$order->tax_amount, 2),
            'discount_amount' => number_format((float)$order->discount_amount, 2),
            'shipping_amount' => number_format((float)$order->shipping_amount, 2),
            'total_amount' => number_format((float)$order->total_amount, 2),
            'paid_amount' => number_format((float)$order->paid_amount, 2),
            'outstanding_amount' => number_format((float)$order->outstanding_amount, 2),
            'total_cogs' => number_format($totalCogs, 2),
            'gross_margin' => number_format($grossMargin, 2),
            'gross_margin_percentage' => $order->total_amount > 0 ? number_format(($grossMargin / (float)$order->total_amount) * 100, 2) : '0.00',
            'is_installment' => $order->is_installment_payment,
            'order_date' => $order->order_date->format('Y-m-d H:i:s'),
            'created_at' => $order->created_at->format('Y-m-d H:i:s'),
        ];

        // Always include payment breakdowns so list pages, expanded details, and exports
        // can show split-payment methods and amounts instead of only "Split Payment".
        $response['payments'] = $order->payments->map(fn ($payment) => $this->formatOrderPaymentResponse($payment));
        $response['payment_method_summary'] = $response['payments']
            ->flatMap(function ($payment) {
                $splits = collect($payment['splits'] ?? []);

                if ($splits->isNotEmpty()) {
                    return $splits->map(fn ($split) => trim(($split['payment_method'] ?? 'Unknown') . ' ৳' . ($split['amount'] ?? '0.00')));
                }

                return [trim(($payment['payment_method'] ?? 'Unknown') . ' ৳' . ($payment['amount'] ?? '0.00'))];
            })
            ->filter()
            ->values()
            ->implode(' + ');

        if ($detailed) {
            $response['items'] = $order->items->map(function ($item) {
                return [
                    'id' => $item->id,
                    'product_id' => $item->product_id,
                    'product_name' => $item->product_name,
                    'product_sku' => $item->product_sku,
                    'batch_id' => $item->product_batch_id,
                    'batch_number' => $item->batch?->batch_number,
                    'barcode_id' => $item->product_barcode_id,
                    'barcode' => $item->barcode?->barcode,
                    'quantity' => $item->quantity,
                    'global_available' => $item->product?->reservedProduct?->available_inventory ?? 0,
                    'unit_price' => number_format((float)$item->unit_price, 2),
                    'discount_amount' => number_format((float)$item->discount_amount, 2),
                    'tax_amount' => number_format((float)$item->tax_amount, 2),
                    'total_amount' => number_format((float)$item->total_amount, 2),
                    'cogs' => number_format((float)($item->cogs ?? (($item->batch?->cost_price ?? 0) * $item->quantity)), 2),
                    'item_gross_margin' => number_format((float)$item->total_amount - (float)($item->cogs ?? (($item->batch?->cost_price ?? 0) * $item->quantity)), 2),
                ];
            });

            if ($order->is_installment_payment) {
                $response['installment_info'] = [
                    'total_installments' => $order->total_installments,
                    'paid_installments' => $order->paid_installments,
                    'installment_amount' => number_format((float)$order->installment_amount, 2),
                    'next_payment_due' => $order->next_payment_due ? date('Y-m-d', strtotime($order->next_payment_due)) : null,
                    'is_overdue' => $order->isPaymentOverdue(),
                    'days_overdue' => $order->getDaysOverdue(),
                ];
            }

            $response['notes'] = $order->notes;
            $response['shipping_address'] = $order->shipping_address;
            $response['confirmed_at'] = $order->confirmed_at?->format('Y-m-d H:i:s');
        }

        return $response;
    }

    /**
     * Fulfill order by scanning barcodes (for social commerce/ecommerce)
     * 
     * This is the NEW step requested by client:
     * - Social commerce employee creates order WITHOUT barcodes (works from home)
     * - At end of day, warehouse staff scans barcodes to fulfill the order
     * - This assigns specific physical units (barcodes) to order items
     * - After fulfillment, order can be shipped via Pathao
     * 
     * POST /api/orders/{id}/fulfill
     * Body: {
     *   "fulfillments": [
     *     {
     *       "order_item_id": 123,
     *       "barcodes": ["BARCODE-001", "BARCODE-002"]  // Scan actual units
     *     },
     *     {
     *       "order_item_id": 124,
     *       "barcodes": ["BARCODE-003"]
     *     }
     *   ]
     * }
     */
    public function fulfill(Request $request, $id)
    {
        $order = Order::with(['items.batch', 'items.product'])->find($id);

        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'Order not found'
            ], 404);
        }

        // Only social commerce and ecommerce orders need fulfillment
        if (!$order->needsFulfillment()) {
            return response()->json([
                'success' => false,
                'message' => 'This order type does not require fulfillment. Counter orders are fulfilled immediately.'
            ], 422);
        }

        if (!$order->canBeFulfilled()) {
            return response()->json([
                'success' => false,
                'message' => "Order cannot be fulfilled. Current status: {$order->status}, Fulfillment status: {$order->fulfillment_status}"
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'fulfillments' => 'required|array|min:1',
            'fulfillments.*.order_item_id' => 'required|integer',
            'fulfillments.*.barcodes' => 'nullable|array',
            'fulfillments.*.barcodes.*' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        DB::beginTransaction();
        try {
            $fulfilledItems = [];
            $employee = Employee::find(Auth::id());
            $orderItemsById = $order->items->keyBy('id');
            $allBarcodeValues = collect($request->fulfillments)
                ->flatMap(fn ($fulfillment) => $fulfillment['barcodes'] ?? [])
                ->map(fn ($barcode) => trim((string) $barcode))
                ->filter()
                ->unique()
                ->values();

            $barcodesByValue = $allBarcodeValues->isEmpty()
                ? collect()
                : \App\Models\ProductBarcode::with('batch')
                    ->whereIn('barcode', $allBarcodeValues->all())
                    ->lockForUpdate()
                    ->get()
                    ->groupBy('barcode');

            foreach ($request->fulfillments as $fulfillment) {
                $orderItem = $orderItemsById->get((int) $fulfillment['order_item_id']);

                if (!$orderItem) {
                    throw new \Exception("Order item {$fulfillment['order_item_id']} not found in this order");
                }

                $barcodes = array_values(array_filter(array_map(
                    fn ($barcode) => trim((string) $barcode),
                    $fulfillment['barcodes'] ?? []
                ), fn ($barcode) => $barcode !== ''));
                $isDefectiveResale = str_contains(strtolower((string) $orderItem->product_name), '[defective/used resale]')
                    || str_contains(strtolower((string) $orderItem->product_name), '[defective]');

                // Defective/used resale items are fulfilled from the Extra Panel stock bucket.
                // They do not need normal packing barcode scans because their barcode is not active sellable stock anymore.
                if ($isDefectiveResale && count($barcodes) === 0) {
                    $fulfilledItems[] = [
                        'item_id' => $orderItem->id,
                        'product_name' => $orderItem->product_name,
                        'barcodes' => [],
                        'note' => 'Defective/used resale item fulfilled without normal packing barcode scan',
                    ];
                    continue;
                }
                
                // Validate quantity matches
                if (count($barcodes) !== $orderItem->quantity) {
                    throw new \Exception("Item '{$orderItem->product_name}' requires {$orderItem->quantity} barcode(s), but " . count($barcodes) . " provided");
                }

                // Prevent the same physical barcode from being submitted twice in one fulfillment payload.
                $normalizedBarcodes = array_map(fn ($value) => trim((string) $value), $barcodes);
                if (count($normalizedBarcodes) !== count(array_unique($normalizedBarcodes))) {
                    throw new \Exception("Duplicate barcode scanned for item '{$orderItem->product_name}'. Each quantity must use a different physical barcode.");
                }

                // Validate all barcodes. They were preloaded above so packing does
                // not run one or two database queries for every scanned unit.
                $barcodeModels = [];
                foreach ($barcodes as $barcodeValue) {
                    $matches = $barcodesByValue->get($barcodeValue, collect());
                    $barcode = $matches->first(function ($candidate) use ($orderItem) {
                        return (int) $candidate->product_id === (int) $orderItem->product_id
                            && (empty($orderItem->product_batch_id) || (int) $candidate->batch_id === (int) $orderItem->product_batch_id);
                    });

                    if (!$barcode) {
                        $barcode = $matches->first(fn ($candidate) => (int) $candidate->product_id === (int) $orderItem->product_id);
                    }

                    if (!$barcode) {
                        throw new \Exception("Barcode {$barcodeValue} not found for product {$orderItem->product_name}");
                    }

                    // Check if barcode is already sold or already packed for another active order.
                    if (in_array($barcode->current_status, ['sold', 'with_customer'])) {
                        throw new \Exception("Barcode {$barcodeValue} has already been sold");
                    }

                    $barcodeMetadata = is_array($barcode->location_metadata) ? $barcode->location_metadata : [];
                    $heldOrderId = (int) ($barcodeMetadata['reserved_for_order_id'] ?? 0);
                    if ($barcode->current_status === 'in_shipment' && $heldOrderId > 0 && $heldOrderId !== (int) $order->id) {
                        throw new \Exception("Barcode {$barcodeValue} is already packed for another order");
                    }

                    if (!in_array($barcode->current_status, ['available', 'in_shop', 'in_warehouse', 'on_display'], true)
                        && !($barcode->current_status === 'in_shipment' && $heldOrderId === (int) $order->id)
                    ) {
                        throw new \Exception("Barcode {$barcodeValue} is not available for packing. Current status: {$barcode->current_status}");
                    }

                    if ($barcode->is_defective && !$isDefectiveResale) {
                        throw new \Exception("Barcode {$barcodeValue} is marked as defective");
                    }

                    // Verify barcode belongs to correct store
                    if ($barcode->batch && $barcode->batch->store_id != $order->store_id) {
                        throw new \Exception("Barcode {$barcodeValue} belongs to Store " . ($barcode->batch->store_id ?? 'Unknown') . ". This order must be fulfilled from Store " . $order->store_id);
                    }

                    $barcodeModels[] = $barcode;
                }

                // For single quantity items, assign the barcode and its batch directly
                if ($orderItem->quantity == 1) {
                    $orderItem->update([
                        'product_barcode_id' => $barcodeModels[0]->id,
                        'product_batch_id' => $barcodeModels[0]->batch_id // Sync batch ID with physical unit
                    ]);

                    $barcodeModels[0]->update([
                        'is_active' => true,
                        'current_status' => 'in_shipment',
                        'current_store_id' => $order->store_id ?: ($barcodeModels[0]->current_store_id ?: ($barcodeModels[0]->batch?->store_id)),
                        'location_updated_at' => now(),
                        'location_metadata' => array_merge($barcodeModels[0]->location_metadata ?? [], [
                            'reserved_for_order_id' => $order->id,
                            'reserved_for_order_number' => $order->order_number,
                            'reserved_order_item_id' => $orderItem->id,
                            'reserved_by' => Auth::id(),
                            'reserved_at' => now()->toDateTimeString(),
                            'stock_deducted_on_scan' => false,
                            'packing_lifecycle_status' => 'reserved_for_order',
                            'packing_batch_quantity_before' => $barcodeModels[0]->batch ? (int) $barcodeModels[0]->batch->quantity : null,
                        ]),
                    ]);
                    
                    $fulfilledItems[] = [
                        'item_id' => $orderItem->id,
                        'product_name' => $orderItem->product_name,
                        'barcodes' => [$barcodeModels[0]->barcode]
                    ];
                } else {
                    // For multiple quantity items, we need to split into individual items
                    // This maintains proper barcode tracking
                    $originalQuantity = $orderItem->quantity;
                    $unitPrice = $orderItem->unit_price;
                    $discountPerUnit = $orderItem->discount_amount / $originalQuantity;
                    $taxPerUnit = $orderItem->tax_amount / $originalQuantity;
                    $cogsPerUnit = ($orderItem->cogs ?? 0) / $originalQuantity;

                    // Update first item with first barcode and its batch
                    $orderItem->update([
                        'quantity' => 1,
                        'product_barcode_id' => $barcodeModels[0]->id,
                        'product_batch_id' => $barcodeModels[0]->batch_id, // Sync batch ID
                        'discount_amount' => round($discountPerUnit, 2),
                        'tax_amount' => round($taxPerUnit, 2),
                        'cogs' => round($cogsPerUnit, 2),
                        'total_amount' => round($unitPrice - $discountPerUnit + $taxPerUnit, 2),
                    ]);

                    $barcodeModels[0]->update([
                        'is_active' => true,
                        'current_status' => 'in_shipment',
                        'current_store_id' => $order->store_id ?: ($barcodeModels[0]->current_store_id ?: ($barcodeModels[0]->batch?->store_id)),
                        'location_updated_at' => now(),
                        'location_metadata' => array_merge($barcodeModels[0]->location_metadata ?? [], [
                            'reserved_for_order_id' => $order->id,
                            'reserved_for_order_number' => $order->order_number,
                            'reserved_order_item_id' => $orderItem->id,
                            'reserved_by' => Auth::id(),
                            'reserved_at' => now()->toDateTimeString(),
                            'stock_deducted_on_scan' => false,
                            'packing_lifecycle_status' => 'reserved_for_order',
                            'packing_batch_quantity_before' => $barcodeModels[0]->batch ? (int) $barcodeModels[0]->batch->quantity : null,
                        ]),
                    ]);

                    $fulfilledBarcodes = [$barcodeModels[0]->barcode];

                    // Create new items for remaining barcodes
                    for ($i = 1; $i < count($barcodeModels); $i++) {
                        $splitOrderItem = OrderItem::create([
                            'order_id' => $order->id,
                            'product_id' => $orderItem->product_id,
                            'product_batch_id' => $barcodeModels[$i]->batch_id, // Use actual batch ID of the barcode
                            'product_barcode_id' => $barcodeModels[$i]->id,
                            'product_name' => $orderItem->product_name,
                            'product_sku' => $orderItem->product_sku,
                            'quantity' => 1,
                            'unit_price' => $unitPrice,
                            'discount_amount' => round($discountPerUnit, 2),
                            'tax_amount' => round($taxPerUnit, 2),
                            'cogs' => round($cogsPerUnit, 2),
                            'total_amount' => round($unitPrice - $discountPerUnit + $taxPerUnit, 2),
                        ]);

                        $barcodeModels[$i]->update([
                            'is_active' => true,
                            'current_status' => 'in_shipment',
                            'current_store_id' => $order->store_id ?: ($barcodeModels[$i]->current_store_id ?: ($barcodeModels[$i]->batch?->store_id)),
                            'location_updated_at' => now(),
                            'location_metadata' => array_merge($barcodeModels[$i]->location_metadata ?? [], [
                                'reserved_for_order_id' => $order->id,
                                'reserved_for_order_number' => $order->order_number,
                                'reserved_order_item_id' => $splitOrderItem->id,
                                'reserved_by' => Auth::id(),
                                'reserved_at' => now()->toDateTimeString(),
                                'stock_deducted_on_scan' => false,
                                'packing_batch_quantity_before' => $barcodeModels[$i]->batch ? (int) $barcodeModels[$i]->batch->quantity : null,
                            ]),
                        ]);

                        $fulfilledBarcodes[] = $barcodeModels[$i]->barcode;
                    }

                    $fulfilledItems[] = [
                        'item_id' => $orderItem->id,
                        'product_name' => $orderItem->product_name,
                        'original_quantity' => $originalQuantity,
                        'barcodes' => $fulfilledBarcodes
                    ];
                }
            }

            // Mark order as fulfilled
            $order->fulfill($employee);

            // Recalculate totals (in case of splitting)
            $order->calculateTotals();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Order fulfilled successfully. Ready for shipment.',
                'data' => [
                    'order_number' => $order->order_number,
                    'fulfillment_status' => $order->fulfillment_status,
                    'fulfilled_at' => $order->fulfilled_at->format('Y-m-d H:i:s'),
                    'fulfilled_by' => $order->fulfilledBy->name,
                    'fulfilled_items' => $fulfilledItems,
                    'next_step' => 'Create shipment for delivery',
                ]
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Fulfillment failed: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * Calculate tax based on TAX_MODE configuration
     * 
     * @param float $unitPrice The price per unit
     * @param int $quantity Number of units
     * @param float $taxPercentage Tax percentage
     * @return array ['base_price' => float, 'tax_per_unit' => float, 'total_tax' => float]
     */
    private function calculateTax(float $unitPrice, int $quantity, float $taxPercentage): array
    {
        $taxMode = config('app.tax_mode', 'inclusive');

        if ($taxPercentage <= 0) {
            return [
                'base_price' => $unitPrice,
                'tax_per_unit' => 0,
                'total_tax' => 0,
            ];
        }

        if ($taxMode === 'inclusive') {
            // Inclusive: unitPrice includes tax, extract base and tax
            $basePrice = round($unitPrice / (1 + ($taxPercentage / 100)), 2);
            $taxPerUnit = round($unitPrice - $basePrice, 2);
        } else {
            // Exclusive: unitPrice is the base, tax is added on top
            $basePrice = $unitPrice;
            $taxPerUnit = round($unitPrice * ($taxPercentage / 100), 2);
        }

        return [
            'base_price' => $basePrice,
            'tax_per_unit' => $taxPerUnit,
            'total_tax' => $taxPerUnit * $quantity,
        ];
    }

    /**
     * Set intended courier for an order
     * 
     * PATCH /api/orders/{id}/set-courier
     * Body: { "intended_courier": "pathao" }
     */
    public function setIntendedCourier(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'intended_courier' => 'required|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        $order = Order::findOrFail($id);

        $order->update([
            'intended_courier' => $request->intended_courier
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Intended courier set successfully',
            'data' => [
                'order_number' => $order->order_number,
                'intended_courier' => $order->intended_courier
            ]
        ]);
    }

    /**
     * Get orders by intended courier with search and sort
     * 
     * GET /api/orders/by-courier?courier=pathao&status=pending&sort_by=created_at&sort_order=desc
     */
    public function getOrdersByCourier(Request $request)
    {
        $query = Order::with([
            'customer',
            'store',
            'items.product'
        ]);

        // Filter by intended courier (required)
        if ($request->filled('courier')) {
            $query->where('intended_courier', $request->courier);
        } else {
            // If no courier specified, group by courier
            $couriers = Order::whereNotNull('intended_courier')
                ->select('intended_courier', DB::raw('COUNT(*) as order_count'))
                ->groupBy('intended_courier')
                ->get();
            
            return response()->json([
                'success' => true,
                'data' => $couriers
            ]);
        }

        // Additional filters
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('store_id')) {
            $query->where('store_id', $request->store_id);
        }

        if ($request->filled('date_from')) {
            $query->where('order_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->where('order_date', '<=', $request->date_to);
        }

        // Search
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $this->whereLike($q, 'order_number', $request->search);
                $q->orWhereHas('customer', function ($customerQuery) use ($request) {
                    $this->whereLike($customerQuery, 'name', $request->search);
                    $this->orWhereLike($customerQuery, 'phone', $request->search);
                });
            });
        }

        // Sort
        $sortBy = $request->input('sort_by', 'created_at');
        $sortOrder = $request->input('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $orders = $query->paginate($request->input('per_page', 20));

        $formattedOrders = [];
        foreach ($orders as $order) {
            $formattedOrders[] = $this->formatOrderResponse($order);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'current_page' => $orders->currentPage(),
                'data' => $formattedOrders,
                'first_page_url' => $orders->url(1),
                'from' => $orders->firstItem(),
                'last_page' => $orders->lastPage(),
                'last_page_url' => $orders->url($orders->lastPage()),
                'next_page_url' => $orders->nextPageUrl(),
                'path' => $orders->path(),
                'per_page' => $orders->perPage(),
                'prev_page_url' => $orders->previousPageUrl(),
                'to' => $orders->lastItem(),
                'total' => $orders->total(),
                'courier' => $request->courier
            ]
        ]);
    }

    /**
     * Lookup single order by intended courier
     * 
     * GET /api/orders/lookup-courier/{orderId}
     */
    public function lookupOrderCourier($orderId)
    {
        $order = Order::with(['customer', 'store'])
            ->findOrFail($orderId);

        return response()->json([
            'success' => true,
            'data' => [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
                'intended_courier' => $order->intended_courier,
                'status' => $order->status,
                'customer_name' => $order->customer->name,
                'store_name' => $order->store?->name,
                'total_amount' => $order->total_amount,
                'created_at' => $order->created_at->format('Y-m-d H:i:s'),
            ]
        ]);
    }

    /**
     * Bulk lookup orders by IDs
     * 
     * POST /api/orders/bulk-lookup-courier
     * Body: { "order_ids": [1, 2, 3] }
     */
    public function bulkLookupCourier(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'order_ids' => 'required|array|min:1',
            'order_ids.*' => 'integer|exists:orders,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        $orders = Order::with(['customer', 'store'])
            ->whereIn('id', $request->order_ids)
            ->get();

        $results = $orders->map(function ($order) {
            return [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
                'intended_courier' => $order->intended_courier,
                'status' => $order->status,
                'customer_name' => $order->customer->name,
                'store_name' => $order->store?->name,
                'total_amount' => $order->total_amount,
                'created_at' => $order->created_at->format('Y-m-d H:i:s'),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'total_orders' => $results->count(),
                'orders' => $results
            ]
        ]);
    }

    /**
     * Get available couriers (distinct values)
     * 
     * GET /api/orders/available-couriers
     */
    public function getAvailableCouriers()
    {
        $couriers = Order::whereNotNull('intended_courier')
            ->select('intended_courier', DB::raw('COUNT(*) as order_count'))
            ->groupBy('intended_courier')
            ->orderBy('order_count', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $couriers
        ]);
    }

    /**
     * Bulk export selected orders to CSV
     * 
     * POST /api/orders/bulk-export
     */
    public function bulkExport(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'order_ids' => 'required|array|min:1',
            'order_ids.*' => 'integer|exists:orders,id',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        $orders = Order::with(['customer', 'store', 'items'])
            ->whereIn('id', $request->order_ids)
            ->get();

        $filename = 'orders_export_' . date('Y-m-d_His') . '.csv';
        
        $callback = function() use ($orders) {
            $file = fopen('php://output', 'w');
            
            // CSV Header from order_sample.csv
            fputcsv($file, [
                'ItemType', 
                'StoreName', 
                'MerchantOrderId', 
                'RecipientName(*)', 
                'RecipientPhone(*)', 
                'RecipientAddress(*)', 
                'RecipientCity(*)', 
                'RecipientZone(*)', 
                'RecipientArea', 
                'AmountToCollect(*)', 
                'ItemQuantity', 
                'ItemWeight', 
                'ItemDesc', 
                'SpecialInstruction'
            ]);

            foreach ($orders as $order) {
                $shipping = is_array($order->shipping_address) ? $order->shipping_address : json_decode($order->shipping_address, true);
                if (!$shipping) $shipping = [];

                $customer = $order->customer;
                
                // Robust address extraction
                $recipientAddress = '';
                if (!empty($shipping['address_line_1'])) {
                    $recipientAddress = $shipping['address_line_1'];
                } elseif (!empty($shipping['street'])) {
                    $recipientAddress = $shipping['street'];
                } elseif (!empty($shipping['address'])) {
                    $recipientAddress = $shipping['address'];
                } elseif ($customer) {
                    $recipientAddress = $customer->address ?? '';
                }

                // Item descriptions: join product names
                $itemDesc = $order->items->pluck('product_name')->implode(', ');
                $totalItems = $order->items->sum('quantity');

                fputcsv($file, [
                    'parcel', // ItemType
                    $order->store->name ?? '', // StoreName
                    $order->order_number, // MerchantOrderId
                    $order->customer_name ?? ($customer ? $customer->name : ''), // RecipientName
                    $order->customer_phone ?? ($customer ? $customer->phone : ''), // RecipientPhone
                    $recipientAddress, // RecipientAddress
                    $shipping['city'] ?? '', // RecipientCity
                    $shipping['zone'] ?? '', // RecipientZone
                    $shipping['area'] ?? '', // RecipientArea
                    round($order->outstanding_amount, 2), // AmountToCollect
                    $totalItems, // ItemQuantity
                    '0.5 Kg', // ItemWeight
                    $itemDesc, // ItemDesc
                    $order->notes ?? '' // SpecialInstruction
                ]);
            }

            fclose($file);
        };

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"$filename\"",
        ]);
    }
}


