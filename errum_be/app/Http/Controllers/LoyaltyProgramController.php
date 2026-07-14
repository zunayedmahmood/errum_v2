<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\LoyaltyPointTransaction;
use App\Models\LoyaltySetting;
use App\Services\LoyaltyCardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class LoyaltyProgramController extends Controller
{
    public function __construct(private readonly LoyaltyCardService $loyalty)
    {
    }

    public function checkoutPreview(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'phone' => 'required|string|max:40',
            'eligible_amount' => 'required|numeric|min:0|max:999999999',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $customer = $this->loyalty->findCustomerByPhone($request->string('phone')->toString());

        return response()->json([
            'success' => true,
            'data' => $this->loyalty->preview($customer, (float) $request->input('eligible_amount')),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = min(100, max(10, (int) $request->input('per_page', 20)));
        $search = trim((string) $request->input('search', ''));
        $status = $request->input('status', 'active');

        $query = Customer::query()
            ->with('loyaltyCardActivatedBy:id,name')
            ->when($status === 'active', fn ($q) => $q->where('has_loyalty_card', true))
            ->when($status === 'inactive', fn ($q) => $q->where('has_loyalty_card', false)->where('loyalty_points_balance', '>', 0))
            ->when($status === 'all', fn ($q) => $q->where(function ($inner) {
                $inner->where('has_loyalty_card', true)->orWhere('loyalty_points_balance', '>', 0);
            }))
            ->when($search !== '', function ($q) use ($search) {
                $normalized = $this->loyalty->normalizePhone($search);
                $q->where(function ($inner) use ($search, $normalized) {
                    $inner->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('customer_code', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                    if ($normalized !== '') {
                        $inner->orWhere('phone', 'like', "%{$normalized}%");
                    }
                });
            })
            ->orderByDesc('has_loyalty_card')
            ->orderByDesc('loyalty_card_activated_at')
            ->orderByDesc('id');

        $customers = $query->paginate($perPage);
        $customers->getCollection()->transform(fn (Customer $customer) => $this->formatCustomer($customer));

        $summary = [
            'active_cardholders' => Customer::where('has_loyalty_card', true)->count(),
            'total_points_balance' => (int) Customer::where('has_loyalty_card', true)->sum('loyalty_points_balance'),
            'points_earned' => (int) LoyaltyPointTransaction::where('type', 'earned')->where('points_delta', '>', 0)->sum('points_delta'),
            'points_redeemed' => abs((int) LoyaltyPointTransaction::where('type', 'redeemed')->where('points_delta', '<', 0)->sum('points_delta')),
            'points_reversed' => abs((int) LoyaltyPointTransaction::whereIn('type', ['reversed_return', 'reversed_order'])->where('points_delta', '<', 0)->sum('points_delta')),
        ];

        return response()->json(['success' => true, 'data' => ['customers' => $customers, 'summary' => $summary]]);
    }

    public function show(int $id): JsonResponse
    {
        $customer = Customer::with('loyaltyCardActivatedBy:id,name')->findOrFail($id);
        return response()->json(['success' => true, 'data' => $this->formatCustomer($customer)]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), ['phone' => 'required|string|max:40']);
        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $customer = $this->loyalty->findCustomerByPhone($request->string('phone')->toString(), true);
        return response()->json([
            'success' => true,
            'data' => $customer ? $this->formatCustomer($customer) : null,
        ]);
    }

    public function activate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'phone' => 'required|string|max:40',
            'name' => 'nullable|string|max:255',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string|max:1000',
            'city' => 'nullable|string|max:120',
            'state' => 'nullable|string|max:120',
            'postal_code' => 'nullable|string|max:40',
            'country' => 'nullable|string|max:120',
            'customer_type' => 'nullable|in:counter,social_commerce,ecommerce',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        try {
            $customer = $this->loyalty->activateCard(
                $request->string('phone')->toString(),
                $request->only(['name', 'email', 'address', 'city', 'state', 'postal_code', 'country', 'customer_type']),
                Auth::id()
            );

            return response()->json([
                'success' => true,
                'message' => 'Loyalty card activated successfully.',
                'data' => $this->formatCustomer($customer),
            ], 201);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function deactivate(int $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);
        $customer = $this->loyalty->deactivateCard($customer);

        return response()->json([
            'success' => true,
            'message' => 'Loyalty card deactivated. Existing points remain in the ledger.',
            'data' => $this->formatCustomer($customer),
        ]);
    }

    public function transactions(Request $request, int $id): JsonResponse
    {
        Customer::findOrFail($id);
        $perPage = min(100, max(10, (int) $request->input('per_page', 25)));

        $transactions = LoyaltyPointTransaction::query()
            ->with(['order:id,order_number,status,total_amount', 'createdBy:id,name'])
            ->where('customer_id', $id)
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json(['success' => true, 'data' => $transactions]);
    }

    public function settings(): JsonResponse
    {
        $setting = $this->loyalty->settings();
        return response()->json([
            'success' => true,
            'data' => [
                'points_per_thousand' => (float) $setting->points_per_thousand,
                'points_per_taka_discount' => (int) $setting->points_per_taka_discount,
                'updated_at' => $setting->updated_at,
            ],
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        if (!$this->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Only administrators can change loyalty point rates.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'points_per_thousand' => 'required|numeric|min:0|max:1000000',
            'points_per_taka_discount' => 'required|integer|min:1|max:1000000',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $setting = DB::transaction(function () use ($request) {
            $setting = LoyaltySetting::query()->whereKey(1)->lockForUpdate()->first();
            if (!$setting) {
                $setting = new LoyaltySetting();
                $setting->id = 1;
            }
            $setting->points_per_thousand = (float) $request->input('points_per_thousand');
            $setting->points_per_taka_discount = (int) $request->input('points_per_taka_discount');
            $setting->updated_by = Auth::id();
            $setting->save();
            return $setting;
        });

        return response()->json([
            'success' => true,
            'message' => 'Loyalty point settings updated. The new earning rate applies only to future orders.',
            'data' => [
                'points_per_thousand' => (float) $setting->points_per_thousand,
                'points_per_taka_discount' => (int) $setting->points_per_taka_discount,
                'updated_at' => $setting->updated_at,
            ],
        ]);
    }

    private function isAdmin(): bool
    {
        $slug = strtolower((string) optional(Auth::user()?->role)->slug);
        return in_array($slug, ['super-admin', 'super_admin', 'admin', 'administrator'], true);
    }

    private function formatCustomer(Customer $customer): array
    {
        return [
            'id' => $customer->id,
            'customer_code' => $customer->customer_code,
            'customer_type' => $customer->customer_type,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'address' => $customer->address,
            'city' => $customer->city,
            'state' => $customer->state,
            'postal_code' => $customer->postal_code,
            'country' => $customer->country,
            'status' => $customer->status,
            'has_loyalty_card' => (bool) $customer->has_loyalty_card,
            'loyalty_points_balance' => (int) $customer->loyalty_points_balance,
            'loyalty_card_activated_at' => $customer->loyalty_card_activated_at,
            'loyalty_card_activated_by' => $customer->loyaltyCardActivatedBy ? [
                'id' => $customer->loyaltyCardActivatedBy->id,
                'name' => $customer->loyaltyCardActivatedBy->name,
            ] : null,
            'total_orders' => (int) $customer->total_orders,
            'total_purchases' => (float) $customer->total_purchases,
            'created_at' => $customer->created_at,
        ];
    }
}
