<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AdminEntry;
use App\Models\BranchCostEntry;
use App\Models\OwnerEntry;
use App\Models\Transaction;
use Illuminate\Support\Str;

class AccountingEntryService
{
    public function syncBranchCostEntry(BranchCostEntry $entry): void
    {
        $this->replaceEntry(
            BranchCostEntry::class,
            $entry->id,
            'cash_sheet_branch_cost',
            $entry->entry_date,
            (float) $entry->amount,
            $this->getOrCreateAccount('5010', 'Branch Operating Costs', 'expense', 'operating_expenses'),
            Transaction::getCashAccountId($entry->store_id),
            'Cash Sheet Branch Cost',
            $entry->store_id,
            $entry->created_by,
            [
                'cash_sheet_type' => 'branch_cost',
                'details' => $entry->details,
            ]
        );
    }

    public function syncAdminEntry(AdminEntry $entry): void
    {
        $type = $entry->type;
        $amount = (float) $entry->amount;

        if ($type === 'salary_setaside') {
            $this->replaceEntry(
                AdminEntry::class,
                $entry->id,
                'cash_sheet_salary_setaside',
                $entry->entry_date,
                $amount,
                $this->getOrCreateAccount('1010', 'Salary Set Aside', 'asset', 'current_asset'),
                Transaction::getCashAccountId($entry->store_id),
                'Cash Sheet Salary Set Aside',
                $entry->store_id,
                $entry->created_by,
                [
                    'cash_sheet_type' => $type,
                    'details' => $entry->details,
                    'note' => 'Cash reserved for salary; kept out of branch available cash.',
                ]
            );
            return;
        }

        if ($type === 'cash_to_bank') {
            $this->replaceEntry(
                AdminEntry::class,
                $entry->id,
                'cash_sheet_cash_to_bank',
                $entry->entry_date,
                $amount,
                $this->getBankAccountId(),
                Transaction::getCashAccountId($entry->store_id),
                'Cash Sheet Cash To Bank Transfer',
                $entry->store_id,
                $entry->created_by,
                [
                    'cash_sheet_type' => $type,
                    'details' => $entry->details,
                ]
            );
            return;
        }

        if (in_array($type, ['sslzc', 'pathao'], true)) {
            $label = $type === 'sslzc' ? 'SSLCommerz Disbursement Received' : 'Pathao Disbursement Received';
            $this->replaceEntry(
                AdminEntry::class,
                $entry->id,
                'cash_sheet_' . $type,
                $entry->entry_date,
                $amount,
                $this->getBankAccountId(),
                $this->getOnlineCourierReceivableAccountId(),
                $label,
                null,
                $entry->created_by,
                [
                    'cash_sheet_type' => $type,
                    'details' => $entry->details,
                    'note' => 'Settlement received from payment/courier partner.',
                ]
            );
        }
    }

    public function syncOwnerEntry(OwnerEntry $entry): void
    {
        $type = $entry->type;
        $amount = (float) $entry->amount;
        $ownerCapital = $this->getOrCreateAccount('3002', 'Owner Capital', 'equity', 'owner_equity');
        $ownerExpense = $this->getOrCreateAccount('5011', 'Owner/Head Office Costs', 'expense', 'operating_expenses');
        $cash = Transaction::getCashAccountId(null);
        $bank = $this->getBankAccountId();

        match ($type) {
            'cash_invest' => $this->replaceEntry(
                OwnerEntry::class,
                $entry->id,
                'cash_sheet_owner_cash_invest',
                $entry->entry_date,
                $amount,
                $cash,
                $ownerCapital,
                'Owner Cash Investment',
                null,
                $entry->created_by,
                ['cash_sheet_type' => $type, 'details' => $entry->details]
            ),
            'bank_invest' => $this->replaceEntry(
                OwnerEntry::class,
                $entry->id,
                'cash_sheet_owner_bank_invest',
                $entry->entry_date,
                $amount,
                $bank,
                $ownerCapital,
                'Owner Bank Investment',
                null,
                $entry->created_by,
                ['cash_sheet_type' => $type, 'details' => $entry->details]
            ),
            'cash_cost' => $this->replaceEntry(
                OwnerEntry::class,
                $entry->id,
                'cash_sheet_owner_cash_cost',
                $entry->entry_date,
                $amount,
                $ownerExpense,
                $cash,
                'Owner Cash Cost',
                null,
                $entry->created_by,
                ['cash_sheet_type' => $type, 'details' => $entry->details]
            ),
            'bank_cost' => $this->replaceEntry(
                OwnerEntry::class,
                $entry->id,
                'cash_sheet_owner_bank_cost',
                $entry->entry_date,
                $amount,
                $ownerExpense,
                $bank,
                'Owner Bank Cost',
                null,
                $entry->created_by,
                ['cash_sheet_type' => $type, 'details' => $entry->details]
            ),
            default => null,
        };
    }

    public function cancelByReference(string $referenceType, int $referenceId, ?string $event = null): void
    {
        $query = Transaction::where('reference_type', $referenceType)
            ->where('reference_id', $referenceId);

        if ($event) {
            $query->where('metadata->event', $event);
        }

        $query->update(['status' => 'cancelled']);
    }

    private function replaceEntry(
        string $referenceType,
        int $referenceId,
        string $event,
        $date,
        float $amount,
        int $debitAccountId,
        int $creditAccountId,
        string $description,
        $storeId,
        $createdBy,
        array $metadata = []
    ): void {
        if ($amount <= 0) {
            return;
        }

        // Cancel older generated entries for this exact cash-sheet row, then recreate.
        Transaction::where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->where('metadata->event', $event)
            ->update(['status' => 'cancelled']);

        $groupId = (string) Str::uuid();
        $baseMetadata = array_merge($metadata, [
            'event' => $event,
            'source' => 'cash_sheet',
            'group_id' => $groupId,
        ]);

        Transaction::create([
            'transaction_date' => $date,
            'amount' => $amount,
            'type' => 'debit',
            'account_id' => $debitAccountId,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'description' => $description,
            'store_id' => $storeId,
            'created_by' => $createdBy,
            'metadata' => $baseMetadata,
            'status' => 'completed',
        ]);

        Transaction::create([
            'transaction_date' => $date,
            'amount' => $amount,
            'type' => 'credit',
            'account_id' => $creditAccountId,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'description' => $description,
            'store_id' => $storeId,
            'created_by' => $createdBy,
            'metadata' => $baseMetadata,
            'status' => 'completed',
        ]);
    }

    private function getBankAccountId(): int
    {
        return $this->getOrCreateAccount('1004', 'Bank Account', 'asset', 'current_asset');
    }

    private function getOnlineCourierReceivableAccountId(): int
    {
        return $this->getOrCreateAccount('1011', 'Online/Courier Receivable', 'asset', 'current_asset');
    }

    private function getOrCreateAccount(string $code, string $name, string $type, string $subType): int
    {
        $account = Account::where('account_code', $code)->first();
        if (!$account) {
            $parent = Account::where('type', $type)
                ->whereNull('parent_id')
                ->orderBy('account_code')
                ->first();

            $account = Account::create([
                'account_code' => $code,
                'name' => $name,
                'type' => $type,
                'sub_type' => $subType,
                'parent_id' => $parent?->id,
                'is_active' => true,
                'description' => 'Auto-created for cash sheet/accounting reconciliation.',
            ]);
        }

        return (int) $account->id;
    }
}
