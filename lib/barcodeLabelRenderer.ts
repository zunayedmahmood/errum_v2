"use client";

// Shared barcode label renderer so BatchPrinter, Grouped/Multi, and Lookup
// print with the exact same size/layout/style.

export const LABEL_WIDTH_MM = 39;
export const LABEL_HEIGHT_MM = 25;
export const DEFAULT_DPI = 300; // set to 203 for 203dpi printers
export const TOP_GAP_MM = 0.3; // extra blank gap at the very top
export const SHIFT_X_MM = 0; // keep 0 for perfect centering

export function mmToIn(mm: number) {
  return mm / 25.4;
}

async function ensureJsBarcode() {
  // QzTrayLoader loads JsBarcode globally, but keep a fallback for safety.
  if (typeof window === "undefined") return;
  if ((window as any).JsBarcode) return;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load JsBarcode"));
    document.head.appendChild(s);
  });
}

async function ensurePoppinsLoaded(px = 24) {
  if (typeof document === "undefined" || !(document as any).fonts?.load) return;

  try {
    await (document as any).fonts.load(`700 ${px}px Poppins`);
    await (document as any).fonts.ready;
  } catch {
    // Font loading is best-effort; canvas will fall back if unavailable.
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const ellipsis = "…";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + ellipsis).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length ? t + ellipsis : "";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const clean = (text || "").trim().replace(/\s+/g, " ");
  if (!clean) return [""];
  if (ctx.measureText(clean).width <= maxWidth) return [clean];

  const words = clean.split(" ");
  const lines: string[] = [];
  let remaining = words;

  while (remaining.length > 0 && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;

    if (remaining.length === 1) {
      lines.push(isLastLine ? fitText(ctx, remaining[0], maxWidth) : remaining[0]);
      remaining = [];
      break;
    }

    let line = "";
    let i = 0;
    for (; i < remaining.length; i++) {
      const test = line ? `${line} ${remaining[i]}` : remaining[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else break;
    }

    if (!line) {
      // Single word too wide — force-break it
      let forced = remaining[0];
      while (forced.length > 0 && ctx.measureText(forced).width > maxWidth) forced = forced.slice(0, -1);
      line = forced || fitText(ctx, remaining[0], maxWidth);
      i = 1;
    }

    if (isLastLine && i < remaining.length) {
      // Last line — truncate with ellipsis if needed
      const restRaw = [line, ...remaining.slice(i)].join(" ");
      lines.push(fitText(ctx, restRaw, maxWidth));
      remaining = [];
    } else {
      lines.push(line);
      remaining = remaining.slice(i);
    }
  }

  return lines.length > 0 ? lines : [fitText(ctx, clean, maxWidth)];
}

function normalizeLabelName(text: string) {
  const clean = (text || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  // Normalize separators so wrap logic can break naturally on spaces
  // Example: "Mueed-ta-40" -> "Mueed - ta - 40"
  return clean.replace(/\s*[-–—]\s*/g, " - ");
}

export async function renderBarcodeLabelBase64(opts: {
  code: string;
  productName: string;
  price: number;
  dpi?: number;
  brandName?: string;
}) {
  await ensureJsBarcode();

  const dpi = opts.dpi ?? DEFAULT_DPI;
  const wIn = mmToIn(LABEL_WIDTH_MM);
  const hIn = mmToIn(LABEL_HEIGHT_MM);
  const wPx = Math.max(50, Math.round(wIn * dpi));
  const hPx = Math.max(50, Math.round(hIn * dpi));

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  await ensurePoppinsLoaded(Math.round(hPx * 0.1));

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, wPx, hPx);

  const pad = Math.round(wPx * 0.04); // ~4%
  const topGapPx = Math.round((TOP_GAP_MM / 25.4) * dpi);
  const topPad = pad + topGapPx;
  const shiftPx = Math.round((SHIFT_X_MM / 25.4) * dpi);
  const centerX = wPx / 2 + shiftPx;

  // Brand
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 ${Math.round(hPx * 0.11)}px Poppins, Arial, sans-serif`;
  ctx.fillText((opts.brandName || "ERRUM BD").trim() || "ERRUM BD", centerX, topPad);

  // Product name — up to 3 lines, shrinking font as needed
  const nameY = topPad + Math.round(hPx * 0.14);
  const nameMaxW = wPx - pad * 2;
  const lineGap = Math.max(2, Math.round(hPx * 0.01));
  const fullName = normalizeLabelName(opts.productName || "Product");

  // Try fitting in 1 line → 2 lines → 3 lines, shrinking font each step
  let nameFont = Math.round(hPx * 0.095);
  ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
  let nameLines = wrapLines(ctx, fullName, nameMaxW, 3);

  if (nameLines.length > 1) {
    nameFont = Math.round(hPx * 0.082);
    ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
    nameLines = wrapLines(ctx, fullName, nameMaxW, 3);
  }

  if (nameLines.length > 2) {
    nameFont = Math.round(hPx * 0.070);
    ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
    nameLines = wrapLines(ctx, fullName, nameMaxW, 3);
  }

  nameLines.forEach((line, i) => {
    ctx.fillText(line, centerX, nameY + i * (nameFont + lineGap));
  });

  const afterNameBottom = nameY + nameLines.length * (nameFont + lineGap);
  const afterNameY = afterNameBottom + Math.round(hPx * 0.02);

  // Barcode — smaller to leave room for 3-line names
  const JsBarcode = (window as any).JsBarcode;

  const maxBcW = Math.round((wPx - pad * 2) * 0.98);
  const maxBcH = Math.round(hPx * 0.56);
  const bcHeight = Math.round(hPx * 0.28);
  const bcFontSize = Math.round(hPx * 0.062);

  const renderBarcodeCanvas = (barWidth: number) => {
    const c = document.createElement("canvas");
    JsBarcode(c, opts.code, {
      format: "CODE128",
      width: Math.max(1, Math.floor(barWidth)),
      height: bcHeight,
      displayValue: true,
      fontSize: bcFontSize,
      fontOptions: "bold",
      textMargin: 0,
      margin: 0,
    });
    return c;
  };

  // Pick the largest integer barWidth that fits
  let bw = 1;
  let bcCanvas = renderBarcodeCanvas(bw);
  while (bw < 6) {
    const next = renderBarcodeCanvas(bw + 1);
    if (next.width <= maxBcW && next.height <= maxBcH) {
      bw += 1;
      bcCanvas = next;
      continue;
    }
    break;
  }

  const bcY = Math.max(topPad + Math.round(hPx * 0.27), Math.round(afterNameY));
  const scale = Math.min(1, maxBcW / bcCanvas.width, maxBcH / bcCanvas.height);
  const drawW = Math.round(bcCanvas.width * scale);
  const drawH = Math.round(bcCanvas.height * scale);
  const bcX = Math.round((wPx - drawW) / 2 + shiftPx);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bcCanvas, bcX, bcY, drawW, drawH);

  // Price
  const priceText = `BDT ${Number(opts.price || 0).toLocaleString("en-BD")}`;
  ctx.textBaseline = "bottom";
  const priceFontSize = Math.round(hPx * 0.1);
  // Use a mono-style numeric font stack for clearer digit differentiation (e.g., 6 vs 8)
  ctx.font = `700 ${priceFontSize}px Poppins, Arial, sans-serif`;
  const priceY = hPx - pad;
  ctx.fillText(fitText(ctx, priceText, wPx - pad * 2), centerX, priceY);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}
