# Cash Sheet New Behaviour

This document explains how `/api/cash-sheet-new` is calculated in the current Errum codebase. The page uses the same backend controller as the original cash sheet: `app/Http/Controllers/CashSheetController.php`.

## 1. Main principle

`cash-sheet-new` is a live calculated report. It does not store a separate daily snapshot. Every reload recalculates the month from the live database tables:

- `orders`
- `order_payments`
- `payment_splits`
- `refunds`
- `product_returns`
- `branch_cost_entries`
- `expenses`
- `expense_payments`
- `admin_entries`
- `owner_entries`
- `stores`

Because of this, edits/deletes/cancellations update the cash sheet automatically after refresh as long as the source row status/date/amount is updated correctly.

## 2. Date range

Request:

```http
GET /api/cash-sheet-new?month=YYYY-MM
```

The controller creates rows from the first day of the month to the last day of the month.

Example:

```text
month=2026-07
from = 2026-07-01
to   = 2026-07-31
```

Every row in the response represents one date.

## 3. Branch/store columns

The page loads every active store from `stores`:

```php
Store::where('is_active', true)
    ->orderBy('is_warehouse')
    ->orderBy('id')
```

Each active store/warehouse appears as a branch column in the response. The controller does not hide a store because it has no sale or no stock.

For each store and date, the branch block contains:

```text
daily_sale
raw_cash
cash
bank
ex_on
salary
cash_to_bank
daily_cost
```

## 4. Which orders are included

### Branch/offline order types

Branch/offline calculations include orders whose `order_type` is one of:

```text
counter
pos
offline
```

### Online order types

Online calculations include orders whose `order_type` is one of:

```text
social_commerce
ecommerce
```

### Excluded order statuses

Both branch and online calculations exclude orders when `LOWER(status)` is one of:

```text
cancelled
canceled
refunded
void
deleted
```

Soft-deleted orders are excluded using:

```text
orders.deleted_at IS NULL
```

### Exchange replacement orders

Orders with metadata showing `is_exchange_replacement = true` are excluded from normal sales, because the original exchanged value is not a fresh sale. The only exception is an `exchange_surplus` payment, which is counted because it is real extra money collected from the customer.

## 5. Branch daily sale

Function:

```php
loadBranchSales()
```

Branch `daily_sale` is calculated from live order total, grouped by order business date:

```text
daily_sale = SUM(orders.total_amount)
```

Date used:

```text
DATE(COALESCE(order_date, confirmed_at, created_at))
```

Important behaviour:

- If an offline/POS sale is created for July 5, it appears on July 5.
- If that offline/POS sale total is edited, July 5 updates to the new total.
- If that offline/POS sale date is changed, the sale moves to the new date.
- If that offline/POS sale is cancelled, refunded, voided, deleted, or soft-deleted, it disappears from branch daily sale.
- Payment rows do not create branch sale totals. This prevents duplicate sale totals when a payment is edited or split.

## 6. Branch raw cash and raw bank

Function:

```php
loadBranchPayments()
```

Branch money movement comes from completed payment rows, not from order totals.

### Single-method payments

Single-method payments are read from `order_payments` joined with `payment_methods` and `orders`.

Included when:

```text
order_type in counter/pos/offline
order_payments.status = completed
order_payments.deleted_at IS NULL
order_payments.completed_at is inside the month
payment has no split child rows
order is not cancelled/deleted/refunded/void
```

The payment method decides the bucket:

```text
payment_methods.type = cash  -> raw_cash
anything else               -> raw_bank
```

So bKash, Nagad, card, MFS, bank transfer, online banking and similar non-cash methods are treated as bank for cash-sheet purposes.

### Split payments

Split payments are read from `payment_splits` joined with parent `order_payments`, `payment_methods`, and `orders`.

Included when:

```text
parent order_payment.status = completed
payment_split.status = completed
COALESCE(payment_splits.completed_at, order_payments.completed_at) is inside the month
order is not cancelled/deleted/refunded/void
```

