"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LABEL_WIDTH_MM as SHARED_LABEL_WIDTH_MM,
  LABEL_HEIGHT_MM as SHARED_LABEL_HEIGHT_MM,
  DEFAULT_DPI as SHARED_DEFAULT_DPI,
  mmToIn as sharedMmToIn,
  renderBarcodeLabelBase64,
} from "@/lib/barcodeLabelRenderer";

// A lightweight multi-label printer that prints multiple different barcodes in one click.
// Uses the same 39x25mm pixel-perfect printing approach used in BatchPrinter.

export type MultiBarcodePrintItem = {
  code: string;
  productName: string;
  price: number;
  qty?: number;
};

// Global QZ connection state to prevent multiple connection attempts
let qzConnectionPromise: Promise<void> | null = null;
let qzConnected = false;

async function ensureQZConnection() {
  const qz = (window as any).qz;
  if (!qz) throw new Error("QZ Tray not available");

  if (qzConnected && (await qz.websocket.isActive())) return;
  if (qzConnectionPromise) return qzConnectionPromise;

  qzConnectionPromise = (async () => {
    try {
      if (!(await qz.websocket.isActive())) {
        await qz.websocket.connect();
        qzConnected = true;
      }
    } finally {
      qzConnectionPromise = null;
    }
  })();

  return qzConnectionPromise;
}

// Label geometry (match BatchPrinter)
const LABEL_WIDTH_MM = 39;
const LABEL_HEIGHT_MM = 25;
const DEFAULT_DPI = 300; // set to 203 for 203dpi printers
const TOP_GAP_MM = 0.3; // extra blank gap at the very top (same as Batch)
const SHIFT_X_MM = 0; // keep 0 for perfect centering

function mmToIn(mm: number) {
  return mm / 25.4;
}

async function ensureJsBarcode() {
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
      let forced = remaining[0];
      while (forced.length > 0 && ctx.measureText(forced).width > maxWidth) forced = forced.slice(0, -1);
      line = forced || fitText(ctx, remaining[0], maxWidth);
      i = 1;
    }

    if (isLastLine && i < remaining.length) {
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
  return clean.replace(/\s*[-–—]\s*/g, " - ");
}

