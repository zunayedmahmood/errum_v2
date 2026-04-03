'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  Package,
  Store as StoreIcon,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ArrowLeft,
  Loader,
  RefreshCw,
  MapPin,
  TrendingUp,
  Award,
  Box,
  ChevronDown,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import orderManagementService, {
  PendingAssignmentOrder,
  AvailableStoresResponse,
} from '@/services/orderManagementService';
import Toast from '@/components/Toast';
import storeService from '@/services/storeService';
import inventoryService from '@/services/inventoryService';

export default function StoreAssignmentPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Orders list state
  const [pendingOrders, setPendingOrders] = useState<PendingAssignmentOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Assignment state
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingAssignmentOrder | null>(null);
  const [availableStoresData, setAvailableStoresData] = useState<AvailableStoresResponse | null>(null);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  useEffect(() => {
    fetchPendingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  useEffect(() => {
    if (selectedOrderId) {
      const order = pendingOrders.find((o) => o.id === selectedOrderId);
      setSelectedOrder(order || null);
      fetchAvailableStores(selectedOrderId, order || null);
    }
    // include pendingOrders so selection works after refresh
  }, [selectedOrderId, pendingOrders]);

  const displayToast = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success'
  ) => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Defensive extractor for different API shapes
  const extractOrders = (resp: any): PendingAssignmentOrder[] => {
    const candidates = [
      resp?.orders,
      resp?.data?.orders,
      resp?.data?.data?.orders,
      resp?.data?.data,
      resp?.data,
    ];

    for (const c of candidates) {
      if (Array.isArray(c)) return c as PendingAssignmentOrder[];
    }

    return [];
  };



  const toNumber = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const computeFulfillmentMetrics = (inventoryDetails: any[] = []) => {
    const totalRequiredQty = inventoryDetails.reduce((sum, d) => sum + toNumber(d?.required_quantity), 0);
    const fulfillableQty = inventoryDetails.reduce(
      (sum, d) => sum + Math.min(toNumber(d?.required_quantity), toNumber(d?.available_quantity)),
      0
    );
    const percent = totalRequiredQty > 0 ? Math.round((fulfillableQty / totalRequiredQty) * 100) : 0;
    const canFulfillEntireOrder = inventoryDetails.every(
      (d) => toNumber(d?.available_quantity) >= toNumber(d?.required_quantity)
    );

    return {
      totalRequiredQty,
      fulfillableQty,
      percent,
      canFulfillEntireOrder,
    };
  };

  const normalizeAvailableStoresPayload = (
    data: any,
    orderCtx: PendingAssignmentOrder | null = null
  ) => {
    const deepCandidates = [
      data,
      data?.data,
      data?.data?.data,
      data?.payload,
      data?.result,
    ];

    const candidateArrays = deepCandidates
      .flatMap((d: any) => [
        d?.stores,
        d?.warehouses,
        d?.available_stores,
        d?.available_warehouses,
        d?.outlets,
        d?.locations,
      ])
      .filter(Array.isArray);

    const mergedRaw = candidateArrays.flat();

    const orderItems = Array.isArray(orderCtx?.items) ? orderCtx.items : [];
    const orderReqByProduct = new Map<number, { req: number; name: string; sku: string }>();

    for (const oi of orderItems) {
      const pid = toNumber((oi as any)?.product_id);
      if (!pid) continue;
      const prev = orderReqByProduct.get(pid);
      const qty = toNumber((oi as any)?.quantity);
      orderReqByProduct.set(pid, {
        req: toNumber(prev?.req) + qty,
        name: (oi as any)?.product_name ?? prev?.name ?? 'Unknown Product',
        sku: (oi as any)?.product_sku ?? prev?.sku ?? '',
      });
    }

    const normalizedStores = mergedRaw.map((store: any) => {
      const rawDetails = Array.isArray(store?.inventory_details) ? store.inventory_details : [];

      const inventoryDetails = rawDetails.map((d: any) => {
        const requiredQty = toNumber(d?.required_quantity);
        const availableQty = toNumber(d?.available_quantity ?? d?.quantity ?? d?.stock ?? 0);
        const productId = toNumber(d?.product_id);

        return {
          ...d,
          product_id: productId,
          product_name: d?.product_name ?? d?.name ?? 'Unknown Product',
          product_sku: d?.product_sku ?? d?.sku ?? '',
          required_quantity: requiredQty,
          available_quantity: availableQty,
          can_fulfill: availableQty >= requiredQty,
        };
      });

      // IMPORTANT:
      // Some APIs return partial inventory_details (missing one or more order items),
      // which can incorrectly show 100% fulfillment.
      // Fill missing required order items with available_quantity = 0 for accurate %.
      if (orderReqByProduct.size) {
        const byPid = new Map<number, any>();
        for (const d of inventoryDetails) {
          const pid = toNumber(d?.product_id);
          if (pid) byPid.set(pid, d);
        }

        for (const [pid, reqMeta] of orderReqByProduct.entries()) {
          const found = byPid.get(pid);
          if (found) {
            const correctedReq = Math.max(toNumber(found?.required_quantity), toNumber(reqMeta.req));
            found.required_quantity = correctedReq;
            found.can_fulfill = toNumber(found.available_quantity) >= correctedReq;
          } else {
            inventoryDetails.push({
              product_id: pid,
              product_name: reqMeta.name,
              product_sku: reqMeta.sku,
              required_quantity: toNumber(reqMeta.req),
              available_quantity: 0,
              can_fulfill: false,
              batches: [],
            });
          }
        }
      }

      const metrics = computeFulfillmentMetrics(inventoryDetails);

      const storeId = toNumber(store?.store_id ?? store?.id);
      const resolvedType = String(
        store?.store_type ??
          store?.type ??
          (store?.is_warehouse === true ? 'warehouse' : 'store')
      ).toLowerCase();

      const safePercent = inventoryDetails.length
        ? metrics.percent
        : Math.min(100, Math.max(0, toNumber(store?.fulfillment_percentage)));

      const requiredCount = orderReqByProduct.size || inventoryDetails.length;

      return {
        ...store,
        store_id: storeId,
        store_name: store?.store_name ?? store?.name ?? `Location #${storeId}`,
        store_address: store?.store_address ?? store?.address ?? '—',
        store_type: resolvedType === 'warehouse' ? 'warehouse' : 'store',
        inventory_details: inventoryDetails,
        fulfillment_percentage: safePercent,
        can_fulfill_entire_order: inventoryDetails.length
          ? metrics.canFulfillEntireOrder
          : !!store?.can_fulfill_entire_order,
        total_items_available: inventoryDetails.filter((d: any) => toNumber(d?.available_quantity) > 0).length,
        total_items_required:
          store?.total_items_required ?? requiredCount,
      };
    });

    // de-duplicate by store_id keeping richer entry (higher inventory detail count)
    const dedupMap = new Map<number, any>();
    for (const s of normalizedStores) {
      const sid = toNumber(s?.store_id);
      if (!sid) continue;
      const prev = dedupMap.get(sid);
      if (!prev) {
        dedupMap.set(sid, s);
        continue;
      }

      const prevLen = Array.isArray(prev?.inventory_details) ? prev.inventory_details.length : 0;
      const currLen = Array.isArray(s?.inventory_details) ? s.inventory_details.length : 0;

      if (currLen > prevLen) {
        dedupMap.set(sid, s);
      } else if (currLen === prevLen) {
        const prevPct = toNumber(prev?.fulfillment_percentage);
        const currPct = toNumber(s?.fulfillment_percentage);
        dedupMap.set(sid, currPct >= prevPct ? s : prev);
      } else {
        dedupMap.set(sid, prev);
      }
    }

    return {
      ...data,
      stores: Array.from(dedupMap.values()),
    };
  };

  const extractWarehouseList = (raw: any): any[] => {
    const candidates = [
      raw?.data?.data,
      raw?.data,
      raw?.warehouses,
      raw?.stores,
      raw,
    ];

    for (const c of candidates) {
      if (Array.isArray(c)) {
        return c.filter((x: any) => {
          const t = String(x?.store_type ?? x?.type ?? '').toLowerCase();
          return x?.is_warehouse === true || t === 'warehouse';
        });
      }
    }

    return [];
  };

  const buildWarehouseRowsFromInventory = async (order: PendingAssignmentOrder | null) => {
    if (!order?.items?.length) return [] as any[];

    // 1) Warehouse master list
    let warehouseMasters: any[] = [];
    try {
      const warehousesResp = await storeService.getWarehouses();
      warehouseMasters = extractWarehouseList(warehousesResp);
    } catch (e) {
      console.warn('Could not load warehouse master list:', e);
    }

    const warehouseMeta = new Map<number, any>();
    warehouseMasters.forEach((w: any) => {
      const id = toNumber(w?.id ?? w?.store_id);
      if (!id) return;
      warehouseMeta.set(id, {
        id,
        name: w?.name ?? w?.store_name ?? `Warehouse #${id}`,
        address: w?.address ?? w?.store_address ?? '—',
      });
    });

    // 2) Global inventory snapshot (includes store-wise quantities)
    let inventoryItems: any[] = [];
    try {
      const inventoryResp: any = await inventoryService.getGlobalInventory();
      const cands = [inventoryResp?.data, inventoryResp?.data?.data, inventoryResp];
      for (const c of cands) {
        if (Array.isArray(c)) {
          inventoryItems = c;
          break;
        }
      }
    } catch (e) {
      console.warn('Could not load global inventory for warehouses:', e);
    }

    type WarehouseAgg = {
      store_id: number;
      store_name: string;
      store_address: string;
      byProduct: Map<number, number>;
    };

    const warehouseAgg = new Map<number, WarehouseAgg>();

    const ensureAgg = (id: number, fallbackName?: string, fallbackAddress?: string) => {
      if (!warehouseAgg.has(id)) {
        const meta = warehouseMeta.get(id);
        warehouseAgg.set(id, {
          store_id: id,
          store_name: meta?.name ?? fallbackName ?? `Warehouse #${id}`,
          store_address: meta?.address ?? fallbackAddress ?? '—',
          byProduct: new Map<number, number>(),
        });
      }
      return warehouseAgg.get(id)!;
    };

    // seed from warehouse master so 0-stock warehouses are still visible
    for (const [id, meta] of warehouseMeta.entries()) {
      ensureAgg(id, meta?.name, meta?.address);
    }

    for (const item of inventoryItems) {
      const productId = toNumber(item?.product_id);
      const sku = String(item?.sku || '').trim().toLowerCase();
      const stores = Array.isArray(item?.stores) ? item.stores : [];

      for (const s of stores) {
        const sid = toNumber(s?.store_id ?? s?.id);
        if (!sid) continue;

        const sType = String(s?.store_type ?? s?.type ?? '').toLowerCase();
        const isWarehouse = s?.is_warehouse === true || sType === 'warehouse' || warehouseMeta.has(sid);
        if (!isWarehouse) continue;

        const agg = ensureAgg(sid, s?.store_name ?? s?.name, s?.store_address ?? s?.address);
        const qty = toNumber(s?.quantity);

        if (productId) {
          agg.byProduct.set(productId, toNumber(agg.byProduct.get(productId)) + qty);
        }
      }
    }

    const rows = Array.from(warehouseAgg.values()).map((w) => {
      const inventory_details = order.items.map((oi: any) => {
        const req = toNumber(oi?.quantity);
        const pid = toNumber(oi?.product_id);
        const sku = String(oi?.product_sku || '').trim().toLowerCase();

        const byPid = pid ? toNumber(w.byProduct.get(pid)) : 0;
        const available = byPid;

        return {
          product_id: pid,
          product_name: oi?.product_name ?? 'Unknown Product',
          product_sku: oi?.product_sku ?? '',
          required_quantity: req,
          available_quantity: available,
          can_fulfill: available >= req,
          batches: [],
        };
      });

      const metrics = computeFulfillmentMetrics(inventory_details);

      return {
        store_id: w.store_id,
        store_name: w.store_name,
        store_address: w.store_address,
        store_type: 'warehouse',
        inventory_details,
        total_items_available: inventory_details.filter((d: any) => toNumber(d.available_quantity) > 0).length,
        total_items_required: inventory_details.length,
        can_fulfill_entire_order: metrics.canFulfillEntireOrder,
        fulfillment_percentage: metrics.percent,
      };
    });

    return rows;
  };

  const isOrderUnassigned = (order: any): boolean => {
    const candidateIds = [
      order?.store_id,
      order?.assigned_store_id,
      order?.store?.id,
      order?.store?.store_id,
      order?.assigned_store?.id,
      order?.assigned_store?.store_id,
      order?.outlet_id,
      order?.branch_id,
    ]
      .map((v) => toNumber(v))
      .filter((v) => v > 0);

    return candidateIds.length === 0;
  };

  const fetchPendingOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const statusCandidates = ['pending_assignment', 'pending-assignment', 'pending'];
      const combined: PendingAssignmentOrder[] = [];

      for (const status of statusCandidates) {
        try {
          const resp = await orderManagementService.getPendingAssignment({
            per_page: 100,
            status,
            sort_order: sortOrder,
          } as any);

          let orders = extractOrders(resp);

          // If backend stores e-commerce unassigned orders as plain "pending",
          // keep only truly unassigned ones.
          if (status === 'pending') {
            orders = orders.filter((o: any) => isOrderUnassigned(o));
          }

          if (orders.length) combined.push(...(orders as PendingAssignmentOrder[]));
        } catch (e) {
          // continue trying other status variants
          console.warn(`Could not fetch status=${status}`, e);
        }
      }

      // final fallback: no status filter
      if (!combined.length) {
        const fallback = await orderManagementService.getPendingAssignment({
          per_page: 100,
        } as any);
        const fallbackOrders = extractOrders(fallback).filter((o: any) => isOrderUnassigned(o));
        combined.push(...(fallbackOrders as PendingAssignmentOrder[]));
      }

      // de-dupe by order id
      const byId = new Map<number, PendingAssignmentOrder>();
      for (const o of combined) {
        const oid = toNumber((o as any)?.id);
        if (!oid) continue;
        if (!byId.has(oid)) byId.set(oid, o);
      }

      let orders = Array.from(byId.values());
      
      // Global sort after merging
      orders = orders.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      });

      setPendingOrders(orders);
      console.log('📦 Loaded pending/unassigned orders:', orders.length);
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      displayToast('Error loading orders: ' + (error?.message || 'Unknown error'), 'error');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const fetchAvailableStores = async (orderId: number, orderCtx: PendingAssignmentOrder | null = null) => {
    setIsLoadingStores(true);
    try {
      const data = await orderManagementService.getAvailableStores(orderId);
      const normalized = normalizeAvailableStoresPayload(data, orderCtx || selectedOrder || null);

      let mergedStores = Array.isArray(normalized?.stores) ? [...normalized.stores] : [];
      const hasWarehouseAlready = mergedStores.some(
        (s: any) => String(s?.store_type ?? s?.type ?? '').toLowerCase() === 'warehouse'
      );

      // Fallback: if API doesn't return warehouses, derive them from warehouse master + global inventory.
      if (!hasWarehouseAlready) {
        const fallbackWarehouses = await buildWarehouseRowsFromInventory(orderCtx || selectedOrder || null);
        const existingIds = new Set(mergedStores.map((s: any) => toNumber(s?.store_id ?? s?.id)).filter(Boolean));
        for (const w of fallbackWarehouses) {
          const sid = toNumber(w?.store_id);
          if (!sid || existingIds.has(sid)) continue;
          mergedStores.push(w);
        }
      }

      const mergedPayload: any = {
        ...normalized,
        stores: mergedStores,
      };

      // Recompute recommendation if backend recommendation is missing from merged list
      if (mergedStores.length && mergedPayload?.recommendation?.store_id) {
        const recId = toNumber(mergedPayload.recommendation.store_id);
        const hasRec = mergedStores.some((s: any) => toNumber(s?.store_id) === recId);
        if (!hasRec) {
          mergedPayload.recommendation = null;
        }
      }

      setAvailableStoresData(mergedPayload);

      // Auto-select recommended store if available, else best fulfillment candidate
      if (mergedPayload?.recommendation?.store_id) {
        setSelectedStoreId(toNumber(mergedPayload.recommendation.store_id));
      } else if (mergedStores.length) {
        const sorted = [...mergedStores].sort(
          (a: any, b: any) => toNumber(b?.fulfillment_percentage) - toNumber(a?.fulfillment_percentage)
        );
        setSelectedStoreId(toNumber(sorted[0]?.store_id));
      }

      console.log('🏪 Available locations loaded:', mergedStores.length);
    } catch (error: any) {
      console.error('Error fetching stores:', error);
      displayToast('Error loading stores: ' + (error?.message || 'Unknown error'), 'error');
    } finally {
      setIsLoadingStores(false);
    }
  };

  const handleAssignStore = async () => {
    if (!selectedOrderId || !selectedStoreId) {
      displayToast('Please select a store', 'warning');
      return;
    }

    setIsAssigning(true);
    try {
      await orderManagementService.assignOrderToStore(selectedOrderId, {
        store_id: selectedStoreId,
        notes: assignmentNotes || undefined,
      });

      displayToast('✅ Order assigned successfully!', 'success');

      setTimeout(() => {
        setSelectedOrderId(null);
        setSelectedOrder(null);
        setAvailableStoresData(null);
        setSelectedStoreId(null);
        setAssignmentNotes('');
        fetchPendingOrders();
      }, 800);
    } catch (error: any) {
      console.error('Error assigning order:', error);
      displayToast(error?.response?.data?.message || error?.message || 'Failed to assign order', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const filteredOrders = pendingOrders.filter((order) => {
    const q = searchQuery.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(q) ||
      order.customer?.name?.toLowerCase().includes(q)
    );
  });

  // ORDER LIST VIEW
  if (!selectedOrderId) {
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

            <main className="flex-1 overflow-auto p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                      🏪 Store Assignment
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Assign pending e-commerce orders to stores based on inventory availability
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                        className="appearance-none pl-3 pr-10 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer shadow-sm"
                      >
                        <option value="asc">Oldest First</option>
                        <option value="desc">Newest First</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={fetchPendingOrders}
                      disabled={isLoadingOrders}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Pending Assignment</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                          {pendingOrders.length}
                        </p>
                      </div>
                      <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                        <Package className="h-8 w-8 text-yellow-600" />
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Items</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                          {pendingOrders.reduce(
                            (sum, order) =>
                              sum +
                              (order.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) ||
                                0),
                            0
                          )}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Box className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Total Value</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                          ৳
                          {pendingOrders
                            .reduce((sum, order) => sum + parseFloat(String(order.total_amount || 0)), 0)
                            .toFixed(2)}
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <TrendingUp className="h-8 w-8 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by order number or customer name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Orders List */}
                {isLoadingOrders ? (
                  <div className="text-center py-12">
                    <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Loading orders...</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <Package className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                      {searchQuery ? 'No matching orders' : 'No pending assignment orders'}
                    </p>
                    {!searchQuery && (
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        If you believe there should be orders here, verify the API is filtering by
                        status = pending_assignment.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className="p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer transition-all hover:border-blue-500 hover:shadow-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {order.order_number}
                              </h3>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                Pending Assignment
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              👤 {order.customer?.name} • 📱 {order.customer?.phone}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {order.items_summary?.slice(0, 3).map((item, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                  {item.product_name} (×{item.quantity})
                                </span>
                              ))}
                              {(order.items_summary?.length || 0) > 3 && (
                                <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                  +{(order.items_summary?.length || 0) - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                              ৳{parseFloat(String(order.total_amount || 0)).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                              {order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>

        {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}
      </div>
    );
  }

  // STORE ASSIGNMENT VIEW
  const selectedStoreData = availableStoresData?.stores?.find((s) => s.store_id === selectedStoreId);
  const recommendation = availableStoresData?.recommendation;

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

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setSelectedOrderId(null);
                      setSelectedOrder(null);
                      setAvailableStoresData(null);
                      setSelectedStoreId(null);
                      setAssignmentNotes('');
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ArrowLeft className="text-gray-900 dark:text-white" />
                  </button>
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedOrder?.order_number || 'Loading...'}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedOrder?.customer?.name} • {availableStoresData?.total_items || 0} items
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommendation Banner */}
              {recommendation && (
                <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <Award className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                        ⭐ Recommended: {recommendation.store_name}
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-400">
                        {recommendation.reason} • {recommendation.fulfillment_percentage}% fulfillment
                      </p>
                      {recommendation.note && (
                        <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                          💡 {recommendation.note}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Available Stores */}
                <div>
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Available Stores & Warehouses
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Assignment creates an inventory reservation. Physical stock is deducted only during scanning/fulfillment.
                    </p>
                  </div>

                  {isLoadingStores ? (
                    <div className="text-center py-12">
                      <Loader className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">Checking inventory...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {availableStoresData?.stores?.map((store) => {
                        const isSelected = selectedStoreId === store.store_id;
                        const isRecommended = recommendation?.store_id === store.store_id;

                        return (
                          <div
                            key={store.store_id}
                            onClick={() => setSelectedStoreId(store.store_id)}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : store.can_fulfill_entire_order
                                ? 'border-green-300 dark:border-green-800 bg-white dark:bg-gray-800 hover:border-green-500'
                                : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-gray-900 dark:text-white">
                                    {store.store_name}
                                  </h3>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${String((store as any).store_type ?? (store as any).type ?? '').toLowerCase()==='warehouse' ? 'border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300' : 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'}`}>
                                    {String((store as any).store_type ?? (store as any).type ?? '').toLowerCase() === 'warehouse' ? 'Warehouse' : 'Store'}
                                  </span>
                                  {isRecommended && <Award className="h-4 w-4 text-yellow-500" />}
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                                  <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                  {store.store_address}
                                </p>
                              </div>
                              <div className="ml-4">
                                {store.can_fulfill_entire_order ? (
                                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-100 dark:bg-green-900/30">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                                      Can Fulfill
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-100 dark:bg-red-900/30">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-xs font-medium text-red-700 dark:text-red-400">
                                      Insufficient
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mb-3">
                              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                <span>Reservation Capacity</span>
                                <span className="font-semibold">{store.fulfillment_percentage}%</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                <div
                                  className={`h-2 transition-all ${
                                    store.fulfillment_percentage === 100
                                      ? 'bg-green-500'
                                      : store.fulfillment_percentage >= 50
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${store.fulfillment_percentage}%` }}
                                />
                              </div>
                            </div>

                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              Available: {store.total_items_available} / {store.total_items_required} items
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column - Store Details & Assignment */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    {selectedStoreData ? 'Inventory Details' : 'Select a Store'}
                  </h2>

                  {selectedStoreData ? (
                    <div className="space-y-4">
                      {/* Inventory Details */}
                      <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
                          Product Availability
                        </h3>
                        <div className="space-y-3">
                          {selectedStoreData.inventory_details.map((detail, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg ${
                                detail.can_fulfill
                                  ? 'bg-green-50 dark:bg-green-900/20'
                                  : 'bg-red-50 dark:bg-red-900/20'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                    {detail.product_name}
                                  </h4>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    SKU: {detail.product_sku}
                                  </p>
                                </div>
                                {detail.can_fulfill ? (
                                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Required: {detail.required_quantity} | Available: {detail.available_quantity}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    detail.can_fulfill
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {detail.can_fulfill
                                    ? 'OK'
                                    : `Short by ${detail.required_quantity - detail.available_quantity}`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Assignment Notes */}
                      <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                          Assignment Notes (Optional)
                        </label>
                        <textarea
                          value={assignmentNotes}
                          onChange={(e) => setAssignmentNotes(e.target.value)}
                          placeholder="Add any notes about this assignment..."
                          rows={3}
                          maxLength={500}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">{assignmentNotes.length}/500 characters</p>
                      </div>

                      {/* Assign Button */}
                      <button
                        onClick={handleAssignStore}
                        disabled={isAssigning || !selectedStoreData.can_fulfill_entire_order}
                        className={`w-full px-6 py-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                          selectedStoreData.can_fulfill_entire_order && !isAssigning
                            ? 'bg-green-600 hover:bg-green-700 shadow-lg'
                            : 'bg-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isAssigning ? (
                          <>
                            <Loader className="h-5 w-5 animate-spin" />
                            Assigning Order...
                          </>
                        ) : selectedStoreData.can_fulfill_entire_order ? (
                          <>
                            <StoreIcon className="h-5 w-5" />
                            Assign to {selectedStoreData.store_name}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-5 w-5" />
                            Insufficient Inventory
                          </>
                        )}
                      </button>

                      {!selectedStoreData.can_fulfill_entire_order && (
                        <p className="text-sm text-center text-red-600 dark:text-red-400">
                          ⚠️ This store cannot fulfill the entire order. Please select a different store or consider restocking.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <StoreIcon className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Select a store/warehouse to view inventory details
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}
    </div>
  );
}
