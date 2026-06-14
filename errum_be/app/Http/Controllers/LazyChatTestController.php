<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductBatch;
use App\Models\ProductImage;
use App\Models\ProductBarcode;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Store;
use App\Models\Vendor;
use App\Services\LazyChat\LazyChatWebhookTestContext;
use App\Services\LazyChat\LazyChatWebhookTestLogger;
use App\Services\LazyChat\LazyChatTestAuth;
use App\Services\LazyChat\ProductPayloadBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Throwable;

class LazyChatTestController extends Controller
{
    private bool $dryRun = false;

    public function login(Request $request): JsonResponse
    {
        $authError = $this->authorizeTestRequest($request);
        if ($authError) {
            return $authError;
        }

        try {
            $auth = app(LazyChatTestAuth::class);
            $tokenData = $auth->ensureToken(true);

            return response()->json([
                'success' => true,
                'message' => 'LazyChat test login token saved successfully.',
                'data' => $auth->safeSummary($tokenData),
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'LazyChat test login failed.',
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    public function downloadProducts(Request $request, ProductPayloadBuilder $payloadBuilder)
    {
        $authError = $this->authorizeTestRequest($request);
        if ($authError) {
            return $authError;
        }

        $fileName = 'lazychat-products-' . now()->format('Ymd-His') . '.json';

        return response()->streamDownload(function () use ($payloadBuilder) {
            $first = true;
            echo "[\n";

            Product::query()
                ->select('sku')
                ->whereNotNull('sku')
                ->where('sku', '!=', '')
                ->distinct()
                ->orderBy('sku')
                ->chunk(100, function ($skuRows) use (&$first, $payloadBuilder) {
                    foreach ($skuRows as $row) {
                        if (!$first) {
                            echo ",\n";
                        }

                        echo json_encode(
                            $payloadBuilder->buildForSku((string) $row->sku),
                            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                        );

                        $first = false;
                    }
                });

            echo "\n]\n";
        }, $fileName, [
            'Content-Type' => 'application/json',
        ]);
    }

    public function productWebhooks(Request $request): JsonResponse
    {
        $authError = $this->authorizeTestRequest($request, true);
        if ($authError) {
            return $authError;
        }

        $dryRun = $request->boolean('dry_run', false);
        $this->dryRun = $dryRun;

        $testAuth = app(LazyChatTestAuth::class);
        $authSummary = null;
        $employeeId = null;

        try {
            $authSummary = $testAuth->safeSummary($testAuth->ensureToken());
            $employee = $testAuth->employee();
            if ($employee) {
                Auth::guard('api')->setUser($employee);
                $employeeId = $employee->id;
            }
        } catch (Throwable $e) {
            $authSummary = [
                'token_saved' => false,
                'error' => $e->getMessage(),
            ];
        }

        $employeeId = $employeeId ?: DB::table('employees')->value('id');

        $runId = $request->input('run_id') ?: 'LC-TEST-' . now()->format('Ymd-His') . '-' . Str::upper(Str::random(5));
        $sku = 'LC-TEST-' . Str::upper(Str::random(8));
        $steps = [];
        $product = null;
        $variant = null;
        $batch = null;
        $image = null;
        $po = null;
        $barcode = null;

        $category = $this->testCategory();
        $vendor = $this->testVendor();
        $store = $this->testStore();
        $warehouse = $this->testWarehouseStore();

        $this->runStep($steps, $runId, 'product_create', 'Create a test product row', [
            'controller' => self::class . '@productWebhooks',
            'expected_model' => Product::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductObserver',
        ], function () use (&$product, $category, $vendor, $sku) {
            $product = Product::create([
                'category_id' => $category->id,
                'vendor_id' => $vendor->id,
                'brand' => 'LazyChat Test',
                'sku' => $sku,
                'base_name' => 'LazyChat Test Product ' . now()->format('His'),
                'variation_suffix' => '-M',
                'description' => 'Temporary product created by the LazyChat webhook test runner.',
                'is_archived' => false,
            ]);

            return [
                'product_id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
            ];
        });

        $this->runStep($steps, $runId, 'batch_create_product_batch_page', 'Create a batch from the product/batch flow', [
            'controller' => 'ProductBatchController@create equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch, &$product, $store) {
            $batch = ProductBatch::create([
                'product_id' => $product->id,
                'store_id' => $store->id,
                'quantity' => 5,
                'cost_price' => 450,
                'sell_price' => 1550,
                'tax_percentage' => 0,
                'availability' => true,
                'notes' => 'LazyChat test batch creation.',
                'is_active' => true,
            ]);

            return [
                'batch_id' => $batch->id,
                'quantity' => $batch->quantity,
                'sell_price' => $batch->sell_price,
                'cost_price' => $batch->cost_price,
            ];
        });

        $this->runStep($steps, $runId, 'batch_update_selling_price', 'Change batch selling price', [
            'controller' => 'ProductBatchController@updateAllBatchPrices/update equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch) {
            $batch->update(['sell_price' => 1660]);

            return [
                'batch_id' => $batch->id,
                'new_sell_price' => $batch->fresh()->sell_price,
            ];
        });

        $this->runStep($steps, $runId, 'batch_update_cost_price', 'Change batch cost price', [
            'controller' => 'ProductBatchController@updateAllBatchCostPrices/update equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch) {
            $batch->update(['cost_price' => 520]);

            return [
                'batch_id' => $batch->id,
                'new_cost_price' => $batch->fresh()->cost_price,
            ];
        });

        $this->runStep($steps, $runId, 'stock_decrease_exchange_sale', 'Decrease stock like an exchange replacement sale', [
            'controller' => 'ExchangeController stock removal equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch) {
            $batch->update(['quantity' => max(0, (int) $batch->quantity - 1)]);

            return [
                'batch_id' => $batch->id,
                'quantity_after_decrease' => $batch->fresh()->quantity,
            ];
        });

        $this->runStep($steps, $runId, 'stock_increase_return_restock', 'Increase stock like a return/exchange restock', [
            'controller' => 'ProductReturnController/ExchangeController restock equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch) {
            $batch->update(['quantity' => (int) $batch->quantity + 2]);

            return [
                'batch_id' => $batch->id,
                'quantity_after_increase' => $batch->fresh()->quantity,
            ];
        });

        $this->runStep($steps, $runId, 'social_commerce_package_stock_deduction', 'Decrease stock like social-commerce/package order packing', [
            'controller' => 'OrderController@complete / social-commerce package equivalent',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$batch) {
            $batch->removeStock(1);

            return [
                'batch_id' => $batch->id,
                'quantity_after_package_deduction' => $batch->fresh()->quantity,
            ];
        });

        $this->runStep($steps, $runId, 'pos_sale_stock_and_barcode_update', 'Decrease stock and update barcode like a POS sale', [
            'controller' => 'POS sale / OrderController@complete equivalent',
            'expected_model' => ProductBatch::class . ' + ' . ProductBarcode::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver + App\\Observers\\LazyChatProductBarcodeObserver',
        ], function () use (&$batch, &$product, &$barcode, $store) {
            $barcode = ProductBarcode::create([
                'product_id' => $product->id,
                'batch_id' => $batch->id,
                'type' => 'CODE128',
                'is_primary' => false,
                'is_active' => true,
                'generated_at' => now(),
                'current_store_id' => $store->id,
                'current_status' => 'in_shop',
                'location_updated_at' => now(),
                'location_metadata' => ['source' => 'lazychat_pos_sale_test'],
            ]);

            $batch->removeStock(1);
            $barcode->updateLocation($store->id, 'with_customer', ['source' => 'lazychat_pos_sale_test'], false);
            $barcode->update(['is_active' => false]);

            return [
                'batch_id' => $batch->id,
                'barcode_id' => $barcode->id,
                'barcode_status' => $barcode->fresh()->current_status,
                'barcode_active' => (bool) $barcode->fresh()->is_active,
                'quantity_after_pos_sale' => $batch->fresh()->quantity,
            ];
        });

        $this->runStep($steps, $runId, 'image_create', 'Create product image row', [
            'controller' => 'ProductImageController@upload equivalent',
            'expected_model' => ProductImage::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductImageObserver',
        ], function () use (&$image, &$product, $runId) {
            $image = ProductImage::create([
                'product_id' => $product->id,
                'image_path' => 'products/lazychat-test/' . $runId . '-primary.webp',
                'alt_text' => 'LazyChat test primary image',
                'is_primary' => true,
                'sort_order' => 0,
                'is_active' => true,
            ]);

            return [
                'image_id' => $image->id,
                'image_path' => $image->image_path,
            ];
        });

        $this->runStep($steps, $runId, 'image_update', 'Update product image metadata', [
            'controller' => 'ProductImageController@update equivalent',
            'expected_model' => ProductImage::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductImageObserver',
        ], function () use (&$image) {
            $image->update([
                'alt_text' => 'LazyChat test image updated',
                'sort_order' => 1,
            ]);

            return [
                'image_id' => $image->id,
                'alt_text' => $image->fresh()->alt_text,
                'sort_order' => $image->fresh()->sort_order,
            ];
        });

        $this->runStep($steps, $runId, 'variant_create_size_add', 'Add a size/variation as a new product row', [
            'controller' => 'ProductController@create variation equivalent',
            'expected_model' => Product::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductObserver',
        ], function () use (&$variant, &$product, $category, $vendor, $sku) {
            $variant = Product::create([
                'category_id' => $category->id,
                'vendor_id' => $vendor->id,
                'brand' => 'LazyChat Test',
                'sku' => $sku,
                'base_name' => $product->base_name,
                'variation_suffix' => '-L',
                'description' => 'Temporary size variation created by the LazyChat webhook test runner.',
                'is_archived' => false,
            ]);

            return [
                'variant_product_id' => $variant->id,
                'sku' => $variant->sku,
                'name' => $variant->name,
            ];
        });

        $this->runStep($steps, $runId, 'sync_images_across_sku', 'Sync image across all products sharing the SKU', [
            'controller' => 'ProductController@syncSkuImages',
            'expected_model' => ProductImage::class,
            'expected_observer' => 'ProductController manual SKU sync dispatch',
        ], function () use (&$product, &$image) {
            $request = Request::create('/api/products/' . $product->id . '/sync-sku-images', 'POST', [
                'existing_paths' => [$image->image_path],
                'primary_index' => 0,
                'alt_texts' => ['LazyChat synced SKU image'],
            ]);

            $response = app(ProductController::class)->syncSkuImages($request, $product->id);
            $data = $response->getData(true);

            if (!($data['success'] ?? false)) {
                throw new \RuntimeException($data['message'] ?? 'SKU image sync failed.');
            }

            return $data;
        });

        $this->runStep($steps, $runId, 'product_name_update', 'Change product base name/display name', [
            'controller' => 'ProductController@update equivalent',
            'expected_model' => Product::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductObserver',
        ], function () use (&$product) {
            $product->update(['base_name' => $product->base_name . ' Updated']);

            return [
                'product_id' => $product->id,
                'new_name' => $product->fresh()->name,
            ];
        });

        $this->runStep($steps, $runId, 'po_receiving', 'Receive a purchase order that creates a product batch', [
            'controller' => 'PurchaseOrderController@receive / PurchaseOrder::markAsReceived',
            'expected_model' => ProductBatch::class,
            'expected_observer' => 'App\\Observers\\ProductBatchObserver',
        ], function () use (&$po, &$product, $vendor, $warehouse, $runId, $employeeId) {
            if (!$employeeId) {
                throw new \RuntimeException('No employee ID was available for PO receiving test.');
            }

            $po = PurchaseOrder::create([
                'po_number' => PurchaseOrder::generatePONumber(),
                'vendor_id' => $vendor->id,
                'store_id' => $warehouse->id,
                'created_by' => $employeeId,
                'approved_by' => $employeeId,
                'approved_at' => now(),
                'order_date' => now()->format('Y-m-d'),
                'expected_delivery_date' => now()->format('Y-m-d'),
                'status' => 'approved',
                'payment_status' => 'unpaid',
                'tax_amount' => 0,
                'discount_amount' => 0,
                'shipping_cost' => 0,
                'notes' => 'LazyChat test PO receiving.',
            ]);

            $item = PurchaseOrderItem::create([
                'purchase_order_id' => $po->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_sku' => $product->sku,
                'quantity_ordered' => 2,
                'quantity_received' => 0,
                'unit_cost' => 540,
                'unit_sell_price' => 1720,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'receive_status' => 'pending',
            ]);

            $po->calculateTotals();
            $po->save();
            $po->markAsReceived([[
                'item_id' => $item->id,
                'quantity_received' => 2,
                'batch_number' => 'LC-PO-' . $runId,
            ]]);

            return [
                'purchase_order_id' => $po->id,
                'purchase_order_number' => $po->po_number,
                'received_item_id' => $item->id,
                'batch_id' => $item->fresh()->product_batch_id,
            ];
        });

        $this->runStep($steps, $runId, 'archive_product', 'Archive the product', [
            'controller' => 'ProductController@archive equivalent',
            'expected_model' => Product::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductObserver',
        ], function () use (&$product) {
            $product->update(['is_archived' => true]);

            return [
                'product_id' => $product->id,
                'is_archived' => $product->fresh()->is_archived,
            ];
        });

        $this->runStep($steps, $runId, 'delete_variant', 'Delete the test variation product row', [
            'controller' => 'ProductController@destroy equivalent',
            'expected_model' => Product::class,
            'expected_observer' => 'App\\Observers\\LazyChatProductObserver',
        ], function () use (&$variant) {
            if (!$variant) {
                throw new \RuntimeException('Variant was not created.');
            }

            $variantId = $variant->id;
            $variant->delete();

            return [
                'deleted_product_id' => $variantId,
            ];
        });

        $logs = LazyChatWebhookTestLogger::read($runId);
        $webhookContract = $this->validateWebhookContract($logs, $steps, $sku, $product?->id, $variant?->id);

        $stepsPassed = collect($steps)->every(fn ($step) => $step['success'] === true);
        $webhookTransportPassed = count($logs) > 0 && collect($logs)->every(fn ($log) => ($log['ok'] ?? false) === true);
        $webhooksPassed = $webhookTransportPassed && $webhookContract['passed'];

        return response()->json([
            'success' => $stepsPassed && $webhooksPassed,
            'message' => $dryRun
                ? 'LazyChat product webhook dry-run completed. Payloads were built and logged locally; nothing was sent to LazyChat.'
                : 'LazyChat product webhook test run completed.',
            'data' => [
                'run_id' => $runId,
                'dry_run' => $dryRun,
                'external_delivery' => !$dryRun,
                'auth' => $authSummary,
                'steps_passed' => $stepsPassed,
                'webhooks_passed' => $webhooksPassed,
                'webhook_transport_passed' => $webhookTransportPassed,
                'webhook_contract_passed' => $webhookContract['passed'],
                'webhook_contract_errors' => $webhookContract['errors'],
                'test_sku' => $sku,
                'created_product_id' => $product?->id,
                'created_variant_id' => $variant?->id,
                'steps' => $steps,
                'webhook_log_count' => count($logs),
                'webhook_logs' => $logs,
                'log_file' => LazyChatWebhookTestLogger::path(),
            ],
        ], 200);
    }

    public function logs(Request $request, string $runId): JsonResponse
    {
        $authError = $this->authorizeTestRequest($request);
        if ($authError) {
            return $authError;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'run_id' => $runId,
                'logs' => LazyChatWebhookTestLogger::read($runId),
                'log_file' => LazyChatWebhookTestLogger::path(),
            ],
        ]);
    }

    private function runStep(array &$steps, string $runId, string $key, string $label, array $meta, callable $callback): void
    {
        LazyChatWebhookTestContext::set($runId, array_merge($meta, [
            'step_key' => $key,
            'step_label' => $label,
            'dry_run' => $this->dryRun,
        ]));

        try {
            $result = $callback();

            $steps[] = [
                'key' => $key,
                'label' => $label,
                'success' => true,
                'result' => $result,
            ];
        } catch (Throwable $e) {
            $steps[] = [
                'key' => $key,
                'label' => $label,
                'success' => false,
                'error' => $e->getMessage(),
            ];
        } finally {
            LazyChatWebhookTestContext::clear();
        }
    }

    private function validateWebhookContract(array $logs, array $steps, string $sku, ?int $productId, ?int $variantId): array
    {
        $errors = [];
        $logsByStep = collect($logs)->groupBy(fn ($log) => $log['step_key'] ?? '__missing_step__');

        foreach ($steps as $step) {
            if (($step['success'] ?? false) !== true) {
                continue;
            }

            $stepKey = $step['key'] ?? null;
            if (!$stepKey) {
                continue;
            }

            if (!$logsByStep->has($stepKey)) {
                $errors[] = "No LazyChat webhook log was captured for successful step: {$stepKey}.";
            }
        }

        foreach ($logs as $index => $log) {
            $topic = (string) ($log['topic'] ?? '');
            if ($topic === '' || strpos($topic, 'product/') !== 0) {
                continue;
            }

            $stepKey = (string) ($log['step_key'] ?? 'unknown_step');
            $summary = $log['payload_summary'] ?? null;

            if (!is_array($summary)) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) has no payload_summary.";
                continue;
            }

            if (($summary['contract_shape_ok'] ?? false) !== true) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) does not follow the SKU payload contract: top-level sku plus variants array.";
            }