The parent order payment is ignored when split rows exist, so the parent amount is not double-counted.

Split bucket logic:

```text
split payment method type = cash -> raw_cash
split payment method type != cash -> raw_bank
```

### Offline payment breakdown update behaviour

When the payment breakdown of an offline/POS sale is updated correctly, the old/replaced/cancelled payment rows stop counting and the new completed payment rows count.

Result examples:

```text
Original: 1000 cash
Cash sheet: raw_cash +1000

Edited to: 400 cash + 600 bKash
Cash sheet after refresh: raw_cash +400, raw_bank +600
```

If the payment date is changed, the money moves to the new payment completion date.

## 7. Branch refunds

Function:

```php
loadBranchPayments()
```

Completed refunds reduce branch money on the refund completion date.

Source tables:

```text
refunds
product_returns
orders
```

Included when:

```text
refunds.status = completed
refunds.completed_at is inside the month
orders.order_type in counter/pos/offline
orders.deleted_at IS NULL
refund method is not store_credit or gift_card
```

Store selection:

```text
COALESCE(product_returns.received_at_store_id, product_returns.store_id, orders.store_id)
```

Refund bucket:

```text
refund_method = cash -> subtract from raw_cash
anything else        -> subtract from raw_bank
```

Store-credit and gift-card refunds do not reduce cash/bank because no immediate cash or bank money moved.

## 8. Branch displayed cash and displayed bank

After raw branch payments are loaded, the controller subtracts local costs/salary/cash-to-bank movements.

For each store/date:

```text
displayed_cash = max(0, raw_cash - salary - cash_paid_daily_cost - cash_to_bank)
displayed_bank = raw_bank - bank_paid_daily_cost + cash_to_bank
```

Where:

```text
salary       = admin_entries type salary_setaside
cash_to_bank = admin_entries type cash_to_bank
cash_paid_daily_cost = branch costs paid by cash
bank_paid_daily_cost = branch costs paid by non-cash/bank/MFS/card
```

The `max(0, ...)` on displayed cash prevents the visible cash cell from becoming negative when costs/salary exceed same-day cash.

## 9. Branch daily cost

Function:

```php
loadBranchCosts()
```

Daily cost is the sum of two sources:

### 9.1 Legacy/manual branch cost entries

Source:

```text
branch_cost_entries
```

Grouped by:

```text
store_id + entry_date
```

These are treated as cash costs.

### 9.2 Accounting expense payments

Source:

```text
expense_payments
expenses
payment_methods
```

Included when:

```text
expense_payments.status = completed
expenses.status is not cancelled/rejected
COALESCE(expense_payments.completed_at, expense_payments.processed_at, expenses.expense_date) is inside the month
```

The expense payment method decides whether it reduces branch cash or branch bank:

```text
payment method type = cash -> cash cost
anything else               -> bank cost
```

Expenses generated from the cash-sheet branch-cost form are excluded from the accounting-expense scan to avoid counting the same branch cost twice.

## 10. Branch Ex/On

Function:

```php
loadBranchExOn()
```

`Ex/On` means exchange/online adjustment for branch-level exchange money movement.

### Exchange upgrade/top-up

Source:

```text
order_payments.payment_type = exchange_surplus
```

Included when:

```text
order_type in counter/pos/offline
payment status = completed
payment completed_at is inside the month
order is not cancelled/deleted/refunded/void
```

Formula:

```text
ex_on += SUM(exchange_surplus payment amount)
```

This is positive because the customer paid extra money during an exchange upgrade.

### Exchange downgrade/refund

Source:

```text
refunds.refund_type = exchange_refund
```

Included when:

```text
refund status = completed
refund completed_at is inside the month
order_type in counter/pos/offline
```

Formula:

```text
ex_on -= SUM(exchange_refund amount)
```

This is negative because money went out to the customer.

## 11. Online daily sales

Function:

```php
loadOnlineData()
```

Online `daily_sales` is calculated from live order total:

