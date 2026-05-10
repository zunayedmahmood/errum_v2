// lib/socialInvoiceHtml.ts
// Social commerce invoice (A5 / Half A4), cleaner print-first layout.
// - Includes Delivery Fee
// - No VAT row
// - Invoice No = part after 'ORD' prefix from Order No

import { normalizeOrderForReceipt } from '@/lib/receipt';

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(n: any) {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return '0.00';
  return v.toFixed(2);
}

function invoiceNoFromOrderNo(orderNo?: string) {
  if (!orderNo) return '';
  const inv = String(orderNo).replace(/^ORD[-\s]?/i, '').trim();
  return inv || String(orderNo).trim();
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}-${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}`;
}

function wrapHtml(title: string, inner: string, opts?: { embed?: boolean }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A5; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color:#111827; }
    body { font-family: Inter, Arial, Helvetica, sans-serif; }
    .page { padding: 0; }
    .top { display:flex; justify-content:space-between; gap: 14px; align-items:flex-start; }
    .invoiceTitle { font-size: 26px; font-weight: 900; letter-spacing: 0.08em; margin: 0; }
    .subtle { color:#6b7280; }
    .tag { display:inline-flex; align-items:center; min-height: 28px; padding: 6px 12px; border-radius: 999px; border: 1px solid #d1d5db; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .company {
      border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px 14px; text-align: right; min-width: 235px;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    }
    .company .name { font-size: 20px; font-weight: 900; margin: 0; }
    .company .line { margin-top: 4px; font-size: 11px; color:#4b5563; line-height: 1.4; }
    .spacer { height: 12px; }
    .row { display:grid; grid-template-columns: 1.15fr 0.85fr; gap: 12px; }
    .box { border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; }
    .sectionTitle { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color:#6b7280; margin: 0 0 8px; }
    .billName { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
    .addr { font-size: 12px; line-height: 1.45; color:#111827; }
    .metaGrid { display:grid; grid-template-columns: 1fr auto; gap: 8px 12px; font-size: 12px; }
    .metaGrid .k { color:#6b7280; }
    .metaGrid .v { text-align:right; font-weight: 700; }
    table { width:100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th { text-align:left; padding: 9px 8px; border-bottom: 1px solid #111827; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 9px 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
    .right { text-align:right; }
    .itemTitle { font-weight: 700; }
    .itemSub { font-size: 11px; color:#6b7280; margin-top: 2px; }
    .summaryArea { display:grid; grid-template-columns: 1fr 240px; gap: 14px; align-items:start; margin-top: 12px; }
    .paymentCard { border: 1px dashed #cbd5e1; border-radius: 14px; padding: 12px; background: #f8fafc; }
    .paymentCard .big { font-size: 18px; font-weight: 900; margin-top: 4px; }
    .totals { width:100%; border-collapse: collapse; }
    .totals td { border: none; padding: 5px 0; font-size: 12px; }
    .totals tr:last-child td { border-top: 1px solid #111827; padding-top: 8px; font-weight: 800; }
    .footer { margin-top: 16px; font-size: 10.5px; color:#6b7280; text-align:center; }
    ${opts?.embed ? 'html,body{height:100%;}' : ''}
  </style>
</head>
<body>
  <div class="page">${inner}</div>
</body>
</html>`;
}

function companyInfoBlock() {
  return `
    <div class="company">
      <div class="name">Errum BD</div>
      <div class="line">Level 03, Lift 2, Haji Kujrot Ali Mollah Super Market, Dhaka 1216</div>
      <div class="line">Mobile: 01942-565664</div>
    </div>
  `;
}

