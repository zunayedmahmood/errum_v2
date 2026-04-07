import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2, RefreshCw, Scan, RotateCcw, AlertTriangle } from 'lucide-react';
import { Store } from '@/services/storeService';
import batchService from '@/services/batchService';
import barcodeService from '@/services/barcodeService';
import { toast } from 'react-hot-toast';

interface DispatchItem {
  batch_id: string;
  batch_number: string;
  product_name: string;
  quantity: string;
  available_quantity: number;
}

interface CreateDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  stores: Store[];
  loading: boolean;
  defaultSourceStoreId?: number;
}

type AddMode = 'batch' | 'barcode';

type ScanEntry = {
  barcode: string;
  batch_id: string;
  batch_number: string;
  product_name: string;
  scanned_at: string;
};

const CreateDispatchModal: React.FC<CreateDispatchModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  stores,
  loading,
  defaultSourceStoreId,
}) => {
  const [formData, setFormData] = useState({
    source_store_id: '',
    destination_store_id: '',
    expected_delivery_date: '',
    carrier_name: '',
    tracking_number: '',
    notes: '',
  });

  const [items, setItems] = useState<DispatchItem[]>([]);

  // Only for UI convenience while creating dispatch (does NOT replace send/receive scan flow).
  type AddMode = 'batch' | 'barcode';
  type ScanEntry = {
    barcode: string;
    batch_id: string;
    batch_number: string;
    product_name: string;
    scanned_at: string;
  };

  const [addMode, setAddMode] = useState<AddMode>('batch');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanEntry[]>([]);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // IMPORTANT: hardware barcode scanners often "type" the next barcode instantly.
  // If we lock the input while an API call is in-flight, subsequent scans are lost.
  // So we keep a small in-memory queue and process scans sequentially.
  const scanQueueRef = useRef<string[]>([]);
  const scanQueueSetRef = useRef<Set<string>>(new Set());
  const scanQueueProcessingRef = useRef(false);
  const [queuedScanCount, setQueuedScanCount] = useState(0);

  const scannedSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of scanHistory) s.add(it.barcode);
    return s;
  }, [scanHistory]);
  const [currentItem, setCurrentItem] = useState({
    batch_id: '',
    quantity: '',
  });
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchData, setBatchData] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        source_store_id: '',
        destination_store_id: '',
        expected_delivery_date: '',
        carrier_name: '',
        tracking_number: '',
        notes: '',
      });
      setItems([]);
      setCurrentItem({ batch_id: '', quantity: '' });
      setBatchData(null);
      setAvailableBatches([]);
      setAddMode('batch');
      setScanInput('');
      setScanError(null);
      setScanning(false);
      setScanHistory([]);
      // reset queued scans (otherwise pending scans from a previous open can leak)
      scanQueueRef.current = [];
      scanQueueSetRef.current = new Set();
      scanQueueProcessingRef.current = false;
      setQueuedScanCount(0);
    } else if (isOpen && defaultSourceStoreId) {
      setFormData(prev => ({
        ...prev,
        source_store_id: defaultSourceStoreId.toString(),
      }));
    }
  }, [isOpen, defaultSourceStoreId]);

  useEffect(() => {
    if (formData.source_store_id) {
      fetchAvailableBatches();
    } else {
      setAvailableBatches([]);
      setBatchData(null);
      setCurrentItem({ batch_id: '', quantity: '' });
    }

    // barcode scan UI depends on source store
    setScanInput('');
    setScanError(null);
    setScanHistory([]);
    scanQueueRef.current = [];
    scanQueueSetRef.current = new Set();
    scanQueueProcessingRef.current = false;
    setQueuedScanCount(0);
  }, [formData.source_store_id]);

  const fetchAvailableBatches = async () => {
    if (!formData.source_store_id) return;

    try {
      setBatchLoading(true);
      const response = await batchService.getBatches({
        store_id: parseInt(formData.source_store_id),
        status: 'available',
        sort_by: 'created_at',
        sort_order: 'desc',
        per_page: 100,
      });

      const batches = response.data.data || [];
      setAvailableBatches(batches);
    } catch (error) {
      console.error('Error fetching batches:', error);
      alert('Failed to fetch available batches');
      setAvailableBatches([]);
    } finally {
      setBatchLoading(false);
    }
  };

  // Fetch full batch details when batch is selected from dropdown
  useEffect(() => {
    const fetchBatchDetails = async () => {
      if (currentItem.batch_id) {
        try {
          // Fetch full batch details with barcodes
          const response = await batchService.getBatch(parseInt(currentItem.batch_id));
          const batch = response.data;

          // Filter to count only active barcodes
          if (batch.barcode && Array.isArray(batch.barcode)) {
            const activeBarcodes = batch.barcode.filter(
              (barcode: any) => barcode.is_active === true
            );

            const filteredBatch = {
              ...batch,
              quantity: activeBarcodes.length, // Update to active count
              original_quantity: batch.quantity, // Keep original
              active_barcodes_count: activeBarcodes.length,
              barcodes: activeBarcodes, // Only active barcodes
            };

            setBatchData(filteredBatch);
          } else {
            setBatchData(batch);
          }
        } catch (error) {
          console.error('Error fetching batch details:', error);
          alert('Failed to load batch details');
          setBatchData(null);
        }
      } else {
        setBatchData(null);
      }
    };

    fetchBatchDetails();
  }, [currentItem.batch_id]);

  const addItem = () => {
    if (addMode !== 'batch') return;

    if (!batchData || !currentItem.quantity) {
      alert('Please select a batch and enter quantity');
      return;
    }

    const quantityToAdd = parseInt(currentItem.quantity);
    const existingItemIndex = items.findIndex((item) => item.batch_id === currentItem.batch_id);

    if (existingItemIndex !== -1) {
      // Merge with existing item
      const existingItem = items[existingItemIndex];
      const newQuantity = parseInt(existingItem.quantity) + quantityToAdd;
      
      if (newQuantity > (existingItem.available_quantity || batchData.quantity)) {
        alert(`Cannot add more. Total would exceed batch limit (${batchData.quantity} active units available)`);
        return;
      }

      const updatedItems = [...items];
      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity.toString(),
      };
      setItems(updatedItems);
    } else {
      // Add new item
      if (quantityToAdd > batchData.quantity) {
        alert(`Only ${batchData.quantity} active units available`);
        return;
      }

      const newItem: DispatchItem = {
        batch_id: batchData.id.toString(),
        batch_number: batchData.batch_number,
        product_name: batchData.product.name,
        quantity: currentItem.quantity,
        available_quantity: batchData.quantity,
      };

      setItems([...items, newItem]);
    }

    setCurrentItem({ batch_id: '', quantity: '' });
    setBatchData(null);
  };

  const scanOneBarcode = async (value: string) => {
    const code = value.trim();
    if (!code) return;

    if (!formData.source_store_id) {
      setScanError('Select the Source Store first, then scan.');
      return;
    }

    setScanError(null);

    try {
      // Double-check duplicates (covers edge cases when scans were queued very fast)
      if (scannedSet.has(code)) {
        setScanError('This barcode is already scanned in this dispatch draft.');
        return;
      }

      const res = await barcodeService.scanBarcode(code);
      if (!res?.success) {
        setScanError(`(${code}) ${res?.message || 'Barcode not found'}`);
        return;
      }

      const data = res.data;
      const sourceId = Number(formData.source_store_id);
      const locationId = data?.current_location?.id;

      if (!locationId || locationId !== sourceId) {
        setScanError(`(${code}) Barcode is not currently at the selected source store.`);
        return;
      }

      if (!data?.current_batch?.id) {
        setScanError(`(${code}) This barcode is not linked to any active batch.`);
        return;
      }

      if (!data?.is_available) {
        setScanError(`(${code}) This barcode is not available for dispatch.`);
        return;
      }

      const batchId = String(data.current_batch.id);
      const batchNumber = data.current_batch.batch_number;
      const productName = data.product?.name || 'Unknown Product';

      const availableQty = Number(
        typeof data.quantity_available === 'number'
          ? data.quantity_available
          : data.current_batch.quantity_available ?? 0
      );

      setItems((prev) => {
        const idx = prev.findIndex((it) => it.batch_id === batchId);

        if (idx === -1) {
          return [
            ...prev,
            {
              batch_id: batchId,
              batch_number: batchNumber,
              product_name: productName,
              quantity: '1',
              available_quantity: availableQty,
            },
          ];
        }

        const next = [...prev];
        const existing = next[idx];
        const existingQty = Number.parseInt(existing.quantity || '0', 10) || 0;
        const nextQty = existingQty + 1;

        const maxAllowed = existing.available_quantity || availableQty;
        if (maxAllowed > 0 && nextQty > maxAllowed) {
          setScanError(`Batch limit reached. Only ${maxAllowed} active unit(s) available.`);
          return prev;
        }

        next[idx] = {
          ...existing,
          quantity: String(nextQty),
          available_quantity: maxAllowed,
        };
        return next;
      });

      setScanHistory((prev) => [
        {
          barcode: code,
          batch_id: batchId,
          batch_number: batchNumber,
          product_name: productName,
          scanned_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      setScanError(`(${code}) ${err?.response?.data?.message || err?.message || 'Failed to scan barcode'}`);
    }
  };

  const processScanQueue = async () => {
    if (scanQueueProcessingRef.current) return;
    if (scanQueueRef.current.length === 0) return;
    scanQueueProcessingRef.current = true;
    setScanning(true);

    try {
      while (scanQueueRef.current.length > 0) {
        const next = scanQueueRef.current.shift();
        if (!next) continue;
        scanQueueSetRef.current.delete(next);
        setQueuedScanCount(scanQueueRef.current.length);
        // eslint-disable-next-line no-await-in-loop
        await scanOneBarcode(next);
      }
    } finally {
      scanQueueProcessingRef.current = false;
      setScanning(false);
      // keep the input focused for hardware scanners
      setTimeout(() => scanInputRef.current?.focus(), 0);
    }
  };

  const enqueueBarcodeScan = () => {
    const value = scanInput.trim();
    if (!value) return;

    if (!formData.source_store_id) {
      setScanError('Select the Source Store first, then scan.');
      return;
    }

    // Clear the input immediately so the next scan doesn't overwrite the previous one.
    setScanInput('');

    // Prevent duplicates across already-scanned + queued
    if (scannedSet.has(value) || scanQueueSetRef.current.has(value)) {
      setScanError('This barcode is already scanned in this dispatch draft.');
      return;
    }

    setScanError(null);
    scanQueueRef.current.push(value);
    scanQueueSetRef.current.add(value);
    setQueuedScanCount(scanQueueRef.current.length);
    void processScanQueue();
  };

  const removeLastScan = () => {
    const last = scanHistory[0];
    if (!last) return;

    setScanHistory((prev) => prev.slice(1));
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.batch_id === last.batch_id);
      if (idx === -1) return prev;
      const next = [...prev];
      const item = next[idx];
      const existingQty = Number.parseInt(item.quantity || '0', 10) || 0;
      const nextQty = Math.max(0, existingQty - 1);
      if (nextQty === 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...item, quantity: String(nextQty) };
      }
      return next;
    });
  };

  const clearScans = () => {
    // Reduce quantities only for items added via scans. Since we don't know which were manual,
    // safest behavior: clear scan list only (does not auto-remove items).
    setScanHistory([]);
    setScanError(null);
  };

  const removeItem = (index: number) => {
    const removed = items[index];
    setItems(items.filter((_, i) => i !== index));
    if (removed?.batch_id) {
      setScanHistory((prev) => prev.filter((s) => s.batch_id !== removed.batch_id));
    }
  };

  const handleSubmit = () => {
    if (isSubmitting) return;

    if (
      !formData.source_store_id ||
      !formData.destination_store_id ||
      items.length === 0
    ) {
      alert('Please fill in all required fields and add at least one item');
      return;
    }

    setIsSubmitting(true);
    onSubmit({
      ...formData,
      items,
      // If you scanned barcodes while creating (quick-add), we will attach those scans to the created dispatch items immediately (DB).
      draft_scan_history: scanHistory,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full my-8">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create Dispatch
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Store Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source Store *
                {defaultSourceStoreId && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Pre-selected)</span>
                )}
              </label>
              <select
                value={formData.source_store_id}
                onChange={(e) =>
                  setFormData({ ...formData, source_store_id: e.target.value })
                }
                disabled={!!defaultSourceStoreId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                <option value="">Select Source Store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Destination Store *
              </label>
              <select
                value={formData.destination_store_id}
                onChange={(e) =>
                  setFormData({ ...formData, destination_store_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select Destination Store</option>
                {stores
                  .filter((s) => s.id.toString() !== formData.source_store_id)
                  .map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Delivery & Tracking Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={formData.expected_delivery_date}
                onChange={(e) =>
                  setFormData({ ...formData, expected_delivery_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Carrier Name
              </label>
              <input
                type="text"
                value={formData.carrier_name}
                onChange={(e) =>
                  setFormData({ ...formData, carrier_name: e.target.value })
                }
                placeholder="DHL, FedEx, etc."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tracking Number
            </label>
            <input
              type="text"
              value={formData.tracking_number}
              onChange={(e) =>
                setFormData({ ...formData, tracking_number: e.target.value })
              }
              placeholder="Enter tracking number"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>

          {/* Add Items Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">
                Add Items
              </h3>
              {formData.source_store_id && (
                <button
                  onClick={fetchAvailableBatches}
                  disabled={batchLoading}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${batchLoading ? 'animate-spin' : ''}`} />
                  Refresh Batches
                </button>
              )}
            </div>

            {/* Add mode toggle (manual batch vs barcode scan) */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setAddMode('batch');
                  setScanError(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${addMode === 'batch'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                Select Batch
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode('barcode');
                  setScanError(null);
                  setTimeout(() => scanInputRef.current?.focus(), 0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${addMode === 'barcode'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
              >
                <Scan className="w-3.5 h-3.5" /> Scan Barcodes
              </button>
              {addMode === 'barcode' && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Each scan adds <b>1 unit</b> to the matching batch. These scans will be attached to the dispatch right after you click <b>Create Dispatch</b>.
                </span>
              )}
            </div>

            {addMode === 'barcode' && (
              <div className="mb-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <div className="relative group">
                      <Scan className={`absolute left-3 top-2.5 w-4 h-4 transition-colors ${!formData.source_store_id ? 'text-gray-400' : 'text-indigo-500 group-hover:animate-pulse'}`} />
                      <input
                        ref={scanInputRef}
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            enqueueBarcodeScan();
                            setTimeout(() => scanInputRef.current?.focus(), 0);
                          }
                        }}
                        className={`w-full pl-10 pr-3 py-2 rounded-lg border text-sm transition-all focus:ring-2 focus:ring-indigo-500/20 active:scale-[0.99] ${!formData.source_store_id
                            ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-60'
                            : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:border-indigo-500'
                          }`}
                        placeholder={formData.source_store_id ? 'Scan/Type barcode and press Enter…' : 'Select source store first'}
                        disabled={!formData.source_store_id}
                      />
                      {!formData.source_store_id && (
                        <div className="absolute inset-0 z-10 cursor-not-allowed" onClick={() => toast.error('Please select a Source Store first')} />
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={enqueueBarcodeScan}
                      disabled={!formData.source_store_id || !scanInput.trim()}
                      className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg text-sm flex items-center justify-center"
                      title="Scan & add"
                    >
                      <Scan className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 flex gap-2">
                    <button
                      type="button"
                      onClick={removeLastScan}
                      disabled={scanHistory.length === 0 || scanning}
                      className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 rounded-lg text-sm flex items-center justify-center"
                      title="Undo last scan"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={clearScans}
                      disabled={scanHistory.length === 0 || scanning}
                      className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 rounded-lg text-xs"
                      title="Clear scan list"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {scanError && (
                  <div className="mt-2 p-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <div>{scanError}</div>
                  </div>
                )}

                {(scanning || queuedScanCount > 0) && (
                  <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
                    {scanning ? 'Processing scans' : 'Scans queued'}
                    {queuedScanCount > 0 ? ` • queued: ${queuedScanCount}` : ''}
                  </div>
                )}

                {scanHistory.length > 0 && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        Scanned ({scanHistory.length})
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        Latest first
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
                      {scanHistory.map((s, idx) => (
                        <div key={`${s.barcode}-${idx}`} className="px-3 py-2">
                          <div className="text-xs font-mono text-gray-900 dark:text-white truncate">
                            {idx + 1}. {s.barcode}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {s.product_name} • {s.batch_number}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sync hint */}
                {scanHistory.length > 0 && (
                  <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
                    These barcodes will be <b>saved to the dispatch</b> right after you click <b>Create Dispatch</b>.
                  </div>
                )}
              </div>
            )}

            <div className={`grid grid-cols-12 gap-2 mb-3 ${addMode === 'barcode' ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="col-span-6">
                <select
                  value={currentItem.batch_id}
                  onChange={(e) =>
                    setCurrentItem({ ...currentItem, batch_id: e.target.value })
                  }
                  disabled={!formData.source_store_id || batchLoading}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600"
                >
                  <option value="">
                    {batchLoading
                      ? 'Loading batches...'
                      : !formData.source_store_id
                        ? 'Select source store first'
                        : availableBatches.length === 0
                          ? 'No available batches with active items'
                          : 'Select a batch'}
                  </option>
                  {availableBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batch_number} - {batch.product.name} ({batch.quantity} active units)
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <input
                  type="number"
                  value={currentItem.quantity}
                  onChange={(e) =>
                    setCurrentItem({ ...currentItem, quantity: e.target.value })
                  }
                  placeholder="Quantity"
                  disabled={!batchData}
                  min="1"
                  max={batchData?.quantity}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:bg-gray-100 dark:disabled:bg-gray-600"
                />
              </div>
              <div className="col-span-2">
                <button
                  onClick={addItem}
                  disabled={!batchData || !currentItem.quantity}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {batchData && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div>
                      <strong className="text-blue-900 dark:text-blue-300">Product:</strong>{' '}
                      <span className="text-gray-900 dark:text-gray-100">{batchData.product.name}</span>
                    </div>
                    <div>
                      <strong className="text-blue-900 dark:text-blue-300">Batch:</strong>{' '}
                      <span className="font-mono text-gray-900 dark:text-gray-100">{batchData.batch_number}</span>
                    </div>
                    <div>
                      <strong className="text-blue-900 dark:text-blue-300">Available (Active):</strong>{' '}
                      <span className="text-green-600 dark:text-green-400 font-semibold">{batchData.quantity} units</span>
                      {batchData.original_quantity && batchData.original_quantity !== batchData.quantity && (
                        <span className="text-gray-500 dark:text-gray-500 ml-1">
                          (Total: {batchData.original_quantity})
                        </span>
                      )}
                    </div>
                    <div>
                      <strong className="text-blue-900 dark:text-blue-300">Cost Price:</strong>{' '}
                      <span className="text-gray-900 dark:text-gray-100">৳{batchData.cost_price}</span>
                      {' | '}
                      <strong className="text-blue-900 dark:text-blue-300">Sell Price:</strong>{' '}
                      <span className="text-gray-900 dark:text-gray-100">৳{batchData.sell_price}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items List */}
            {items.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                        Batch
                      </th>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                        Product
                      </th>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                        Quantity
                      </th>
                      <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="px-3 py-2 text-gray-900 dark:text-white font-mono text-xs">
                          {item.batch_number}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-white">
                          {item.product_name}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-white">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeItem(index)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          >
                            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || isSubmitting || items.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium"
          >
            {loading || isSubmitting ? 'Creating...' : 'Create Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateDispatchModal;