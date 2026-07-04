# Cash Sheet New Behaviour

This document describes how `/api/cash-sheet-new` and the frontend page `/cash-sheet-new` calculate the daily/monthly cash sheet after the July 2026 tracking fixes.

## 1. Date and timezone rule

The business timezone for Errum is **Asia/Dhaka / GMT+6**.

The frontend no longer uses `new Date().toISOString().split('T')[0]` to decide today, because that is UTC. At 01:25 in Bangladesh, UTC is still the previous day, so the UI could mark **4 July** as “Today” while the actual local date was **5 July**.

The `/cash-sheet-new` page now calculates the current day/month using `Asia/Dhaka`, so the highlighted **Today** row matches Bangladesh business date.

## 2. Branch/offline daily sale

Branch sale is calculated from the `orders` table, not from payment rows.

Included order types:

- `counter`
- `pos`
- `offline`

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

Important behaviour:

- If an offline sale total is edited, the Sale column updates because the sheet reads the current `orders.total_amount`.
- If an offline sale is deleted/voided, it disappears from Sale because the order is soft-deleted or excluded by status.
- Sale can be higher than Cash + Bank if the order has due/partial payment.

## 3. Branch/offline cash and bank

Branch Cash and Bank are calculated from real payment movement, not from the order total.

Included order payment statuses:

```text
completed
partially_refunded
refunded
```

Excluded payment rows:

- soft-deleted payment rows
- payments from deleted/cancelled/excluded orders
- internal/non-cash settlement rows:
  - `exchange_balance`
  - `store_credit`
  - `balance_carryover`

### 3.1 Single-method payments

If an `order_payments` row has no child `payment_splits`, the parent payment is counted directly.

Payment date source:

```text
COALESCE(
  order_payments.completed_at,
  order_payments.payment_received_date,
  order_payments.processed_at,
  order_payments.created_at
)
```

Bucket rule:

```text
payment_methods.type = cash  => Cash
anything else                => Bank
```

So bKash, Nagad, card, bank transfer, MFS, mobile banking, digital wallet, SSL-type non-cash branch payments all go to Bank.

### 3.2 Split payments

If the parent `order_payments` row has child rows in `payment_splits`, the parent amount is ignored to avoid double-counting. The sheet reads the split rows instead.

This is the key fix.

Previously, split rows were counted only when:

```text
order_payments.status = completed
payment_splits.status = completed
order_payments.completed_at is not null
```

That created this bug:

```text
Sale = 2333
Cash = 0
Bank = 0
```

when the receipt/order was paid but the split rows were still `pending`, `processing`, or missing `completed_at`.

Now split rows are counted when:

```text
parent order_payments.status is completed / partially_refunded / refunded
AND split row is not failed/cancelled
```

The split payment date source is:

```text
COALESCE(
  payment_splits.completed_at,
  order_payments.completed_at,
  payment_splits.processed_at,
  order_payments.processed_at,
  order_payments.payment_received_date,
  order_payments.created_at
)
```

This means:

- if split rows are correctly completed, they are counted normally;
- if the parent payment is completed but legacy split rows stayed pending, the split amounts are still counted;
- if split `completed_at` is missing, the parent payment date is used;
- failed/cancelled splits are ignored;
- cancelled/replaced parent payments are ignored.

## 4. Branch refunds / returns

Completed refund rows reduce branch Cash or Bank on the refund completion date.

Source tables:

- `refunds`
- `product_returns`
- `orders`

Included refund status:

```text
refunds.status = completed
```

Excluded refund methods:

- `store_credit`
- `gift_card`

Refund date source:

```text
refunds.completed_at
```

Refund bucket rule:

```text
refund_method = cash => subtract from Cash
anything else        => subtract from Bank
```

Branch/store source:

```text
COALESCE(product_returns.received_at_store_id, product_returns.store_id, orders.store_id)
```

## 5. Ex/On column

`Ex/On` tracks exchange money movement only.

Positive Ex/On:

```text
order_payments.payment_type = exchange_surplus
```

This is used when the customer pays extra during an upgrade exchange.

Negative Ex/On:

```text
refunds.refund_type = exchange_refund
```

This is used when an exchange creates a refund/down-payment back to the customer.

Ex/On is intentionally separate from normal Sale because exchange replacement order totals should not inflate daily sales.

## 6. Salary, cost, and cash-to-bank

### Salary

Source:

```text
admin_entries.type = salary_setaside
```

Effect:

```text
Displayed Cash = Raw Cash - Salary
```

### Cash to bank

Source:

```text
admin_entries.type = cash_to_bank
```

Effect:

```text
Displayed Cash = Raw Cash - CashToBank
Displayed Bank = Raw Bank + CashToBank
```

This does not create new money. It only moves money from branch cash to branch bank.

### Daily cost

Daily cost comes from two places:

1. Manual cash-sheet branch cost entries
2. Completed accounting expense payments

Manual branch-cost entries are treated as cash costs because the form has no payment-method selector.

Accounting expense payments use their payment method:

```text
payment_methods.type = cash => reduce Cash
anything else               => reduce Bank
```

Effect:

```text
Displayed Cash = Raw Cash - cash-paid costs
Displayed Bank = Raw Bank - bank/non-cash-paid costs
```

