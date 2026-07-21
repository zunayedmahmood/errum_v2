export interface SoldAtOrderItemLike {
  quantity?: number | string | null;
  unit_price?: number | string | null;
  sale_price?: number | string | null;
  price?: number | string | null;
  discount_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  total_price?: number | string | null;
  sold_at_unit_price?: number | string | null;
  net_unit_price?: number | string | null;
  final_unit_price?: number | string | null;
}

export function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * Returns the historical net unit value credited by Return/Exchange.
 *
 * Priority:
 * 1. A backend-provided sold-at/net unit snapshot.
 * 2. The final line total divided by the sold quantity.
 * 3. Gross unit price - per-unit discount + per-unit tax.
 *
 * Explicit zeroes are preserved for 100% discounted items.
 */
export function getEffectiveSoldUnitPrice(item: SoldAtOrderItemLike): string {
  const quantity = Math.max(1, Math.trunc(parseMoney(item.quantity) || 1));

  const explicitUnitPrice = [
    item.sold_at_unit_price,
    item.net_unit_price,
    item.final_unit_price,
  ].find(hasValue);

  if (explicitUnitPrice !== undefined) {
    return String(Number(Math.max(0, parseMoney(explicitUnitPrice)).toFixed(2)));
  }

  const lineTotal = [item.total_amount, item.total_price].find(hasValue);
  if (lineTotal !== undefined) {
    return String(Number(Math.max(0, parseMoney(lineTotal) / quantity).toFixed(2)));
  }

  const gross = parseMoney(item.unit_price ?? item.sale_price ?? item.price);
  const discountPerUnit = parseMoney(item.discount_amount) / quantity;
  const taxPerUnit = parseMoney(item.tax_amount) / quantity;

  return String(Number(Math.max(0, gross - discountPerUnit + taxPerUnit).toFixed(2)));
}

export function isValidSoldAtPrice(value: unknown): boolean {
  return hasValue(value) && parseMoney(value) >= 0;
}
