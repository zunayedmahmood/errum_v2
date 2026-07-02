'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, PackageSearch, RefreshCw, Search, ShieldCheck, Store as StoreIcon, X } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/contexts/ThemeContext';
import catalogService, { CatalogGroupedProduct, Product } from '@/services/catalogService';
import inventoryService from '@/services/inventoryService';

function money(v: any) {
  const n = Number(v || 0);
  return `৳${Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}`;
}

function formatDate(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function CheckReservePage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogGroupedProduct[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [reserveData, setReserveData] = useState<any>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingReserve, setLoadingReserve] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    let active = true;
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      setError('');
      try {
        const res = await catalogService.searchProducts({ q, per_page: 50, group_by_sku: true });
        if (!active) return;
        setSearchResults(res.grouped_products || []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Search failed.');
      } finally {
        if (active) setLoadingSearch(false);
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [searchQuery]);

  const loadReserve = async (variant: Product, groupName?: string) => {
    setSelectedProduct(variant);
    setSelectedGroupName(groupName || variant.base_name || variant.name || 'Selected product');
    setReserveData(null);
    setLoadingReserve(true);
    setError('');

    try {
      const res = await inventoryService.getReserveCheck(Number(variant.id));
      if (!res.success) throw new Error(res.message || 'Failed to check reserve.');
      setReserveData(res.data);
    } catch (e: any) {
      setError(e?.message || 'Failed to check reserve.');
    } finally {
      setLoadingReserve(false);
    }
  };

  const totals = reserveData?.summary || {};
  const branches = Array.isArray(reserveData?.branches) ? reserveData.branches : [];
  const orders = Array.isArray(reserveData?.orders) ? reserveData.orders : [];
  const unassignedQty = Number(totals.unassigned_reserved_quantity || 0);

  const variantsForGroup = (group: CatalogGroupedProduct) => {
    const ids = new Set<number>();
    return [group.main_variant, ...(group.variants || [])].filter((variant) => {
      if (!variant?.id || ids.has(Number(variant.id))) return false;
      ids.add(Number(variant.id));
      return true;
    });
  };

  const selectedLabel = useMemo(() => {
    if (!selectedProduct) return '';
    return `${selectedGroupName}${selectedProduct.variation_suffix ? ` - ${selectedProduct.variation_suffix}` : ''} (${selectedProduct.sku})`;
  }, [selectedProduct, selectedGroupName]);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Check Reserve</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Find where online/social stock is reserved before it is deducted from branch inventory.
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  Includes statuses: pending, pending assignment, assigned to store
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <section className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                  <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search product by SKU or name..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-blue-900/40"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[68vh] overflow-auto p-3 space-y-3">
                    {loadingSearch && <div className="p-6 text-center text-sm text-gray-500">Searching...</div>}
                    {!loadingSearch && searchQuery.trim() && searchResults.length === 0 && (
                      <div className="p-6 text-center text-sm text-gray-500">No products found.</div>
                    )}
                    {!searchQuery.trim() && (
                      <div className="p-8 text-center text-sm text-gray-500">
                        <PackageSearch className="mx-auto mb-3 h-8 w-8 text-gray-400" />
                        Search exactly like Social Commerce, then select a variant.
                      </div>
                    )}

                    {searchResults.map((group) => {
                      const expanded = expandedGroupId === group.base_name;
                      return (
                        <div key={group.base_name} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                          <button
                            type="button"
                            onClick={() => setExpandedGroupId(expanded ? null : group.base_name)}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <img
                                src={group.main_variant.images?.[0]?.url || '/placeholder-image.jpg'}
                                alt={group.base_name}
                                className="h-12 w-12 rounded-lg border object-cover dark:border-gray-700"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-gray-900 dark:text-white">{group.base_name}</p>
                                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-gray-500">
                                  <span>{group.total_variants} variant(s)</span>
                                  <span>Avail: {group.total_available ?? group.total_stock ?? 0}</span>
                                  <span>Reserved: {group.total_reserved ?? 0}</span>
                                </div>
                              </div>
                            </div>
                            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>

                          {expanded && (
                            <div className="border-t border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/40">
                              {variantsForGroup(group).map((variant) => (
                                <button
                                  key={variant.id}
                                  type="button"
                                  onClick={() => loadReserve(variant, group.base_name)}
                                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-white dark:border-gray-800 dark:hover:bg-gray-900"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{variant.variation_suffix || 'Standard'}</p>
                                    <p className="text-[10px] font-semibold text-gray-500">{variant.sku}</p>
                                  </div>
                                  <div className="text-right text-[11px] font-bold">
                                    <p>{money(variant.selling_price || variant.price)}</p>
                                    <p className="text-green-600">Avail: {variant.available_inventory ?? variant.stock_quantity ?? 0}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="xl:col-span-3 space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white">Reserved Stock Details</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedLabel || 'Select a variant to see reserve details.'}</p>
                      </div>
                      {selectedProduct && (
                        <button
                          type="button"
                          onClick={() => loadReserve(selectedProduct, selectedGroupName)}
                          disabled={loadingReserve}
                          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${loadingReserve ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      )}
                    </div>

                    {loadingReserve ? (
                      <div className="py-12 text-center text-sm font-semibold text-gray-500">Loading reserve details...</div>
                    ) : reserveData ? (
                      <>
                        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900"><p className="text-[10px] font-black uppercase text-gray-400">Physical</p><p className="text-xl font-black">{totals.total_physical_stock ?? 0}</p></div>
                          <div className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><p className="text-[10px] font-black uppercase">Reserved Row</p><p className="text-xl font-black">{totals.reserved_products_reserved ?? 0}</p></div>
                          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><p className="text-[10px] font-black uppercase">Global Available</p><p className="text-xl font-black">{totals.reserved_products_available ?? 0}</p></div>
                          <div className="rounded-xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><p className="text-[10px] font-black uppercase">Listed Orders</p><p className="text-xl font-black">{totals.reserved_from_listed_orders ?? 0}</p></div>
                          <div className="rounded-xl bg-purple-50 p-3 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300"><p className="text-[10px] font-black uppercase">Unassigned</p><p className="text-xl font-black">{unassignedQty}</p></div>
                        </div>
                      </>
                    ) : (
                      <div className="py-12 text-center text-sm text-gray-500">No variant selected.</div>
                    )}
                  </div>

                  {reserveData && (
                    <>
                      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                          <StoreIcon className="h-4 w-4 text-blue-600" />
                          <h3 className="font-black text-gray-900 dark:text-white">Branch-wise Stock</h3>
                        </div>
                        <div className="overflow-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                              <tr>
                                <th className="px-4 py-3 text-left">Branch</th>
                                <th className="px-4 py-3 text-right">Physical</th>
                                <th className="px-4 py-3 text-right">Reserved Here</th>
                                <th className="px-4 py-3 text-right">Available After Reserve</th>
                                <th className="px-4 py-3 text-left">Batches</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {branches.map((branch: any) => (
                                <tr key={branch.store_id} className="align-top">
                                  <td className="px-4 py-3 font-bold">{branch.store_name}</td>
                                  <td className="px-4 py-3 text-right font-black">{branch.physical_quantity}</td>
                                  <td className="px-4 py-3 text-right font-black text-blue-600">{branch.reserved_quantity}</td>
                                  <td className="px-4 py-3 text-right font-black text-emerald-600">{branch.available_after_reserved}</td>
                                  <td className="px-4 py-3">
                                    {branch.batches?.length ? (
                                      <div className="space-y-1">
                                        {branch.batches.map((b: any) => (
                                          <div key={b.batch_id} className="rounded-lg bg-gray-50 px-2 py-1 text-xs dark:bg-gray-900">
                                            <span className="font-bold">{b.batch_number}</span> · Qty {b.quantity} · Sell {money(b.sell_price)} {b.expiry_date ? `· Exp ${b.expiry_date}` : ''}
                                          </div>
                                        ))}
                                      </div>
                                    ) : <span className="text-gray-400">No physical batch</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                          <ShieldCheck className="h-4 w-4 text-amber-600" />
                          <h3 className="font-black text-gray-900 dark:text-white">Orders Holding Reservation</h3>
                        </div>
                        <div className="overflow-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                              <tr>
                                <th className="px-4 py-3 text-left">Order</th>
                                <th className="px-4 py-3 text-left">Type / Status</th>
                                <th className="px-4 py-3 text-left">Customer</th>
                                <th className="px-4 py-3 text-left">Branch</th>
                                <th className="px-4 py-3 text-right">Qty Reserved</th>
                                <th className="px-4 py-3 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {orders.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No pending online/social orders found for this variant.</td></tr>
                              ) : orders.map((order: any) => (
                                <tr key={order.order_id}>
                                  <td className="px-4 py-3">
                                    <a href={`/orders?search=${encodeURIComponent(order.order_number)}`} className="font-black text-blue-600 hover:underline">{order.order_number}</a>
                                    <div className="text-xs text-gray-500">{formatDate(order.order_date)}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-bold capitalize">{String(order.order_type || '').replace('_', ' ')}</div>
                                    <div className="text-xs text-gray-500">{String(order.status || '').replace(/_/g, ' ')} · {order.payment_status}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-semibold">{order.customer_name || '-'}</div>
                                    <div className="text-xs text-gray-500">{order.customer_phone || ''}</div>
                                  </td>
                                  <td className="px-4 py-3 font-semibold">{order.store_name || 'Unassigned'}</td>
                                  <td className="px-4 py-3 text-right font-black">{order.quantity_reserved}</td>
                                  <td className="px-4 py-3 text-right font-bold">{money(order.total_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