            if (($summary['sku'] ?? null) !== $sku) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) used SKU " . (($summary['sku'] ?? null) ?: 'NULL') . " instead of expected {$sku}.";
            }

            if ((int) ($summary['variant_count'] ?? 0) < 1) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) did not include any variants.";
            }

            $variantIds = array_map('intval', is_array($summary['variant_ids'] ?? null) ? $summary['variant_ids'] : []);

            if ($productId && !in_array((int) $productId, $variantIds, true)) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) is missing the original product ID {$productId} in variants.";
            }

            if ($variantId && in_array($stepKey, [
                'variant_create_size_add',
                'sync_images_across_sku',
                'product_name_update',
                'po_receiving',
                'archive_product',
                'delete_variant',
            ], true) && !in_array((int) $variantId, $variantIds, true)) {
                $errors[] = "Webhook log #{$index} ({$stepKey}) is missing the added variation product ID {$variantId} in variants.";
            }

            if ($variantId && $stepKey === 'delete_variant') {
                $deletedIds = array_map('intval', is_array($summary['deleted_variant_ids'] ?? null) ? $summary['deleted_variant_ids'] : []);
                if (!in_array((int) $variantId, $deletedIds, true)) {
                    $errors[] = "Delete-variant webhook did not mark variation product ID {$variantId} as deleted.";
                }
            }

            if ($productId && $stepKey === 'archive_product') {
                $archivedIds = array_map('intval', is_array($summary['archived_variant_ids'] ?? null) ? $summary['archived_variant_ids'] : []);
                if (!in_array((int) $productId, $archivedIds, true)) {
                    $errors[] = "Archive-product webhook did not mark product ID {$productId} as archived.";
                }
            }
        }

        return [
            'passed' => empty($errors),
            'errors' => $errors,
        ];
    }

    private function authorizeTestRequest(Request $request, bool $allowDryRunWithoutToken = false): ?JsonResponse
    {
        if (!config('lazychat.testing.enabled')) {
            return response()->json([
                'success' => false,
                'message' => 'LazyChat test endpoints are disabled. Set LAZYCHAT_TEST_ENABLED=true to use this runner.',
            ], 403);
        }

        if ($allowDryRunWithoutToken && $request->boolean('dry_run', false)) {
            return null;
        }

        $expectedToken = config('lazychat.testing.token');

        if (!$expectedToken) {
            return null;
        }

        $givenToken = $request->bearerToken() ?: $request->header('X-LazyChat-Test-Token');

        if (!$givenToken || !hash_equals((string) $expectedToken, (string) $givenToken)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or missing LazyChat test token.',
            ], 401);
        }

        return null;
    }

    private function testCategory(): Category
    {
        return Category::firstOrCreate(
            ['slug' => 'lazychat-test'],
            [
                'title' => 'LazyChat Test',
                'description' => 'Temporary category for LazyChat integration tests.',
                'is_active' => true,
            ]
        );
    }

    private function testVendor(): Vendor
    {
        return Vendor::firstOrCreate(
            ['name' => 'LazyChat Test Vendor'],
            [
                'type' => 'supplier',
                'is_active' => true,
            ]
        );
    }

    private function testStore(): Store
    {
        return Store::where('is_active', true)->where('is_warehouse', false)->first()
            ?: Store::firstOrCreate(
                ['name' => 'LazyChat Test Store'],
                [
                    'address' => 'LazyChat Test Store',
                    'is_warehouse' => false,
                    'is_online' => false,
                    'is_active' => true,
                ]
            );
    }

    private function testWarehouseStore(): Store
    {
        return Store::where('is_active', true)->where('is_warehouse', true)->first()
            ?: Store::firstOrCreate(
                ['name' => 'LazyChat Test Warehouse'],
                [
                    'address' => 'LazyChat Test Warehouse',
                    'is_warehouse' => true,
                    'is_online' => false,
                    'is_active' => true,
                ]
            );
    }
}
