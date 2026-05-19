<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ReservedProduct;
use App\Services\LazyChat\ProductPayloadBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class LazyChatOrderController extends Controller
{
    public function store(Request $request, ProductPayloadBuilder $payloadBuilder): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'id' => 'required|string|max:100',
            'deliveryCharge' => 'nullable|numeric|min:0',
            'contact' => 'required|array',
            'contact.name' => 'required|string|max:255',
            'contact.phone' => 'required|string|min:10|max:20',
            'contact.address' => 'required|string|max:1000',
            'total_price' => 'nullable|numeric|min:0',
            'note' => 'nullable|string|max:1000',
            'payment_method' => 'nullable|string|max:50',
            'payment_status' => 'nullable|string|max:50',
            'line_items' => 'required|array|min:1',
            'line_items.*.product_id' => 'required|integer|exists:products,id',
            'line_items.*.sku' => 'nullable|string|max:255',
            'line_items.*.variation_id' => 'nullable|string|max:255',
            'line_items.*.name' => 'nullable|string|max:255',
            'line_items.*.price' => 'nullable|numeric|min:0',
            'line_items.*.quantity' => 'required|integer|min:1',
            'line_items.*.image' => 'nullable|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $existingOrder = Order::where('metadata->source', 'lazychat')
            ->where('metadata->lazychat_order_id', (string) $request->input('id'))
            ->first();

        if ($existingOrder) {
            return response()->json([
                'success' => true,
                'message' => 'LazyChat order already exists.',
                'data' => [
                    'order_id' => $existingOrder->id,
                    'order_number' => $existingOrder->order_number,
                    'status' => $existingOrder->status,
                    'payment_status' => $existingOrder->payment_status,
                    'total_amount' => $existingOrder->total_amount,
                ],
            ]);
        }

        try {
            DB::beginTransaction();

            $contact = $request->input('contact');
            $customer = Customer::findOrCreateByPhone($contact['phone'], [
                'name' => $contact['name'],
                'address' => $contact['address'],
                'country' => 'Bangladesh',
            ]);

            $subtotal = 0;
            $taxAmount = 0;
            $orderItems = [];
            $outOfStockItems = [];

            foreach ($request->input('line_items') as $lineItem) {
                $product = Product::find($lineItem['product_id']);
                $quantity = (int) $lineItem['quantity'];

                $reservedRecord = ReservedProduct::where('product_id', $product->id)
                    ->lockForUpdate()
                    ->first();

                $availableStock = $reservedRecord ? (int) $reservedRecord->available_inventory : 0;

                if ($availableStock < $quantity) {
                    $outOfStockItems[] = [
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'requested' => $quantity,
                        'available' => $availableStock,
                    ];
                    continue;
                }

                $batch = $payloadBuilder->batchForOrder($product);
                $unitPrice = $batch ? (float) $batch->sell_price : null;

                if ($unitPrice === null) {
                    DB::rollBack();

                    return response()->json([
                        'success' => false,
                        'message' => "Product {$product->name} has no active available price.",
                    ], 400);
                }

                $itemSubtotal = $unitPrice * $quantity;
                $taxPercentage = $batch ? (float) ($batch->tax_percentage ?? 0) : 0;
                $itemTax = $taxPercentage > 0
                    ? round($itemSubtotal - ($itemSubtotal / (1 + ($taxPercentage / 100))), 2)
                    : 0;

                $subtotal += $itemSubtotal;
                $taxAmount += $itemTax;

                $orderItems[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'tax_amount' => $itemTax,
                    'discount_amount' => 0,
                    'total_amount' => $itemSubtotal,
                    'notes' => isset($lineItem['variation_id']) ? 'LazyChat variation_id: ' . $lineItem['variation_id'] : null,
                ];
            }

            if (!empty($outOfStockItems)) {
                DB::rollBack();

                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient stock for some items',
                    'out_of_stock_items' => $outOfStockItems,
                ], 400);
            }

            $deliveryCharge = (float) $request->input('deliveryCharge', 0);
            $totalAmount = $subtotal + $deliveryCharge;
            $paymentMethod = $this->normalizePaymentMethod($request->input('payment_method'));
            $paymentStatus = $this->normalizePaymentStatus($request->input('payment_status'), $paymentMethod);
            $deliveryAddress = $this->buildDeliveryAddress($contact);

            $order = Order::create([
                'customer_id' => $customer->id,
                'store_id' => null,
                'order_type' => 'ecommerce',
                'is_preorder' => false,
                'preorder_notes' => null,
                'status' => 'pending_assignment',
                'fulfillment_status' => 'pending_fulfillment',
                'payment_status' => $paymentStatus,
                'payment_method' => $paymentMethod,
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'discount_amount' => 0,
                'shipping_amount' => $deliveryCharge,
                'total_amount' => $totalAmount,
                'paid_amount' => $paymentStatus === 'paid' ? $totalAmount : 0,
                'outstanding_amount' => $paymentStatus === 'paid' ? 0 : $totalAmount,
                'shipping_address' => $deliveryAddress,
                'billing_address' => $deliveryAddress,
                'notes' => $request->input('note'),
                'metadata' => [
                    'source' => 'lazychat',
                    'lazychat_order_id' => (string) $request->input('id'),
                    'lazychat_total_price' => $request->input('total_price'),
                    'lazychat_payment_method' => $request->input('payment_method'),
                    'lazychat_payment_status' => $request->input('payment_status'),
                    'checkout_type' => 'lazychat',
                    'customer_phone' => $contact['phone'],
                ],
            ]);

            foreach ($orderItems as $itemData) {
                OrderItem::create(array_merge($itemData, [
                    'order_id' => $order->id,
                ]));
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'LazyChat order created successfully.',
                'data' => [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'status' => $order->status,
                    'payment_method' => $order->payment_method,
                    'payment_status' => $order->payment_status,
                    'subtotal' => $order->subtotal,
                    'shipping_amount' => $order->shipping_amount,
                    'total_amount' => $order->total_amount,
                    'lazychat_order_id' => (string) $request->input('id'),
                ],
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Failed to create LazyChat order',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    private function normalizePaymentMethod(?string $paymentMethod): string
    {
        return match ($paymentMethod) {
            'cash_on_delivery', 'cod', null => 'cod',
            'cash' => 'cash',
            'card' => 'card',
            'bank_transfer' => 'bank_transfer',
            'digital_wallet' => 'digital_wallet',
            default => 'cod',
        };
    }

    private function normalizePaymentStatus(?string $paymentStatus, string $paymentMethod): string
    {
        if (in_array($paymentStatus, ['pending', 'unpaid', 'paid', 'partial', 'failed', 'refunded'], true)) {
            return $paymentStatus;
        }

        return in_array($paymentMethod, ['cod', 'cash'], true) ? 'pending' : 'unpaid';
    }

    private function buildDeliveryAddress(array $contact): array
    {
        return [
            'full_name' => $contact['name'],
            'phone' => $contact['phone'],
            'address_line_1' => $contact['address'],
            'address_line_2' => null,
            'city' => null,
            'state' => null,
            'postal_code' => null,
            'country' => 'Bangladesh',
            'full_address' => $contact['address'],
        ];
    }
}
