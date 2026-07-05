# Errum Used Metadata + Cash Sheet Date + Reserve Count Fix Notes

## Files changed

### Backend
- `app/Models/ProductBarcode.php`
- `app/Http/Controllers/DefectiveProductController.php`
- `app/Http/Controllers/ProductBarcodeController.php`
- `app/Http/Controllers/CashSheetController.php`
- `cash-sheet-explanation.md`

### Frontend
- `app/cash-sheet-new/page.tsx`
- `app/cash-sheet/page.tsx`
- `app/cash-sheet/summary/page.tsx`
- `app/cash-sheet/admin/page.tsx`
- `app/cash-sheet/branch-cost/page.tsx`
- `app/cash-sheet/owner/page.tsx`
- `app/product/check-reserve/page.tsx`

## 1. Used item metadata

Problem: marking a barcode as used was metadata-only for stock, but the barcode response/metadata did not reliably expose a simple `used` attribute for UI/reporting.

Fix:
- `ProductBarcode::markAsUsed()` now writes multiple safe aliases inside `location_metadata`:
  - `used: true`
  - `condition: used`
  - `item_condition: used`
  - `is_used_item: true`
  - `used_item_metadata_only: true`
- It still does not reduce batch stock.
- It still does not unlink the barcode from the batch.
- It still does not mark the barcode defective/inactive.
- Barcode scan API now returns `used`, `is_used_item`, `used_item`, `attributes.used`, and `metadata`.

## 2. Cash-sheet-new timezone/date hydration

Problem: the frontend was fixed earlier, but the backend was still grouping many UTC timestamps with `DATE(column)`. Records created at 01:xx Bangladesh time could therefore hydrate the previous date row.

Fix:
- Added backend Bangladesh business date conversion for datetime columns:
  - MySQL: `DATE(DATE_ADD(column, INTERVAL 6 HOUR))`
  - SQLite/dev: `DATE(column, '+6 hours')`
- Applied this to branch sales, branch payments, split payments, refunds, exchanges, online sales, online payments, online refunds, and accounting expense payments.
- Manual date-only cash sheet entries still use their stored date directly.

## 3. Cash/Bank split payment consistency

Problem: Sale could show correctly while Cash and Bank stayed zero when legacy split rows were pending/null or missing `store_id`.

Fix:
- Split payments now use store fallback:
  - `payment_splits.store_id → order_payments.store_id → orders.store_id`
- Split payments are counted when the parent payment is completed/partially_refunded/refunded and the split row is not failed/cancelled/canceled/void.
- Split payment date fallback now uses split date first, then parent payment date, then created date.

## 4. Frontend date defaults

Problem: some cash-sheet sub-pages still used UTC `toISOString()` for default date.

Fix:
- Updated cash-sheet new/main/summary/admin/branch-cost/owner pages to use `Asia/Dhaka` date.

## 5. Check Reserve variant reserve count

Problem: SKU group showed total reserved count, but individual variants did not show their own reserved count in the product list.

Fix:
- Added `Reserved: {variant.reserved_inventory}` beside each variant in the collapsed product list.

## Validation

PHP syntax checks passed for:

```bash
php -l app/Http/Controllers/CashSheetController.php
php -l app/Http/Controllers/DefectiveProductController.php
php -l app/Http/Controllers/ProductBarcodeController.php
php -l app/Models/ProductBarcode.php
```

No full Laravel/Next runtime test was run because the uploaded bundle does not include the complete live runtime/dependencies.