```text
online.daily_sales = SUM(orders.total_amount)
```

Date used:

```text
DATE(COALESCE(order_date, confirmed_at, created_at))
```

Included order types:

```text
social_commerce
ecommerce
```

Behaviour:

- If an online/social order is created, it appears on its order business date.
- If the online order total is edited, the day updates to the new total.
- If the order date changes, the sale moves to the new date.
- If the order is cancelled, deleted, refunded, voided, or soft-deleted, it is removed from online daily sales.

## 12. Online COD/due

Open online due is shown as a receivable bucket, not bank.

Source:

```text
orders.outstanding_amount
```

Included when:

```text
order_type in social_commerce/ecommerce
outstanding_amount > 0
order is not cancelled/deleted/refunded/void
```

Date used:

```text
order business date
```

Formula:

```text
online.cod_due += SUM(outstanding_amount)
online.cod     += SUM(outstanding_amount)
```

Behaviour:

- An online COD/due order shows open due on the original order date.
- When the order is delivered and due becomes 0, the open due disappears from the original date after refresh.
- The actual collected COD is then tracked from completed payment rows on the payment/delivery collection date.

## 13. Online advance, online payment, and COD collection

Completed online payments are read from both `order_payments` and `payment_splits`.

### Single online payments

Source:

```text
order_payments
payment_methods
orders
```

Included when:

```text
order_type in social_commerce/ecommerce
order_payment.status = completed
order_payment.deleted_at IS NULL
order_payment.completed_at is inside the month
payment has no split rows
order is not cancelled/deleted/refunded/void
```

### Split online payments

Source:

```text
payment_splits
order_payments
payment_methods
orders
```

Included when:

```text
payment_split.status = completed
parent order_payment.status = completed
COALESCE(payment_splits.completed_at, order_payments.completed_at) is inside the month
order is not cancelled/deleted/refunded/void
```

### Classification

#### COD collection

A payment is treated as COD collection when:

```text
payment method code is cod/cash_on_delivery
OR order payment_method is cod/cash_on_delivery
OR order_payment.metadata contains auto_settled_on_delivery
```

and it is completed at/after delivery, or it was auto-settled on delivery.

Formula:

```text
online.cod_collected += amount
online.cod           += amount
```

This does not immediately increase branch bank. It represents COD/Pathao receivable until the real disbursement is entered in admin entries.

#### Social-commerce advance

For social-commerce payments that are not COD collection:

```text
online.advance += amount
```

This represents advance money already received through bank/MFS/cash-equivalent online collection.

#### Ecommerce online payment

For ecommerce payments that are not COD collection:

```text
online.online_payment += amount
```

This represents SSLCommerz/online payment collection before final settlement.

## 14. Online refunds

Completed online refunds reduce the bucket that originally received the money.

Source:

```text
refunds
orders
```

Included when:

```text
order_type in social_commerce/ecommerce
refund.status = completed
refund.completed_at is inside the month
refund_method is not store_credit or gift_card
```

Always tracked for display:

```text
online.refunds += refund_amount
```

### COD refund

If refund method is cash/COD/cash_on_delivery and the order payment method is COD:

```text
online.cod_collected -= refund_amount
online.cod           -= refund_amount
```

### Social-commerce refund

For non-COD social-commerce refunds:

```text
online.advance -= refund_amount
```

### Ecommerce refund

For ecommerce refunds:

```text
online.online_payment -= refund_amount
```

## 15. Disbursements / amount sent to bank

Admin entries control settlement and transfer rows.

Function:

```php
loadAdminEntries()
```

Admin entry types:

```text
salary_setaside
cash_to_bank
sslzc
pathao
```

### Branch cash to bank

Source:

```text
admin_entries.type = cash_to_bank
```

Formula per store/date:

```text
branch cash -= cash_to_bank
branch bank += cash_to_bank
```

So when cash is sent to bank for a branch, the cash sheet updates by lowering that branch's cash and increasing that branch's bank.

