'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Search, Trash2, X, Layers, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import BatchForm from '@/components/BatchForm';
import BatchCard from '@/components/BatchCard';
import batchService, { Batch, CreateBatchData, UpdateBatchData } from '@/services/batchService';
import storeService, { Store } from '@/services/storeService';

interface Product {
  id: number;
  name: string;
}

interface QueuedBatch {
  tempId: string;
  product_id: number;
  product_name: string;
  store_id: number;
  store_name?: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
}

export default function BatchPage() {
  const router = useRouter();

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [stores, setStores] = useState<Store[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [batchSearchQuery, setBatchSearchQuery] = useState('');

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ✅ Bulk mode states (frontend only)
  const [bulkMode, setBulkMode] = useState(false);
  const [queuedBatches, setQueuedBatches] = useState<QueuedBatch[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // Read URL parameters when redirected back from product selection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get('productId');
      const pname = params.get('productName');

      if (pid) setSelectedProductId(Number(pid));
      if (pname) setSelectedProductName(decodeURIComponent(pname));
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredBatches = useMemo(() => {
    const q = batchSearchQuery.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => {
      const productName = String(b.product?.name || '').toLowerCase();
      const productSku = String((b as any).product?.sku || '').toLowerCase();
      const batchNo = String(b.batch_number || '').toLowerCase();
      return productName.includes(q) || productSku.includes(q) || batchNo.includes(q);
    });
  }, [batches, batchSearchQuery]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setLoadingMessage('Loading stores & batches...');

      // Load stores
      const storesResponse = await storeService.getStores({ is_active: true });
      const storesData = storesResponse.data?.data || storesResponse.data || [];
      setStores(storesData);

      // Set first store as default if none selected
      if (storesData.length > 0 && !selectedStoreId) {
        setSelectedStoreId(storesData[0].id);
      }

      // Load batches
      const batchResponse = await batchService.getBatches({
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      const batchData = batchResponse.data?.data || batchResponse.data || [];
      setBatches(Array.isArray(batchData) ? batchData : []);
    } catch (err) {
      console.error('Error loading data:', err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const openProductListForSelection = () => {
    router.push('/product/list?selectMode=true&redirect=/product/batch');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleClear = () => {
    setSelectedProductId(null);
    setSelectedProductName('');
  };

  const selectedProduct = selectedProductId ? { id: selectedProductId, name: selectedProductName } : undefined;
  const selectedStore = selectedStoreId ? stores.find((s) => s.id === selectedStoreId) : undefined;

  // ---------------------------
  // ✅ SINGLE create (existing)
  // ---------------------------
  const handleAddBatch = async (formData: { costPrice: string; sellingPrice: string; quantity: string }) => {
    const { costPrice, sellingPrice, quantity } = formData;

    if (!selectedProductId || !selectedStoreId || !costPrice || !sellingPrice || !quantity) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const costPriceNum = parseFloat(costPrice);
    const sellingPriceNum = parseFloat(sellingPrice);
    const quantityNum = parseInt(quantity);

    // Validate positive numbers
    if (
      isNaN(costPriceNum) ||
      isNaN(sellingPriceNum) ||
      isNaN(quantityNum) ||
      costPriceNum <= 0 ||
      sellingPriceNum <= 0 ||
      quantityNum <= 0
    ) {
      showToast('Please enter valid positive numbers', 'error');
      return;
    }

    try {
      setLoading(true);
      setLoadingMessage('Creating batch and generating barcodes...');

      const batchData: CreateBatchData = {
        product_id: selectedProductId,
        store_id: selectedStoreId,
        quantity: quantityNum,
        cost_price: costPriceNum,
        sell_price: sellingPriceNum,
        // ✅ Generate barcodes during batch creation
        generate_barcodes: true,
        barcode_type: 'CODE128',
        // ✅ Generate individual barcodes for each unit (if quantity <= 100)
        individual_barcodes: quantityNum <= 100,
      };

      const response = await batchService.createBatch(batchData);

      // Reload batches to get the newly created batch with barcodes
      await loadInitialData();

      showToast(
        `Batch created successfully! ${response.data?.barcodes_generated ?? ''} barcode(s) generated.`,
        'success'
      );

      // Clear selection
      handleClear();
    } catch (err: any) {
      console.error('Failed to create batch:', err);
      showToast(err.response?.data?.message || 'Failed to create batch', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // ---------------------------
  // ✅ BULK: add to queue
  // ---------------------------
  const handleQueueAdd = async (formData: { costPrice: string; sellingPrice: string; quantity: string }) => {
    const { costPrice, sellingPrice, quantity } = formData;

    if (!selectedProductId || !selectedStoreId || !costPrice || !sellingPrice || !quantity) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const costPriceNum = parseFloat(costPrice);
    const sellingPriceNum = parseFloat(sellingPrice);
    const quantityNum = parseInt(quantity);

    if (
      isNaN(costPriceNum) ||
      isNaN(sellingPriceNum) ||
      isNaN(quantityNum) ||
      costPriceNum <= 0 ||
      sellingPriceNum <= 0 ||
      quantityNum <= 0
    ) {
      showToast('Please enter valid positive numbers', 'error');
      return;
    }

    // prevent duplicate same product+store in queue (optional safety)
    const exists = queuedBatches.some(
      (q) => q.product_id === selectedProductId && q.store_id === selectedStoreId
    );
    if (exists) {
      showToast('This product is already in the queue for the selected store', 'error');
      return;
    }

    const store = stores.find((s) => s.id === selectedStoreId);

    const item: QueuedBatch = {
      tempId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      product_id: selectedProductId,
      product_name: selectedProductName || `Product #${selectedProductId}`,
      store_id: selectedStoreId,
      store_name: (store as any)?.name,
      quantity: quantityNum,
      cost_price: costPriceNum,
      sell_price: sellingPriceNum,
    };

    setQueuedBatches((prev) => [item, ...prev]);

    showToast(`Added to queue (${queuedBatches.length + 1})`, 'success');

    // Clear selected product so user can quickly pick next one
    handleClear();
  };

  const removeQueuedItem = (tempId: string) => {
    setQueuedBatches((prev) => prev.filter((x) => x.tempId !== tempId));
  };

  const clearQueue = () => {
    setQueuedBatches([]);
    setBulkProgress(null);
  };

  const createQueuedBatches = async () => {
    if (queuedBatches.length === 0) {
      showToast('Queue is empty', 'error');
      return;
    }

    setLoading(true);
    setLoadingMessage(`Creating ${queuedBatches.length} batch(es) and generating barcodes...`);
    setBulkProgress({ done: 0, total: queuedBatches.length });

    let successCount = 0;
    const failed: QueuedBatch[] = [];

    try {
      // ✅ sequential is safer (rate limit / server load)
      for (let i = 0; i < queuedBatches.length; i++) {
        const q = queuedBatches[i];

        const payload: CreateBatchData = {
          product_id: q.product_id,
          store_id: q.store_id,
          quantity: q.quantity,
          cost_price: q.cost_price,
          sell_price: q.sell_price,
          generate_barcodes: true,
          barcode_type: 'CODE128',
          individual_barcodes: q.quantity <= 100,
        };

        try {
          await batchService.createBatch(payload);
          successCount += 1;
        } catch (err) {
          console.error('Bulk create failed for:', q, err);
          failed.push(q);
        } finally {
          setBulkProgress({ done: i + 1, total: queuedBatches.length });
        }
      }

      await loadInitialData();

      // Keep only failed rows so user can retry quickly
      setQueuedBatches(failed);

      if (failed.length === 0) {
        showToast(`Created ${successCount} batch(es) successfully`, 'success');
        setBulkProgress(null);
      } else {
        showToast(`Created ${successCount}, failed ${failed.length} (failed kept in queue)`, 'error');
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // ---------------------------
  // Edit/Delete (existing)
  // ---------------------------
  const handleEditBatch = async (batchId: number, data: UpdateBatchData) => {
    try {
      const response = await batchService.updateBatch(batchId, data);

      setBatches((prev) => prev.map((b) => (b.id === batchId ? response.data : b)));
      showToast('Batch updated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to update batch:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update batch';
      showToast(errorMsg, 'error');
      throw err;
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    try {
      await batchService.deleteBatch(batchId);
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      showToast('Batch deactivated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to delete batch:', err);
      const errorMsg = err.response?.data?.message || 'Failed to delete batch';
      showToast(errorMsg, 'error');
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-y-auto p-6">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Batches</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {bulkMode
                    ? 'Bulk mode: queue multiple products, then create all at once'
                    : 'Create a batch and generate barcodes automatically'}
                </p>
              </div>

              {/* ✅ Mode Toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkMode(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    !bulkMode
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => setBulkMode(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    bulkMode
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Bulk
                </button>
              </div>
            </div>

            <BatchForm
              selectedProduct={selectedProduct}
              selectedStore={selectedStore}
              stores={stores}
              onProductClick={openProductListForSelection}
              onStoreChange={setSelectedStoreId}
              onAddBatch={bulkMode ? handleQueueAdd : handleAddBatch}
              onClear={handleClear}
              loading={loading}
            />

            {/* ✅ Loading indicator with progress */}
            {loading && (
              <div className="mb-4 flex items-center justify-center py-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-blue-600 dark:text-blue-400">
                  {loadingMessage || 'Working...'}
                  {bulkProgress ? ` (${bulkProgress.done}/${bulkProgress.total})` : ''}
                </span>
              </div>
            )}

            {/* ✅ Bulk Queue Panel */}
            {bulkMode && (
              <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Queue</h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {queuedBatches.length} item{queuedBatches.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearQueue}
                      disabled={queuedBatches.length === 0 || loading}
                      className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      Clear
                    </button>

                    <button
                      onClick={createQueuedBatches}
                      disabled={queuedBatches.length === 0 || loading}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create All ({queuedBatches.length})
                    </button>
                  </div>
                </div>

                {queuedBatches.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    Add products one by one (form → select product → fill qty/prices → submit) to build the queue.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {queuedBatches.map((q) => (
                      <div
                        key={q.tempId}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-white truncate">
                            {q.product_name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Store: {q.store_name || q.store_id} • Qty: {q.quantity} • Cost: {q.cost_price} • Sell: {q.sell_price}
                          </div>
                        </div>

                        <button
                          onClick={() => removeQueuedItem(q.tempId)}
                          disabled={loading}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Small hint */}
                <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>
                    In bulk create, if any item fails, it will stay in the queue so you can retry quickly.
                  </span>
                </div>
              </div>
            )}

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-end gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Batches</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}
                  {batchSearchQuery.trim() ? <span className="ml-1">(filtered)</span> : null}
                </span>
              </div>

              {/* Search (Product-wise / Batch-wise) */}
              <div className="w-full md:w-[420px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={batchSearchQuery}
                    onChange={(e) => setBatchSearchQuery(e.target.value)}
                    placeholder="Search by product name, SKU, or batch number..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBatches.length === 0 && !loading ? (
                <div className="col-span-3 text-center py-12 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">
                    {batchSearchQuery.trim() ? 'No batches match your search' : 'No batches created yet'}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                    {batchSearchQuery.trim()
                      ? 'Try a different keyword (product name / SKU / batch number).'
                      : 'Create your first batch to get started'}
                  </p>
                </div>
              ) : (
                filteredBatches.map((batch) => (
                  <BatchCard key={batch.id} batch={batch} onDelete={handleDeleteBatch} onEdit={handleEditBatch} />
                ))
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-xl text-white transform transition-all duration-300 z-50 ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } animate-slideIn`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <X className="w-6 h-6" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
