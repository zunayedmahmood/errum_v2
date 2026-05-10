"use client";

import React, { useState, useEffect } from "react";
import BarcodeSelectionModal from "./BarcodeSelectionModal";
import { barcodeTrackingService } from "@/services/barcodeTrackingService";
import {
  LABEL_WIDTH_MM as SHARED_LABEL_WIDTH_MM,
  LABEL_HEIGHT_MM as SHARED_LABEL_HEIGHT_MM,
  DEFAULT_DPI as SHARED_DEFAULT_DPI,
  mmToIn as sharedMmToIn,
  renderBarcodeLabelBase64,
} from "@/lib/barcodeLabelRenderer";

interface Product {
  id: number;
  name: string;
}

interface Batch {
  id: number;
  productId: number;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  baseCode: string;
}

interface BatchPrinterProps {
  batch: Batch;
  product?: Product;
  barcodes?: string[]; // Accept pre-fetched barcodes from parent
}

// Global QZ connection state to prevent multiple connection attempts
let qzConnectionPromise: Promise<void> | null = null;
let qzConnected = false;

async function ensureQZConnection() {
  const qz = (window as any).qz;
  if (!qz) {
    throw new Error("QZ Tray not available");
  }

  // If already connected, return immediately
  if (qzConnected && (await qz.websocket.isActive())) {
    return;
  }

  // If connection is in progress, wait for it
  if (qzConnectionPromise) {
    return qzConnectionPromise;
  }

  // Start new connection
  qzConnectionPromise = (async () => {
    try {
      if (!(await qz.websocket.isActive())) {
        await qz.websocket.connect();
        qzConnected = true;
        console.log("✅ QZ Tray connected");
      }
    } catch (error) {
      console.error("❌ QZ Tray connection failed:", error);
      throw error;
    } finally {
      qzConnectionPromise = null;
    }
  })();

  return qzConnectionPromise;
}


