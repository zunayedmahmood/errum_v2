<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Services\AccountingPostingService;
use Illuminate\Console\Command;

class EnsureStandardAccountingAccounts extends Command
{
    protected $signature = 'accounting:ensure-standard-accounts
                            {--dry-run : Show missing/inactive/type-mismatched workbook accounts without creating anything}';

    protected $description = 'Create/activate the standard chart-of-accounts rows required by the operational accounting workbook. No ledger transactions are posted.';

    private array $standardAccounts = [
        '1001' => ['name' => 'Cash and Cash Equivalents', 'type' => 'asset', 'slug' => 'cash'],
        '1002' => ['name' => 'Accounts Receivable', 'type' => 'asset', 'slug' => 'accounts_receivable'],
        '1003' => ['name' => 'Inventory', 'type' => 'asset', 'slug' => 'inventory'],
        '1004' => ['name' => 'Bank Account', 'type' => 'asset', 'slug' => 'bank'],
        '1005' => ['name' => 'Salary/Rent Reserve Cash', 'type' => 'asset', 'slug' => 'salary_reserve'],
        '1006' => ['name' => 'Vendor Advances / Supplier Deposits', 'type' => 'asset', 'slug' => 'vendor_advance'],
        '1007' => ['name' => 'Inventory to Receive / PO Commitment Asset', 'type' => 'asset', 'slug' => 'inventory_to_receive'],
        '1008' => ['name' => 'Pathao Receivable', 'type' => 'asset', 'slug' => 'pathao_receivable'],
        '1009' => ['name' => 'SSLCommerz Receivable', 'type' => 'asset', 'slug' => 'sslcommerz_receivable'],
        '1010' => ['name' => 'Customer Receivable', 'type' => 'asset', 'slug' => 'customer_receivable'],
        '2001' => ['name' => 'Accounts Payable', 'type' => 'liability', 'slug' => 'accounts_payable'],
        '2002' => ['name' => 'Tax Payable', 'type' => 'liability', 'slug' => 'tax_payable'],
        '2003' => ['name' => 'PO Payable Commitment', 'type' => 'liability', 'slug' => 'po_payable_commitment'],
        '2004' => ['name' => 'Customer Advance / Unearned Revenue', 'type' => 'liability', 'slug' => 'customer_advance'],
        '2005' => ['name' => 'Customer Refund Payable', 'type' => 'liability', 'slug' => 'customer_refund_payable'],
        '2006' => ['name' => 'Customer Store Credit', 'type' => 'liability', 'slug' => 'customer_store_credit'],
        '2007' => ['name' => 'Pathao Payable', 'type' => 'liability', 'slug' => 'pathao_payable'],
        '2999' => ['name' => 'Exchange Clearing', 'type' => 'liability', 'slug' => 'exchange_clearing'],
        '3002' => ['name' => 'Owner Capital', 'type' => 'equity', 'slug' => 'owner_capital'],
        '3003' => ['name' => 'Owner Drawings', 'type' => 'equity', 'slug' => 'owner_drawings'],
        '4001' => ['name' => 'Sales Revenue', 'type' => 'income', 'slug' => 'sales_revenue'],
        '4002' => ['name' => 'Service Revenue', 'type' => 'income', 'slug' => 'service_revenue'],
        '4003' => ['name' => 'Delivery Charge Income', 'type' => 'income', 'slug' => 'delivery_charge_income'],
        '4101' => ['name' => 'Sales Discount / Contra Revenue', 'type' => 'expense', 'slug' => 'sales_discount'],
        '4102' => ['name' => 'Sales Return / Refund / Contra Revenue', 'type' => 'expense', 'slug' => 'sales_return'],
        '5001' => ['name' => 'Operating Expenses', 'type' => 'expense', 'slug' => 'operating_expense'],
        '5002' => ['name' => 'Cost of Goods Sold', 'type' => 'expense', 'slug' => 'cogs'],
        '5010' => ['name' => 'Delivery Expense - Pathao', 'type' => 'expense', 'slug' => 'delivery_expense_pathao'],
        '5011' => ['name' => 'SSLCommerz Commission Expense', 'type' => 'expense', 'slug' => 'ssl_fee_expense'],
        '5012' => ['name' => 'Branch Daily Expense', 'type' => 'expense', 'slug' => 'branch_daily_expense'],
        '5013' => ['name' => 'Inventory Loss / Damage', 'type' => 'expense', 'slug' => 'damaged_inventory_loss'],
    ];

    public function handle(AccountingPostingService $posting): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $rows = [];
        $missing = 0;
        $inactive = 0;
        $wrongType = 0;

        foreach ($this->standardAccounts as $code => $expected) {
            $account = Account::where('account_code', $code)->first();
            if (!$account) {
                $missing++;
                $rows[] = [$code, $expected['name'], $expected['type'], 'MISSING', $dryRun ? 'would create' : 'created'];
                continue;
            }
            if (!$account->is_active) {
                $inactive++;
                $rows[] = [$code, $account->name, $account->type, 'INACTIVE', $dryRun ? 'would activate' : 'activated'];
                continue;
            }
            if ($account->type !== $expected['type']) {
                $wrongType++;
                $rows[] = [$code, $account->name, $account->type, 'WRONG TYPE', 'manual review needed; expected '.$expected['type']];
                continue;
            }
        }

        if (!$dryRun) {
            $posting->ensureWorkbookAccounts();
        }

        if ($rows) {
            $this->table(['Code', 'Account', 'Type', 'Status', 'Action'], $rows);
        } else {
            $this->info('All standard operational accounting accounts already exist, are active, and have the expected type.');
        }

        $this->table(['Check', 'Count'], [
            ['missing', $missing],
            ['inactive', $inactive],
            ['wrong_type', $wrongType],
        ]);

        if ($wrongType > 0) {
            $this->error('Some standard account codes exist with the wrong type. Do not sync until those are manually reviewed.');
            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }
}