### SSLCommerz received

Source:

```text
admin_entries.type = sslzc
```

Formula:

```text
final_bank += sslzc_received
```

This represents SSLCommerz/ecommerce settlement received into bank.

### Pathao/COD received

Source:

```text
admin_entries.type = pathao
```

Formula:

```text
final_bank += pathao_received
```

This represents Pathao/COD settlement received into bank.

## 16. Total cash, bank, and final bank

For each date:

```text
total_sale = sum(branch daily_sale) + online.daily_sales
cash       = sum(branch displayed_cash)
bank       = sum(branch displayed_bank) + online.advance
final_bank = bank + sslzc_received + pathao_received
```

Important:

- `online.advance` is included in bank because it is already received.
- `online.online_payment` is displayed separately and only becomes final bank when SSLCommerz settlement is entered.
- `online.cod` / `cod_due` / `cod_collected` are displayed separately and only become final bank when Pathao/COD settlement is entered.

## 17. Owner section

Owner entries come from `owner_entries`.

Types:

```text
cash_invest
bank_invest
cash_cost
bank_cost
```

Formula:

```text
total_cash      = cash + cash_invest
total_bank      = final_bank + bank_invest
cash_after_cost = total_cash - cash_cost
bank_after_cost = total_bank - bank_cost
```

Owner costs are separate from branch daily costs.

## 18. What happens in common scenarios

### Offline sale is deleted for a specific date

If the order is soft-deleted or its status is changed to deleted/cancelled/void/refunded:

```text
branch daily_sale is removed
completed payments are removed from raw_cash/raw_bank
refund/exchange rows remain only if they are valid completed money movement rows
```

After refresh, that date recalculates without the deleted sale.

### Offline sale date is edited

If `order_date` changes:

```text
daily_sale moves from old date to new date
```

If payment `completed_at` also changes through the offline edit flow:

```text
raw_cash/raw_bank move from old date to new date
```

### Offline sale payment breakdown is updated

Old payment rows must be cancelled/replaced/deleted or split rows must be updated. Then:

```text
old payment bucket disappears
new payment bucket appears
```

Example:

```text
1000 cash -> 500 cash + 500 Nagad
raw_cash changes from 1000 to 500
raw_bank changes from 0 to 500
```

### Online order is edited

If `orders.total_amount`, `outstanding_amount`, `order_date`, or payment rows are updated:

```text
online.daily_sales follows current total_amount
online.cod_due follows current outstanding_amount
online.advance/online_payment/cod_collected follow completed payment rows
```

### Online order is cancelled/deleted

If status becomes cancelled/canceled/deleted/void/refunded or the row is soft-deleted:

```text
online.daily_sales disappears
online.cod_due disappears
completed payments are excluded
```

### Online order with due is marked delivered and due becomes 0

Before delivery/payment completion:

```text
online.cod_due shows outstanding amount on order date
online.cod also includes the open due
```

After delivery and settlement payment completion:

```text
online.cod_due becomes 0 / disappears
online.cod_collected increases on payment completion date
online.cod increases on payment completion date
```

It does not increase final bank until a Pathao/COD received admin entry is entered.

### Cash sent to bank is entered

When `admin_entries.type = cash_to_bank` is entered for a store/date:

```text
branch cash decreases
branch bank increases
```

### SSLCommerz or Pathao settlement is entered

When admin entry type is `sslzc` or `pathao`:

```text
final_bank increases
```

These rows represent real settlement received into bank.

## 19. Known design notes

1. This is a live report, not an immutable audit snapshot.
2. Order totals and payment totals are deliberately separate.
3. Sales follow order business date.
4. Money movement follows payment/refund/settlement completion date.
5. Cancelled/deleted/refunded/void orders are excluded.
6. Store-credit and gift-card refunds are ignored for cash/bank movement.
7. Split payments are counted from split rows, not the parent payment row.
8. Cash-to-bank is not new income; it only moves money from branch cash to branch bank.
