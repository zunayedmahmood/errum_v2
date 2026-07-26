# Errum V2: Accounting & Finance Integrity Audit (7 Apr 2026)

This document lists identified integrity issues, reporting discrepancies, and edge cases found after the implementation of the "7_Apr_26_accounting_plan". These issues must be resolved to ensure the General Ledger remains the single source of truth.

## 1. Reporting & Case Sensitivity Issues
just to make a new fe deployments
### [CRITICAL] Case Sensitivity Inconsistency
*   **Issue**: The backend logic is inconsistent with string comparisons for transaction types.
    *   `AccountingReportController@getTAccount` uses `debit` / `credit` (lowercase).
    *   `AccountingReportController@getTrialBalance` uses `Debit` (PascalCase).
    *   `AccountingReportController@calculateRetainedEarnings` uses `Credit` (PascalCase).
*   **Impact**: Financial reports (Trial Balance, P&L) will fail to aggregate data if the `Transaction` records don't exactly match the expected case.
*   **Proposed Fix**: Standardize all backend and database entries to use lowercase `debit` and `credit`. Update all `sum(DB::raw(...))` calls to use lowercase.

### [ARCHITECTURAL] Report-Ledger Divergence
*   **Issue**: `getIncomeStatement` and `getBalanceSheet` still calculate COGS and Inventory value by querying `OrderItems` and `ProductBatches` directly.
*   **Impact**: If a manual journal entry is made to correct the Inventory or COGS account, it will be ignored by the high-level financial reports.
*   **Proposed Fix**: Reports must query the `Account` balance. For example, `Inventory Value` should be `Account::where('sub_type', 'inventory')->first()->getBalance()`.

## 2. Transaction Integrity & Double-Counting

### [HIGH] Exchange Double-Accounting
*   **Scenario**: A customer returns Item A and takes Item B.
*   **Issue**:
    1.  `ProductReturnController@exchange` calls `Transaction::createFromExchange`, which creates COGS/Inventory entries for the *new* item.
    2.  The standard `Order` fulfillment flow (or `OrderPaymentObserver`) might also trigger `Transaction::createFromOrderCOGS` for that same new order.
*   **Impact**: The cost of Item B is recorded twice in the COGS expense account, artificially lowering net profit.
*   **Proposed Fix**: Implement a check in `createFromOrderCOGS` to see if a transaction already exists for that `order_id` with `reference_type = 'exchange'`.

### [MEDIUM] Tax Reversal Inconsistency
*   **Issue**: `createFromRefund` calculates a tax reversal based on the *total order's tax ratio*.
*   **Edge Case**: If an order has mixed items (taxable and non-taxable) and only one is returned, the proportional tax ratio will be incorrect.
*   **Proposed Fix**: Tax reversal should be calculated based on the specific `OrderItem` being returned, not the whole order's ratio.

## 3. Multi-Store & Scoping Edge Cases

### [MEDIUM] Global vs. Store-Specific Accounts
*   **Issue**: `getInventoryAccountId()` and `getCashAccountId()` return a single global ID.
*   **Edge Case**: In a multi-store setup, Branch A's cash should not be in the same ledger as Branch B. 
*   **Impact**: Trial balance for a specific store works because of the `store_id` filter on transactions, but the `Account` model itself doesn't reflect store-specific hierarchies.
*   **Proposed Fix**: Ensure every transaction created by observers explicitly inherits the `store_id` from the source (Order/Refund/Expense).

### [LOW] Manual Inventory Write-offs
*   **Issue**: When a product is marked as "Defective" and removed from sellable stock, it is moved in `ProductMovement` but doesn't always trigger an accounting entry.
*   **Impact**: Inventory Asset account remains high while physical stock is gone.
*   **Proposed Fix**: Add an observer to `DefectiveProduct` that debits an `Inventory Shrinkage/Loss` expense account and credits the `Inventory` asset account.

## 4. Frontend Verification Requirements

### [UI] Ledger Filtering
*   **Issue**: The account ledger dropdown in `/accounting` needs to ensure it doesn't show "Parent" accounts (like "Current Assets") as they don't have direct transactions; only "Leaf" accounts should be selectable.
*   **Impact**: User selects a parent account and sees an empty or incomplete ledger.

---
**Note to Gemini in Antigravity**: Focus on standardizing the `debit/credit` casing first, then refactor the reports to pull directly from the Account Ledger balances.
