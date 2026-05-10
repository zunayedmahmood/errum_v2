// lib/posReceiptHtml.ts
// POS receipt template used by POS and Purchase History prints.
// Styled template with ERRUM branding/details.

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
  const symbol = currency && String(currency).trim() ? String(currency).trim() : '';
  const x = Number(n || 0);

  // Keep thousands separators, but remove trailing .00 everywhere.
  // Examples: 2000.00 -> 2,000 | 1999.50 -> 1,999.50
  const fixed = x.toFixed(2);
  const [intPartRaw, decPart] = fixed.split('.');
  const intPart = Number(intPartRaw).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  const formatted = decPart === '00' ? intPart : `${intPart}.${decPart}`;

  return `${symbol}${formatted}`;
}

function parseMoney(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.+\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function detectVatRate(order: any): number {
  const candidates = [
    order?.amounts?.vatRate,
    order?.vat_rate,
    order?.vatRate,
    order?.tax_rate,
    order?.taxRate,
    order?.amounts?.taxRate,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function inferInclusiveVat(netAmount: number, vatRatePercent: number): number {
  if (!(netAmount > 0) || !(vatRatePercent > 0)) return 0;
  return (netAmount * vatRatePercent) / (100 + vatRatePercent);
}

type PaymentMap = {
  CASH: number;
  CARD: number;
  BKASH: number;
  NAGAD: number;
  OTHERS: Array<{ name: string; amount: number }>;
};

function normalizeMethodLabel(raw: unknown): 'CASH' | 'CARD' | 'BKASH' | 'NAGAD' | '' {
  const m = String(raw || '').toLowerCase().trim();
  if (!m) return '';

  if (m.includes('cash')) return 'CASH';
  if (m.includes('card') || m.includes('visa') || m.includes('master')) return 'CARD';
  if (m.includes('bkash') || m.includes('b-kash') || m.includes('b kash')) return 'BKASH';
  if (m.includes('nagad')) return 'NAGAD';
  if (m.includes('mobile') || m.includes('wallet') || m.includes('mfs')) return 'BKASH';

  return '';
}

function extractPaymentBreakdown(order: any, paidFallback: number): PaymentMap {
  const out: PaymentMap = { CASH: 0, CARD: 0, BKASH: 0, NAGAD: 0, OTHERS: [] };

  const add = (label: keyof PaymentMap | '', amount: unknown, rawName?: string) => {
    const n = parseMoney(amount);
    if (!(n > 0)) return;

    if (label === 'CASH' || label === 'CARD' || label === 'BKASH' || label === 'NAGAD') {
      out[label] += n;
      return;
    }

    const name = String(rawName || 'OTHER').trim() || 'OTHER';
    out.OTHERS.push({ name, amount: n });
  };

  const addKnownKeys = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;

    let added = 0;
    const pairs: Array<[keyof PaymentMap, any]> = [
      ['CASH', obj.cash ?? obj.cash_paid ?? obj.cashPaid],
      ['CARD', obj.card ?? obj.card_paid ?? obj.cardPaid],
      ['BKASH', obj.bkash ?? obj.bkash_paid ?? obj.bkashPaid],
      ['NAGAD', obj.nagad ?? obj.nagad_paid ?? obj.nagadPaid],
    ];

    for (const [label, val] of pairs) {
      const n = parseMoney(val);
      if (n > 0) {
        out[label] += n;
        added += n;
      }
    }

    return added;
  };

  // IMPORTANT: payment shapes often duplicate the same values across
  // payment_breakdown/payment/paymentInfo/root keys.
  // Use precedence (first non-empty source) instead of summing all sources.
  const rootPaymentSlice = {
    cash: order?.cash ?? order?.cash_paid ?? order?.cashPaid,
    card: order?.card ?? order?.card_paid ?? order?.cardPaid,
    bkash: order?.bkash ?? order?.bkash_paid ?? order?.bkashPaid,
    nagad: order?.nagad ?? order?.nagad_paid ?? order?.nagadPaid,
  };

  const candidateObjects = [
    order?.payment_breakdown,
    order?.payments_breakdown,
    order?.paymentInfo,
    order?.payment,
    rootPaymentSlice,
  ];

  let explicitAdded = 0;
  for (const obj of candidateObjects) {
    const added = addKnownKeys(obj);
    if (added > 0) {
      explicitAdded = added;
      break;
    }
  }

  if (explicitAdded <= 0 && Array.isArray(order?.payments)) {
    for (const p of order.payments) {
      const amount = p?.amount;
      const methodRaw =
        p?.payment_method || p?.payment_method_name || p?.method || p?.name || p?.type || p?.channel;
      const label = normalizeMethodLabel(methodRaw);
      add(label, amount, methodRaw);
    }
  }

  const knownTotal = out.CASH + out.CARD + out.BKASH + out.NAGAD + out.OTHERS.reduce((s, x) => s + x.amount, 0);

  if (knownTotal <= 0) {
    const methodRaw =
      order?.payment_method || order?.paymentMethod || order?.payments?.method || order?.payment?.method;
    const label = normalizeMethodLabel(methodRaw);
    if (label) add(label, paidFallback, methodRaw);
  }

  return out;
}


function pickFirstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) return t;
      continue;
    }
    if (typeof v === 'number') {
      const t = String(v).trim();
      if (t) return t;
      continue;
    }
  }
  return '';
}

