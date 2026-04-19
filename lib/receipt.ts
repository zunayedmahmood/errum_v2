// lib/receipt.ts
// Normalizes different order shapes (social commerce UI, backend API order, POS order)
import { CLIENT_ADDRESS, CLIENT_MOBILE } from './constants';

export type ReceiptItem = {
  name: string;
  variant?: string; // size/color/etc.
  qty: number;
  unitPrice: number;
  lineTotal: number;
  discount?: number;
  barcodes?: string[];
};

export type ReceiptTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  paid: number;
  due: number;
  change: number;
};

export type ReceiptOrder = {
  id: number | string;
  orderNo: string;
  dateTime: string; // human readable
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  salesBy?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddressLines?: string[];
  orderType?: string;
  orderTypeLabel?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  intendedCourier?: string;
  items: ReceiptItem[];
  totals: ReceiptTotals;
  notes?: string;
};

export function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.+\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function formatDateTime(input: unknown): string {
  const s = safeString(input);
  const d = s ? new Date(s) : new Date();
  if (Number.isNaN(d.getTime())) return s || '';
  return d.toLocaleString();
}

function uniqNonEmpty(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const t = (x || '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Accepts:
 * - Backend orderService Order (order_number, items[], store, customer, totals as strings)
 * - UI Order types/order.ts (orderNumber, products/items arrays, amounts/payments)
 * - Orders page local UI model (orderNumber, items[], amounts)
 */
export function normalizeOrderForReceipt(order: any): ReceiptOrder {
  const id = order?.id ?? order?.order_id ?? '';

  const orderNo =
    safeString(order?.order_number) ||
    safeString(order?.orderNumber) ||
    safeString(order?.order_number) ||
    (id ? String(id) : '');

  const dateTime =
    formatDateTime(order?.order_date || order?.created_at || order?.createdAt || order?.date);

  // Store
  const storeObj = order?.store || order?.branch || order?.outlet || order?.assigned_store || order?.assignedStore;
  const storeName =
    safeString(storeObj?.name) || safeString(storeObj?.store_name) || safeString(order?.storeName) || safeString(order?.store) || 'Main Store';
  
  const storeAddress = 
    safeString(storeObj?.address) || 
    safeString(storeObj?.store_address) || 
    safeString(order?.storeAddress) || 
    safeString(order?.store_address) || 
    CLIENT_ADDRESS;

  const storePhone = 
    safeString(storeObj?.phone) || 
    safeString(storeObj?.mobile) || 
    safeString(storeObj?.contact_phone) || 
    safeString(order?.storePhone) || 
    safeString(order?.store_phone) || 
    CLIENT_MOBILE;

  // Salesperson
  const salesBy =
    safeString(order?.salesBy) || safeString(order?.salesman?.name) || safeString(order?.created_by?.name);

  // Customer
  const customerName = safeString(order?.customer?.name) || safeString(order?.customerName);
  const customerPhone = safeString(order?.customer?.phone) || safeString(order?.mobileNo);

  // Address (supports social-commerce deliveryAddress OR backend shipping_address OR generic customer.address)
  const addrLines: string[] = [];
  const deliveryAddress = order?.deliveryAddress;
  if (deliveryAddress?.address) {
    addrLines.push(safeString(deliveryAddress.address));
    const areaLine = [deliveryAddress.area, deliveryAddress.zone].filter(Boolean).join(', ');
    if (areaLine) addrLines.push(areaLine);
    const cityLine = [deliveryAddress.city, deliveryAddress.district].filter(Boolean).join(', ');
    if (cityLine) addrLines.push(cityLine);
    const divLine = [deliveryAddress.division, deliveryAddress.postalCode].filter(Boolean).join(' - ');
    if (divLine) addrLines.push(divLine);
  }

  const shippingAddress = order?.shipping_address || order?.shippingAddress || order?.shipping_address;
  if (shippingAddress && typeof shippingAddress === 'object') {
    // common keys: address, area, city, district, division, postal_code
    if (shippingAddress.address) addrLines.push(safeString(shippingAddress.address));
    const areaLine = [shippingAddress.area, shippingAddress.zone].filter(Boolean).join(', ');
    if (areaLine) addrLines.push(areaLine);
    const cityLine = [shippingAddress.city, shippingAddress.district].filter(Boolean).join(', ');
    if (cityLine) addrLines.push(cityLine);
    const divLine = [shippingAddress.division, shippingAddress.postal_code || shippingAddress.postalCode]
      .filter(Boolean)
      .join(' - ');
    if (divLine) addrLines.push(divLine);
  }

  const customerAddr = safeString(order?.customer?.address);
  if (customerAddr) addrLines.push(customerAddr);

  const customerAddressLines = uniqNonEmpty(addrLines);

  const orderType = safeString(order?.order_type || order?.orderType);
  const orderTypeLabel = safeString(order?.order_type_label || order?.orderTypeLabel);
  const paymentStatus = safeString(order?.payment_status || order?.paymentStatus);
  const intendedCourier = safeString(order?.intended_courier || order?.intendedCourier);

  const paymentMethod =
    safeString(order?.payment_method) ||
    safeString(order?.paymentMethod) ||
    (Array.isArray(order?.payments)
      ? uniqNonEmpty((order.payments as any[]).map((p) => safeString(p?.payment_method || p?.method || p?.name)))[0] || ''
      : '');

  // Items
  const items: ReceiptItem[] = [];

  // Social-commerce style: order.products
  if (Array.isArray(order?.products)) {
    for (const p of order.products) {
      const qty = Number(p?.qty ?? p?.quantity ?? 0) || 0;
      const unitPrice = parseMoney(p?.price ?? p?.unit_price);
      const discount = parseMoney(p?.discount ?? p?.discount_amount);
      const lineTotal = parseMoney(p?.amount ?? p?.total_amount) || Math.max(0, qty * unitPrice - discount);
      const barcodes = Array.isArray(p?.barcodes)
        ? (p.barcodes as string[])
        : p?.barcode
          ? [String(p.barcode)]
          : undefined;

      items.push({
        name: safeString(p?.productName || p?.product_name || p?.name || 'Item'),
        variant: safeString(p?.size || p?.variant || ''),
        qty,
        unitPrice,
        discount,
        lineTotal,
        barcodes,
      });
    }
  }

  // Backend order style: order.items
  if (items.length === 0 && Array.isArray(order?.items)) {
    for (const it of order.items) {
      const qty = Number(it?.quantity ?? it?.qty ?? 0) || 0;
      const unitPrice = parseMoney(it?.unit_price ?? it?.price ?? it?.unitPrice);
      const discount = parseMoney(it?.discount_amount ?? it?.discount ?? 0);
      const lineTotal =
        parseMoney(it?.total_amount ?? it?.amount ?? it?.lineTotal) || Math.max(0, qty * unitPrice - discount);
      const barcodes = it?.barcode ? [String(it.barcode)] : undefined;

      items.push({
        name: safeString(it?.product_name || it?.productName || it?.name || 'Item'),
        variant: safeString(it?.size || it?.variant || ''),
        qty,
        unitPrice,
        discount,
        lineTotal,
        barcodes,
      });
    }
  }

  // Totals
  const subtotal =
    parseMoney(order?.amounts?.subtotal) ||
    parseMoney(order?.subtotal_amount) ||
    parseMoney(order?.subtotal) ||
    items.reduce((s, i) => s + i.lineTotal, 0);

  const discount =
    parseMoney(order?.amounts?.totalDiscount) ||
    parseMoney(order?.discount_amount) ||
    parseMoney(order?.discount) ||
    0;

  const tax = parseMoney(order?.amounts?.vat) || parseMoney(order?.tax_amount) || 0;
  const shipping =
    parseMoney(order?.amounts?.transportCost) ||
    parseMoney(order?.shipping_amount) ||
    parseMoney(order?.shipping) ||
    0;

  const total =
    parseMoney(order?.amounts?.total) ||
    parseMoney(order?.total_amount) ||
    (subtotal - discount + tax + shipping);

  const paid =
    parseMoney(order?.payments?.paid) ||
    parseMoney(order?.payments?.totalPaid) ||
    parseMoney(order?.paid_amount) ||
    (Array.isArray(order?.payments)
      ? (order.payments as any[]).reduce((s, p) => s + parseMoney(p?.amount), 0)
      : 0);

  const due =
    parseMoney(order?.payments?.due) ||
    parseMoney(order?.outstanding_amount) ||
    Math.max(0, total - paid);

  const change = Math.max(0, paid - total);

  const notes = safeString(order?.notes);

  return {
    id,
    orderNo,
    dateTime,
    storeName,
    storeAddress,
    storePhone,
    salesBy,
    customerName,
    customerPhone,
    customerAddressLines,
    orderType,
    orderTypeLabel,
    paymentMethod,
    paymentStatus,
    intendedCourier,
    items,
    totals: {
      subtotal,
      discount,
      tax,
      shipping,
      total,
      paid,
      due,
      change,
    },
    notes,
  };
}