async function renderLabelBase64(opts: {
  code: string;
  productName: string;
  price: number;
  dpi?: number;
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

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, wPx, hPx);

  const pad = Math.round(wPx * 0.04);
  const topGapPx = Math.round((TOP_GAP_MM / 25.4) * dpi);
  const topPad = pad + topGapPx;
  const shiftPx = Math.round((SHIFT_X_MM / 25.4) * dpi);
  const centerX = wPx / 2 + shiftPx;

  // Brand
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 ${Math.round(hPx * 0.11)}px Arial`;
  ctx.fillText("ERRUM BD", centerX, topPad);

  // Product name — up to 3 lines, shrinking font as needed
  const nameY = topPad + Math.round(hPx * 0.14);
  const nameMaxW = wPx - pad * 2;
  const lineGap = Math.max(2, Math.round(hPx * 0.01));
  const fullName = normalizeLabelName(opts.productName || "Product");

  let nameFont = Math.round(hPx * 0.095);
  ctx.font = `700 ${nameFont}px Arial`;
  let nameLines = wrapLines(ctx, fullName, nameMaxW, 3);

  if (nameLines.length > 1) {
    nameFont = Math.round(hPx * 0.082);
    ctx.font = `700 ${nameFont}px Arial`;
    nameLines = wrapLines(ctx, fullName, nameMaxW, 3);
  }

  if (nameLines.length > 2) {
    nameFont = Math.round(hPx * 0.070);
    ctx.font = `700 ${nameFont}px Arial`;
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
  const bcFontSize = Math.round(hPx * 0.075);

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
  const priceText = `BDT ৳${Number(opts.price || 0).toLocaleString("en-BD")}`;
  ctx.textBaseline = "bottom";
  const priceFontSize = Math.round(hPx * 0.1);
  ctx.font = `800 ${priceFontSize}px "Consolas", "Lucida Console", "DejaVu Sans Mono", "Courier New", monospace`;
  const priceY = hPx - pad;
  ctx.fillText(fitText(ctx, priceText, wPx - pad * 2), centerX, priceY);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}


async function resolvePrinterName(qz: any): Promise<string | null> {
  try {
    const def = await qz.printers.getDefault();
    if (def && String(def).trim()) return String(def);
  } catch (_e) {}

  try {
    const found = await qz.printers.find();
    if (Array.isArray(found) && found.length > 0 && found[0]) return String(found[0]);
    if (typeof found === "string" && found.trim()) return found;
  } catch (_e) {}

  try {
    const details = await qz.printers.details?.();
    if (Array.isArray(details) && details.length > 0) {
      const name = details[0]?.name || details[0];
      if (name) return String(name);
    }
  } catch (_e) {}

  return null;
}

export default function MultiBarcodePrinter({
  items,
  buttonLabel = "Print All Barcodes",
  title = "Print Barcodes",
  hideButton = false,
  autoOpenToken,
}: {
  items: MultiBarcodePrintItem[];
  buttonLabel?: string;
  title?: string;
  hideButton?: boolean;
  // If provided, the modal will auto-open once per token change (useful for async loading flows)
  autoOpenToken?: number;
}) {
  const [isQzLoaded, setIsQzLoaded] = useState(false);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [qtyByCode, setQtyByCode] = useState<Record<string, number>>({});

  const lastAutoOpenTokenRef = React.useRef<number | undefined>(undefined);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20;

    const check = () => {
      attempts++;
      if (typeof window !== "undefined" && (window as any).qz) {
        setIsQzLoaded(true);
        return true;
      }
      return false;
    };

    if (check()) return;
    const t = setInterval(() => {
      if (check() || attempts >= maxAttempts) clearInterval(t);
    }, 100);

    return () => clearInterval(t);
  }, []);

  // Initialize quantities when modal opens or items change
  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, number> = {};
    items.forEach((it) => {
      if (!it.code) return;
      next[it.code] = clamp(Number(it.qty ?? 1) || 1, 1, 100);
    });
    setQtyByCode(next);
  }, [isOpen, items]);

  const totalLabels = useMemo(() => {
    return items.reduce((sum, it) => sum + (qtyByCode[it.code] || 0), 0);
  }, [items, qtyByCode]);

  const loadDefaultPrinter = async (): Promise<string | null> => {
    try {
      const qz = (window as any).qz;
      if (!qz) return null;
      await ensureQZConnection();

      const printer = await resolvePrinterName(qz);
      if (printer) {
        setDefaultPrinter(printer);
        setPrinterError(null);
        return printer;
      }

      setPrinterError("No printers found");
      return null;
    } catch (e: any) {
      setPrinterError(e?.message || "Failed to load printers");
      return null;
    }
  };

  const open = async () => {
    setIsOpen(true);
    if (!defaultPrinter && isQzLoaded) await loadDefaultPrinter();
  };

  // Allow a parent to trigger opening once per token change.
  useEffect(() => {
    if (autoOpenToken === undefined || autoOpenToken === null) return;
    if (lastAutoOpenTokenRef.current === autoOpenToken) return;
    lastAutoOpenTokenRef.current = autoOpenToken;
    // Defer to next tick so state updates (items) settle.
    setTimeout(() => {
      open();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenToken]);

  const print = async () => {
    const qz = (window as any).qz;
    if (!qz) {
      alert("QZ Tray library not loaded. Please refresh the page or install QZ Tray.");
      return;
    }

    let printerToUse = defaultPrinter;
    if (!printerToUse) {
      printerToUse = await loadDefaultPrinter();
    }
    if (!printerToUse) {
      alert("No printer available. Please set a default printer and try again.");
      return;
    }

    const willPrint = totalLabels;
    if (!willPrint) {
      alert("Nothing selected to print.");
      return;
    }

    const ok = confirm(`Print ${willPrint} label(s) to "${printerToUse}"?`);
    if (!ok) return;

    setIsPrinting(true);
    try {
      await ensureQZConnection();

      const dpi = SHARED_DEFAULT_DPI;
      const config = qz.configs.create(printerToUse, {
        units: "in",
        size: { width: sharedMmToIn(SHARED_LABEL_WIDTH_MM), height: sharedMmToIn(SHARED_LABEL_HEIGHT_MM) },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        density: dpi,
        colorType: "blackwhite",
        interpolation: "nearest-neighbor",
        scaleContent: false,
      });

      const data: any[] = [];
      for (const it of items) {
        const qty = qtyByCode[it.code] || 0;
        if (!qty) continue;

        for (let i = 0; i < qty; i++) {
          const base64 = await renderBarcodeLabelBase64({
            code: it.code,
            productName: it.productName || "Product",
            price: it.price,
            dpi,
            brandName: "ERRUM BD",
          });
          data.push({
            type: "pixel",
            format: "image",
            flavor: "base64",
            data: base64,
          });
        }
      }

      await qz.print(config, data);
      alert(`✅ ${data.length} label(s) sent to printer "${printerToUse}" successfully!`);
      setIsOpen(false);
    } catch (err: any) {
      console.error("❌ Multi print error:", err);
      const msg = err?.message || "Unknown error";
      if (msg.includes("Unable to establish connection")) {
        alert(
          "QZ Tray is not running. Please start QZ Tray and try again.\n\nDownload from: https://qz.io/download/"
        );
      } else {
        alert(`Print failed: ${msg}`);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const canPrint = isQzLoaded && items.length > 0;

  return (
    <>
      {!hideButton && (
        <button
          onClick={open}
          disabled={!canPrint}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!isQzLoaded ? "QZ Tray not detected" : items.length ? "Print all" : "No barcodes"}
        >
          {buttonLabel}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">{title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Printer: {defaultPrinter || printerError || "Loading..."} • Total labels: {totalLabels}
                </div>
              </div>
              <button
                onClick={() => (isPrinting ? null : setIsOpen(false))}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {items.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No barcodes to print.</div>
              ) : (
                <div className="space-y-3">
                  {items.map((it) => (
                    <div
                      key={it.code}
                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm text-gray-900 dark:text-white truncate">{it.code}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {it.productName} • ৳{Number(it.price || 0).toLocaleString("en-BD")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setQtyByCode((p) => ({
                              ...p,
                              [it.code]: clamp((p[it.code] || 1) - 1, 0, 100),
                            }))
                          }
                          disabled={isPrinting}
                          className="w-9 h-9 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 disabled:opacity-50"
                          title="-"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={qtyByCode[it.code] ?? 1}
                          onChange={(e) =>
                            setQtyByCode((p) => ({
                              ...p,
                              [it.code]: clamp(parseInt(e.target.value || "0", 10) || 0, 0, 100),
                            }))
                          }
                          disabled={isPrinting}
                          className="w-20 px-2 py-2 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                        />
                        <button
                          onClick={() =>
                            setQtyByCode((p) => ({
                              ...p,
                              [it.code]: clamp((p[it.code] || 0) + 1, 0, 100),
                            }))
                          }
                          disabled={isPrinting}
                          className="w-9 h-9 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 disabled:opacity-50"
                          title="+"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Tip: set quantity to 0 to skip an item.
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={isPrinting}
                  className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  onClick={print}
                  disabled={isPrinting || !canPrint}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPrinting ? "Printing..." : `Print (${totalLabels})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