## 7. Displayed branch Cash and Bank formulas

For each store/date:

```text
raw_cash = completed cash payments - cash refunds
raw_bank = completed non-cash payments - non-cash refunds

cash = max(0, raw_cash - salary - cash_cost - cash_to_bank)
bank = raw_bank - bank_cost + cash_to_bank
```

`raw_cash` is kept in the API for debugging. The visible Cash column uses the adjusted `cash` value.

## 8. Online / ecommerce section

Online order types:

- `social_commerce`
- `ecommerce`

### Online Sales

Source:

```text
orders.total_amount
```

Date source:

```text
COALESCE(orders.order_date, orders.confirmed_at, orders.created_at)
```

Excluded:

- soft-deleted orders
- cancelled/refunded/deleted/void statuses

If an online order is edited, the online Sales value changes immediately because the sheet reads current order totals.

If an online order is cancelled/deleted/refunded, it is removed from online Sales.

### COD / Due

Open due is shown as COD/Due while it remains outstanding:

```text
orders.outstanding_amount > 0
```

It is counted on the order business date.

When the due becomes 0, this open due disappears automatically.

### Delivered COD collection

If a social-commerce COD/due order is delivered and the due is settled, the collected payment appears as COD collection on the payment completion date.

It does not become branch Bank immediately. It remains COD/Pathao receivable until the Pathao/COD disbursement is entered.

### Advance

Social-commerce completed non-COD payments are counted as Advance.

### Online payment / SSLZC

Ecommerce completed online payments are counted as Online Payment / SSLZC receivable.

### Online split payments

Online split payments use the same robust split logic as offline payments:

- parent completed/partially_refunded/refunded payment can make split rows countable;
- split rows do not need their own completed status if the parent is completed;
- failed/cancelled split rows are ignored;
- split date falls back to parent payment date when needed.

## 9. Disbursements

Disbursements are manual/admin entries that convert receivables into actual bank receipt.

SSLCommerz received:

```text
admin_entries.type = sslzc
```

Pathao/COD received:

```text
admin_entries.type = pathao
```

These are added to Final Bank, not directly to branch Sale.

## 10. Day totals

For each date:

```text
total_sale = sum(branch daily_sale) + online daily_sales
cash       = sum(branch displayed cash)
bank       = sum(branch displayed bank) + online advance
final_bank = bank + sslzc_received + pathao_received
```

Important:

- `cash` is actual adjusted branch cash.
- `bank` is actual adjusted branch non-cash plus online advance.
- `final_bank` includes settlement/disbursement entries.
- COD/Due is shown separately and does not inflate Bank until disbursed.

## 11. Owner section

Owner entries are manual owner-level movements.

```text
cash_invest => adds to total cash
bank_invest => adds to total bank
cash_cost   => subtracts from total cash after cost
bank_cost   => subtracts from total bank after cost
```

Formulas:

```text
total_cash      = day cash + cash_invest
total_bank      = final_bank + bank_invest
cash_after_cost = total_cash - cash_cost
bank_after_cost = total_bank - bank_cost
```

## 12. What happens in key workflows

### Offline sale created

- Sale increases on the order date.
- Cash/Bank increases on the completed payment date.
- Split payments now count even if legacy split rows are pending but parent payment is completed.

### Offline sale deleted/voided

- Order is soft-deleted/cancelled.
- Sale disappears from the original date.
- Payment rows/split rows are cancelled and no longer count.
- Linked transactions are cancelled.

### Offline sale payment breakdown edited

- Old payment rows and old split rows are cancelled.
- New payment rows/split rows are created using the selected sale/payment date.
- Cash/Bank is recalculated from the new method split.

### Offline sale date moved

- Order date moves.
- Payment rows/split rows are moved to the same selected date when applicable.
- Sale and payment columns move to the corrected date.

### Online order edited

- Online Sales updates because the current `orders.total_amount` is read live.
- Existing completed payments stay on their actual payment dates.
- If outstanding amount changes, COD/Due recalculates from current outstanding amount.

### Online order cancelled/deleted

- Online Sales is removed.
- Completed payments from the cancelled/deleted order are ignored by the cash sheet.

### Online COD/due order delivered and due becomes 0

- Open COD/Due disappears.
- Actual COD collection appears on the delivery/payment date.
- Bank does not increase until Pathao/COD disbursement is recorded.

### Return/refund

- Sale may be excluded if the order status becomes refunded/cancelled.
- The completed refund itself is shown on the refund date as negative Cash/Bank or negative Ex/On for exchange refund.

## 13. Why Sale may not equal Cash + Bank

This is expected in several cases:

- customer has due/outstanding amount;
- payment happened on a different date from order creation;
- sale was edited after payment;
- payment breakdown was changed;
- salary/cost/cash-to-bank adjusted visible cash/bank;
- refunds/returns happened on another date;
- online COD is receivable, not bank, until disbursement;
- exchange replacement orders are excluded from sales, while exchange top-up/refund is shown in Ex/On.

After the July fix, Sale should no longer show a paid split-payment receipt with Cash and Bank both zero just because child split rows were left pending or missing `completed_at`.
