# Implementation Plan: Accounting and Transaction Synchronization (Updated)

**Date:** April 7, 2026
**Focus:** Human-readable Transaction IDs, Global (Errum) vs Store-specific scoping, Manual Entry Modal, Transaction Detail Page, and Accounting Sync.

---

## 1. Backend Changes (Laravel)

### 1.1. Human-Readable Reference Types & Labels
*   **Goal:** Replace `App\Models\OrderPayment` with "Order Payment" and ensure unique transaction IDs are clear.
*   **Action:** 
    *   Add a `reference_label` virtual attribute to the `Transaction` model.
    *   Add a `display_id` attribute (e.g., `TXN-2026-0001` or similar logic) to avoid class-path strings in the UI.
*   **Mapping:**
    *   `App\Models\OrderPayment` -> "Order Payment"
    *   `App\Models\Expense` -> "Expense"
    *   `App\Models\Refund` -> "Refund"
    *   `App\Models\VendorPayment` -> "Vendor Payment"
    *   `Manual` -> "Manual Entry"

### 1.2. Transaction Controller Enhancements (`TransactionController.php`)
*   **Store Scoping for "Errum":**
    *   **Admins:** Can select any `store_id` OR "Errum" (represented as `store_id: null` in DB).
    *   **Branch Managers:** `store_id` is automatically set to their assigned store and is **mandatory/unchangeable**. They cannot select "Errum".
*   **Manual Entry with Images:**
    *   Ensure `store()` accepts `receipt_image` (Base64) and `note`/`reference` fields.
    *   Save images to storage and link via `metadata` or `attachments`.
*   **Sorting:**
    *   Default `index()` to `transaction_date DESC, id DESC` (Flat list, newest first).

### 1.3. Accounting Report Sync (`AccountingReportController.php`)
*   Ensure `getJournalEntries` and other reports respect the `store_id: null` (Global Errum) filter for Admins.

---

## 2. Frontend Changes (Next.js)

### 2.1. Manual Entry Modal (`app/transaction/ManualEntryModal.tsx`)
*   **Refactor:** Instead of `/transaction/new` page, create a reusable `ManualEntryModal` component.
*   **Store Selection:**
    *   **Admins:** Dropdown with all stores + "Errum" (Global).
    *   **Branch Managers:** Pre-selected store, dropdown is **disabled/hidden**. "Errum" option is excluded.
*   **Features:** Support for image upload, notes, and references.

### 2.2. Transaction Detail Page (`app/transaction/[id]/page.tsx`)
*   **New Page:** Create a detailed view for a single transaction.
*   **Content:** Display full metadata, receipt images, linked reference entities (e.g., the specific Order or Expense), and audit logs.
*   **Navigation:** Link each row in the transaction list to this new detail page.

### 2.3. Accounting Dashboard (`app/accounting/page.tsx`)
*   **Data Fetching:** Update to use the backend's `/api/accounting/journal-entries` directly instead of client-side grouping.
*   **Labels:** Display the new `reference_label` and `display_id`.

### 2.4. Transaction List (`app/transaction/page.tsx`)
*   **Chronological View:** Ensure the main list is flat (not grouped by type) and sorted by newest first.
*   **Modal Integration:** Replace the "Manual Entry" button's link with a trigger for the new `ManualEntryModal`.

---

## 3. Data Integrity & Validation

*   **Scoping:** Backend must reject `store_id: null` requests from non-admin users.
*   **Consistency:** "Errum" (Global) expenses should be excluded from branch-specific profit/loss reports but included in company-wide reports.

---

## 4. Execution Order

1.  **Backend:** Implement `reference_label` mapping and "Errum" scoping in `TransactionController`.
2.  **Frontend:** Create `ManualEntryModal` and integrate into `app/transaction/page.tsx`.
3.  **Frontend:** Implement the `app/transaction/[id]/page.tsx` detail view.
4.  **Frontend:** Sync the Accounting dashboard with the new backend labels and grouping logic.
5.  **Validation:** Test Admin vs Branch Manager views for "Errum" vs Branch data.
