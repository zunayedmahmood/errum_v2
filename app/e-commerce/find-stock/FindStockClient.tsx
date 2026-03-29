'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { productService, StockDetail } from '@/services/productService';
import { 
  Loader2, 
  Search, 
  MapPin, 
  Box, 
  Layers, 
  ArrowLeft,
  Camera,
  AlertCircle,
  Package,
  Info,
  ChevronRight,
  Database,
  RefreshCw,
  ShoppingBag,
  Store
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const scannerStyles = `
  #reader {
    border: none !important;
  }
  #reader__dashboard_section_csr button {
    background-color: #3b82f6 !important;
    color: white !important;
    border: none !important;
    padding: 8px 16px !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    margin-top: 10px !important;
  }
  #reader__status_span {
    font-size: 12px !important;
    color: #64748b !important;
  }
  #reader__scan_region video {
    border-radius: 12px !important;
    object-fit: cover !important;
  }
`;

export default function FindStockClient() {
  const [scannedData, setScannedData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner only when needed
    if (isScanning && !scannedData && !loading) {
      // Use a small delay to ensure the container is ready
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner(
            "reader",
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
              showTorchButtonIfSupported: true,
              videoConstraints: {
                facingMode: "environment"
              }
            },
            /* verbose= */ false
          );
          
          scanner.render(onScanSuccess, onScanFailure);
          scannerRef.current = scanner;
        } catch (err) {
          console.error("Scanner initialization failed", err);
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch(error => {
            console.error("Failed to clear scanner", error);
          });
          scannerRef.current = null;
        }
      };
    }
  }, [isScanning, scannedData, loading]);

  const onScanSuccess = async (decodedText: string) => {
    if (loading) return;
    performSearch(decodedText);
  };

  const onScanFailure = (error: any) => {
    // Failures happen constantly while scanning, no need to log
  };

  const performSearch = async (barcode: string) => {
    setLoading(true);
    setError(null);
    
    // Stop scanner first to avoid camera lock
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        scannerRef.current = null;
      } catch (e) {
        console.error("Clear error", e);
      }
    }
    setIsScanning(false);
    
    try {
      const data = await productService.findStockByBarcode(barcode);
      setScannedData(data);
    } catch (err: any) {
      setError(err.message || 'Product not found');
      // On error, we provide a way to try again, which will re-enable scanning
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      performSearch(manualBarcode.trim());
    }
  };

  const resetScanner = () => {
    setScannedData(null);
    setError(null);
    setIsScanning(true);
    setManualBarcode('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-12">
      <style dangerouslySetInnerHTML={{ __html: scannerStyles }} />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/e-commerce" className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold tracking-tight">Find Stock</h1>
        </div>
        {scannedData && (
          <button 
            onClick={resetScanner}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-primary"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </header>

      <main className="p-4 max-w-md mx-auto">
        {!scannedData && !loading && !error && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Intro Header */}
            <div className="text-center space-y-2 py-4">
              <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2 text-primary">
                <Camera className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold">Quick Stock Check</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Scan a product barcode or enter it manually below.</p>
            </div>

            {/* Scanner Area */}
            <div className="relative group">
              <div id="reader" className="overflow-hidden rounded-2xl border-4 border-white dark:border-slate-800 shadow-2xl bg-black aspect-square" />
              <div className="absolute inset-0 pointer-events-none border-2 border-primary/30 rounded-2xl m-8" />
            </div>

            {/* Manual Entry */}
            <form onSubmit={handleManualSearch} className="space-y-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter barcode manually..."
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
              </div>
              <button 
                type="submit"
                disabled={!manualBarcode.trim()}
                className="w-full h-14 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
              >
                Lookup Stock
              </button>
            </form>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
            </div>
            <p className="text-slate-500 font-medium font-inter animate-pulse">Fetching inventory details...</p>
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-3xl text-center space-y-4 animate-in zoom-in duration-300">
            <div className="inline-flex p-3 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600 dark:text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-red-900 dark:text-red-200 uppercase tracking-wider text-sm">Product Not Found</h3>
              <p className="text-red-600 dark:text-red-400 text-sm leading-relaxed">{error}</p>
            </div>
            <button 
              onClick={resetScanner}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 active:scale-[0.98] transition-all"
            >
              Try Another Scan
            </button>
          </div>
        )}

        {scannedData && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500 fill-mode-both">
            {/* Product Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-5 shadow-sm space-y-4">
              <div className="flex gap-4">
                <div className="w-24 h-24 relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-100 dark:border-slate-800">
                  {scannedData.images && scannedData.images.length > 0 ? (
                    <Image 
                      src={scannedData.images[0].url} 
                      alt={scannedData.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <ShoppingBag className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/5 px-2 py-0.5 rounded-full self-start mb-1">
                    {scannedData.category || 'General'}
                  </span>
                  <h2 className="text-lg font-bold leading-tight line-clamp-2">{scannedData.name}</h2>
                  <p className="text-sm font-mono text-slate-500 mt-1 flex items-center gap-1">
                    <Database className="w-3 h-3" /> {scannedData.sku}
                  </p>
                </div>
              </div>
              
              {scannedData.description && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{scannedData.description}</p>
                </div>
              )}
            </div>

            {/* Overall Inventory Scoreboard */}
            <div className="grid grid-cols-3 gap-3">
              <InventoryMetric 
                label="Physical" 
                value={scannedData.inventory.physical_stock} 
                icon={<Box className="w-4 h-4" />}
                color="blue"
              />
              <InventoryMetric 
                label="Reserved" 
                value={scannedData.inventory.reserved_stock} 
                icon={<Layers className="w-4 h-4" />}
                color="orange"
              />
              <InventoryMetric 
                label="Available" 
                value={scannedData.inventory.available_stock} 
                icon={<ShoppingBag className="w-4 h-4" />}
                color="green"
              />
            </div>

            {/* Branch Wise Stock */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" /> Branch Distribution
                </h3>
              </div>
              <div className="space-y-2">
                {scannedData.branch_stock.length > 0 ? (
                  scannedData.branch_stock.map((store) => (
                    <div key={store.store_id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{store.store_name}</p>
                          <p className="text-[10px] text-slate-400">{store.store_address || 'Main Branch'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-lg font-black",
                          store.quantity > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
                        )}>
                          {store.quantity}
                        </p>
                        <p className="text-[10px] uppercase font-bold text-slate-400">Units</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-slate-400 text-sm italic">No branch stock data available</p>
                )}
              </div>
            </div>

            {/* Variants */}
            {scannedData.variants && scannedData.variants.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-bold flex items-center gap-2 px-1">
                  <Layers className="w-4 h-4 text-primary" /> Other Variants
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 no-scrollbar">
                  {scannedData.variants.map((v) => (
                    <div key={v.sku} className={cn(
                      "flex-shrink-0 w-36 bg-white dark:bg-slate-900 border rounded-2xl p-3 shadow-sm",
                      v.sku === scannedData.sku ? "border-primary ring-1 ring-primary/20" : "border-slate-200 dark:border-slate-800"
                    )}>
                      <p className="text-[10px] font-bold text-slate-400 mb-1">{v.sku}</p>
                      <p className="font-bold text-xs mb-2 line-clamp-1">{v.name}</p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-black",
                          v.stock_status === 'In Stock' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        )}>
                          {v.stock_status}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">Qty: {v.available_stock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <button 
              onClick={resetScanner}
              className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-2xl shadow-xl active:scale-95 transition-all mt-4"
            >
              Scan New Item
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function InventoryMetric({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: 'blue' | 'orange' | 'green' }) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30",
    orange: "bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30",
    green: "bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30"
  };

  return (
    <div className={cn("p-3 rounded-2xl border text-center space-y-1", colorMap[color])}>
      <div className="flex justify-center flex-col items-center gap-1 opacity-70">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
