// lib/receiptHtml.ts
// Browser-based parcel sticker preview / printing fallback (works without QZ Tray).
// Orders-page "Print" uses this template for a 3x4 inch courier sticker style layout.

import { normalizeOrderForReceipt, type ReceiptOrder } from '@/lib/receipt';

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(n: any, currency?: string) {
  const symbol = currency && String(currency).trim() ? String(currency).trim() : '৳';
  const x = Number(n || 0);
  const formatted = x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

function compactAddress(lines?: string[]) {
  return (lines || []).map((x) => String(x || '').trim()).filter(Boolean).join(', ');
}

function receiptBody(r: ReceiptOrder) {
  const brand = "ERRUMBD";
  const orderNo = r.orderNo || String(r.id || '—');
  const createdAt = r.dateTime || new Date().toLocaleString();
  const codAmount = Math.max(0, Number(r.totals?.due ?? r.totals?.total ?? 0));
  const phone = r.customerPhone || 'N/A';
  const address = compactAddress(r.customerAddressLines) || 'Address not provided';
  const itemCount = (r.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);



  return `
    <div class="sticker">
      <div class="brandBox">
        <div class="brand">${escapeHtml(brand)}</div>
        <div class="sub">Parcel Sticker</div>
      </div>

      <div class="contactBox">
        <div class="label">Customer Contact</div>
        <div class="contact">${escapeHtml(phone)}</div>
      </div>

      <div class="section">
        <div class="row"><span class="k">Customer</span><span class="v strong">${escapeHtml(r.customerName || 'Customer')}</span></div>
        <div class="address">${escapeHtml(address)}</div>
      </div>

      <div class="metaGrid">
        <div class="metaItem">
          <span class="k">Order</span>
          <span class="v">${escapeHtml(orderNo)}</span>
        </div>
        <div class="metaItem highlight">
          <span class="k">COD</span>
          <span class="v">${escapeHtml(money(codAmount))}</span>
        </div>
        <div class="metaItem">
          <span class="k">Items</span>
          <span class="v">${escapeHtml(String(itemCount || r.items.length || 0))}</span>
        </div>
        <div class="metaItem">
          <span class="k">Date</span>
          <span class="v small">${escapeHtml(createdAt)}</span>
        </div>
      </div>
    </div>
  `;
}

function wrapHtml(title: string, inner: string, opts?: { embed?: boolean }) {
  const embed = !!opts?.embed;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 3in 4in; margin: 0.12in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color:#111;
      background:#fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .btnbar { position: fixed; top: 10px; right: 10px; display:flex; gap:8px; z-index: 10; }
    .btnbar button { font-family: inherit; font-size: 12px; padding: 8px 10px; cursor:pointer; }
    @media print { .btnbar { display:none; } }

    .page { break-after: page; page-break-after: always; padding: 0.12in; }
    .page:last-child { break-after: auto; page-break-after: auto; }

    .sticker {
      width: 100%;
      min-height: calc(4in - 0.24in);
      border: 1.5px solid #111;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .brandBox {
      border-bottom: 2px solid #111;
      padding-bottom: 6px;
    }
    .brand {
      font-size: 20px;
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-align: center;
    }
    .sub {
      font-size: 10px;
      text-align: center;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 1.1px;
    }
    .contactBox {
      border: 2px solid #111;
      padding: 6px 8px;
      text-align: center;
    }
    .contactBox .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      margin-bottom: 2px;
    }
    .contactBox .contact {
      font-size: 24px;
      line-height: 1.05;
      font-weight: 800;
      word-break: break-word;
    }
    .section {
      border: 1px solid #111;
      padding: 7px 8px;
    }
    .row {
      display:flex;
      justify-content: space-between;
      gap: 8px;
      align-items: baseline;
    }
    .k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.7px;
    }
    .v {
      font-size: 12px;
      font-weight: 700;
      text-align: right;
    }
    .v.strong {
      font-size: 16px;
      text-align: left;
      flex: 1;
      margin-left: 10px;
    }
    .v.small {
      font-size: 10px;
      font-weight: 600;
    }
    .address {
      margin-top: 4px;
      font-size: 13px;
      line-height: 1.28;
      font-weight: 600;
      word-break: break-word;
    }
    .metaGrid {
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .metaItem {
      border: 1px solid #111;
      padding: 6px;
      min-height: 46px;
      display:flex;
      flex-direction: column;
      justify-content: center;
    }
    .metaItem.highlight {
      background: #111;
      color: #fff;
    }
    .metaItem.highlight .k,
    .metaItem.highlight .v { color: #fff; }
    .metaItem.highlight .v { font-size: 18px; }
  </style>
</head>
<body>
  ${embed ? '' : `
  <div class="btnbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  `}
  ${inner}
</body>
</html>`;
}

export function receiptHtml(order: any, opts?: { embed?: boolean }): string {
  const r = normalizeOrderForReceipt(order);
  const title = `Sticker ${r.orderNo || r.id || ''}`.trim();
  return wrapHtml(title, `<div class="page">${receiptBody(r)}</div>`, opts);
}

export function receiptBulkHtml(orders: any[], opts?: { embed?: boolean }): string {
  const pages = (orders || []).map((o) => {
    const r = normalizeOrderForReceipt(o);
    const title = `Sticker ${r.orderNo || r.id || ''}`.trim();
    return `<div class="page" data-title="${escapeHtml(title)}">${receiptBody(r)}</div>`;
  }).join('');
  return wrapHtml('Bulk Stickers', pages || '<p>No orders selected</p>', opts);
}

export function openReceiptPreview(order: any): void {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=800');
  if (!w) {
    alert('Popup blocked. Please allow popups to preview sticker.');
    return;
  }
  w.document.open();
  w.document.write(receiptHtml(order));
  w.document.close();
}

export function openBulkReceiptPreview(orders: any[]): void {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=520,height=900');
  if (!w) {
    alert('Popup blocked. Please allow popups to preview stickers.');
    return;
  }
  w.document.open();
  w.document.write(receiptBulkHtml(orders));
  w.document.close();
}
