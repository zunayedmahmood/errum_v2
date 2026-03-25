# Social Commerce & Fulfillment Process — Errum V2

The social commerce and fulfillment process in Errum V2 is a sophisticated multi-stage workflow designed to bridge the gap between remote sales staff and physical warehouse operations.

---

## 1. The Order Initiation Phase
**Frontend: `social-commerce`**

When a social commerce employee (who may be working remotely) initiates an order, the system prioritizes flexibility over immediate stock locking.

- **Aggregated Search**: The employee searches for products across all stores. The system calculates the total available quantity by summing up batches from every branch.
- **Batch-Agnostic Cart**: Unlike a Point-of-Sale (POS) system, adding an item to the cart does not select a specific batch or barcode. The `batch_id` is kept `null` because the remote employee doesn't know which physical unit will be picked at the warehouse.
- **Customer Intelligence**: As the employee enters a phone number, the system automatically checks for an existing customer. It displays Customer Tags (e.g., "VIP", "High Return Rate") and a Last Order Summary to help the employee prevent duplicate orders or handle difficult customers appropriately.
- **Order Creation** (`POST /api/orders`):
  - **Status**: If no specific store is assigned, the order enters `pending_assignment`. If a store is assigned, it starts as `pending`.
  - **Fulfillment Status**: Set to `pending_fulfillment`.
  - **Inventory Impact**: No stock is deducted at this stage because no specific physical units (barcodes) have been reserved.

---

## 2. The Payment & Commitment Phase
**Frontend: `amount-details`**

Before the warehouse sees the order, the payment terms are finalized.

- **Payment Options**:
  - **Full Payment**: The customer pays the total amount upfront.
  - **Partial (Advance + COD)**: The customer pays an advance (e.g., shipping cost), and the rest is collected on delivery.
  - **Full COD**: No payment is made during order creation.
- **Simple Payment API**: The system uses a dedicated `/payments/simple` endpoint to handle these transactions, supporting transaction references for mobile banking (bKash, Nagad) or cards.

---

## 3. Warehouse Fulfillment Phase
**Frontend: `social-commerce/package`**

This is where the physical inventory is finally linked to the digital order. Warehouse staff use this page to "pack" the order.

- **Pending Fulfillment List**: The warehouse team sees a queue of all `social_commerce` and `ecommerce` orders that haven't been packed yet.
- **Barcode Scanning**: For every item in the order, the staff must scan a physical barcode.
- **The Fulfillment Logic** (`POST /api/orders/{id}/fulfill`):
  - **Validation**: The backend ensures the scanned barcode belongs to the correct product and is actually available (not already sold or defective).
  - **OrderItem Splitting**: If an order calls for 3 units of "Product A," the backend splits that single `OrderItem` row into 3 separate rows. Each new row is assigned a specific `product_barcode_id` and `product_batch_id`.
  - **Inventory Deduction**: Once the barcodes are assigned, the system marks those specific units as "Sold," officially reducing the inventory of the assigned store.
- **Completion**: After all items are scanned, the order status moves to `processing` or `shipped`, making it ready for courier dispatch (e.g., Pathao).

---

## Edge Cases & Logic Details

| Scenario | Handling Logic |
|---|---|
| Defective Items | If a "Defective Item" is sold, it is selected by its unique `defect_id` during order creation. The system marks it as sold immediately since it's a unique unit. |
| Store Assignment | If an order is "Auto-assigned," the warehouse staff's scan determines the store. If the scanned barcode belongs to Store A, the order is automatically scoped to Store A. |
| Insufficient Stock | If the warehouse finds they don't actually have the item (despite the digital count), they can't fulfill the order. The order must then be cancelled or edited. |
| International Orders | The frontend switches to an international address schema (Country, State, City) and adds specialized notes to the order for the logistics team. |
| Partial Scans | An order cannot be "Fulfilled" until every item has been scanned. This prevents incomplete packages from being shipped. |

---

## Example Flow

1. **Sales (10:00 AM)**: Employee creates `ORD-123` for 2 Cotton Shirts. Customer pays 200 Tk advance via bKash.
2. **Warehouse (4:00 PM)**: Staff opens `social-commerce/package`, selects `ORD-123`.
3. **Scanning**: Staff scans Shirt A (`Barcode B-001`) and Shirt B (`Barcode B-999`).
4. **Database**: The `OrderItem` for 2 shirts is deleted; two new `OrderItem` rows (1 shirt each) are created with those barcodes. Stock in the Warehouse branch drops by 2.
5. **Dispatch**: The system generates a shipping label, and the status changes to `shipped`.