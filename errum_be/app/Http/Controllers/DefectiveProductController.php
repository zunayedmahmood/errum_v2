<?php

namespace App\Http\Controllers;

use App\Models\DefectiveProduct;
use App\Models\ProductBarcode;
use App\Models\Product;
use App\Models\Order;
use App\Models\Vendor;
use App\Models\Employee;
use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class DefectiveProductController extends Controller
{
    use DatabaseAgnosticSearch;
    /**
     * Get all defective products
     */
    public function index(Request $request): JsonResponse
    {
        try {
            $query = DefectiveProduct::with([
                'product',
                'barcode',
                'batch',
                'store',
                'identifiedBy',
                'inspectedBy',
                'soldBy',
                'order',
                'vendor'
            ]);

            // Filter by status
            if ($request->has('status')) {
                $query->where('status', $request->status);
            }

            // Filter by store
            if ($request->has('store_id')) {
                $query->where('store_id', $request->store_id);
            }

            // Filter by severity
            if ($request->has('severity')) {
                $query->where('severity', $request->severity);
            }

            // Filter by defect type
            if ($request->has('defect_type')) {
                $query->where('defect_type', $request->defect_type);
            }

            // Filter by date range
            if ($request->has('from_date')) {
                $query->where('identified_at', '>=', $request->from_date);
            }

            if ($request->has('to_date')) {
                $query->where('identified_at', '<=', $request->to_date);
            }

            // Search by barcode or product name
            if ($request->has('search')) {
                $search = $request->search;
                $query->where(function ($q) use ($search) {
                    $q->whereHas('barcode', function ($bq) use ($search) {
                        $this->whereLike($bq, 'barcode', $search);
                    })->orWhereHas('product', function ($pq) use ($search) {
                        $this->whereLike($pq, 'name', $search);
                    });
                });
            }

            // Sort
            $sortBy = $request->get('sort_by', 'created_at');
            $sortOrder = $request->get('sort_order', 'desc');
            $query->orderBy($sortBy, $sortOrder);

            // Pagination
            $perPage = $request->get('per_page', 15);
            $defectiveProducts = $query->paginate($perPage);

            return response()->json([
                'success' => true,
                'data' => $defectiveProducts,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch defective products: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get a specific defective product
     */
    public function show($id): JsonResponse
    {
        try {
            $defectiveProduct = DefectiveProduct::with([
                'product',
                'barcode',
                'batch',
                'store',
                'identifiedBy',
                'inspectedBy',
                'soldBy',
                'order',
                'vendor'
            ])->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => $defectiveProduct,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Defective product not found: ' . $e->getMessage(),
            ], 404);
        }
    }

    /**
     * Mark a product barcode as defective
     */
    public function markAsDefective(Request $request): JsonResponse
    {
        $request->validate([
            'product_barcode_id' => 'required|exists:product_barcodes,id',
            'store_id' => 'required|exists:stores,id',
            'defect_type' => 'required|string|in:physical_damage,malfunction,cosmetic,missing_parts,packaging_damage,expired,counterfeit,other',
            'defect_description' => 'required|string',
            'severity' => 'required|in:minor,moderate,major,critical',
            'original_price' => 'required|numeric|min:0',
            'product_batch_id' => 'nullable|exists:product_batches,id',
            'is_used_item' => 'nullable|boolean',
            'defect_images' => 'nullable|array',
            'defect_images.*' => 'image|mimes:jpeg,png,jpg,gif|max:5120',
            'internal_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $barcode = ProductBarcode::findOrFail($request->product_barcode_id);

            $employee = auth()->user();
            if (!$employee) {
                throw new \Exception('Employee authentication required');
            }

            // If the UI marks an item as used without marking it as a real defect,
            // this must remain metadata-only. Do not depend on the description text;
            // older/newer frontends may write different wording such as USED, Used item,
            // product has been tried, etc.
            $isUsedOnly = $request->boolean('is_used_item')
                && strtolower((string) $request->defect_type) === 'other';

            // Used-only is metadata, not a stock event. The barcode keeps the same
            // batch_id, stock, is_active, is_defective and current_status so POS
            // sales and online packing treat it like a regular barcode. We still
            // create/update a DefectiveProduct row with metadata.is_used_item so
            // the Extra Item Management page has a visible audit/list row after
            // the user clicks Mark as Used.
            if ($isUsedOnly) {
                if ($barcode->isDefective()) {
                    throw new \Exception('This product is already marked as defective');
                }

                if (!$barcode->isAvailableForSale()) {
                    throw new \Exception('This barcode is not currently available for normal sale/packing.');
                }

                $recordMetadata = [
                    'is_used_item' => true,
                    'used_item_metadata_only' => true,
                    'source' => 'extra_items_panel',
                    'original_batch_id' => $request->product_batch_id ?: $barcode->batch_id,
                    'resale_batch_id' => $barcode->batch_id,
                    'barcode_status_preserved' => true,
                    'stock_preserved' => true,
                ];

                $defectiveProduct = DefectiveProduct::withTrashed()
                    ->where('product_barcode_id', $barcode->id)
                    ->where('defect_type', 'other')
                    ->latest('id')
                    ->get()
                    ->first(function ($record) {
                        $metadata = is_array($record->metadata ?? null) ? $record->metadata : [];
                        return !empty($metadata['is_used_item'])
                            || str_contains(strtoupper((string) $record->defect_description), 'USED');
                    });

                $payload = [
                    'product_id' => $barcode->product_id,
                    'product_barcode_id' => $barcode->id,
                    'product_batch_id' => $request->product_batch_id ?: $barcode->batch_id,
                    'store_id' => $request->store_id,
                    'defect_type' => 'other',
                    'defect_description' => $request->defect_description ?: 'USED_ITEM - Product has been used',
                    'severity' => 'minor',
                    'original_price' => $request->original_price,
                    'status' => 'identified',
                    'identified_by' => $employee->id,
                    'internal_notes' => $request->internal_notes,
                    'metadata' => $recordMetadata,
                ];

                if ($defectiveProduct) {
                    if (method_exists($defectiveProduct, 'trashed') && $defectiveProduct->trashed()) {
                        $defectiveProduct->restore();
                    }
                    $defectiveProduct->update($payload);
                } else {
                    $defectiveProduct = DefectiveProduct::create($payload);
                }

                $barcode->markAsUsed([
                    'store_id' => $request->store_id,
                    'defect_description' => $request->defect_description,
                    'original_price' => $request->original_price,
                    'identified_by' => $employee->id,
                    'source' => 'extra_items_panel',
                    'defective_product_id' => $defectiveProduct->id,
                ]);

                DB::commit();

                return response()->json([
                    'success' => true,
                    'message' => 'Barcode marked as used successfully. Stock and batch were not changed.',
                    'data' => $defectiveProduct->fresh(['product', 'barcode', 'store', 'identifiedBy']),
                ], 201);
            }

            // Check if already marked as defective for real defect flows only.
            if ($barcode->isDefective()) {
                throw new \Exception('This product is already marked as defective');
            }

            // Handle image uploads
            $imagePaths = [];
            if ($request->hasFile('defect_images')) {
                foreach ($request->file('defect_images') as $image) {
                    $path = $image->store('defective-products', 'public');
                    $imagePaths[] = $path;
                }
            }

            // Mark barcode as defective and create defective product record
            $defectiveProduct = $barcode->markAsDefective([
                'store_id' => $request->store_id,
                'product_batch_id' => $request->product_batch_id,
                'defect_type' => $request->defect_type,
                'defect_description' => $request->defect_description,
                'severity' => $request->severity,
                'original_price' => $request->original_price,
                'defect_images' => !empty($imagePaths) ? $imagePaths : null,
                'metadata' => [
                    'is_used_item' => $request->boolean('is_used_item'),
                    'source' => 'extra_items_panel',
                ],
                'identified_by' => $employee->id,
                'internal_notes' => $request->internal_notes,
            ]);

            // Real defective items are no longer auto-moved to an EXTRA resale batch merely
            // because the used checkbox was also ticked. If they should be resold later,
            // inspect/make-available explicitly from the Extra/Defect workflow.

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Product marked as defective successfully',
                'data' => $defectiveProduct->load(['product', 'barcode', 'store', 'identifiedBy']),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark product as defective: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Inspect a defective product
     */
    public function inspect(Request $request, $id): JsonResponse
    {
        $request->validate([
            'severity' => 'nullable|in:minor,moderate,major,critical',
            'internal_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);

            $employee = auth()->user();
            if (!$employee) {
                throw new \Exception('Employee authentication required');
            }

            $success = $defectiveProduct->markAsInspected($employee, [
                'severity' => $request->severity,
                'internal_notes' => $request->internal_notes,
            ]);

            if (!$success) {
                throw new \Exception('Cannot inspect product in current status');
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Product inspected successfully',
                'data' => $defectiveProduct->load(['product', 'barcode', 'inspectedBy']),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to inspect product: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Make defective product available for sale
     */
    public function makeAvailableForSale($id): JsonResponse
    {
        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);

            $success = $defectiveProduct->makeAvailableForSale();

            if (!$success) {
                throw new \Exception('Product must be inspected before making it available for sale');
            }

            DB::commit();

            $defectiveProduct = $defectiveProduct->fresh(['product', 'barcode', 'batch', 'store']);
            $metadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
            $defectiveProduct->resale_batch_id = $metadata['resale_batch_id'] ?? optional($defectiveProduct->barcode)->batch_id;
            $defectiveProduct->original_batch_id = $metadata['original_batch_id'] ?? $defectiveProduct->product_batch_id;

            return response()->json([
                'success' => true,
                'message' => 'Product is now available for sale',
                'data' => $defectiveProduct,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to make product available for sale: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Sell a defective product (with custom price set by seller)
     */
    public function sell(Request $request, $id): JsonResponse
    {
        $request->validate([
            'order_id' => 'required|exists:orders,id',
            'selling_price' => 'required|numeric|min:0',
            'sale_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);

            // POS may intentionally sell display/used items at a manager-approved lower price.
            // Keep the minimum price as guidance only; do not block the sale after the order exists.
            if ($request->selling_price < $defectiveProduct->minimum_selling_price) {
                $metadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
                $metadata['sold_below_minimum_price'] = true;
                $metadata['minimum_price_at_sale'] = $defectiveProduct->minimum_selling_price;
                $metadata['approved_sale_price'] = $request->selling_price;
                $defectiveProduct->metadata = $metadata;
                $defectiveProduct->save();
            }

            $employee = auth()->user();
            if (!$employee) {
                throw new \Exception('Employee authentication required');
            }

            $order = Order::findOrFail($request->order_id);

            $success = $defectiveProduct->markAsSold(
                $employee,
                $order,
                $request->selling_price,
                $request->sale_notes
            );

            if (!$success) {
                throw new \Exception('Product is not available for sale');
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Defective product sold successfully',
                'data' => $defectiveProduct->load(['product', 'barcode', 'order', 'soldBy']),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to sell defective product: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Dispose a defective product
     */
    public function dispose(Request $request, $id): JsonResponse
    {
        $request->validate([
            'disposal_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::withTrashed()->findOrFail($id);

            $metadata = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
            $isUsedItem = !empty($metadata['is_used_item']) || str_contains(strtoupper((string) $defectiveProduct->defect_description), 'USED');

            if ($isUsedItem) {
                $barcodeId = $defectiveProduct->product_barcode_id;
                if ($barcodeId) {
                    $barcode = ProductBarcode::find($barcodeId);
                    if ($barcode) {
                        $barcode->unmarkAsUsed();
                    }
                    $records = DefectiveProduct::withTrashed()
                        ->where('product_barcode_id', $barcodeId)
                        ->get();

                    foreach ($records as $record) {
                        $meta = is_array($record->metadata ?? null) ? $record->metadata : [];
                        $desc = strtolower((string) $record->defect_description);
                        if (!empty($meta['is_used_item']) || strtolower((string) $record->defect_type) === 'other' || str_contains($desc, 'used')) {
                            $record->forceDelete();
                        }
                    }
                } else {
                    $defectiveProduct->forceDelete();
                }
            } else {
                $success = $defectiveProduct->markAsDisposed($request->disposal_notes);

                if (!$success) {
                    throw new \Exception('Cannot dispose product in current status');
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Product marked as disposed',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to dispose product: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Unmark used item status on defective record and barcode
     */
    public function unmarkUsed(Request $request, $id): JsonResponse
    {
        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::withTrashed()->find($id);

            if ($defectiveProduct) {
                $barcodeId = $defectiveProduct->product_barcode_id;
                if ($barcodeId) {
                    $barcode = ProductBarcode::find($barcodeId);
                    if ($barcode) {
                        $barcode->unmarkAsUsed();
                        if ($barcode->is_defective) {
                            $meta = is_array($defectiveProduct->metadata ?? null) ? $defectiveProduct->metadata : [];
                            $batchId = $meta['original_batch_id'] ?? $defectiveProduct->product_batch_id ?? $barcode->batch_id;
                            $barcode->unmarkAsDefective($batchId);
                        }
                    }

                    // Always delete the originally-requested record first
                    $defectiveProduct->forceDelete();

                    // Then clean up any remaining sibling used-only records for the same barcode.
                    $remaining = DefectiveProduct::withTrashed()
                        ->where('product_barcode_id', $barcodeId)
                        ->get();

                    foreach ($remaining as $record) {
                        $meta = is_array($record->metadata ?? null) ? $record->metadata : [];
                        $desc = strtolower((string) $record->defect_description);
                        if (!empty($meta['is_used_item']) || strtolower((string) $record->defect_type) === 'other' || str_contains($desc, 'used')) {
                            $record->forceDelete();
                        }
                    }
                } else {
                    $defectiveProduct->forceDelete();
                }
            } else {
                // $id might be a product_barcode id or barcode string instead of a defective_product id
                $barcode = ProductBarcode::where('id', $id)->orWhere('barcode', $id)->first();
                if ($barcode) {
                    $barcode->unmarkAsUsed();
                    if ($barcode->is_defective) {
                        $barcode->unmarkAsDefective();
                    }

                    $records = DefectiveProduct::withTrashed()
                        ->where('product_barcode_id', $barcode->id)
                        ->get();

                    foreach ($records as $record) {
                        $meta = is_array($record->metadata ?? null) ? $record->metadata : [];
                        $desc = strtolower((string) $record->defect_description);
                        if (!empty($meta['is_used_item']) || strtolower((string) $record->defect_type) === 'other' || str_contains($desc, 'used')) {
                            $record->forceDelete();
                        }
                    }
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Used item status removed and barcode restored to regular inventory',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to unmark used status: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Unmark defective status on barcode and reverse accounting write-off
     */
    public function unmarkDefective(Request $request, $id): JsonResponse
    {
        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::withTrashed()->find($id);
            $barcode = null;

            if ($defectiveProduct) {
                if ($defectiveProduct->product_barcode_id) {
                    $barcode = ProductBarcode::find($defectiveProduct->product_barcode_id);
                }
            } else {
                $barcode = ProductBarcode::where('id', $id)->orWhere('barcode', $id)->first();
                if ($barcode) {
                    $defectiveProduct = DefectiveProduct::withTrashed()
                        ->where('product_barcode_id', $barcode->id)
                        ->latest('id')
                        ->first();
                }
            }

            if ($defectiveProduct) {
                $observer = new \App\Observers\DefectiveProductObserver();
                $observer->reverseWriteoff($defectiveProduct, 'unmarked_defective');
            }

            if ($barcode) {
                $meta = is_array($defectiveProduct?->metadata) ? $defectiveProduct->metadata : [];
                $batchId = $meta['original_batch_id'] ?? $defectiveProduct?->product_batch_id ?? $barcode->batch_id;
                $barcode->unmarkAsDefective($batchId);
                $barcode->unmarkAsUsed();
            }

            if ($defectiveProduct) {
                $defectiveProduct->forceDelete();
            }

            if ($barcode) {
                DefectiveProduct::withTrashed()
                    ->where('product_barcode_id', $barcode->id)
                    ->forceDelete();
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Defect unmarked and barcode restored to active inventory',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to unmark defective item: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Return defective product to vendor
     */
    public function returnToVendor(Request $request, $id): JsonResponse
    {
        $request->validate([
            'vendor_id' => 'required|exists:vendors,id',
            'vendor_notes' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);
            $vendor = Vendor::findOrFail($request->vendor_id);

            $success = $defectiveProduct->returnToVendor($vendor, $request->vendor_notes);

            if (!$success) {
                throw new \Exception('Cannot return product to vendor in current status');
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Product returned to vendor successfully',
                'data' => $defectiveProduct->load(['vendor']),
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to return product to vendor: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get defective products available for sale
     */
    public function getAvailableForSale(Request $request): JsonResponse
    {
        try {
            $query = DefectiveProduct::availableForSale()
                ->with(['product', 'barcode', 'store']);

            if ($request->has('store_id')) {
                $query->where('store_id', $request->store_id);
            }

            if ($request->has('severity')) {
                $query->where('severity', $request->severity);
            }

            if ($request->has('max_price')) {
                $query->where('suggested_selling_price', '<=', $request->max_price);
            }

            $defectiveProducts = $query->orderBy('suggested_selling_price')->get()->map(function ($item) {
                $metadata = is_array($item->metadata ?? null) ? $item->metadata : [];
                $item->resale_batch_id = $metadata['resale_batch_id'] ?? optional($item->barcode)->batch_id;
                $item->original_batch_id = $metadata['original_batch_id'] ?? $item->product_batch_id;
                return $item;
            });

            return response()->json([
                'success' => true,
                'data' => $defectiveProducts,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch available products: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get statistics for defective products
     */
    public function statistics(Request $request): JsonResponse
    {
        try {
            $query = DefectiveProduct::query();

            // Filter by date range
            if ($request->has('from_date')) {
                $query->where('identified_at', '>=', $request->from_date);
            }

            if ($request->has('to_date')) {
                $query->where('identified_at', '<=', $request->to_date);
            }

            // Filter by store
            if ($request->has('store_id')) {
                $query->where('store_id', $request->store_id);
            }

            $stats = [
                'total_defective' => $query->count(),
                'by_status' => [
                    'identified' => (clone $query)->where('status', 'identified')->count(),
                    'inspected' => (clone $query)->where('status', 'inspected')->count(),
                    'available_for_sale' => (clone $query)->where('status', 'available_for_sale')->count(),
                    'sold' => (clone $query)->where('status', 'sold')->count(),
                    'disposed' => (clone $query)->where('status', 'disposed')->count(),
                    'returned_to_vendor' => (clone $query)->where('status', 'returned_to_vendor')->count(),
                ],
                'by_severity' => [
                    'minor' => (clone $query)->where('severity', 'minor')->count(),
                    'moderate' => (clone $query)->where('severity', 'moderate')->count(),
                    'major' => (clone $query)->where('severity', 'major')->count(),
                    'critical' => (clone $query)->where('severity', 'critical')->count(),
                ],
                'by_defect_type' => DefectiveProduct::select('defect_type', DB::raw('count(*) as count'))
                    ->groupBy('defect_type')
                    ->get(),
                'financial_impact' => [
                    'total_original_value' => (clone $query)->sum('original_price'),
                    'total_suggested_selling_price' => (clone $query)->where('status', 'available_for_sale')->sum('suggested_selling_price'),
                    'total_sold_value' => (clone $query)->where('status', 'sold')->sum('actual_selling_price'),
                    'total_loss' => (clone $query)->where('status', 'sold')->get()->sum(function ($item) {
                        return $item->original_price - $item->actual_selling_price;
                    }),
                ],
            ];

            return response()->json([
                'success' => true,
                'data' => $stats,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch statistics: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Scan barcode and get defective product info
     */
    public function scanBarcode(Request $request): JsonResponse
    {
        $request->validate([
            'barcode' => 'required|string',
        ]);

        try {
            $barcodeRecord = ProductBarcode::where('barcode', $request->barcode)->first();

            if (!$barcodeRecord) {
                return response()->json([
                    'success' => false,
                    'message' => 'Barcode not found',
                ], 404);
            }

            if (!$barcodeRecord->isDefective()) {
                return response()->json([
                    'success' => false,
                    'message' => 'This product is not marked as defective',
                    'data' => [
                        'is_defective' => false,
                        'barcode' => $barcodeRecord,
                        'product' => $barcodeRecord->product,
                    ],
                ]);
            }

            $defectiveProduct = $barcodeRecord->defectiveRecord()
                ->with(['product', 'store', 'identifiedBy', 'inspectedBy'])
                ->first();

            return response()->json([
                'success' => true,
                'data' => [
                    'is_defective' => true,
                    'defective_product' => $defectiveProduct,
                    'can_be_sold' => $defectiveProduct->canBeSold(),
                    'suggested_price' => $defectiveProduct->suggested_selling_price,
                    'minimum_price' => $defectiveProduct->minimum_selling_price,
                    'discount_percentage' => $defectiveProduct->getDiscountPercentage(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to scan barcode: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload additional images for a defective product
     */
    public function uploadImages(Request $request, $id): JsonResponse
    {
        $request->validate([
            'images' => 'required|array|min:1|max:5',
            'images.*' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);

            // Get existing images
            $existingImages = $defectiveProduct->defect_images ?? [];

            // Upload new images
            $newImagePaths = [];
            foreach ($request->file('images') as $image) {
                $path = $image->store('defective-products', 'public');
                $newImagePaths[] = $path;
            }

            // Merge with existing images
            $allImages = array_merge($existingImages, $newImagePaths);

            // Update defective product
            $defectiveProduct->update([
                'defect_images' => $allImages,
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Images uploaded successfully',
                'data' => [
                    'id' => $defectiveProduct->id,
                    'defect_images' => $allImages,
                    'image_urls' => array_map(function ($path) {
                        return Storage::url($path);
                    }, $allImages),
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload images: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Delete an image from defective product
     */
    public function deleteImage(Request $request, $id): JsonResponse
    {
        $request->validate([
            'image_path' => 'required|string',
        ]);

        DB::beginTransaction();
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);
            $existingImages = $defectiveProduct->defect_images ?? [];

            // Remove the specified image from array
            $updatedImages = array_filter($existingImages, function ($path) use ($request) {
                return $path !== $request->image_path;
            });

            // Delete file from storage
            if (Storage::disk('public')->exists($request->image_path)) {
                Storage::disk('public')->delete($request->image_path);
            }

            // Update defective product
            $defectiveProduct->update([
                'defect_images' => array_values($updatedImages),
            ]);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Image deleted successfully',
                'data' => [
                    'id' => $defectiveProduct->id,
                    'defect_images' => array_values($updatedImages),
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete image: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get image URLs for a defective product
     */
    public function getImages($id): JsonResponse
    {
        try {
            $defectiveProduct = DefectiveProduct::findOrFail($id);
            $images = $defectiveProduct->defect_images ?? [];

            $imageUrls = array_map(function ($path) {
                return [
                    'path' => $path,
                    'url' => Storage::url($path),
                ];
            }, $images);

            return response()->json([
                'success' => true,
                'data' => [
                    'id' => $defectiveProduct->id,
                    'images' => $imageUrls,
                    'count' => count($imageUrls),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to get images: ' . $e->getMessage(),
            ], 404);
        }
    }
}
