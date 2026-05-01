'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Search, Loader2, Save, CheckCircle2, AlertCircle, Pencil, X, Check, Tag, HandCoins, Package } from 'lucide-react';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

import productService, { Product as FullProduct } from '@/services/productService';
import batchService, { Batch } from '@/services/batchService';
import GroupedAllBarcodesPrinter, { BatchBarcodeSource } from '@/components/GroupedAllBarcodesPrinter';

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
  const [products, setProducts] = useState<FullProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<FullProduct | null>(null);

  // Variations with same SKU (so you can apply price to multiple variations without backend changes)
  const [skuGroupProducts, setSkuGroupProducts] = useState<FullProduct[]>([]);
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
  const [costPrice, setCostPrice] = useState<string>('');
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
          group_by_sku: true,
          no_pagination: true,
        });

        // Backend now returns grouped structure
        const list = (res?.data || []) as FullProduct[];
        setProducts(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to search products.');
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [search]);

  // Load batches when product selected (now loads ALL variants of the SKU)
  useEffect(() => {
    const load = async () => {
      if (!selectedProduct?.sku) {
        setBatches([]);
        setUpdates([]);
        setSellPrice('');
        setCostPrice('');
        return;
      }

      try {
        setIsLoadingBatches(true);
        setError(null);
        setSuccessMsg(null);
        setUpdates([]);

        // 1. Get all variants for this SKU
        const skuGroup = await productService.getSkuGroup(selectedProduct.id);
        const variants = skuGroup.products || [];
        setSkuGroupProducts(variants);
        setSelectedVariationIds(variants.map(v => v.id));

        // 2. Load batches for ALL variations
        const allBatchesResults = await Promise.all(
          variants.map(v => batchService.getBatchesArray({ product_id: v.id, per_page: 200 }))
        );
        
        const flattenedBatches = allBatchesResults.flat();
        setBatches(flattenedBatches);

        // Prefill sell price if all batches have same sell_price
        const sellPrices = flattenedBatches
          .map((b) => (b.sell_price ?? '').toString().trim())
          .filter(Boolean);
        const uniqueSell = Array.from(new Set(sellPrices));
        if (uniqueSell.length === 1) setSellPrice(uniqueSell[0]);
        else setSellPrice('');

        // Prefill cost price if all batches have same cost_price
        const costPrices = flattenedBatches
          .map((b) => (b.cost_price ?? '').toString().trim())
          .filter(Boolean);
        const uniqueCost = Array.from(new Set(costPrices));
        if (uniqueCost.length === 1) setCostPrice(uniqueCost[0]);
        else setCostPrice('');

      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load batches.');
        setBatches([]);
      } finally {
        setIsLoadingBatches(false);
      }
    };

    load();
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

  const onSelectProduct = (p: FullProduct | ProductPick) => {
    setSelectedProduct(p);
    // Don't clear search results automatically as user might want to pick other variants
  };

  const onApply = async () => {
    setError(null);
    setSuccessMsg(null);
    setUpdates([]);

    if (!selectedProduct?.sku) {
      setError('Select a product SKU first.');
      return;
    }

    const priceNum = Number(sellPrice);
    if (!sellPrice || Number.isNaN(priceNum) || priceNum < 0) {
      setError('Enter a valid selling price (0 or greater).');
      return;
    }

    try {
      setIsSaving(true);
      const targetIds = Array.from(new Set(selectedVariationIds));
      let totalUpdated = 0;
      let allUpdates: UpdateRow[] = [];

      for (const pid of targetIds) {
        const res = await batchService.updateAllBatchPrices(pid, priceNum);
        if (res?.success) {
          totalUpdated += res.data.updated_batches;
          allUpdates = [...allUpdates, ...res.data.updates];
        }
      }

      setSuccessMsg(`Successfully updated selling price for ${totalUpdated} batches across variants.`);
      setUpdates(allUpdates);

      // Reload batches
      const allBatchesResults = await Promise.all(
        skuGroupProducts.map(v => batchService.getBatchesArray({ product_id: v.id, per_page: 200 }))
      );
      setBatches(allBatchesResults.flat());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update selling prices.');
    } finally {
      setIsSaving(false);
    }
  };

  const onApplyCost = async () => {
    setError(null);
    setSuccessMsg(null);
    setUpdates([]);

    if (!selectedProduct?.sku) {
      setError('Select a product SKU first.');
      return;
    }

    const costNum = Number(costPrice);
    if (!costPrice || Number.isNaN(costNum) || costNum < 0) {
      setError('Enter a valid cost price (0 or greater).');
      return;
    }

    try {
      setIsSaving(true);
      const targetIds = Array.from(new Set(selectedVariationIds));
      let totalUpdated = 0;
      let allUpdates: UpdateRow[] = [];

      for (const pid of targetIds) {
        const res = await batchService.updateAllBatchCostPrices(pid, costNum);
        if (res?.success) {
          totalUpdated += res.data.updated_batches;
          allUpdates = [...allUpdates, ...res.data.updates];
        }
      }

      setSuccessMsg(`Successfully updated cost price for ${totalUpdated} batches across variants.`);
      setUpdates(allUpdates);

      // Reload batches
      const allBatchesResults = await Promise.all(
        skuGroupProducts.map(v => batchService.getBatchesArray({ product_id: v.id, per_page: 200 }))
      );
      setBatches(allBatchesResults.flat());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update cost prices.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateBarcodeSources: BatchBarcodeSource[] = useMemo(() => {
    if (!updates.length || !selectedProduct) return [];
    return updates.map((u) => ({
      batchId: u.batch_id,
      productName: selectedProduct.name,
      price: Number(String(u.new_price).replace(/[^\d.]/g, '')),
      fallbackCode: u.batch_number || String(u.batch_id),
    }));
  }, [updates, selectedProduct]);

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

                {/* Grouped Search Results Box */}
                {products.length > 0 && (
                  <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                    <div className="max-h-[450px] overflow-y-auto">
                      {products.map((group) => (
                        <div key={group.sku} className="border-b last:border-b-0 border-gray-100 dark:border-gray-700">
                          {/* SKU Group Header */}
                          <button
                            onClick={() => onSelectProduct(group)}
                            className={`w-full text-left sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-sm transition-all flex items-center justify-between border-b border-gray-100 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 ${
                              selectedProduct?.sku === group.sku ? 'bg-emerald-50 dark:bg-emerald-900/40 ring-1 ring-inset ring-emerald-500' : ''
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="uppercase tracking-wider font-bold text-gray-800 dark:text-gray-200">{group.base_name || group.name}</span>
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">SKU: {group.sku}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">{group.variants_count} variatons</span>
                                <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                                    selectedProduct?.sku === group.sku 
                                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                                    : 'border-gray-300 dark:border-gray-600'
                                }`}>
                                    {selectedProduct?.sku === group.sku && <Check className="h-3 w-3" />}
                                </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Clear Button at bottom of scroll box if needed, or just let users scroll */}
                    <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <span>{products.length} SKU groups found</span>
                        <button 
                            onClick={() => {
                                setProducts([]);
                                setSearch('');
                                setSelectedProduct(null);
                            }}
                            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
                        >
                            Clear Results
                        </button>
                    </div>
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
              </div>

              <div className="mt-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Bulk Price Management</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Selling Price Section */}
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Selling Price</h3>
                    </div>
                    
                    <div className="space-y-3">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Selling Price (BDT)</label>
                      <div className="flex gap-2">
                        <input
                          value={sellPrice}
                          onChange={(e) => setSellPrice(e.target.value)}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          className="flex-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900 dark:text-gray-100 transition-all"
                          disabled={!selectedProduct || isSaving}
                        />
                        <button
                          onClick={onApply}
                          disabled={!selectedProduct || isSaving}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 font-semibold text-white shadow-sm transition-all"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Update
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">This will update the selling price for all selected variations and their active batches.</p>
                    </div>
                  </div>

                  {/* Cost Price Section */}
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                        <HandCoins className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Cost Price</h3>
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Cost Price (BDT)</label>
                      <div className="flex gap-2">
                        <input
                          value={costPrice}
                          onChange={(e) => setCostPrice(e.target.value)}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          className="flex-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-gray-900 dark:text-gray-100 transition-all"
                          disabled={!selectedProduct || isSaving}
                        />
                        <button
                          onClick={onApplyCost}
                          disabled={!selectedProduct || isSaving}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 font-semibold text-white shadow-sm transition-all"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Update
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">This will update the cost price for all selected variations and their active batches.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-batch price update (Tabled) */}
              {selectedProduct && (
                <div className="mt-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                          Inventory Batch List
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Review and adjust individual batch cost prices. Selling prices are managed via bulk updates.
                        </p>
                      </div>

                      {isLoadingBatches && (
                        <div className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
                          <Loader2 className="h-4 w-4 animate-spin" /> Syncing batches...
                        </div>
                      )}
                    </div>
                  </div>

                  {!isLoadingBatches && batches.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">No active batches</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">There are no batches currently recorded for the selected SKU/variations.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/60">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product Variant</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Batch Info</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Store</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Stock</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cost Price (Edit)</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Selling Price</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/50">
                          {batches.map((b) => {
                            const isEditing = costEditBatchId === b.id;
                            const isRowSaving = costSavingBatchId === b.id;
                            return (
                              <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">{b.product?.name || '-'}</div>
                                  <div className="text-[10px] text-gray-500 font-mono">SKU: {b.product?.sku}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-[11px] font-mono border border-gray-200 dark:border-gray-600">
                                    {b.batch_number || `#${b.id}`}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                  {b.store?.name || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    (b.quantity || 0) > 10 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                                    (b.quantity || 0) > 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>
                                    {b.quantity ?? 0}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isEditing ? (
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">৳</span>
                                      <input
                                        value={costEditValue}
                                        onChange={(e) => setCostEditValue(e.target.value)}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        autoFocus
                                        className="w-28 pl-6 pr-2 py-1 text-sm rounded-md border border-blue-500 dark:border-blue-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none ring-2 ring-blue-500/10"
                                      />
                                    </div>
                                  ) : (
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">৳{b.cost_price ?? '-'}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-600 dark:text-blue-400">
                                  ৳{b.sell_price ?? '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                  {isEditing ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => saveCostPrice(b)}
                                        disabled={isRowSaving}
                                        className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                                        title="Save changes"
                                      >
                                        {isRowSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                      </button>
                                      <button
                                        onClick={cancelCostEdit}
                                        disabled={isRowSaving}
                                        className="p-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                                        title="Cancel"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startCostEdit(b)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
                                    >
                                      <Pencil className="h-3 w-3" /> Edit Cost
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
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Updated batches</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Backend response: per-batch old → new prices.
                      </p>
                    </div>

                    <div className="shrink-0">
                      <GroupedAllBarcodesPrinter
                        sources={updateBarcodeSources}
                        buttonLabel="Print Labels (All Updated)"
                        title={`Barcodes for ${selectedProduct?.name}`}
                        availableOnly={true}
                      />
                    </div>
                  </div>

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