function pickAddressFromObject(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';

  const direct = pickFirstNonEmpty(
    obj?.address,
    obj?.full_address,
    obj?.fullAddress,
    obj?.location,
    obj?.street,
    obj?.street_address,
    obj?.streetAddress,
    obj?.line1,
    obj?.line_1
  );
  if (direct) return direct;

  const composed = [
    obj?.area,
    obj?.zone,
    obj?.city,
    obj?.district,
    obj?.division,
    obj?.postal_code || obj?.postalCode,
  ]
    .filter(Boolean)
    .join(', ')
    .trim();

  return composed;
}

function resolveStoreDisplay(order: any, r: ReceiptOrder): { brand: string; tagline: string; address: string; phone: string } {
  const brand = 'ERRUM BD';
  const defaultAddress = 'Level 03, Lift 2, Haji Kujrot Ali Mollah Super Market, Dhaka 1216';
  const defaultPhone = '01942-565664';

  const objectCandidates = [
    order?.store,
    order?.branch,
    order?.outlet,
    order?.assigned_store,
    order?.assignedStore,
    order?.shop,
  ];

  const storeObj = objectCandidates.find((x) => x && typeof x === 'object');

  const tagline =
    pickFirstNonEmpty(
      storeObj?.name,
      storeObj?.store_name,
      storeObj?.branch_name,
      storeObj?.outlet_name,
      order?.store_name,
      order?.storeName,
      order?.branch_name,
      order?.branchName,
      order?.outlet_name,
      order?.outletName,
      order?.shop_name,
      r.storeName
    ) || brand;

  const address =
    pickFirstNonEmpty(
      pickAddressFromObject(storeObj),
      order?.store_address,
      order?.storeAddress,
      order?.branch_address,
      order?.branchAddress,
      order?.outlet_address,
      order?.outletAddress,
      order?.shop_address,
      order?.shopAddress
    ) || defaultAddress;

  const phone =
    pickFirstNonEmpty(
      storeObj?.phone,
      storeObj?.mobile,
      storeObj?.contact_phone,
      storeObj?.contactPhone,
      order?.store_phone,
      order?.storePhone,
      order?.branch_phone,
      order?.branchPhone
    ) || defaultPhone;

  return { brand, tagline, address, phone };
}

