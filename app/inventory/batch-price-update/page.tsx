'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Search, Loader2, Save, CheckCircle2, AlertCircle, Pencil, X, Check } from 'lucide-react';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

import productService, { Product as FullProduct } from '@/services/productService';
import batchService, { Batch } from '@/services/batchService';

type ProductPick = {
  id: number;
  name: string;
  sku?: string;
};

type UpdateRow = {
  batch_id: number;
  batch_number: string | null;
  store: string;
  old_price: string;
  new_price: string;
};

export default function BatchPriceUpdatePage() {
  // Layout states (required by your Header/Sidebar)
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Product search/select
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductPick | null>(null);

  // Variations with same SKU (so you can apply price to multiple variations without backend changes)
  const [skuGroupProducts, setSkuGroupProducts] = useState<ProductPick[]>([]);
  const [selectedVariationIds, setSelectedVariationIds] = useState<number[]>([]);

  // Batches
  const [batches, setBatches] = useState<Batch[]>([]);

  // Per-batch cost price editing
  const [costEditBatchId, setCostEditBatchId] = useState<number | null>(null);
  const [costEditValue, setCostEditValue] = useState('');
  const [costSavingBatchId, setCostSavingBatchId] = useState<number | null>(null);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  // Update price
  const [sellPrice, setSellPrice] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // UI messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);

  // Debounced product search
  useEffect(() => {
    setError(null);
    setSuccessMsg(null);

    const q = search.trim();
    if (q.length < 2) {
      setProducts([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        setIsSearching(true);

        const res = await productService.getAll({
          search: q,
          per_page: 10,
        });

        // productService already normalizes to array
        const list = (res?.data || []) as FullProduct[];
        const mapped: ProductPick[] = list.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
        }));

        setProducts(mapped);
      } catch (e: any) {
        setError(e?.message || 'Failed to search products.');
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [search]);

  // Load batches when product selected
  useEffect(() => {
    const load = async () => {
      if (!selectedProduct?.id) {
        setBatches([]);
        setUpdates([]);
        setSellPrice('');
        return;
      }

      try {
        setIsLoadingBatches(true);
        setError(null);
        setSuccessMsg(null);
        setUpdates([]);

        const list = await batchService.getBatchesArray({
          product_id: selectedProduct.id,
          per_page: 200,
        });

        setBatches(list);

        // Prefill price if all batches have same sell_price
        const prices = list
          .map((b) => (b.sell_price ?? '').toString().trim())
          .filter(Boolean);

        const unique = Array.from(new Set(prices));
        if (unique.length === 1) setSellPrice(unique[0]);
        else setSellPrice('');
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load batches.');
        setBatches([]);
      } finally {
        setIsLoadingBatches(false);
      }
    };

    load();
  }, [selectedProduct?.id]);


  // Load SKU-group variations when product selected (for bulk price update across variations)
  useEffect(() => {
    const loadSkuGroup = async () => {
      const sku = String(selectedProduct?.sku || '').trim();
      if (!sku) {
        setSkuGroupProducts([]);
        setSelectedVariationIds([]);
        return;
      }

      try {
        const res = await productService.getAll({ search: sku, per_page: 200 });
        const list = (res?.data || []) as FullProduct[];
        const exact = list
          .filter((p) => String(p.sku || '').trim() === sku)
          .map((p) => ({ id: p.id, name: p.name, sku: p.sku } as ProductPick));

        setSkuGroupProducts(exact);
        setSelectedVariationIds(exact.map((p) => p.id)); // default: select all, user can uncheck
      } catch (e) {
        console.error('Failed to load SKU group products', e);
        setSkuGroupProducts([]);
        setSelectedVariationIds([]);
      }
    };

    loadSkuGroup();
  }, [selectedProduct?.id, selectedProduct?.sku]);

  const startCostEdit = (batch: Batch) => {
    setError(null);
    setSuccessMsg(null);
    setCostEditBatchId(batch.id);
    setCostEditValue(String(batch.cost_price ?? ''));
  };

  const cancelCostEdit = () => {
    setCostEditBatchId(null);
    setCostEditValue('');
    setCostSavingBatchId(null);
  };

  const saveCostPrice = async (batch: Batch) => {
    const costNum = Number(costEditValue);
    if (!costEditValue || Number.isNaN(costNum) || costNum < 0) {
      setError('Enter a valid cost price (0 or greater).');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setCostSavingBatchId(batch.id);

    try {
      await batchService.updateBatch(batch.id, { cost_price: costNum });
      setBatches((prev) => prev.map((b) => (b.id === batch.id ? { ...b, cost_price: String(costNum) } : b)));
      setSuccessMsg(`Cost price updated for batch ${batch.batch_number}.`);
      cancelCostEdit();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || 'Failed to update cost price.');
      setCostSavingBatchId(null);
    }
  };

  const summary = useMemo(() => {
    if (!batches.length) return null;

    const prices = batches
      .map((b) => Number(b.sell_price))
      .filter((n) => !Number.isNaN(n));

    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;

    const totalQty = batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);

    return {
      count: batches.length,
      totalQty,
      min,
      max,
    };
  }, [batches]);


  const toggleVariationSelect = (id: number) => {
    setSelectedVariationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllVariations = () => setSelectedVariationIds(skuGroupProducts.map((p) => p.id));
  const selectNoVariations = () => setSelectedVariationIds([]);

  const onSelectProduct = (p: ProductPick) => {
    setSelectedProduct(p);
    setProducts([]);
    setSearch(`${p.name}${p.sku ? ` (${p.sku})` : ''}`);
  };

  const onApply = async () => {
    setError(null);
    setSuccessMsg(null);
    setUpdates([]);

    if (!selectedProduct?.id) {
      setError('Select a product first.');
      return;
    }

    const priceNum = Number(sellPrice);
    if (!sellPrice || Number.isNaN(priceNum) || priceNum < 0) {
      setError('Enter a valid selling price (0 or greater).');
      return;
    }

    try {
      setIsSaving(true);

      const targetIdsRaw = selectedVariationIds.length ? selectedVariationIds : [selectedProduct.id];
      const targetIds = Array.from(new Set(targetIdsRaw));

      let firstSuccess: any = null;

      for (const pid of targetIds) {
        const res = await batchService.updateAllBatchPrices(pid, priceNum);
        if (!res?.success) {
          throw new Error(res?.message || `Failed to update batch prices for product ${pid}.`);
        }
        if (!firstSuccess) firstSuccess = res;
      }

      setSuccessMsg(
        targetIds.length > 1
          ? `Updated selling price for all batches of ${targetIds.length} variations (same SKU).`
          : (firstSuccess?.message || 'Updated selling price for all batches.')
      );

      
      sessionStorage.setItem('product_list_refresh_needed', '1');
// Show update rows from the first response (usually enough for verification)
      setUpdates(((firstSuccess?.data?.updates || []) as UpdateRow[]) || []);

      // Reload batches for the currently selected product (so table reflects new price)
      const list = await batchService.getBatchesArray({
        product_id: selectedProduct.id,
        per_page: 200,
      });
      setBatches(list);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update batch prices.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Bulk Batch Selling Price Update
              </h1>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Update <span className="font-semibold">sell_price</span> for every batch of a selected product.
                This impacts Ecommerce + Social Commerce + POS wherever batch pricing is used.
              </p>

              {/* Alerts */}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="text-red-700 dark:text-red-200">{error}</div>
                </div>
              )}
              {successMsg && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div className="text-emerald-800 dark:text-emerald-200">{successMsg}</div>
                </div>
              )}

              {/* Product Search */}
              <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedProduct(null);
                    }}
                    placeholder="Search product by name / SKU (type 2+ chars)..."
                    className="w-full rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100"
                  />
                  {isSearching && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                </div>

                {/* Search Results */}
                {products.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onSelectProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          ID: {p.id} {p.sku ? `• SKU: ${p.sku}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Product + Summary */}
                {selectedProduct && (
                  <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Selected product</div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {selectedProduct.name}{' '}
                          {selectedProduct.sku ? (
                            <span className="text-gray-500 dark:text-gray-400">({selectedProduct.sku})</span>
                          ) : null}
                        </div>
                      </div>

                      {isLoadingBatches ? (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading batches...
                        </div>
                      ) : summary ? (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          <div>
                            Batches: <span className="font-semibold">{summary.count}</span>
                          </div>
                          <div>
                            Total Qty: <span className="font-semibold">{summary.totalQty}</span>
                          </div>
                          <div>
                            Price Range:{' '}
                            <span className="font-semibold">
                              {summary.min !== null ? summary.min.toFixed(2) : 'N/A'} -{' '}
                              {summary.max !== null ? summary.max.toFixed(2) : 'N/A'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">No batch data found.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Update Price */}
              <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Set new selling price</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Applies to all batches of the selected product.
                </p>


                {selectedProduct?.sku && skuGroupProducts.length > 1 && (
                  <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">
                          Apply price to multiple variations (same SKU)
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          SKU: <span className="font-medium">{selectedProduct.sku}</span> • Select which variations to update
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllVariations}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={selectNoVariations}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors"
                        >
                          Select none
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-auto pr-1">
                      {skuGroupProducts.map((vp) => (
                        <label
                          key={vp.id}
                          className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40 px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVariationIds.includes(vp.id)}
                            onChange={() => toggleVariationSelect(vp.id)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {vp.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">ID: {vp.id}</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      Selected: <span className="font-semibold">{selectedVariationIds.length}</span> variation(s).
                      If you select none, the price update applies only to the currently selected product.
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                      Selling Price (BDT)
                    </label>
                    <input
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 1299.00"
                      className="w-full rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100"
                      disabled={!selectedProduct || isSaving}
                    />
                  </div>

                  <button
                    onClick={onApply}
                    disabled={!selectedProduct || isSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 font-semibold text-white"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Apply to all batches
                  </button>
                </div>
              </div>

              {/* Per-batch cost price update */}
              {selectedProduct && (
                <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Update cost price (specific batch)
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Cost price changes only the selected batch. Selling price changes all batches using the button above.
                      </p>
                    </div>

                    {isLoadingBatches && (
                      <div className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading batches...
                      </div>
                    )}
                  </div>

                  {!isLoadingBatches && batches.length === 0 && (
                    <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-400">
                      No batches found for this product.
                    </div>
                  )}

                  {!isLoadingBatches && batches.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/40">
                          <tr className="text-left">
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Batch No</th>
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Store</th>
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Qty</th>
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Cost Price</th>
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Sell Price</th>
                            <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map((b) => {
                            const isEditing = costEditBatchId === b.id;
                            const isRowSaving = costSavingBatchId === b.id;
                            return (
                              <tr key={b.id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{b.batch_number || `#${b.id}`}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{b.store?.name || '-'}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{b.quantity ?? '-'}</td>
                                <td className="px-3 py-2">
                                  {isEditing ? (
                                    <input
                                      value={costEditValue}
                                      onChange={(e) => setCostEditValue(e.target.value)}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      className="w-32 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-gray-900 dark:text-white"
                                    />
                                  ) : (
                                    <span className="text-gray-900 dark:text-gray-100">{b.cost_price ?? '-'}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{b.sell_price ?? '-'}</td>
                                <td className="px-3 py-2">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => saveCostPrice(b)}
                                        disabled={isRowSaving}
                                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2 py-1 font-semibold text-white"
                                      >
                                        {isRowSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        Save
                                      </button>
                                      <button
                                        onClick={cancelCostEdit}
                                        disabled={isRowSaving}
                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-gray-800 dark:text-gray-200"
                                      >
                                        <X className="h-4 w-4" /> Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startCostEdit(b)}
                                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-gray-800 dark:text-gray-200"
                                    >
                                      <Pencil className="h-4 w-4" /> Edit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Updated list */}
              {updates.length > 0 && (
                <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Updated batches</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Backend response: per-batch old → new prices.
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr className="text-left">
                          <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Batch ID</th>
                          <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Batch No</th>
                          <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Store</th>
                          <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">Old</th>
                          <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">New</th>
                        </tr>
                      </thead>
                      <tbody>
                        {updates.map((u) => (
                          <tr key={u.batch_id} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{u.batch_id}</td>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{u.batch_number || '-'}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{u.store}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{u.old_price}</td>
                            <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{u.new_price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