function render(order: any) {
  const r = normalizeOrderForReceipt(order);
  const orderNo = r.orderNo || '';
  const invNo = invoiceNoFromOrderNo(orderNo);
  const date = fmtDate(r.dateTime);

  const sub = Number(r.totals?.subtotal ?? 0);
  const disc = Number(r.totals?.discount ?? 0);
  const delivery = Number(r.totals?.shipping ?? 0);
  const grand = Number(r.totals?.total ?? Math.max(0, sub - disc + delivery));
  const due = Number(r.totals?.due ?? 0);
  const paid = Number(r.totals?.paid ?? 0);

  const billToLines = [
    r.customerName ? `<div class="billName">${escapeHtml(r.customerName)}</div>` : '<div class="billName">Customer</div>',
    r.customerPhone ? `Phone: ${escapeHtml(r.customerPhone)}` : '',
    ...(r.customerAddressLines || []).map((x: string) => escapeHtml(x)),
  ].filter(Boolean);

  const items = (r.items || []).map((it: any, i: number) => {
    const desc = escapeHtml(it.name || 'Item');
    const subline = it.variant ? `<div class="itemSub">${escapeHtml(it.variant)}</div>` : '';
    return `
      <tr>
        <td class="right" style="width:38px;">${i + 1}</td>
        <td>
          <div class="itemTitle">${desc}</div>
          ${subline}
        </td>
        <td class="right" style="width:56px;">${escapeHtml(it.qty)}</td>
        <td class="right" style="width:88px;">${escapeHtml(money(it.unitPrice))}</td>
        <td class="right" style="width:96px;">${escapeHtml(money(it.lineTotal))}</td>
      </tr>
    `;
  }).join('');

  const paymentLabel = due > 0 ? (paid > 0 ? 'Partial Advance' : 'Cash on Delivery') : 'Fully Paid';
  const paymentAmount = due > 0 ? due : grand;

  return `
    <div class="top">
      <div>
        <h1 class="invoiceTitle">INVOICE</h1>
        <div class="subtle" style="margin-top:4px; font-size:12px;">Social Commerce Order Document</div>
        <div style="margin-top:10px;"><span class="tag">${escapeHtml(paymentLabel)}</span></div>
      </div>
      ${companyInfoBlock()}
    </div>

    <div class="spacer"></div>

    <div class="row">
      <div class="box">
        <div class="sectionTitle">Bill To</div>
        <div class="addr">${billToLines.join('<br/>')}</div>
      </div>

      <div class="box">
        <div class="sectionTitle">Invoice Details</div>
        <div class="metaGrid">
          <div class="k">Invoice No</div><div class="v">${escapeHtml(invNo)}</div>
          <div class="k">Order No</div><div class="v">${escapeHtml(orderNo)}</div>
          <div class="k">Date</div><div class="v">${escapeHtml(date)}</div>
          ${r.orderTypeLabel || r.orderType ? `<div class="k">Order Type</div><div class="v">${escapeHtml(r.orderTypeLabel || r.orderType || '')}</div>` : ''}
          ${r.paymentStatus ? `<div class="k">Payment Status</div><div class="v">${escapeHtml(r.paymentStatus)}</div>` : ''}
          ${r.storeName ? `<div class="k">Store</div><div class="v">${escapeHtml(r.storeName)}</div>` : ''}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="right">#</th>
          <th>Item</th>
          <th class="right">Qty</th>
          <th class="right">Unit</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items || `<tr><td colspan="5" class="subtle">No items</td></tr>`}
      </tbody>
    </table>

    <div class="summaryArea">
      <div class="paymentCard">
        <div class="sectionTitle" style="margin-bottom:6px;">Collection Summary</div>
        <div class="subtle" style="font-size:12px;">${due > 0 ? 'Amount to collect from customer upon delivery' : 'Amount already settled for this order'}</div>
        <div class="big">৳${escapeHtml(money(paymentAmount))}</div>
      </div>

      <div class="box">
        <table class="totals">
          <tbody>
            <tr><td>Subtotal</td><td class="right">${escapeHtml(money(sub))}</td></tr>
            <tr><td>Delivery Fee</td><td class="right">${escapeHtml(money(delivery))}</td></tr>
            ${disc > 0 ? `<tr><td>Discount</td><td class="right">-${escapeHtml(money(disc))}</td></tr>` : ''}
            ${paid > 0 ? `<tr><td>Paid</td><td class="right">${escapeHtml(money(paid))}</td></tr>` : ''}
            ${due > 0 ? `<tr><td>Due</td><td class="right">${escapeHtml(money(due))}</td></tr>` : ''}
            <tr><td>Grand Total</td><td class="right">${escapeHtml(money(grand))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      This is a computer-generated invoice. Please keep it for your records.
    </div>
  `;
}

export function socialInvoiceHtml(order: any, opts?: { embed?: boolean }) {
  return wrapHtml('Social Invoice', render(order), opts);
}

export function socialInvoiceBulkHtml(orders: any[], opts?: { embed?: boolean }) {
  const pages = (orders || [])
    .map((o) => `<div style="page-break-after: always;">${render(o)}</div>`)
    .join('');
  return wrapHtml('Social Invoices', pages || '<p>No orders</p>', opts);
}
