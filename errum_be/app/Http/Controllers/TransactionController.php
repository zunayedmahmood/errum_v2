<?php

namespace App\Http\Controllers;

use App\Models\Transaction;
use App\Models\Account;
use App\Traits\DatabaseAgnosticSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    use DatabaseAgnosticSearch;
    public function index(Request $request)
    {
        $query = Transaction::with(['account', 'store', 'createdBy']);

        // Filter by account
        if ($request->has('account_id')) {
            $query->byAccount($request->account_id);
        }

        // Filter by type
        if ($request->has('type')) {
            $query->where('type', $request->type);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by store
        if ($request->has('store_id')) {
            $query->byStore($request->store_id);
        }

        // Filter by date range
        if ($request->has('date_from') && $request->has('date_to')) {
            $query->byDateRange($request->date_from, $request->date_to);
        }

        // Filter by reference
        if ($request->has('reference_type') && $request->has('reference_id')) {
            $query->byReference($request->reference_type, $request->reference_id);
        }

        // Search by transaction number or description
        if ($request->has('search')) {
            $search = $request->search;
            $this->whereAnyLike($query, ['transaction_number', 'description'], $search);
        }

        // Sort
        $sortBy = $request->get('sort_by', 'transaction_date');
        $sortOrder = $request->get('sort_order', 'desc');
        $query->orderBy($sortBy, $sortOrder);

        $perPage = $request->get('per_page', 15);
        $transactions = $query->paginate($perPage);

        return response()->json(['success' => true, 'data' => $transactions]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'transaction_date' => 'required|date',
            'amount' => 'required|numeric|min:0',
            'type' => 'required|in:debit,credit',
            'account_id' => 'required|exists:accounts,id',
            'description' => 'nullable|string',
            'store_id' => 'nullable|exists:stores,id',
            'reference_type' => 'nullable|string',
            'reference_id' => 'nullable|integer',
            'metadata' => 'nullable|array',
            'status' => 'nullable|in:pending,completed,failed,cancelled',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();
        
        // Auto-detect transaction type based on reference_type if needed
        // This helps frontend developers who might not know the accounting rules
        if ($request->has('reference_type')) {
            $referenceType = $request->reference_type;
            
            // Money IN (Debit): Customer payments
            $moneyInTypes = ['OrderPayment', 'ServiceOrderPayment', 'CustomerPayment'];
            
            // Money OUT (Credit): Business expenses, vendor payments, refunds
            $moneyOutTypes = ['Expense', 'ExpensePayment', 'VendorPayment', 'Refund', 'manual'];
            
            // Log warning if type doesn't match reference
            if (in_array($referenceType, $moneyInTypes) && $data['type'] === 'credit') {
                \Log::warning("Transaction type mismatch: {$referenceType} should be 'debit' but got 'credit'");
            }
            if (in_array($referenceType, $moneyOutTypes) && $data['type'] === 'debit') {
                \Log::warning("Transaction type mismatch: {$referenceType} should be 'credit' but got 'debit'");
            }
        }
        
        // Set created_by to current authenticated user
        if (!isset($data['created_by'])) {
            $data['created_by'] = auth()->id();
        }
        
        // Set store_id to current authenticated user's store if not provided
        if (!isset($data['store_id'])) {
            $employee = auth()->user();
            $data['store_id'] = $employee->store_id ?? null;
        }

        $transaction = Transaction::create($data);

        return response()->json([
            'success' => true,
            'data' => $transaction->load(['account', 'store', 'createdBy']),
            'message' => 'Transaction created successfully'
        ], 201);
    }

    public function show($id)
    {
        $transaction = Transaction::with(['account', 'store', 'createdBy', 'reference'])->findOrFail($id);

        return response()->json(['success' => true, 'data' => $transaction]);
    }

    public function update(Request $request, $id)
    {
        $transaction = Transaction::findOrFail($id);

        // Only allow updating pending transactions
        if ($transaction->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Only pending transactions can be updated'
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'transaction_date' => 'sometimes|required|date',
            'amount' => 'sometimes|required|numeric|min:0',
            'type' => 'sometimes|required|in:debit,credit',
            'account_id' => 'sometimes|required|exists:accounts,id',
            'description' => 'nullable|string',
            'store_id' => 'nullable|exists:stores,id',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $transaction->update($validator->validated());

        return response()->json([
            'success' => true,
            'data' => $transaction->load(['account', 'store', 'createdBy']),
            'message' => 'Transaction updated successfully'
        ]);
    }

    public function destroy($id)
    {
        $transaction = Transaction::findOrFail($id);

        // Only allow deleting pending or failed transactions
        if (!in_array($transaction->status, ['pending', 'failed'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only pending or failed transactions can be deleted'
            ], 422);
        }

        $transaction->delete();

        return response()->json(['success' => true, 'message' => 'Transaction deleted successfully']);
    }

    public function complete($id)
    {
        $transaction = Transaction::findOrFail($id);

        if ($transaction->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Only pending transactions can be completed'
            ], 422);
        }

        $transaction->complete();

        return response()->json([
            'success' => true,
            'data' => $transaction->load(['account', 'store']),
            'message' => 'Transaction completed successfully'
        ]);
    }

    public function fail(Request $request, $id)
    {
        $transaction = Transaction::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $transaction->fail($request->reason);

        return response()->json([
            'success' => true,
            'data' => $transaction->load(['account', 'store']),
            'message' => 'Transaction marked as failed'
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $transaction = Transaction::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $transaction->cancel($request->reason);

        return response()->json([
            'success' => true,
            'data' => $transaction->load(['account', 'store']),
            'message' => 'Transaction cancelled successfully'
        ]);
    }

    public function getAccountTransactions($accountId, Request $request)
    {
        $account = Account::findOrFail($accountId);

        $query = $account->transactions()->with(['store', 'createdBy']);

        // Filter by date range
        if ($request->has('date_from') && $request->has('date_to')) {
            $query->byDateRange($request->date_from, $request->date_to);
        }

        // Filter by store
        if ($request->has('store_id')) {
            $query->byStore($request->store_id);
        }

        $query->orderBy('transaction_date', 'desc');

        $perPage = $request->get('per_page', 15);
        $transactions = $query->paginate($perPage);

        return response()->json(['success' => true, 'data' => $transactions]);
    }

    public function getStatistics(Request $request)
    {
        $dateFrom = $request->get('date_from', now()->startOfMonth());
        $dateTo = $request->get('date_to', now()->endOfMonth());
        $storeId = $request->get('store_id');

        $query = Transaction::whereBetween('transaction_date', [$dateFrom, $dateTo]);

        if ($storeId) {
            $query->byStore($storeId);
        }

        $stats = [
            'total' => (clone $query)->count(),
            'completed' => (clone $query)->completed()->count(),
            'pending' => (clone $query)->pending()->count(),
            'failed' => (clone $query)->failed()->count(),
            'total_debits' => (float) (clone $query)->debit()->sum('amount'),
            'total_credits' => (float) (clone $query)->credit()->sum('amount'),
            'completed_debits' => (float) (clone $query)->debit()->completed()->sum('amount'),
            'completed_credits' => (float) (clone $query)->credit()->completed()->sum('amount'),
            'net_balance' => (float) (clone $query)->completed()->debit()->sum('amount') - 
                            (float) (clone $query)->completed()->credit()->sum('amount'),
            'by_type' => [
                'debit' => (clone $query)->debit()->count(),
                'credit' => (clone $query)->credit()->count(),
            ],
            'by_status' => [
                'completed' => (clone $query)->completed()->count(),
                'pending' => (clone $query)->pending()->count(),
                'failed' => (clone $query)->failed()->count(),
            ],
        ];

        return response()->json(['success' => true, 'data' => $stats]);
    }

    public function getTrialBalance(Request $request)
    {
        $storeId = $request->get('store_id');
        $startDate = $request->get('start_date', now()->startOfMonth());
        $endDate = $request->get('end_date', now()->endOfMonth());

        $trialBalance = Transaction::getTrialBalance($storeId, $startDate, $endDate);

        // Get account-wise balance
        $accounts = Account::with('parent')
            ->active()
            ->orderBy('account_code')
            ->get()
            ->map(function($account) use ($storeId, $endDate) {
                $balance = $account->getBalance($storeId, $endDate);
                return [
                    'account_code' => $account->account_code,
                    'account_name' => $account->name,
                    'type' => $account->type,
                    'balance' => $balance,
                    'debit' => $balance > 0 ? $balance : 0,
                    'credit' => $balance < 0 ? abs($balance) : 0,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => $trialBalance,
                'accounts' => $accounts,
                'date_range' => [
                    'start_date' => $startDate,
                    'end_date' => $endDate,
                ],
                'store_id' => $storeId,
            ]
        ]);
    }

    public function getLedger($accountId, Request $request)
    {
        $account = Account::findOrFail($accountId);

        $dateFrom = $request->get('date_from', now()->startOfMonth());
        $dateTo = $request->get('date_to', now()->endOfMonth());
        $storeId = $request->get('store_id');

        $query = $account->transactions()
            ->completed()
            ->with(['store', 'createdBy'])
            ->whereBetween('transaction_date', [$dateFrom, $dateTo]);

        if ($storeId) {
            $query->byStore($storeId);
        }

        $transactions = $query->orderBy('transaction_date')->get();

        // Calculate running balance
        $runningBalance = 0;
        $ledger = $transactions->map(function($transaction) use (&$runningBalance, $account) {
            if ($transaction->type === 'debit') {
                $runningBalance += $transaction->amount;
            } else {
                $runningBalance -= $transaction->amount;
            }

            return [
                'id' => $transaction->id,
                'transaction_number' => $transaction->transaction_number,
                'transaction_date' => $transaction->transaction_date,
                'description' => $transaction->description,
                'debit' => $transaction->type === 'debit' ? $transaction->amount : 0,
                'credit' => $transaction->type === 'credit' ? $transaction->amount : 0,
                'balance' => $runningBalance,
                'status' => $transaction->status,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'account' => [
                    'id' => $account->id,
                    'account_code' => $account->account_code,
                    'name' => $account->name,
                    'type' => $account->type,
                ],
                'opening_balance' => $account->getBalance($storeId, $dateFrom),
                'closing_balance' => $runningBalance,
                'transactions' => $ledger,
                'date_range' => [
                    'date_from' => $dateFrom,
                    'date_to' => $dateTo,
                ],
            ]
        ]);
    }

    public function bulkComplete(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'transaction_ids' => 'required|array',
            'transaction_ids.*' => 'required|integer|exists:transactions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $transactions = Transaction::whereIn('id', $request->transaction_ids)
            ->where('status', 'pending')
            ->get();

        $completed = 0;
        foreach ($transactions as $transaction) {
            if ($transaction->complete()) {
                $completed++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$completed} transaction(s) completed successfully",
            'data' => ['completed_count' => $completed]
        ]);
    }
}

