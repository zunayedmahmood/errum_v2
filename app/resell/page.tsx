'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeDollarSign,
  BarChart3,
  Box,
  Check,
  ChevronRight,
  CircleDollarSign,
  FilePlus2,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AccessControl from '@/components/AccessControl';
import { useTheme } from '@/contexts/ThemeContext';
import catalogService, { Product as CatalogProduct } from '@/services/catalogService';
import paymentMethodService, { PaymentMethod } from '@/services/paymentMethodService';
import purchaseOrderService from '@/services/purchase-order.service';
import resellService, {
  ResellProductTag,
  ResellSummary,
  ResellVendorProfile,
} from '@/services/resellService';
import storeService, { Store } from '@/services/storeService';

const money = (value: any) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const getError = (error: any) =>
  error?.response?.data?.message ||
  (error?.response?.data?.errors ? Object.values(error.response.data.errors).flat().join(', ') : '') ||
  error?.message ||
  'Something went wrong';

function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-900 ${wide ? 'max-w-6xl' : 'max-w-2xl'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'amber' | 'blue' | 'red' }) {
  const cls = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

export default function ResellItemsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [tab, setTab] = useState<'vendors' | 'products' | 'purchase-orders' | 'payments'>('vendors');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [summary, setSummary] = useState<ResellSummary | null>(null);
  const [vendors, setVendors] = useState<ResellVendorProfile[]>([]);
  const [products, setProducts] = useState<ResellProductTag[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Store[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [vendorModal, setVendorModal] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorCandidates, setVendorCandidates] = useState<any[]>([]);
  const [vendorNotes, setVendorNotes] = useState('');

  const [productModal, setProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<CatalogProduct[]>([]);
  const [productVendorId, setProductVendorId] = useState<number | ''>('');
  const [productSearching, setProductSearching] = useState(false);

  const [poModal, setPoModal] = useState(false);
  const [poForm, setPoForm] = useState<any>({
    resell_vendor_id: '', store_id: '', order_date: today(), expected_delivery_date: '',
    notes: '', tax_amount: 0, discount_amount: 0, shipping_cost: 0, other_charges: 0,
    items: [],
  });
  const [receivePo, setReceivePo] = useState<any | null>(null);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState<any>({
    resell_vendor_id: '', payment_method_id: '', payment_date: today(), amount: '', notes: '', allocations: [],
  });

  const flash = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 5500);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, vendorData, productData, poData, paymentData, storeData, methods] = await Promise.all([
        resellService.getSummary(),
        resellService.getVendors(),
        resellService.getProducts({ per_page: 200 }),
        resellService.getPurchaseOrders({ per_page: 200 }),
        resellService.getPayments({ per_page: 200 }),
        storeService.getStores({ is_warehouse: true, is_active: true, per_page: 1000 }),
        paymentMethodService.getAll({ is_active: true, per_page: 1000 }),
      ]);
      setSummary(summaryData);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
      setProducts(Array.isArray(productData?.data) ? productData.data : []);
      setPurchaseOrders(Array.isArray(poData?.data) ? poData.data : []);
      setPayments(Array.isArray(paymentData?.data) ? paymentData.data : []);
      setWarehouses(Array.isArray(storeData?.data?.data) ? storeData.data.data : Array.isArray(storeData?.data) ? storeData.data : []);
      setPaymentMethods(Array.isArray(methods) ? methods : []);
    } catch (error) {
      flash('error', getError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!vendorModal) return;
    const timer = window.setTimeout(async () => {
      try { setVendorCandidates(await resellService.getVendorCandidates(vendorSearch)); }
      catch (error) { flash('error', getError(error)); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [vendorSearch, vendorModal]);

  useEffect(() => {
    if (!productModal || !productSearch.trim()) {
      setProductResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setProductSearching(true);
      try {
        const result = await catalogService.searchProducts({ q: productSearch, per_page: 40, group_by_sku: true });
        const flat = result.grouped_products?.flatMap((group) => [group.main_variant, ...(group.variants || [])]) || result.products || [];
        const unique = Array.from(new Map(flat.map((p) => [p.id, p])).values());
        setProductResults(unique);
      } catch (error) {
        flash('error', getError(error));
      } finally {
        setProductSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [productSearch, productModal]);

  const activeVendors = useMemo(() => vendors.filter((v) => v.is_active), [vendors]);
  const selectedPoVendorProducts = useMemo(
    () => products.filter((p) => Number(p.resell_vendor_id) === Number(poForm.resell_vendor_id) && p.is_active),
    [products, poForm.resell_vendor_id]
  );
  const outstandingForPayment = useMemo(
    () => purchaseOrders.filter((po) => Number(po.vendor_id) === Number(activeVendors.find((v) => Number(v.id) === Number(paymentForm.resell_vendor_id))?.vendor_id) && Number(po.outstanding_amount) > 0 && !['cancelled', 'returned'].includes(po.status)),
    [purchaseOrders, paymentForm.resell_vendor_id, activeVendors]
  );

  const run = async (action: () => Promise<any>, success: string) => {
    setWorking(true);
    try {
      await action();
      flash('success', success);
      await loadAll();
      return true;
    } catch (error) {
      flash('error', getError(error));
      return false;
    } finally {
      setWorking(false);
    }
  };

  const markVendor = async (candidate: any) => {
    const ok = await run(() => resellService.markVendor({ vendor_id: candidate.id, notes: vendorNotes }), `${candidate.name} is now a resell vendor.`);
    if (ok) { setVendorModal(false); setVendorNotes(''); setVendorSearch(''); }
  };

  const markProduct = async (product: CatalogProduct) => {
    if (!productVendorId) return flash('error', 'Select the resell vendor for this product.');
    const ok = await run(() => resellService.markProduct({ product_id: product.id, resell_vendor_id: Number(productVendorId) }), `${product.name} is now a resell product.`);
    if (ok) setProductResults((rows) => rows.filter((row) => row.id !== product.id));
  };

  const addPoItem = (tag: ResellProductTag) => {
    if (poForm.items.some((item: any) => item.product_id === tag.product_id)) return;
    const latestBatch = Array.isArray(tag.product?.batches) ? tag.product.batches[0] : null;
    setPoForm((form: any) => ({ ...form, items: [...form.items, { product_id: tag.product_id, product_name: tag.product?.name, sku: tag.product?.sku, quantity_ordered: 1, unit_cost: latestBatch?.cost_price || 0, unit_sell_price: latestBatch?.sell_price || 0 }] }));
  };

  const updatePoItem = (index: number, field: string, value: any) => {
    setPoForm((form: any) => ({ ...form, items: form.items.map((item: any, i: number) => i === index ? { ...item, [field]: value } : item) }));
  };

  const submitPo = async () => {
    if (!poForm.resell_vendor_id || !poForm.store_id || poForm.items.length === 0) return flash('error', 'Choose a vendor, warehouse, and at least one product.');
    const payload = { ...poForm, resell_vendor_id: Number(poForm.resell_vendor_id), store_id: Number(poForm.store_id), items: poForm.items.map(({ product_name, sku, ...item }: any) => ({ ...item, quantity_ordered: Number(item.quantity_ordered), unit_cost: Number(item.unit_cost), unit_sell_price: Number(item.unit_sell_price || 0) })) };
    const ok = await run(() => resellService.createPurchaseOrder(payload), 'Resell purchase order created.');
    if (ok) {
      setPoModal(false);
      setPoForm({ resell_vendor_id: '', store_id: '', order_date: today(), expected_delivery_date: '', notes: '', tax_amount: 0, discount_amount: 0, shipping_cost: 0, other_charges: 0, items: [] });
      setTab('purchase-orders');
    }
  };

  const openReceive = (po: any) => {
    setReceivePo(po);
    setReceiveItems((po.items || []).filter((item: any) => Number(item.quantity_pending ?? (item.quantity_ordered - item.quantity_received)) > 0).map((item: any) => ({ item_id: item.id, product_name: item.product_name, quantity_received: Number(item.quantity_pending ?? (item.quantity_ordered - item.quantity_received)), batch_number: '', manufactured_date: '', expiry_date: '' })));
  };

  const submitReceive = async () => {
    if (!receivePo || receiveItems.length === 0) return;
    const ok = await run(() => purchaseOrderService.receive(receivePo.id, { items: receiveItems.map(({ product_name, ...item }) => ({ ...item, quantity_received: Number(item.quantity_received) })) }), 'Products received into the regular inventory lifecycle.');
    if (ok) { setReceivePo(null); setReceiveItems([]); }
  };

  const openPayment = (vendor?: ResellVendorProfile) => {
    setPaymentForm({ resell_vendor_id: vendor?.id || '', payment_method_id: paymentMethods[0]?.id || '', payment_date: today(), amount: '', notes: '', allocations: [] });
    setPaymentModal(true);
  };

  const setAllocation = (po: any, amount: string) => {
    setPaymentForm((form: any) => {
      const others = form.allocations.filter((row: any) => row.purchase_order_id !== po.id);
      const value = Number(amount || 0);
      const allocations = value > 0 ? [...others, { purchase_order_id: po.id, po_number: po.po_number, amount: Math.min(value, Number(po.outstanding_amount)) }] : others;
      return { ...form, allocations, amount: allocations.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0) };
    });
  };

  const submitPayment = async () => {
    if (!paymentForm.resell_vendor_id || !paymentForm.payment_method_id || paymentForm.allocations.length === 0) return flash('error', 'Choose a vendor, payment method, and at least one PO allocation.');
    const ok = await run(() => resellService.createPayment({ ...paymentForm, resell_vendor_id: Number(paymentForm.resell_vendor_id), payment_method_id: Number(paymentForm.payment_method_id), amount: Number(paymentForm.amount), allocations: paymentForm.allocations.map((row: any) => ({ purchase_order_id: row.purchase_order_id, amount: Number(row.amount) })) }), 'Vendor payment recorded and PO balances updated.');
    if (ok) { setPaymentModal(false); setTab('payments'); }
  };

  const cancelPurchaseOrder = async (po: any) => {
    const reason = window.prompt(`Why are you cancelling ${po.po_number}?`, 'Cancelled from Resell Items panel');
    if (reason === null) return;
    await run(() => purchaseOrderService.cancel(po.id, reason.trim() || undefined), 'Resell purchase order cancelled.');
  };

  const cards = [
    ['Resell Vendors', summary?.vendors || 0, Users],
    ['Resell Products', summary?.products || 0, ShoppingBag],
    ['Stock on Hand', summary?.stock_on_hand || 0, Box],
    ['Net Units Sold', summary?.net_units_sold || 0, PackageCheck],
    ['Net Sales', money(summary?.net_sales), BadgeDollarSign],
    ['Gross Profit', money(summary?.gross_profit), BarChart3],
    ['Vendor Outstanding', money(summary?.outstanding), CircleDollarSign],
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className={`transition-all ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="p-4 md:p-7">
          {notice && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'}`}>{notice.text}</div>}

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950 dark:text-violet-300"><ShoppingBag className="h-4 w-4" /> Separate classification, regular lifecycle</div>
              <h1 className="text-3xl font-bold">Resell Items</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">Tag existing vendors and products, create and receive regular POs, pay vendors partially or fully, and track live sell-through and profitability.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={loadAll} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
              <AccessControl roles={['super-admin', 'admin']}><Link href="/resell/reports" className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900"><BarChart3 className="h-4 w-4" /> Reports <ChevronRight className="h-4 w-4" /></Link></AccessControl>
            </div>
          </div>

          <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {cards.map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><Icon className="mb-3 h-5 w-5 text-violet-600" /><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-gray-500">{label}</div></div>)}
          </div>

          <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
            {([
              ['vendors', 'Vendors', Users], ['products', 'Products', ShoppingBag], ['purchase-orders', 'Purchase Orders', Truck], ['payments', 'Payments', CircleDollarSign],
            ] as const).map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === key ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}><Icon className="h-4 w-4" /> {label}</button>)}
          </div>

          {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div> : (
            <>
              {tab === 'vendors' && <section>
                <div className="mb-4 flex justify-end"><AccessControl roles={['super-admin', 'admin']}><button onClick={() => setVendorModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> Add Resell Vendor</button></AccessControl></div>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800"><tr><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Products</th><th className="px-5 py-3">PO Value</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Outstanding</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{vendors.map((row) => <tr key={row.id}><td className="px-5 py-4"><div className="font-semibold">{row.vendor?.name}</div><div className="text-xs text-gray-500">{row.vendor?.contact_person || row.vendor?.phone || 'No contact'}</div></td><td className="px-5 py-4">{row.product_count}</td><td className="px-5 py-4">{money(row.po_value)}</td><td className="px-5 py-4 text-emerald-600">{money(row.paid_amount)}</td><td className="px-5 py-4 font-semibold text-amber-600">{money(row.outstanding_amount)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => openPayment(row)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Pay</button><AccessControl roles={['super-admin', 'admin']}><button onClick={() => window.confirm('Remove this resell tag? This is blocked while products, open POs, or outstanding balances remain.') && run(() => resellService.unmarkVendor(row.id), 'Resell vendor tag removed.')} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button></AccessControl></div></td></tr>)}{vendors.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-500">No resell vendors yet.</td></tr>}</tbody></table></div></div>
              </section>}

              {tab === 'products' && <section>
                <div className="mb-4 flex justify-end"><AccessControl roles={['super-admin', 'admin']}><button onClick={() => setProductModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> Mark Resell Product</button></AccessControl></div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((row) => <article key={row.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{row.product?.name}</h3><div className="mt-1 text-xs text-gray-500">SKU {row.product?.sku || '—'}</div></div><Pill tone="blue">{row.stock_on_hand} left</Pill></div><div className="mt-5 flex items-center justify-between border-t pt-4 text-sm dark:border-gray-800"><div><div className="text-xs text-gray-500">Resell Vendor</div><div className="font-medium">{row.resell_vendor?.vendor?.name}</div></div><AccessControl roles={['super-admin', 'admin']}><button title="Remove resell tag" onClick={() => window.confirm('Remove this tag? This is blocked while stock or open PO items remain.') && run(() => resellService.unmarkProduct(row.id), 'Resell product tag removed.')} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button></AccessControl></div></article>)}{products.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-14 text-center text-gray-500 dark:border-gray-700">No resell products yet.</div>}</div>
              </section>}

              {tab === 'purchase-orders' && <section>
                <div className="mb-4 flex justify-end"><button onClick={() => setPoModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><FilePlus2 className="h-4 w-4" /> Create Resell PO</button></div>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800"><tr><th className="px-5 py-3">PO</th><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Warehouse</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Outstanding</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{purchaseOrders.map((po) => <tr key={po.id}><td className="px-5 py-4"><div className="font-semibold">{po.po_number}</div><div className="text-xs text-gray-500">{po.order_date}</div></td><td className="px-5 py-4">{po.vendor?.name}</td><td className="px-5 py-4">{po.store?.name}</td><td className="px-5 py-4"><Pill tone={po.status === 'received' ? 'green' : po.status === 'cancelled' ? 'red' : po.status === 'approved' ? 'blue' : 'amber'}>{String(po.status).replaceAll('_', ' ')}</Pill></td><td className="px-5 py-4 font-semibold">{money(po.total_amount)}</td><td className="px-5 py-4 text-amber-600">{money(po.outstanding_amount)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{po.status === 'draft' && <button disabled={working} onClick={() => run(() => purchaseOrderService.approve(po.id), 'Purchase order approved.')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" /> Approve</button>}{['approved', 'partially_received'].includes(po.status) && <button onClick={() => openReceive(po)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"><PackageCheck className="h-3.5 w-3.5" /> Receive</button>}{['draft', 'approved'].includes(po.status) && <button disabled={working} onClick={() => cancelPurchaseOrder(po)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"><X className="h-3.5 w-3.5" /> Cancel</button>}</div></td></tr>)}{purchaseOrders.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-gray-500">No resell purchase orders yet.</td></tr>}</tbody></table></div></div>
              </section>}

              {tab === 'payments' && <section>
                <div className="mb-4 flex justify-end"><button onClick={() => openPayment()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><CircleDollarSign className="h-4 w-4" /> Record Payment</button></div>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800"><tr><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{payments.map((payment) => <tr key={payment.id}><td className="px-5 py-4 font-semibold">{payment.payment_number}</td><td className="px-5 py-4">{payment.vendor?.name}</td><td className="px-5 py-4">{payment.payment_date}</td><td className="px-5 py-4">{payment.payment_method?.name || '—'}</td><td className="px-5 py-4 font-semibold text-emerald-600">{money(payment.amount)}</td><td className="px-5 py-4"><Pill tone={payment.status === 'completed' ? 'green' : 'amber'}>{payment.status}</Pill></td></tr>)}{payments.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-500">No resell vendor payments yet.</td></tr>}</tbody></table></div></div>
              </section>}
            </>
          )}
        </main>
      </div>

      <Modal open={vendorModal} title="Add Resell Vendor" onClose={() => setVendorModal(false)}>
        <div className="space-y-4"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} placeholder="Search existing vendors" className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-10 pr-4 dark:border-gray-700" /></div><textarea value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} placeholder="Optional internal note" className="w-full rounded-xl border border-gray-300 bg-transparent p-3 dark:border-gray-700" rows={2} /><div className="max-h-96 space-y-2 overflow-y-auto">{vendorCandidates.map((vendor) => <button key={vendor.id} disabled={working} onClick={() => markVendor(vendor)} className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-4 text-left hover:border-violet-400 hover:bg-violet-50 dark:border-gray-700 dark:hover:bg-violet-950"><div><div className="font-semibold">{vendor.name}</div><div className="text-xs text-gray-500">{vendor.contact_person || vendor.phone || vendor.email || 'No contact information'}</div></div><Plus className="h-5 w-5 text-violet-600" /></button>)}{vendorCandidates.length === 0 && <div className="py-10 text-center text-sm text-gray-500">No eligible regular vendors found.</div>}</div></div>
      </Modal>

      <Modal open={productModal} title="Mark Existing Product as Resell" onClose={() => setProductModal(false)} wide>
        <div className="mb-5 grid gap-4 md:grid-cols-[280px_1fr]"><select value={productVendorId} onChange={(e) => setProductVendorId(e.target.value ? Number(e.target.value) : '')} className="rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-700"><option value="">Select resell vendor</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendor?.name}</option>)}</select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search exactly like Social Commerce: name, SKU, Bangla, variations…" className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-10 pr-4 dark:border-gray-700" /></div></div>
        {productSearching ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : <div className="grid gap-3 md:grid-cols-2">{productResults.map((product) => { const already = products.some((tag) => tag.product_id === product.id && tag.is_active); return <div key={product.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4 dark:border-gray-700"><div><div className="font-semibold">{product.name}</div><div className="text-xs text-gray-500">SKU {product.sku} · Stock {product.stock_quantity ?? 0}</div></div><button disabled={already || working || !productVendorId} onClick={() => markProduct(product)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400">{already ? 'Already tagged' : 'Mark resell'}</button></div>; })}{productSearch && productResults.length === 0 && <div className="col-span-full py-12 text-center text-gray-500">No products found.</div>}</div>}
      </Modal>

      <Modal open={poModal} title="Create Resell Purchase Order" onClose={() => setPoModal(false)} wide>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4"><label className="text-sm"><span className="mb-1 block font-medium">Resell Vendor</span><select value={poForm.resell_vendor_id} onChange={(e) => setPoForm({ ...poForm, resell_vendor_id: e.target.value, items: [] })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700"><option value="">Select vendor</option>{activeVendors.map((v) => <option key={v.id} value={v.id}>{v.vendor?.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Receiving Warehouse</span><select value={poForm.store_id} onChange={(e) => setPoForm({ ...poForm, store_id: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700"><option value="">Select warehouse</option>{warehouses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Order Date</span><input type="date" value={poForm.order_date} onChange={(e) => setPoForm({ ...poForm, order_date: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700" /></label><label className="text-sm"><span className="mb-1 block font-medium">Expected Delivery</span><input type="date" value={poForm.expected_delivery_date} onChange={(e) => setPoForm({ ...poForm, expected_delivery_date: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700" /></label></div>
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]"><div><h3 className="mb-3 text-sm font-semibold">Vendor’s Tagged Products</h3><div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border p-2 dark:border-gray-700">{selectedPoVendorProducts.map((tag) => <button key={tag.id} onClick={() => addPoItem(tag)} className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800"><div><div className="text-sm font-medium">{tag.product?.name}</div><div className="text-xs text-gray-500">{tag.product?.sku}</div></div><Plus className="h-4 w-4" /></button>)}{!poForm.resell_vendor_id && <div className="p-8 text-center text-sm text-gray-500">Choose a vendor first.</div>}{poForm.resell_vendor_id && selectedPoVendorProducts.length === 0 && <div className="p-8 text-center text-sm text-gray-500">This vendor has no tagged products.</div>}</div></div><div><h3 className="mb-3 text-sm font-semibold">PO Items</h3><div className="overflow-x-auto rounded-xl border dark:border-gray-700"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Unit Cost</th><th className="px-3 py-2">Sell Price</th><th></th></tr></thead><tbody>{poForm.items.map((item: any, index: number) => <tr key={item.product_id} className="border-t dark:border-gray-800"><td className="px-3 py-3"><div className="font-medium">{item.product_name}</div><div className="text-xs text-gray-500">{item.sku}</div></td><td className="px-3 py-3"><input type="number" min="1" value={item.quantity_ordered} onChange={(e) => updatePoItem(index, 'quantity_ordered', e.target.value)} className="w-20 rounded-lg border bg-transparent px-2 py-1.5 dark:border-gray-700" /></td><td className="px-3 py-3"><input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => updatePoItem(index, 'unit_cost', e.target.value)} className="w-28 rounded-lg border bg-transparent px-2 py-1.5 dark:border-gray-700" /></td><td className="px-3 py-3"><input type="number" min="0" step="0.01" value={item.unit_sell_price} onChange={(e) => updatePoItem(index, 'unit_sell_price', e.target.value)} className="w-28 rounded-lg border bg-transparent px-2 py-1.5 dark:border-gray-700" /></td><td className="px-3 py-3"><button onClick={() => setPoForm((form: any) => ({ ...form, items: form.items.filter((_: any, i: number) => i !== index) }))} className="text-red-600"><Trash2 className="h-4 w-4" /></button></td></tr>)}{poForm.items.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-gray-500">Add tagged products from the left.</td></tr>}</tbody></table></div></div></div>
          <div className="grid gap-4 md:grid-cols-4">{['tax_amount', 'discount_amount', 'shipping_cost', 'other_charges'].map((field) => <label key={field} className="text-sm"><span className="mb-1 block font-medium capitalize">{field.replaceAll('_', ' ')}</span><input type="number" min="0" step="0.01" value={poForm[field]} onChange={(e) => setPoForm({ ...poForm, [field]: Number(e.target.value) })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700" /></label>)}</div><textarea value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} placeholder="PO notes" rows={2} className="w-full rounded-xl border bg-transparent p-3 dark:border-gray-700" /><div className="flex justify-end"><button disabled={working} onClick={submitPo} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{working && <Loader2 className="h-4 w-4 animate-spin" />} Create PO</button></div>
        </div>
      </Modal>

      <Modal open={!!receivePo} title={`Receive ${receivePo?.po_number || 'Purchase Order'}`} onClose={() => setReceivePo(null)} wide>
        <div className="space-y-4">{receiveItems.map((item, index) => <div key={item.item_id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-5 dark:border-gray-700"><div className="md:col-span-1"><div className="text-xs text-gray-500">Product</div><div className="font-medium">{item.product_name}</div></div><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Quantity</span><input type="number" min="1" value={item.quantity_received} onChange={(e) => setReceiveItems((rows) => rows.map((row, i) => i === index ? { ...row, quantity_received: e.target.value } : row))} className="w-full rounded-lg border bg-transparent px-2 py-2 dark:border-gray-700" /></label><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Batch Number</span><input value={item.batch_number} onChange={(e) => setReceiveItems((rows) => rows.map((row, i) => i === index ? { ...row, batch_number: e.target.value } : row))} className="w-full rounded-lg border bg-transparent px-2 py-2 dark:border-gray-700" /></label><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Manufactured</span><input type="date" value={item.manufactured_date} onChange={(e) => setReceiveItems((rows) => rows.map((row, i) => i === index ? { ...row, manufactured_date: e.target.value } : row))} className="w-full rounded-lg border bg-transparent px-2 py-2 dark:border-gray-700" /></label><label className="text-sm"><span className="mb-1 block text-xs text-gray-500">Expiry</span><input type="date" value={item.expiry_date} onChange={(e) => setReceiveItems((rows) => rows.map((row, i) => i === index ? { ...row, expiry_date: e.target.value } : row))} className="w-full rounded-lg border bg-transparent px-2 py-2 dark:border-gray-700" /></label></div>)}<div className="flex justify-end"><button disabled={working} onClick={submitReceive} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">Receive into Inventory</button></div></div>
      </Modal>

      <Modal open={paymentModal} title="Record Resell Vendor Payment" onClose={() => setPaymentModal(false)} wide>
        <div className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><label className="text-sm"><span className="mb-1 block font-medium">Vendor</span><select value={paymentForm.resell_vendor_id} onChange={(e) => setPaymentForm({ ...paymentForm, resell_vendor_id: e.target.value, allocations: [], amount: '' })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700"><option value="">Select vendor</option>{activeVendors.map((v) => <option key={v.id} value={v.id}>{v.vendor?.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Payment Method</span><select value={paymentForm.payment_method_id} onChange={(e) => setPaymentForm({ ...paymentForm, payment_method_id: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700"><option value="">Select method</option>{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Payment Date</span><input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} className="w-full rounded-xl border bg-transparent px-3 py-2.5 dark:border-gray-700" /></label><label className="text-sm"><span className="mb-1 block font-medium">Payment Total</span><input type="number" min="0" step="0.01" value={paymentForm.amount} readOnly className="w-full rounded-xl border bg-gray-50 px-3 py-2.5 font-semibold dark:border-gray-700 dark:bg-gray-800" /></label></div><div className="overflow-hidden rounded-xl border dark:border-gray-700"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800"><tr><th className="px-4 py-3">PO</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Pay Now</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y dark:divide-gray-800">{outstandingForPayment.map((po) => { const allocation = paymentForm.allocations.find((row: any) => row.purchase_order_id === po.id); return <tr key={po.id}><td className="px-4 py-3 font-medium">{po.po_number}</td><td className="px-4 py-3">{money(po.total_amount)}</td><td className="px-4 py-3 text-amber-600">{money(po.outstanding_amount)}</td><td className="px-4 py-3"><input type="number" min="0" max={po.outstanding_amount} step="0.01" value={allocation?.amount || ''} onChange={(e) => setAllocation(po, e.target.value)} className="w-32 rounded-lg border bg-transparent px-2 py-1.5 dark:border-gray-700" /></td><td className="px-4 py-3"><button onClick={() => setAllocation(po, String(po.outstanding_amount))} className="rounded-lg border px-3 py-1.5 text-xs font-medium dark:border-gray-700">Pay full</button></td></tr>; })}{paymentForm.resell_vendor_id && outstandingForPayment.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-gray-500">This vendor has no outstanding resell POs.</td></tr>}{!paymentForm.resell_vendor_id && <tr><td colSpan={5} className="p-10 text-center text-gray-500">Choose a vendor to see outstanding POs.</td></tr>}</tbody></table></div><textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Payment note or transaction reference" rows={2} className="w-full rounded-xl border bg-transparent p-3 dark:border-gray-700" /><div className="flex justify-end"><button disabled={working || Number(paymentForm.amount) <= 0} onClick={submitPayment} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{working && <Loader2 className="h-4 w-4 animate-spin" />} Record Payment</button></div></div>
      </Modal>
    </div>
  );
}
