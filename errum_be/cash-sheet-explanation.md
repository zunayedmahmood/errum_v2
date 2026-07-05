# Cash Sheet New Behaviour

This document describes how `/api/cash-sheet-new` and the `/cash-sheet-new` frontend page calculate the monthly cash sheet after the latest July 2026 fixes.

## 1. Business date and timezone

Errum's cash sheet uses Bangladesh business date: **Asia/Dhaka / GMT+6**.

The production database stores many timestamps in UTC. A record saved at `2026-07-04 19:20:11 UTC` is actually `2026-07-05 01:20:11` in Bangladesh, so it must hydrate the **5 July** row.

For datetime columns, the backend now converts to Bangladesh business date before grouping/filtering:

```sql
DATE(DATE_ADD(<datetime_column>, INTERVAL 6 HOUR))
```

SQLite/dev fallback:

```sql
DATE(<datetime_column>, '+6 hours')
```

This conversion is applied to:

- branch/offline order dates
- branch/offline payment dates
- branch/offline split-payment dates
- branch/offline refund dates
- exchange top-up/refund dates
- online/social/ecommerce order dates
- online/social/ecommerce payment dates
- online/social/ecommerce split-payment dates
- online/social/ecommerce refund dates
- accounting expense payment dates

Manual cash-sheet entry dates such as `entry_date` are already date-only fields, so they are not shifted.

The frontend also uses `Asia/Dhaka` to decide "Today" and the default form date. It does **not** use `new Date().toISOString().split('T')[0]`, because that is UTC and can show yesterday after midnight in Bangladesh.

## 2. Branch/offline daily sale

Branch sale comes from the current order value, not from payment rows.

Included order types:

```text
counter
pos
offline
```

Date source:

```text
COALESCE(orders.order_date, orders.confirmed_at, orders.created_at)
```

Amount source:

```text
SUM(orders.total_amount)
```

Excluded orders:

- soft-deleted orders
- `cancelled`
- `canceled`
- `refunded`
- `void`
- `deleted`
- exchange replacement orders where `metadata.is_exchange_replacement = true`

Behaviour:

- If an offline sale total is edited, the Sale column updates because it reads `orders.total_amount` live.
- If an offline sale is deleted/cancelled/voided/refunded, it disappears from Sale.
- Sale can be higher than Cash + Bank if the order has due/partial payment.

## 3. Branch/offline Cash and Bank

Cash and Bank come from actual payment movement, not from order total.

Included parent payment statuses:

```text
completed
partially_refunded
refunded
```

Excluded payment rows:

- soft-deleted payment rows
- payments from deleted/cancelled/excluded orders
- internal settlement rows:
  - `exchange_balance`
  - `store_credit`
  - `balance_carryover`

### 3.1 Single-method payments

If an `order_payments` row has no child `payment_splits`, the parent payment is counted.

Payment date fallback:

```text
order_payments.completed_at
→ order_payments.payment_received_date
→ order_payments.processed_at
→ order_payments.created_at
```

Payment bucket:

```text
payment_methods.type = cash → Cash
any other payment_methods.type → Bank
```

So card, bank transfer, online banking, MFS, bKash, Nagad, wallet, and similar non-cash methods go to Bank.

### 3.2 Split payments

If a parent `order_payments` row has child `payment_splits`, the parent payment is ignored to avoid double-counting. The sheet reads the split rows.

This latest fix makes legacy split payments safer. A split row is counted when:

- the parent `order_payments.status` is money-moving (`completed`, `partially_refunded`, or `refunded`), and
- the split status is either:
  - `completed`, or
  - null/pending/processing/initiated/other non-failed status from older flows.

The split row is ignored only if its status is explicitly non-money:

```text
failed
cancelled
canceled
void
```

Split payment date fallback:

```text
payment_splits.completed_at
→ order_payments.completed_at
→ payment_splits.processed_at
→ order_payments.processed_at
→ order_payments.payment_received_date
→ order_payments.created_at
```

Split store fallback:

```text
payment_splits.store_id
→ order_payments.store_id
→ orders.store_id
```

This prevents the bug where Sale appeared for a store but Cash/Bank stayed zero because the split rows had no `store_id` or did not have `completed` status.

## 4. Branch Cash display vs Raw Cash

The API keeps both raw payment movement and displayed branch cash.

Raw payment movement:

```text
raw_cash = completed cash payments - completed cash refunds
raw_bank = completed non-cash payments - completed non-cash refunds
```

Displayed branch values:

```text
cash = raw_cash - salary_setaside - cash_paid_daily_cost - cash_to_bank
bank = raw_bank - bank_paid_daily_cost + cash_to_bank
```

