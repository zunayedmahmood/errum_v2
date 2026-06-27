<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductBarcode;
use App\Models\ProductBatch;
use App\Models\StockAuditScan;
use App\Models\StockAuditSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StockAuditController extends Controller
{
    private array $sellableStatuses = ['in_shop', 'on_display', 'in_warehouse', 'available'];

    public function index(Request $request)
    {
        $query = StockAuditSession::with('store')
            ->withCount([
                'scans as scan_attempts_count',
                'scans as scanned_units_count' => function ($q) {
                    $q->where('is_duplicate', false)->whereNotNull('product_id');
                },
            ])
            ->latest('created_at');

        if ($request->filled('store_id')) {
            $query->where('store_id', $request->integer('store_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        $perPage = max(1, min((int) $request->input('per_page', 20), 100));

        return response()->json([
            'success' => true,
            'data' => $query->paginate($perPage),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'store_id' => ['required', 'exists:stores,id'],
            'notes' => ['nullable', 'string'],
        ]);

        $session = StockAuditSession::create([
            'session_number' => $this->generateSessionNumber(),
            'store_id' => $validated['store_id'],
            'status' => 'active',
            'started_by' => auth()->id(),
            'started_at' => now(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Stock audit session started.',
            'data' => $this->buildSessionPayload($session),
        ], 201);
    }

    public function show($id)
    {
        $session = StockAuditSession::findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $this->buildSessionPayload($session),
        ]);
    }

    public function scan(Request $request, $id)
    {
        $session = StockAuditSession::findOrFail($id);

        if ($session->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'This stock audit is completed. Start a new session to scan again.',
            ], 422);
        }

        if ($session->status === 'paused') {
            return response()->json([
                'success' => false,
                'message' => 'This stock audit is paused. Resume it before scanning more products.',
            ], 422);
        }

        $validated = $request->validate([
            'barcode' => ['required', 'string', 'max:191'],
        ]);

        $barcodeText = trim($validated['barcode']);
        $barcode = ProductBarcode::with(['product.category', 'currentStore', 'batch'])
            ->where('barcode', $barcodeText)
            ->first();

        $alreadyCounted = StockAuditScan::where('stock_audit_session_id', $session->id)
            ->where('barcode_text', $barcodeText)
            ->where('is_duplicate', false)
            ->exists();

        [$scanStatus, $notes] = $this->resolveScanStatus($barcode, (int) $session->store_id, $alreadyCounted);

        $scan = StockAuditScan::create([
            'stock_audit_session_id' => $session->id,
            'product_barcode_id' => $barcode?->id,
            'barcode_text' => $barcodeText,
            'product_id' => $barcode?->product_id,
            'batch_id' => $barcode?->batch_id,
            'expected_store_id' => $session->store_id,
            'system_store_id' => $barcode?->current_store_id,
            'system_status' => $barcode?->current_status,
            'scan_status' => $scanStatus,
            'is_duplicate' => $scanStatus === 'duplicate',
            'scanned_by' => auth()->id(),
            'scanned_at' => now(),
            'notes' => $notes,
        ]);

        $productSummary = null;
        if ($barcode?->product_id) {
            $productSummary = $this->buildProductSummary($session, (int) $barcode->product_id);
        }

        return response()->json([
            'success' => true,
            'message' => $this->scanMessage($scanStatus),
            'data' => [
                'scan' => $this->formatScan($scan->load(['product', 'barcode.currentStore'])),
                'product_summary' => $productSummary,
                'session' => $this->buildSessionPayload($session->fresh()),
            ],
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $session = StockAuditSession::findOrFail($id);
        $validated = $request->validate([
            'status' => ['required', 'in:active,paused,completed'],
        ]);

        $status = $validated['status'];
        $updates = ['status' => $status];

        if ($status === 'paused') {
            $updates['paused_at'] = now();
        }

        if ($status === 'active') {
            $updates['paused_at'] = null;
            if (!$session->started_at) {
                $updates['started_at'] = now();
            }
        }

        if ($status === 'completed') {
            $updates['completed_at'] = now();
        }

        $session->update($updates);

        return response()->json([
            'success' => true,
            'message' => "Stock audit marked as {$status}.",
            'data' => $this->buildSessionPayload($session->fresh()),
        ]);
    }

    private function generateSessionNumber(): string
    {
        do {
            $number = 'SA-' . now()->format('Ymd-His') . '-' . strtoupper(Str::random(4));
        } while (StockAuditSession::where('session_number', $number)->exists());

        return $number;
    }

    private function resolveScanStatus(?ProductBarcode $barcode, int $expectedStoreId, bool $alreadyCounted): array
    {
        if ($alreadyCounted) {
            return ['duplicate', 'This barcode was already counted in this audit session.'];
        }

        if (!$barcode) {
            return ['unknown_barcode', 'Barcode was not found in the product barcode table.'];
        }

        $status = $barcode->current_status ?: 'available';
        $isSellableStatus = in_array($status, $this->sellableStatuses, true);

        if (!$barcode->is_active || $barcode->is_defective || !$isSellableStatus) {
            return ['non_sellable', 'Barcode exists but is not currently sellable/active in the system.'];
        }

        if ((int) $barcode->current_store_id !== $expectedStoreId) {
            $storeName = $barcode->currentStore?->name ?: 'no store';
            return ['unexpected_store', "Barcode exists but system location is {$storeName}, not the selected audit store."];
        }

        return ['matched', 'Barcode matched the selected store stock.'];
    }

    private function scanMessage(string $status): string
    {
        return match ($status) {
            'matched' => 'Scanned and matched with selected store stock.',
            'unexpected_store' => 'Scanned, but system says this barcode belongs to another store.',
            'unknown_barcode' => 'Scanned barcode was not found in the system.',
            'duplicate' => 'Duplicate scan ignored for stock count.',
            'non_sellable' => 'Scanned barcode exists but is not sellable/active in the system.',
            default => 'Barcode scanned.',
        };
    }

    private function buildProductSummary(StockAuditSession $session, int $productId): array
    {
        $product = Product::find($productId);
        $systemCount = $this->getProductSystemCount((int) $session->store_id, $productId);
        $scannedCount = StockAuditScan::where('stock_audit_session_id', $session->id)
            ->where('product_id', $productId)
            ->where('is_duplicate', false)
            ->count();

        return [
            'product_id' => $productId,
            'product_name' => $product?->name ?? 'Unknown product',
            'sku' => $product?->sku,
            'system_count' => $systemCount,
            'scanned_count' => $scannedCount,
            'difference' => $scannedCount - $systemCount,
            'status' => $this->rowStatus($systemCount, $scannedCount),
        ];
    }

    private function buildSessionPayload(StockAuditSession $session): array
    {
        $session->load('store');

        $systemRows = $this->getStoreSystemStockRows((int) $session->store_id);
        $scans = StockAuditScan::where('stock_audit_session_id', $session->id)
            ->with(['product', 'barcode.currentStore', 'systemStore'])
            ->orderByDesc('scanned_at')
            ->orderByDesc('id')
            ->get();

        $countedScans = $scans->where('is_duplicate', false)->whereNotNull('product_id');
        $scansByProduct = $countedScans->groupBy('product_id');
        $productIds = collect(array_keys($systemRows))
            ->merge($scansByProduct->keys())
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $products = Product::whereIn('id', $productIds)->with('category')->get()->keyBy('id');

        $rows = $productIds->map(function ($productId) use ($systemRows, $scansByProduct, $products) {
            $product = $products->get($productId);
            $system = $systemRows[$productId] ?? null;
            $productScans = $scansByProduct->get($productId, collect());
            $systemCount = (int) ($system['system_count'] ?? 0);
            $scannedCount = $productScans->count();
            $statusCounts = $productScans->countBy('scan_status');

            return [
                'product_id' => $productId,
                'product_name' => $product?->name ?? ($system['product_name'] ?? 'Unknown product'),
                'sku' => $product?->sku ?? ($system['sku'] ?? null),
                'category_name' => $product?->category?->title,
                'system_count' => $systemCount,
                'scanned_count' => $scannedCount,
                'difference' => $scannedCount - $systemCount,
                'status' => $this->rowStatus($systemCount, $scannedCount),
                'system_source' => $system['system_source'] ?? null,
                'matched_scans' => (int) ($statusCounts['matched'] ?? 0),
                'unexpected_store_scans' => (int) ($statusCounts['unexpected_store'] ?? 0),
                'non_sellable_scans' => (int) ($statusCounts['non_sellable'] ?? 0),
                'sample_barcodes' => $productScans->take(10)->pluck('barcode_text')->values(),
            ];
        })->sortBy([
            ['status', 'asc'],
            ['product_name', 'asc'],
        ])->values();

        $summary = [
            'total_system_units' => $rows->sum('system_count'),
            'total_scanned_units' => $rows->sum('scanned_count'),
            'total_difference' => $rows->sum('difference'),
            'matched_products' => $rows->where('status', 'matched')->count(),
            'short_products' => $rows->where('status', 'short')->count(),
            'extra_products' => $rows->where('status', 'extra')->count(),
            'unexpected_products' => $rows->where('status', 'unexpected')->count(),
            'unknown_barcodes' => $scans->where('scan_status', 'unknown_barcode')->count(),
            'duplicate_scans' => $scans->where('scan_status', 'duplicate')->count(),
            'unexpected_store_scans' => $scans->where('scan_status', 'unexpected_store')->where('is_duplicate', false)->count(),
            'non_sellable_scans' => $scans->where('scan_status', 'non_sellable')->where('is_duplicate', false)->count(),
            'scan_attempts' => $scans->count(),
        ];

        return [
            'id' => $session->id,
            'session_number' => $session->session_number,
            'status' => $session->status,
            'store_id' => $session->store_id,
            'store' => $session->store ? [
                'id' => $session->store->id,
                'name' => $session->store->name,
                'store_code' => $session->store->store_code,
                'address' => $session->store->address,
            ] : null,
            'notes' => $session->notes,
            'started_at' => optional($session->started_at)->toDateTimeString(),
            'paused_at' => optional($session->paused_at)->toDateTimeString(),
            'completed_at' => optional($session->completed_at)->toDateTimeString(),
            'created_at' => optional($session->created_at)->toDateTimeString(),
            'updated_at' => optional($session->updated_at)->toDateTimeString(),
            'summary' => $summary,
            'rows' => $rows,
            'recent_scans' => $scans->take(30)->map(fn ($scan) => $this->formatScan($scan))->values(),
        ];
    }

    private function getProductSystemCount(int $storeId, int $productId): int
    {
        $barcodeCount = ProductBarcode::where('product_id', $productId)
            ->where('current_store_id', $storeId)
            ->where('is_active', true)
            ->where('is_defective', false)
            ->where(function ($q) {
                $q->whereIn('current_status', $this->sellableStatuses)
                  ->orWhereNull('current_status');
            })
            ->count();

        if ($barcodeCount > 0) {
            return $barcodeCount;
        }

        return (int) ProductBatch::where('product_id', $productId)
            ->where('store_id', $storeId)
            ->where('quantity', '>', 0)
            ->where(function ($q) {
                $q->where('is_active', true)->orWhereNull('is_active');
            })
            ->sum('quantity');
    }

    private function getStoreSystemStockRows(int $storeId): array
    {
        $barcodeCounts = ProductBarcode::select('product_id', DB::raw('COUNT(*) as qty'))
            ->where('current_store_id', $storeId)
            ->where('is_active', true)
            ->where('is_defective', false)
            ->where(function ($q) {
                $q->whereIn('current_status', $this->sellableStatuses)
                  ->orWhereNull('current_status');
            })
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        $batchCounts = ProductBatch::select('product_id', DB::raw('SUM(quantity) as qty'))
            ->where('store_id', $storeId)
            ->where('quantity', '>', 0)
            ->where(function ($q) {
                $q->where('is_active', true)->orWhereNull('is_active');
            })
            ->groupBy('product_id')
            ->pluck('qty', 'product_id');

        $productIds = $barcodeCounts->keys()->merge($batchCounts->keys())->unique()->values();
        $products = Product::whereIn('id', $productIds)->get()->keyBy('id');

        $rows = [];
        foreach ($productIds as $productId) {
            $barcodeQty = (int) ($barcodeCounts[$productId] ?? 0);
            $batchQty = (int) ($batchCounts[$productId] ?? 0);
            $product = $products->get((int) $productId);

            $rows[(int) $productId] = [
                'product_id' => (int) $productId,
                'product_name' => $product?->name ?? 'Unknown product',
                'sku' => $product?->sku,
                'system_count' => $barcodeQty > 0 ? $barcodeQty : $batchQty,
                'barcode_count' => $barcodeQty,
                'batch_quantity' => $batchQty,
                'system_source' => $barcodeQty > 0 ? 'barcodes' : 'batches',
            ];
        }

        return $rows;
    }

    private function rowStatus(int $systemCount, int $scannedCount): string
    {
        if ($systemCount === 0 && $scannedCount > 0) {
            return 'unexpected';
        }
        if ($systemCount === $scannedCount) {
            return 'matched';
        }
        if ($scannedCount < $systemCount) {
            return 'short';
        }

        return 'extra';
    }

    private function formatScan(StockAuditScan $scan): array
    {
        return [
            'id' => $scan->id,
            'barcode_text' => $scan->barcode_text,
            'product_id' => $scan->product_id,
            'product_name' => $scan->product?->name,
            'sku' => $scan->product?->sku,
            'scan_status' => $scan->scan_status,
            'is_duplicate' => (bool) $scan->is_duplicate,
            'system_store_id' => $scan->system_store_id,
            'system_store_name' => $scan->systemStore?->name ?? $scan->barcode?->currentStore?->name,
            'system_status' => $scan->system_status,
            'notes' => $scan->notes,
            'scanned_at' => optional($scan->scanned_at)->toDateTimeString(),
        ];
    }
}