async function resolvePrinterName(): Promise<string | null> {
  const qz = (window as any).qz;
  if (!qz) return null;

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

// Label geometry (match MultiBarcodePrinter)
const LABEL_WIDTH_MM = 39;
const LABEL_HEIGHT_MM = 25;
const DEFAULT_DPI = 300; // set to 203 for 203dpi printers
const TOP_GAP_MM = 0.3; // extra blank gap at the very top (same as Multi)
const SHIFT_X_MM = 0; // keep 0 for perfect centering (Batch/Multi-style)

function mmToIn(mm: number) {
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
  // Example: "Mueed-ta-40" -> "Mueed - ta - 40"
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
  ctx.fillText("ERRUM BD", centerX, topPad);

  // Product name — up to 3 lines, shrinking font as needed
  const nameY = topPad + Math.round(hPx * 0.14);
  let afterNameY = 0;
  const nameMaxW = wPx - pad * 2;
  const lineGap = Math.max(2, Math.round(hPx * 0.01));
  const fullName = normalizeLabelName(opts.productName || "Product");

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
  afterNameY = afterNameBottom + Math.round(hPx * 0.02);

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

export default function BatchPrinter({ batch, product, barcodes: externalBarcodes }: BatchPrinterProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQzLoaded, setIsQzLoaded] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>(externalBarcodes || []);
  const [isLoadingBarcodes, setIsLoadingBarcodes] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20;

    const checkQZ = () => {
      attempts++;

      if (typeof window !== "undefined" && (window as any).qz) {
        console.log("✅ QZ Tray library loaded");
        setIsQzLoaded(true);
        return true;
      }

      return false;
    };

    if (checkQZ()) return;

    const interval = setInterval(() => {
      if (checkQZ() || attempts >= maxAttempts) {
        clearInterval(interval);
        if (attempts >= maxAttempts) {
          console.warn("QZ Tray not detected. Install QZ Tray to enable barcode printing.");
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Update barcodes if external barcodes change
  useEffect(() => {
    if (externalBarcodes && externalBarcodes.length > 0) {
      setBarcodes(externalBarcodes);
    }
  }, [externalBarcodes]);

  const loadDefaultPrinter = async (): Promise<string | null> => {
    try {
      const qz = (window as any).qz;
      if (!qz) return null;

      await ensureQZConnection();
      const printer = await resolvePrinterName();

      if (printer) {
        console.log("✅ Printer loaded:", printer);
        setDefaultPrinter(printer);
        setPrinterError(null);
        return printer;
      }

      setPrinterError("No printers found");
      return null;
    } catch (err: any) {
      console.error("❌ Error loading default printer:", err);
      setPrinterError(err?.message || "QZ Tray connection failed");
      return null;
    }
  };

  // Fetch barcodes from backend when modal opens (only if not provided externally)
  const fetchBarcodes = async () => {
    if (externalBarcodes && externalBarcodes.length > 0) {
      setBarcodes(externalBarcodes);
      return;
    }

    if (!batch?.id) {
      setBarcodeError("Batch information not available");
      return;
    }

    setIsLoadingBarcodes(true);
    setBarcodeError(null);

    try {
      const response = await barcodeTrackingService.getBatchBarcodes(batch.id);

      if (response.success && response.data.barcodes) {
        const barcodeCodes = response.data.barcodes
          .filter((b) => b.is_active)
          .map((b) => b.barcode);

        if (barcodeCodes.length === 0) {
          setBarcodeError("No active barcodes found for this batch");
        } else {
          setBarcodes(barcodeCodes);
          console.log(`✅ Loaded ${barcodeCodes.length} barcodes for batch ${batch.id}`);
        }
      } else {
        setBarcodeError("Failed to fetch barcodes");
      }
    } catch (error: any) {
      console.error("Error fetching barcodes:", error);
      setBarcodeError(error.message || "Failed to fetch barcodes from server");
    } finally {
      setIsLoadingBarcodes(false);
    }
  };

  const handleOpenModal = async () => {
    setIsModalOpen(true);

    if (!defaultPrinter && isQzLoaded) {
      await loadDefaultPrinter();
    }

    if (!externalBarcodes || externalBarcodes.length === 0) {
      fetchBarcodes();
    }
  };

  const handleQZPrint = async (selected: string[], quantities: Record<string, number>) => {
    const qz = (window as any).qz;

    if (!qz) {
      alert("QZ Tray library not loaded. Please refresh the page or install QZ Tray.");
      return;
    }

    let printerToUse = defaultPrinter;
    if (!printerToUse) {
      console.log("Loading printer before print...");
      printerToUse = await loadDefaultPrinter();
    }

    if (!printerToUse) {
      alert("No printer available. Please check your printer settings and try again.");
      return;
    }

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

      console.log(`Using printer: ${printerToUse}`);

      const data: any[] = [];
      for (const code of selected) {
        const qty = quantities[code] || 1;
        for (let i = 0; i < qty; i++) {
          const base64 = await renderBarcodeLabelBase64({
            code,
            // NOTE: no substring here so dash-split + ellipsis works properly
            productName: product?.name || "Product",
            price: batch.sellingPrice,
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

      console.log(`📄 Printing ${data.length} labels to printer: ${defaultPrinter}`);

      await qz.print(config, data);
      alert(`✅ ${data.length} barcode(s) sent to printer "${printerToUse}" successfully!`);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("❌ Print error:", err);

      if (err.message && err.message.includes("Unable to establish connection")) {
        alert(
          "QZ Tray is not running. Please start QZ Tray and try again.\n\nDownload from: https://qz.io/download/"
        );
      } else if (err.message && err.message.includes("printer must be specified")) {
        alert("Printer not properly configured. Reloading printer settings...");
        await loadDefaultPrinter();
      } else {
        alert(`Print failed: ${err.message || "Unknown error"}`);
      }
    }
  };

  const canPrint = isQzLoaded;
  const buttonText = !isQzLoaded ? "QZ Tray Not Detected" : "Print Barcodes";

  const buttonTitle = !isQzLoaded
    ? "QZ Tray not detected. Install QZ Tray to enable printing."
    : defaultPrinter
      ? `Print barcodes using ${defaultPrinter}`
      : "Print barcodes";

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="w-full px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!canPrint}
        title={buttonTitle}
      >
        {buttonText}
      </button>

      {defaultPrinter && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
          Printer: {defaultPrinter}
        </div>
      )}

      <BarcodeSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        codes={barcodes}
        productName={product?.name || "Product"}
        price={batch.sellingPrice}
        onPrint={handleQZPrint}
        isLoading={isLoadingBarcodes}
        error={barcodeError}
      />
    </>
  );
}
