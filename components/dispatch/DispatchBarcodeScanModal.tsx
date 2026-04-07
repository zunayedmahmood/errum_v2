'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Scan, RefreshCw, CheckCircle, AlertTriangle, Package, Truck } from 'lucide-react';
import dispatchService, {
  ProductDispatch,
  ScannedBarcodesResponse,
  ReceivedBarcodesResponse,
} from '@/services/dispatchService';

export type DispatchScanMode = 'send' | 'receive';

interface Props {
  dispatch: ProductDispatch | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful scan (send/receive) */
  onComplete?: () => void;
  /** If provided, a "Complete Delivery" button is shown in receive mode */
  onMarkDelivered?: (dispatchId: number) => Promise<void>;
  mode: DispatchScanMode;
}

type AnyProgress =
  | ({ kind: 'send' } & ScannedBarcodesResponse)
  | ({ kind: 'receive' } & ReceivedBarcodesResponse);

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function unpackData(payload: any) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function toArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  if (typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>);
    return values.length ? (values as T[]) : [];
  }

  return [];
}

export default function DispatchBarcodeScanModal({
  dispatch,
  isOpen,
  onClose,
  onComplete,
  onMarkDelivered,
  mode,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Queue scans so staff can scan rapidly even if the API call takes a moment.
  // This prevents "only first scan registers" issues when scanners send codes back-to-back.
  const scanQueueRef = useRef<string[]>([]);
  const scanQueueSetRef = useRef<Set<string>>(new Set());
  const scanQueueProcessingRef = useRef(false);
  const [queuedScanCount, setQueuedScanCount] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<AnyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overall, setOverall] = useState<{ allComplete: boolean; pending: number } | null>(null);
  const [checkingOverall, setCheckingOverall] = useState(false);

  const items = dispatch?.items || [];

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const header = mode === 'send' ? '🔵 Scan Items to Send' : '🟢 Scan Items Received';

  const canCompleteCurrentItem = useMemo(() => {
    if (!progress) return false;
    // Only allow completion when backend actually reports a non-zero requirement.
    // (Some endpoints may return 0/undefined fields; in those cases we keep scanning enabled.)
    if (progress.kind === 'send') {
      const total = toNum((progress as any).required_quantity ?? (progress as any).total ?? 0);
      const remaining = toNum((progress as any).remaining_count ?? (progress as any).remaining ?? 0);
      return total > 0 && remaining === 0;
    }
    const total = toNum((progress as any).total_sent ?? (progress as any).required_quantity ?? (progress as any).total ?? 0);
    const pendingRaw = (progress as any).pending_count ?? (progress as any).remaining_count ?? (progress as any).remaining;
    const received = toNum((progress as any).received_count ?? (progress as any).scanned_count ?? 0);
    const pending = pendingRaw != null ? toNum(pendingRaw) : Math.max(0, total - received);
    return total > 0 && pending === 0;
  }, [progress]);

  const stats = useMemo(() => {
    if (!progress) return null;
    if (progress.kind === 'send') {
      const total = toNum((progress as any).required_quantity ?? (progress as any).total ?? 0);
      const done = toNum((progress as any).scanned_count ?? 0);
      const remainingRaw = (progress as any).remaining_count ?? (progress as any).remaining;
      const remaining = remainingRaw != null ? toNum(remainingRaw) : Math.max(0, total - done);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { total, done, remaining, pct };
    }
    // Receive endpoints sometimes use different key names. Be defensive.
    const total = toNum((progress as any).total_sent ?? (progress as any).required_quantity ?? (progress as any).total ?? 0);
    const done = toNum((progress as any).received_count ?? (progress as any).scanned_count ?? 0);
    const pendingRaw = (progress as any).pending_count ?? (progress as any).remaining_count ?? (progress as any).remaining;
    const remaining = pendingRaw != null ? toNum(pendingRaw) : Math.max(0, total - done);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, remaining, pct };
  }, [progress]);

  const scanningLocked = useMemo(() => {
    // Lock scanning only when we KNOW the item is complete.
    return !!(stats && stats.total > 0 && stats.remaining <= 0);
  }, [stats]);

  const scannedBarcodeList = useMemo(
    () => (progress?.kind === 'send' ? toArray<any>((progress as any).scanned_barcodes) : []),
    [progress]
  );

  const receivedBarcodeList = useMemo(
    () => (progress?.kind === 'receive' ? toArray<any>((progress as any).received_barcodes) : []),
    [progress]
  );

  // When opening: pick first item and focus input
  useEffect(() => {
    if (!isOpen || !dispatch) return;
    if (!items.length) {
      setSelectedItemId(null);
      setProgress(null);
      return;
    }
    setSelectedItemId(items[0].id);
    setBarcode('');
    setError(null);
    setOverall(null);
    scanQueueRef.current = [];
    scanQueueSetRef.current = new Set();
    scanQueueProcessingRef.current = false;
    setQueuedScanCount(0);
    // focus after paint
    setTimeout(() => inputRef.current?.focus(), 50);

    // In receive mode, auto-check overall progress so the "Complete Delivery" button
    // can become available as soon as all items are received.
    if (mode === 'receive') {
      setTimeout(() => {
        void checkOverallProgress();
      }, 100);
    }
  }, [isOpen, dispatch, items]);

  // Fetch progress when item changes
  useEffect(() => {
    if (!isOpen || !dispatch || !selectedItemId) return;
    void fetchProgress(selectedItemId);
    // item changed => clear queued scans to avoid sending a code to the wrong item
    scanQueueRef.current = [];
    scanQueueSetRef.current = new Set();
    scanQueueProcessingRef.current = false;
    setQueuedScanCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, dispatch?.id, selectedItemId, mode]);

  const fetchProgress = async (itemId: number) => {
    if (!dispatch) return;
    setError(null);
    try {
      if (mode === 'send') {
        const res = await dispatchService.getScannedBarcodes(dispatch.id, itemId);
        const data: any = unpackData(res);
        setProgress({
          kind: 'send',
          ...data,
          scanned_barcodes: toArray(data.scanned_barcodes),
        } as AnyProgress);
      } else {
        const res = await dispatchService.getReceivedBarcodes(dispatch.id, itemId);
        const data: any = unpackData(res);
        setProgress({
          kind: 'receive',
          ...data,
          received_barcodes: toArray(data.received_barcodes),
        } as AnyProgress);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load barcode progress');
      setProgress(null);
    }
  };

  const checkOverallProgress = async () => {
    if (!dispatch?.items?.length) return;
    if (mode !== 'receive') return;
    setCheckingOverall(true);
    setError(null);
    try {
      const results = await Promise.all(
        dispatch.items.map((it) => dispatchService.getReceivedBarcodes(dispatch.id, it.id))
      );
      const pending = results.reduce((sum, r) => {
        const d: any = unpackData(r);
        const total = toNum(d.total_sent ?? d.required_quantity ?? d.total ?? 0);
        const received = toNum(d.received_count ?? d.scanned_count ?? 0);
        const pRaw = d.pending_count ?? d.remaining_count ?? d.remaining;
        const p = pRaw != null ? toNum(pRaw) : Math.max(0, total - received);
        return sum + p;
      }, 0);
      setOverall({ allComplete: pending === 0, pending });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to check overall progress');
    } finally {
      setCheckingOverall(false);
    }
  };

  const playBeep = (type: 'success' | 'error') => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.error('Audio feedback error:', e);
    }
  };

  const scanOneBarcode = async (value: string) => {
    if (!dispatch) return;
    const code = value.trim();
    if (!code) return;

    try {
      if (mode === 'send') {
        // In 'send' mode, we use scanToAddItem which is robust: 
        // it finds the existing item or adds a new one if permitted by the backend.
        const res = await dispatchService.scanToAddItem(dispatch.id, code);
        const data = unpackData(res);
        
        // Update selection to the item that was just scanned/added
        if (data?.dispatch_item_id) {
          setSelectedItemId(Number(data.dispatch_item_id));
        }
        
        // Signal that dispatch items might have changed
        if (onComplete) onComplete();
      } else {
        if (!selectedItemId) {
          throw new Error('Please select an item to receive');
        }
        await dispatchService.receiveBarcode(dispatch.id, selectedItemId, code);
      }
      playBeep('success');
    } catch (e: any) {
      playBeep('error');
      throw new Error(e?.response?.data?.message || e.message || 'Scan failed');
    }
  };

  const processScanQueue = async () => {
    if (!dispatch || (mode === 'receive' && !selectedItemId)) return;
    if (scanQueueProcessingRef.current) return;
    if (scanQueueRef.current.length === 0) return;
    scanQueueProcessingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      while (scanQueueRef.current.length > 0) {
        const next = scanQueueRef.current.shift();
        if (!next) continue;
        scanQueueSetRef.current.delete(next);
        setQueuedScanCount(scanQueueRef.current.length);
        // eslint-disable-next-line no-await-in-loop
        await scanOneBarcode(next);
      }

      setBarcode('');
      if (selectedItemId) {
        await fetchProgress(selectedItemId);
      }
      onComplete?.();

      // In receive mode, auto-refresh overall status after processing a burst
      if (mode === 'receive') {
        void checkOverallProgress();
      }
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
      // keep focus for quick recovery
      setTimeout(() => inputRef.current?.select(), 0);
    } finally {
      scanQueueProcessingRef.current = false;
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const enqueueScan = () => {
    if (!dispatch || !selectedItemId) return;
    const value = barcode.trim();
    if (!value) return;
    if (scanQueueSetRef.current.has(value)) return;
    scanQueueRef.current.push(value);
    scanQueueSetRef.current.add(value);
    setQueuedScanCount(scanQueueRef.current.length);
    // Clear input immediately so the next scan doesn't overwrite
    setBarcode('');
    void processScanQueue();
  };

  const handleCompleteDelivery = async () => {
    if (!dispatch || !onMarkDelivered) return;
    setLoading(true);
    setError(null);
    try {
      await onMarkDelivered(dispatch.id);
      onClose();
    } catch (e: any) {
      // surfacing backend's structured error message is useful for staff
      setError(e?.response?.data?.message || 'Failed to complete delivery');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !dispatch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{header}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Dispatch <span className="font-medium text-gray-900 dark:text-white">{dispatch.dispatch_number}</span> •{' '}
              {dispatch.source_store.name} → {dispatch.destination_store.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          {/* Left: Items */}
          <div className="lg:col-span-1 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 min-h-0">
            <div className="p-6 h-full flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                <Package className="w-4 h-4" /> Items
              </div>
              {items.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No items found in this dispatch.
                </div>
              ) : (
                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {items.map((it) => {
                    const active = it.id === selectedItemId;
                    const hint = mode === 'send'
                      ? it.barcode_scanning
                        ? `${it.barcode_scanning.scanned_count}/${it.barcode_scanning.required_quantity}`
                        : `${it.quantity} planned`
                      : `${it.received_quantity ?? 0}/${it.quantity}`;

                    return (
                      <button
                        key={it.id}
                        onClick={() => setSelectedItemId(it.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                              {it.product.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              SKU: {it.product.sku} • Qty: {it.quantity}
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap mt-0.5">
                            {hint}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {mode === 'receive' && (
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Overall receipt
                    </div>
                    <button
                      onClick={checkOverallProgress}
                      disabled={checkingOverall}
                      className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${checkingOverall ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {overall ? (
                    <div className="mt-2 text-sm">
                      {overall.allComplete ? (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle className="w-4 h-4" /> All items received. Ready to complete delivery.
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4" /> {overall.pending} unit(s) still pending receipt.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Click refresh to check if all items are fully received.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Scanner + List */}
          <div className="lg:col-span-2 p-6">
            {!selectedItem && mode === 'receive' ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Select an item to start scanning.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedItem ? selectedItem.product.name : 'Scan to Add New Item'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {selectedItem 
                        ? `SKU: ${selectedItem.product.sku} • Batch: ${selectedItem.batch.batch_number}`
                        : 'Any scanned barcode will be added to this dispatch if it belongs to the source store.'}
                    </div>
                  </div>

                  {stats && (
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {stats.done}/{stats.total}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{stats.pct}%</div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {stats && (
                  <div className="mt-4">
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${mode === 'send' ? 'bg-blue-600' : 'bg-green-600'}`}
                        style={{ width: `${stats.pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {mode === 'send' ? 'Scanned' : 'Received'}: <span className="font-medium">{stats.done}</span>
                      </span>
                      <span>
                        Remaining: <span className="font-medium">{stats.remaining}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Scanner */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                  <div className="relative">
                    <Scan className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={inputRef}
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        // Scanners commonly use Enter or Tab as suffix. If Tab is used,
                        // the browser would move focus away and subsequent scans go to the wrong field.
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          enqueueScan();
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }
                      }}
                      placeholder={mode === 'send' ? 'Scan barcode to send…' : 'Scan received barcode…'}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      // Do not lock the input even if item is complete, so staff can scan the next item
                      // or use "Scan to Add" flow without manually switching items.
                      disabled={loading}
                    />
                  </div>
                  <button
                    onClick={enqueueScan}
                    disabled={loading || !barcode.trim()}
                    className={`px-4 py-3 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      mode === 'send' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                    {mode === 'send' ? 'Add Scan' : 'Receive'}
                  </button>
                </div>

                {(loading || queuedScanCount > 0) && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {loading ? 'Processing scans' : 'Scans queued'}
                    {queuedScanCount > 0 ? ` • queued: ${queuedScanCount}` : ''}
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                    ❌ {error}
                  </div>
                )}

                {/* Barcode list */}
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {mode === 'send' ? 'Successfully Scanned' : 'Received Barcodes'}
                    </h4>
                    <button
                      onClick={() => selectedItemId && fetchProgress(selectedItemId)}
                      className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>

                  <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {progress && ((progress.kind === 'send' && scannedBarcodeList.length === 0) ||
                        (progress.kind === 'receive' && receivedBarcodeList.length === 0)) ? (
                        <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                          No barcodes scanned yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                          {progress?.kind === 'send' &&
                            scannedBarcodeList.map((b: any, idx) => (
                              <div key={b?.id ?? `${b?.barcode ?? b ?? 'scan'}-${idx}`} className="p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{idx + 1}.</span>
                                  <span className="text-sm font-mono text-gray-900 dark:text-white">{String(b?.barcode ?? b ?? '')}</span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {fmtTime(String(b?.scanned_at ?? ''))}{b?.scanned_by ? ` • ${b.scanned_by}` : ''}
                                </div>
                              </div>
                            ))}

                          {progress?.kind === 'receive' &&
                            receivedBarcodeList.map((b: any, idx) => (
                              <div key={b?.id ?? `${b?.barcode ?? b ?? 'receive'}-${idx}`} className="p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{idx + 1}.</span>
                                  <span className="text-sm font-mono text-gray-900 dark:text-white">{String(b?.barcode ?? b ?? '')}</span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {fmtTime(String(b?.received_at ?? ''))}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Complete delivery button (receive mode only) */}
                {mode === 'receive' && onMarkDelivered && (
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {canCompleteCurrentItem
                        ? 'This item is fully received.'
                        : 'Finish receiving all items, then complete delivery.'}
                    </div>
                    <button
                      onClick={handleCompleteDelivery}
                      disabled={loading || !(overall?.allComplete)}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Complete Delivery
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