So Cash and Bank are not supposed to equal Sale. Sale is order value. Cash/Bank are actual collected money after branch cash-sheet adjustments.

## 5. Branch returns and refunds

Completed refunds reduce Cash or Bank on the Bangladesh business date of `refunds.completed_at`.

Cash refund:

```text
refunds.refund_method = cash → subtract from Cash
```

Non-cash refund:

```text
any other money refund method → subtract from Bank
```

Ignored refund methods because they do not immediately move cash/bank:

```text
store_credit
gift_card
```

## 6. Branch Exchange / Ex-On

The Ex/On column tracks exchange top-up/refund impact, not the whole replacement order.

Exchange top-up:

```text
order_payments.payment_type = exchange_surplus
→ positive Ex/On
```

Exchange refund:

```text
refunds.refund_type = exchange_refund
→ negative Ex/On
```

Both are grouped by Bangladesh business date.

## 7. Branch costs, salary and cash-to-bank

Manual branch-cost entries:

```text
branch_cost_entries.entry_date
```

These are date-only and treated as cash cost because the legacy form has no payment-method selector.

Accounting expenses:

```text
COALESCE(expense_payments.completed_at, expense_payments.processed_at, expenses.expense_date)
```

These are shifted to Bangladesh business date before grouping.

Salary/rent set-aside and cash-to-bank entries:

```text
admin_entries.entry_date
```

These are date-only manual cash-sheet entries and are not shifted.

## 8. Online/social/ecommerce daily sale

Online sale comes from current order value.

Included order types:

```text
social_commerce
ecommerce
```

Date source:

```text
COALESCE(orders.order_date, orders.confirmed_at, orders.created_at)
```

Amount source:

```text
SUM(orders.total_amount)
```

Excluded orders:

- soft-deleted orders
- cancelled/canceled/refunded/void/deleted orders

If an online order is edited, cancelled, or deleted, the sheet updates because it reads the current order state.

## 9. Online COD/Due

Open due is a receivable, not Bank.

Open COD/Due source:

```text
orders.outstanding_amount > 0
```

Date source:

```text
COALESCE(orders.order_date, orders.confirmed_at, orders.created_at)
```

When an online order is delivered and due becomes zero:

- open due disappears from the order-date row
- the actual collection appears on the payment business date
- Pathao/COD bank receipt appears only when the disbursement is entered

## 10. Online payments

Online/social/ecommerce payment movement is read from `order_payments` and `payment_splits`, using the same robust split-payment rules as branch payments.

Social-commerce non-COD payment:

```text
advance
```

Ecommerce online payment:

```text
online_payment
```

COD/delivery collection:

```text
cod_collected
cod
```

A delivered COD payment is detected when:

- payment method/order payment method is COD/cash-on-delivery, or
- payment metadata contains `auto_settled_on_delivery`, and
- payment happened at/after delivery or was auto-settled on delivery.

This collection does not immediately increase final Bank. It is tracked as COD/Pathao receivable until the Pathao/COD disbursement is entered.

## 11. Online refunds

Completed online refunds are grouped by Bangladesh business date from `refunds.completed_at`.

- Social-commerce non-COD refund reduces Advance.
- Ecommerce refund reduces Online Payment.
- COD refund reduces COD/COD Collected.
- Store-credit/gift-card refunds are ignored for cash/bank movement.

## 12. Disbursements

Manual disbursement entries come from `admin_entries`:

```text
sslzc  → SSLCommerz / SSLZC received
pathao → Pathao / COD courier received
```

These are date-only manual entries and are not shifted.

Final bank:

```text
final_bank = branch_bank + online_advance + sslzc_received + pathao_received
```

## 13. Owner section

Owner entries come from `owner_entries.entry_date`.

```text
total_cash = branch_total_cash + owner_cash_invest
total_bank = final_bank + owner_bank_invest
cash_after_cost = total_cash - owner_cash_cost
bank_after_cost = total_bank - owner_bank_cost
```

## 14. Practical troubleshooting

If Sale appears but Cash/Bank is zero, inspect:

```sql
SELECT * FROM order_payments WHERE order_id = <order_id>;

SELECT *
FROM payment_splits
WHERE order_payment_id IN (
  SELECT id FROM order_payments WHERE order_id = <order_id>
);
```

Pay attention to:

- parent `order_payments.status`
- split `payment_splits.status`
- split `payment_splits.store_id`
- `completed_at`, `processed_at`, `payment_received_date`, `created_at`
- `payment_method_id`
- `deleted_at`

After this fix, a completed parent payment with pending/null legacy split rows should still hydrate Cash/Bank as long as the split rows are not explicitly failed/cancelled/void.