function posReceiptBody(order: any) {
  const r: ReceiptOrder = normalizeOrderForReceipt(order);
  const branch = resolveStoreDisplay(order, r);

  const rows = (r.items || [])
    .map((it) => {
      const name = it.variant ? `${it.name} (${it.variant})` : it.name;
      const qtyNum = Number(it.qty || 0);

      // Unit Value = product/service unit price.
      // Amount = Qty × Unit Value.
      // Any discount is shown separately in the totals section.
      const hasUnitPrice = Number(it.unitPrice || 0) > 0;
      const displayUnitValue = hasUnitPrice
        ? Number(it.unitPrice || 0)
        : qtyNum > 0
        ? Number(it.lineTotal || 0) / qtyNum
        : Number(it.lineTotal || 0);

      const displayAmount = qtyNum > 0 ? displayUnitValue * qtyNum : Number(it.lineTotal || 0);

      return `<tr>
        <td class="left">${escapeHtml(name)}</td>
        <td class="center">${escapeHtml(String(it.qty))}</td>
        <td class="right">${escapeHtml(money(displayUnitValue))}</td>
        <td class="right">${escapeHtml(money(displayAmount))}</td>
      </tr>`;
    })
    .join('');

  const subtotal = Number(r.totals?.subtotal ?? 0);
  const discount = Number(r.totals?.discount ?? 0);
  const shipping = Number(r.totals?.shipping ?? 0);
  const netAmount = Number(r.totals?.total ?? 0);
  const paid = Number(r.totals?.paid ?? 0);
  const due = Number(r.totals?.due ?? 0);
  const change = Number(r.totals?.change ?? 0);

  // Prices are VAT inclusive: extract VAT from inclusive total when explicit tax is unavailable.
  const vatRate = detectVatRate(order);
  const explicitVat = Number(r.totals?.tax ?? 0);
  const vatBase = Math.max(0, netAmount - Math.max(0, shipping));
  const vat = explicitVat > 0 ? explicitVat : inferInclusiveVat(vatBase, vatRate);

  const paymentMap = extractPaymentBreakdown(order, paid);
  const paymentRows = [
    { label: 'Cash', amount: paymentMap.CASH },
    { label: 'Card', amount: paymentMap.CARD },
    { label: 'Bkash', amount: paymentMap.BKASH },
    ...(paymentMap.NAGAD > 0 ? [{ label: 'Nagad', amount: paymentMap.NAGAD }] : []),
  ].filter((p) => p.amount > 0);

  const hasOtherPayments = paymentMap.OTHERS.length > 0;

  const paymentInfoHtml =
    paymentRows.length > 0 || hasOtherPayments
      ? `
      <div class="payment-box">
        <div class="sec-title">Payment Info</div>
        <table class="totals payment-details">
          <tbody>
            ${paymentRows
              .map(
                (p) => `<tr><td>${escapeHtml(p.label)}</td><td class="right">${escapeHtml(money(p.amount))}</td></tr>`
              )
              .join('')}
            ${paymentMap.OTHERS
              .map(
                (p) => `<tr><td>${escapeHtml(p.name)}</td><td class="right">${escapeHtml(money(p.amount))}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
      : `
      <div class="payment-box">
        <div class="sec-title">Payment Info</div>
        <div class="small muted">No payment-method split available on this order.</div>
      </div>`;

  return `
    <div class="top-center">
      <div class="brand">${escapeHtml(branch.brand)}</div>
      <div class="tagline">${escapeHtml(branch.tagline)}</div>
      <div class="addr">${escapeHtml(branch.address)}</div>
      <div class="hotline">Mobile: ${escapeHtml(branch.phone)}</div>
      <div class="underline"></div>
      <div class="order-no">Order No : ${escapeHtml(String(r.orderNo || r.id || '—'))}</div>
    </div>

    <div class="meta">
      <div><span class="lbl">Date &amp; Time:</span> ${escapeHtml(r.dateTime || new Date().toLocaleString())}</div>
      <div><span class="lbl">Customer Name:</span> ${escapeHtml(r.customerName || 'Walk-in Customer')}</div>
      <div><span class="lbl">Phone:</span> ${escapeHtml(r.customerPhone || 'WALK-IN')}</div>
      ${r.salesBy ? `<div><span class="lbl">Sales By:</span> ${escapeHtml(r.salesBy)}</div>` : ''}
      ${Array.isArray(r.customerAddressLines) && r.customerAddressLines.length > 0
        ? `<div><span class="lbl">Address:</span> ${escapeHtml(r.customerAddressLines.join(', '))}</div>`
        : ''}
    </div>

    <div class="dash"></div>

    <div class="sec-title">Memo Details</div>

    <table class="items">
      <thead>
        <tr>
          <th class="left">Description</th>
          <th class="center">Qty</th>
          <th class="right">Price</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" class="center">No items</td></tr>`}
      </tbody>
    </table>

    <div class="dash"></div>

    <table class="totals">
      <tbody>
        <tr><td>Subtotal</td><td class="right">${escapeHtml(money(subtotal))}</td></tr>
        <tr><td>VAT</td><td class="right">Inclusive</td></tr>
        ${vat > 0 ? `<tr><td class="small muted">(Included VAT)</td><td class="right small muted">${escapeHtml(money(vat))}</td></tr>` : ''}
        <tr><td>Discount</td><td class="right">-${escapeHtml(money(discount))}</td></tr>
        ${shipping > 0 ? `<tr><td>Shipping</td><td class="right">${escapeHtml(money(shipping))}</td></tr>` : ''}
        <tr class="strong"><td>Net Amount</td><td class="right">${escapeHtml(money(netAmount))}</td></tr>
        <tr><td>Paid Amount</td><td class="right">${escapeHtml(money(paid))}</td></tr>
        <tr><td>Change Amount</td><td class="right">${escapeHtml(money(change))}</td></tr>
        ${due > 0 ? `<tr><td>Due Amount</td><td class="right">${escapeHtml(money(due))}</td></tr>` : ''}
      </tbody>
    </table>

    ${paymentInfoHtml}

    ${r.notes ? `<div class="note">Note: ${escapeHtml(r.notes)}</div>` : ''}

    <div class="policy">
      Items sold cannot be returned but may only be exchanged in their unworn condition with tags and original receipt within 7 days. Discount &amp; Offer items cannot be exchanged.
    </div>

    <div class="footer">
      Thank you for shopping at Errum BD.
    </div>
    <div class="credits">Software solution from mADestic Digital</div>
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
    @page { size: 80mm auto; margin: 5mm; }
    html, body { margin:0; padding:0; background:#fff; }

    body {
      font-family: Calibri, Arial, Helvetica, sans-serif;
      color:#111;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .wrap { padding: 2mm 1mm; }

    .top-center { text-align:center; }
    .brand {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: .5px;
      margin-bottom: 2px;
    }
    .tagline, .addr, .hotline, .order-no, .section-title {
      font-size: 13px;
      font-weight: 700;
      margin: 1px 0;
    }

    .underline {
      border-top: 1px solid #222;
      margin: 6px 0 4px;
    }

    .meta { font-size: 13px; margin: 6px 0; }
    .meta .lbl { font-weight: 800; }
    .meta > div { margin: 2px 0; }

    .dash {
      border-top: 1px dashed #666;
      margin: 8px 0;
    }

    .sec-title {
      font-size: 14px;
      font-weight: 800;
      margin: 2px 0 4px;
    }

    table { width:100%; border-collapse: collapse; }

    .items th, .items td {
      padding: 4px 0;
      font-size: 13px;
      font-weight: 700;
      vertical-align: top;
      border-bottom: 1px dotted #cfcfcf;
    }
    .items thead th {
      border-bottom: 1px solid #999;
      font-weight: 800;
    }

    .left { text-align:left; }
    .center { text-align:center; }
    .right { text-align:right; }

    .totals td {
      padding: 3px 0;
      font-size: 13px;
      font-weight: 700;
    }
    .totals .strong td {
      font-size: 14px;
      font-weight: 800;
      border-top: 1px solid #999;
      padding-top: 6px;
    }

    .payment-box {
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px dashed #666;
    }

    .payment-details td {
      font-size: 13px;
      font-weight: 700;
      padding: 2px 0;
    }

    .small { font-size: 12px; }
    .muted { color: #444; }

    .note {
      margin-top: 8px;
      font-size: 12px;
      font-weight: 700;
    }

    .policy {
      margin-top: 10px;
      text-align: center;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.45;
    }

    .footer {
      margin-top: 10px;
      text-align:center;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
    }

    .credits {
      margin-top: 4px;
      text-align: center;
      font-size: 10px;
      font-weight: 600;
      color: #444;
    }

    .btnbar { position: fixed; top: 10px; right: 10px; display:flex; gap:8px; }
    .btnbar button { font-family: inherit; font-size: 12px; padding: 8px 10px; cursor:pointer; }
    @media print { .btnbar { display:none; } }

    .page { break-after: page; page-break-after: always; }
    .page:last-child { break-after: auto; page-break-after: auto; }
  </style>
</head>
<body>
  ${embed ? '' : `
  <div class="btnbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  `}

  <div class="wrap">
    ${inner}
  </div>
</body>
</html>`;
}

export function posReceiptHtml(order: any, opts?: { embed?: boolean }): string {
  const r = normalizeOrderForReceipt(order);
  const title = `POS Receipt ${r.orderNo || r.id || ''}`.trim();
  return wrapHtml(title, `<div class="page">${posReceiptBody(order)}</div>`, opts);
}

export function posReceiptBulkHtml(orders: any[], opts?: { embed?: boolean }): string {
  const pages = (orders || [])
    .map((o) => {
      const r = normalizeOrderForReceipt(o);
      const title = `POS Receipt ${r.orderNo || r.id || ''}`.trim();
      return `<div class="page" data-title="${escapeHtml(title)}">${posReceiptBody(o)}</div>`;
    })
    .join('');

  return wrapHtml('Bulk POS Receipts', pages || '<p>No orders selected</p>', opts);
}
