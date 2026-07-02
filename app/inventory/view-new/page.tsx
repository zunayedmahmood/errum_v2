'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Boxes,
  Building2,
  CalendarDays,
  Download,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  X,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import categoryService from '@/services/categoryService';
import { useAuth } from '@/contexts/AuthContext';
import inventoryService, {
  InventoryDatePreset,
  InventoryOverviewBatch,
  InventoryOverviewItem,
  InventoryOverviewResponse,
  InventoryOverviewStoreRow,
  InventoryStockStatus,
} from '@/services/inventoryService';

interface Category {
  id: number;
  title: string;
  name?: string;
  slug?: string;
  parent_id?: number;
  children?: Category[];
  all_children?: Category[];
  subcategories?: Category[];
  full_path?: string;
}

type SheetRow = {
  rowKey: string;
  store: InventoryOverviewStoreRow | null;
  batch: InventoryOverviewBatch | null;
};

type InventoryStoreOption = InventoryOverviewResponse['stores'][number];

const DATE_PRESETS: Array<{ value: InventoryDatePreset; label: string }> = [
  { value: '365', label: 'Last 1 year' },
  { value: '90', label: 'Last 90 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
  { value: 'today', label: 'Today' },
  { value: 'custom', label: 'Custom range' },
];

const nf = new Intl.NumberFormat('en-US');

const number = (value: number | null | undefined, digits = 0) => {
  const n = Number(value || 0);
  return nf.format(digits > 0 ? Number(n.toFixed(digits)) : Math.round(n));
};

const formatPcs = (value: number | null | undefined) => `${number(value || 0)} PCS`;

const money = (value: number | null | undefined) => `BDT ${number(value || 0)}`;

const formatSkuList = (item: InventoryOverviewItem) => {
  const skus = Array.isArray(item.skus) && item.skus.length ? item.skus : (item.sku ? [item.sku] : []);
  const cleanSkus = Array.from(new Set(skus.map((sku) => String(sku || '').trim()).filter(Boolean)));
  if (!cleanSkus.length) return '-';
  return cleanSkus.join(', ');
};

const globalAvailableStock = (item: InventoryOverviewItem) =>
  Number(item.global_available_stock ?? item.current_stock ?? 0);

const physicalStock = (item: InventoryOverviewItem) =>
  Number(item.physical_stock ?? item.available_stock ?? Math.max(0, globalAvailableStock(item) - Number(item.reserved_stock || 0)));

const variationGlobalAvailableStock = (variation: InventoryOverviewItem['variations'][number]) =>
  Number(variation.global_available_stock ?? variation.current_stock ?? 0);

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysText = (value?: number | null) => {
  if (value === null || value === undefined) return 'No sales';
  if (value > 3650) return 'Very high';
  return `${number(value, 1)} days`;
};

function getStatusLabel(status: InventoryStockStatus) {
  switch (status) {
    case 'out_of_stock': return 'Out of stock';
    case 'no_stock': return 'No stock';
    case 'low': return 'Low stock';
    case 'high': return 'High stock';
    case 'slow_moving': return 'Slow moving';
    default: return 'Normal';
  }
}

type CategoryOption = {
  id: number;
  label: string;
  title: string;
  depth: number;
  fullPath: string;
};

function categoryTitle(category: Category) {
  return category.title || category.name || `Category ${category.id}`;
}

function categoryChildren(category: Category): Category[] {
  return [
    ...(Array.isArray(category.children) ? category.children : []),
    ...(Array.isArray(category.all_children) ? category.all_children : []),
    ...(Array.isArray(category.subcategories) ? category.subcategories : []),
  ].filter(Boolean);
}

function flattenCategoryOptions(categories: Category[], depth = 0, parentPath = '', seen = new Set<number>()): CategoryOption[] {
  return (categories || []).flatMap((category) => {
    if (!category || seen.has(category.id)) return [];
    seen.add(category.id);
    const title = categoryTitle(category);
    const fullPath = category.full_path || (parentPath ? `${parentPath} / ${title}` : title);
    const row = { id: category.id, label: `${'— '.repeat(depth)}${title}`, title, depth, fullPath };
    return [row, ...flattenCategoryOptions(categoryChildren(category), depth + 1, fullPath, seen)];
  });
}

function collectCategoryAndDescendantIds(categories: Category[], selectedIds: number[]): number[] {
  const selected = new Set(selectedIds.map(Number).filter(Boolean));
  const collected = new Set<number>();

  const walk = (items: Category[], parentSelected = false) => {
    for (const category of items || []) {
      const isSelected = selected.has(Number(category.id));
      const shouldInclude = parentSelected || isSelected;
      if (shouldInclude) collected.add(Number(category.id));
      walk(categoryChildren(category), shouldInclude);
    }
  };

  walk(categories);
  selected.forEach((id) => collected.add(id));
  return Array.from(collected);
}

function getStatusClasses(status: InventoryStockStatus) {
  switch (status) {
    case 'out_of_stock':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border-red-200 dark:border-red-800';
    case 'low':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200 border-orange-200 dark:border-orange-800';
    case 'high':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border-blue-200 dark:border-blue-800';
    case 'slow_moving':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200 border-purple-200 dark:border-purple-800';
    case 'no_stock':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600';
    default:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800';
  }
}

function StatusBadge({ status }: { status: InventoryStockStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClasses(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        </div>
        <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function getSheetRows(item: InventoryOverviewItem): SheetRow[] {
  if (!item.stores?.length) {
    return [{ rowKey: `${item.group_key}:no-store`, store: null, batch: null }];
  }

  return item.stores.flatMap((store) => {
    if (!store.batches?.length) {
      return [{ rowKey: `${item.group_key}:${store.store_id}:no-batch`, store, batch: null }];
    }

    return store.batches.map((batch) => ({
      rowKey: `${item.group_key}:${store.store_id}:${batch.batch_id}`,
      store,
      batch,
    }));
  });
}

function variationSummary(item: InventoryOverviewItem) {
  if (!item.variations?.length) return '-';
  return item.variations
    .map((variation) => {
      const name = variation.variation_suffix || 'Default';
      return `${name}: ${formatPcs(variationGlobalAvailableStock(variation))}`;
    })
    .join(' | ');
}

function cleanVariationLabel(label?: string | null) {
  const text = String(label || '').trim();
  return text || 'Default';
}

function VariationStockCell({ item }: { item: InventoryOverviewItem }) {
  const variations = item.variations || [];

  if (!variations.length) {
    return <span className="text-gray-400">-</span>;
  }

  return (
    <div className="min-w-[180px] overflow-hidden rounded-sm border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {variations.map((variation, index) => (
        <div
          key={variation.product_id}
          className={`px-2 py-1 text-center text-[12px] font-bold leading-4 text-gray-800 dark:text-gray-100 ${
            index % 2 === 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-200 dark:bg-gray-700'
          } ${index > 0 ? 'border-t border-gray-300 dark:border-gray-600' : ''}`}
        >
          {cleanVariationLabel(variation.variation_suffix)}: {formatPcs(variationGlobalAvailableStock(variation))}
        </div>
      ))}
    </div>
  );
}

function recommendationText(item: InventoryOverviewItem) {
  const rec = item.movement_recommendation;
  if (!rec) return 'No move needed';
  return `Move ${number(rec.suggested_quantity)} from ${rec.from_store_name} to ${rec.to_store_name} (${rec.urgency})`;
}


type CsvValue = string | number | null | undefined;

const INVENTORY_CSV_HEADERS = [
  'Product Name',
  'SKU',
  'Category',
  'Subcategory',
  'Variation-suffix',
  'Global-available',
  'Physical stock',
  'Reserved',
  'Purchase',
  'Sell',
  'Dispatch Out',
  'Dispatch Receive',
  'Defect',
  'Velocity/Day',
  'Cover',
  'Retail Value',
  'Product Health',
  'Recommendation',
  'Store',
  'Store Stock',
  'Store Health',
  'Store Purchase',
  'Store Sell',
  'Store Revenue',
  'Store Dispatch Out',
  'Store Dispatch Receive',
  'Store Defect',
  'Store Velocity/Day',
  'Store Cover',
  'Store Value',
  'Store PO',
  'Store Batch',
  'PO',
  'Batch',
  'Batch Purchased',
  'Batch Remaining',
  'Batch Sold',
  'Sell-through %',
  'Batch Velocity/Day',
  'Received/Order Date',
  'Vendor',
  'Sell Price',
  'Batch Stock Value',
];

const csvCell = (value: CsvValue) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const rowsToCsv = (rows: CsvValue[][]) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;

function inventoryProductsToCsv(products: InventoryOverviewItem[], includeCostPrice = false) {
  const csvHeaders = includeCostPrice
    ? [
        ...INVENTORY_CSV_HEADERS.slice(0, INVENTORY_CSV_HEADERS.indexOf('Sell Price')),
        'Cost Price',
        ...INVENTORY_CSV_HEADERS.slice(INVENTORY_CSV_HEADERS.indexOf('Sell Price')),
      ]
    : INVENTORY_CSV_HEADERS;

  const dataRows = products.flatMap((item) => {
    const rows = getSheetRows(item);
    return rows.map(({ store, batch }) => [
      item.product_name,
      formatSkuList(item),
      item.category_name || 'Uncategorized',
      item.subcategory_name || '-',
      variationSummary(item),
      globalAvailableStock(item),
      physicalStock(item),
      item.reserved_stock,
      item.total_purchase,
      item.total_sell,
      item.total_dispatch_out,
      item.total_dispatch_received,
      item.total_defect,
      Number(item.velocity_per_day || 0).toFixed(3),
      daysText(item.days_of_cover),
      money(item.stock_value),
      getStatusLabel(item.stock_status),
      recommendationText(item),
      store?.store_name || '-',
      store ? store.current_stock : '-',
      store ? getStatusLabel(store.stock_status) : '-',
      store ? store.total_purchase : '-',
      store ? store.total_sell : '-',
      store ? money(store.sales_revenue) : '-',
      store ? store.total_dispatch_out : '-',
      store ? store.total_dispatch_received : '-',
      store ? store.total_defect : '-',
      store ? Number(store.velocity_per_day || 0).toFixed(3) : '-',
      store ? daysText(store.days_of_cover) : '-',
      store ? money(store.stock_value) : '-',
      store ? store.po_count : '-',
      store ? store.batch_count : '-',
      batch?.po_number || (batch ? 'Manual/Direct' : '-'),
      batch?.batch_number || '-',
      batch ? batch.original_qty : '-',
      batch ? batch.remaining_stock : '-',
      batch ? batch.units_sold : '-',
      batch ? Number(batch.sell_through_pct || 0).toFixed(1) : '-',
      batch ? Number(batch.velocity_per_day || 0).toFixed(3) : '-',
      batch ? formatDate(batch.po_received_date || batch.po_order_date || batch.batch_created_at) : '-',
      batch?.vendor_name || '-',
      ...(includeCostPrice ? [batch ? money(batch.cost_price) : '-'] : []),
      batch ? money(batch.sell_price) : '-',
      batch ? money(batch.stock_value) : '-',
    ]);
  });

  return rowsToCsv([csvHeaders, ...dataRows]);
}

function downloadCsvFile(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getAlignClass(align: 'left' | 'right' | 'center') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function SheetHeader({ children, frozen = false, align = 'left' }: { children: ReactNode; frozen?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={`sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-100 px-3 py-3 ${getAlignClass(align)} text-[11px] font-black uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${
        frozen ? 'left-0 z-30 min-w-[320px] shadow-[8px_0_14px_-14px_rgba(15,23,42,0.9)]' : 'whitespace-nowrap'
      }`}
    >
      {children}
    </th>
  );
}

function SheetCell({ children, strong = false, align = 'left', className = '' }: { children: ReactNode; strong?: boolean; align?: 'left' | 'right' | 'center'; className?: string }) {
  return (
    <td
      className={`border-b border-r border-gray-100 px-3 py-2.5 ${getAlignClass(align)} text-xs dark:border-gray-700 ${
        strong ? 'font-black text-gray-900 dark:text-white' : 'font-semibold text-gray-700 dark:text-gray-200'
      } ${className}`}
    >
      {children}
    </td>
  );
}

function ProductFrozenCell({ item, rowSpan }: { item: InventoryOverviewItem; rowSpan: number }) {
  return (
    <td
      rowSpan={rowSpan}
      className="sticky left-0 z-10 min-w-[320px] max-w-[320px] border-b border-r border-t-2 border-t-gray-300 border-gray-200 bg-white px-3 py-2.5 align-top shadow-[8px_0_14px_-14px_rgba(15,23,42,0.9)] group-hover:bg-gray-50 dark:border-gray-700 dark:border-t-gray-600 dark:bg-gray-800 dark:group-hover:bg-gray-900"
    >
      <p className="line-clamp-2 text-sm font-black leading-snug text-gray-900 dark:text-white">{item.product_name}</p>
      <p className="mt-1 line-clamp-2 text-[11px] font-bold text-gray-500 dark:text-gray-400">SKU: {formatSkuList(item)}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          Global: {formatPcs(globalAvailableStock(item))}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          Physical: {formatPcs(physicalStock(item))}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          {number(item.variations?.length || 0)} variations
        </span>
      </div>
    </td>
  );
}

type StoreColumnDef = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  adminOnly?: boolean;
  render: (store: InventoryOverviewStoreRow | null, batches: InventoryOverviewBatch[]) => ReactNode;
};

function getStoreRow(item: InventoryOverviewItem, storeId: number) {
  return (item.stores || []).find((store) => Number(store.store_id) === Number(storeId)) || null;
}

function getStoreBatches(store: InventoryOverviewStoreRow | null) {
  return store?.batches || [];
}

function uniqueBatchText(batches: InventoryOverviewBatch[], getter: (batch: InventoryOverviewBatch) => string | number | null | undefined, empty = '-') {
  const values = Array.from(new Set(batches.map((batch) => String(getter(batch) ?? '').trim()).filter(Boolean)));
  if (!values.length) return empty;
  return values.join(' | ');
}

function BatchLines({ batches, render, empty = '-' }: { batches: InventoryOverviewBatch[]; render: (batch: InventoryOverviewBatch) => ReactNode; empty?: ReactNode }) {
  if (!batches.length) return <>{empty}</>;
  return (
    <div className="min-w-[150px] space-y-1">
      {batches.map((batch) => (
        <div key={batch.batch_id} className="rounded bg-gray-50 px-1.5 py-1 text-[11px] font-bold dark:bg-gray-900">
          {render(batch)}
        </div>
      ))}
    </div>
  );
}

function StoreCollapsedCell({ store }: { store: InventoryOverviewStoreRow | null }) {
  if (!store) {
    return <span className="text-gray-400">No activity</span>;
  }

  return (
    <div className="min-w-[190px] space-y-1 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-gray-900 dark:text-white">{formatPcs(store.current_stock)}</span>
        <StatusBadge status={store.stock_status} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px] font-bold text-gray-500 dark:text-gray-400">
        <span>Sold: {number(store.total_sell)}</span>
        <span>PO: {number(store.po_count)}</span>
        <span>Batches: {number(store.batch_count)}</span>
        <span>Value: {money(store.stock_value)}</span>
      </div>
    </div>
  );
}

function getStoreColumns(canViewCostPrice: boolean): StoreColumnDef[] {
  const columns: StoreColumnDef[] = [
    { key: 'store', label: 'Store', className: 'min-w-[170px]', render: (store) => store?.store_name || '-' },
    { key: 'stock', label: 'Store stock', align: 'right', render: (store) => store ? formatPcs(store.current_stock) : '-' },
    { key: 'health', label: 'Store health', render: (store) => store ? <StatusBadge status={store.stock_status} /> : '-' },
    { key: 'purchase', label: 'Store purchase', align: 'right', render: (store) => store ? number(store.total_purchase) : '-' },
    { key: 'sell', label: 'Store sell', align: 'right', render: (store) => store ? number(store.total_sell) : '-' },
    { key: 'revenue', label: 'Store revenue', align: 'right', render: (store) => store ? money(store.sales_revenue) : '-' },
    { key: 'dispatch_out', label: 'Store dispatch out', align: 'right', render: (store) => store ? number(store.total_dispatch_out) : '-' },
    { key: 'dispatch_receive', label: 'Store dispatch receive', align: 'right', render: (store) => store ? number(store.total_dispatch_received) : '-' },
    { key: 'defect', label: 'Store defect', align: 'right', render: (store) => store ? number(store.total_defect) : '-' },
    { key: 'velocity', label: 'Store velocity/day', align: 'right', render: (store) => store ? number(store.velocity_per_day, 3) : '-' },
    { key: 'cover', label: 'Store cover', render: (store) => store ? daysText(store.days_of_cover) : '-' },
    { key: 'value', label: 'Store value', align: 'right', render: (store) => store ? money(store.stock_value) : '-' },
    { key: 'store_po', label: 'Store PO', align: 'right', render: (store) => store ? number(store.po_count) : '-' },
    { key: 'store_batch', label: 'Store batch', align: 'right', render: (store) => store ? number(store.batch_count) : '-' },
    { key: 'po', label: 'PO', className: 'min-w-[160px]', render: (_store, batches) => uniqueBatchText(batches, (batch) => batch.po_number || 'Manual/Direct') },
    { key: 'batch', label: 'Batch', className: 'min-w-[170px]', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => batch.batch_number || '-'} /> },
    { key: 'batch_purchased', label: 'Batch purchased', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => number(batch.original_qty)} /> },
    { key: 'batch_remaining', label: 'Batch remaining', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => number(batch.remaining_stock)} /> },
    { key: 'batch_sold', label: 'Batch sold', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => number(batch.units_sold)} /> },
    { key: 'sell_through', label: 'Sell-through', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => `${number(batch.sell_through_pct, 1)}%`} /> },
    { key: 'batch_velocity', label: 'Batch velocity/day', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => number(batch.velocity_per_day, 3)} /> },
    { key: 'received_date', label: 'Received/order date', className: 'min-w-[160px]', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => formatDate(batch.po_received_date || batch.po_order_date || batch.batch_created_at)} /> },
    { key: 'vendor', label: 'Vendor', className: 'min-w-[180px]', render: (_store, batches) => uniqueBatchText(batches, (batch) => batch.vendor_name) },
    { key: 'cost_price', label: 'Cost Price', align: 'right', adminOnly: true, render: (_store, batches) => <BatchLines batches={batches} render={(batch) => money(batch.cost_price)} /> },
    { key: 'sell_price', label: 'Sell price', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => money(batch.sell_price)} /> },
    { key: 'batch_stock_value', label: 'Batch stock value', align: 'right', render: (_store, batches) => <BatchLines batches={batches} render={(batch) => money(batch.stock_value)} /> },
  ];

  return columns.filter((column) => canViewCostPrice || !column.adminOnly);
}

function StoreColumnHeader({
  store,
  column,
  collapsed,
  onToggle,
}: {
  store: InventoryStoreOption;
  column: StoreColumnDef;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const storeName = store.name || `Store ${store.id}`;
  return (
    <SheetHeader align={column.align || 'left'}>
      <div className="relative pr-7">
        <span>{column.label} ({storeName})</span>
        {column.key === 'store' && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-0 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            title={collapsed ? `Open ${storeName} columns` : `Collapse ${storeName} columns`}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </SheetHeader>
  );
}

function InventorySheetTable({
  products,
  stores,
  canViewCostPrice,
}: {
  products: InventoryOverviewItem[];
  stores: InventoryStoreOption[];
  canViewCostPrice: boolean;
}) {
  const [collapsedStores, setCollapsedStores] = useState<Record<number, boolean>>({});
  const allStoreIds = useMemo(() => stores.map((store) => Number(store.id)).filter(Boolean), [stores]);
  const visibleStoreColumns = useMemo(() => getStoreColumns(canViewCostPrice), [canViewCostPrice]);

  useEffect(() => {
    setCollapsedStores((prev) => {
      const next = { ...prev };
      allStoreIds.forEach((storeId) => {
        if (next[storeId] === undefined) next[storeId] = true;
      });
      return next;
    });
  }, [allStoreIds]);

  const areAllExpanded = allStoreIds.length > 0 && allStoreIds.every((storeId) => collapsedStores[storeId] === false);
  const setAllCollapsed = (collapsed: boolean) => {
    setCollapsedStores(Object.fromEntries(allStoreIds.map((storeId) => [storeId, collapsed])));
  };

  const estimatedMinWidth = 2220 + stores.reduce((width, store) => {
    const collapsed = collapsedStores[Number(store.id)] !== false;
    return width + (collapsed ? 230 : (visibleStoreColumns.length * 170));
  }, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
          Store columns are collapsed by default. Open a branch to see stock, movement, PO, batch, vendor and price details for that branch.
        </p>
        <button
          type="button"
          onClick={() => setAllCollapsed(areAllExpanded)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {areAllExpanded ? 'Collapse all branches' : 'Open all branches'}
        </button>
      </div>
      <div className="relative max-h-[70vh] overflow-auto">
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: `${estimatedMinWidth}px` }}>
          <thead>
            <tr>
              <SheetHeader frozen>Product name</SheetHeader>
              <SheetHeader>Category</SheetHeader>
              <SheetHeader>Subcategory</SheetHeader>
              <SheetHeader>Variation-suffix</SheetHeader>
              <SheetHeader align="right">Global-available</SheetHeader>
              <SheetHeader align="right">Physical stock</SheetHeader>
              <SheetHeader align="right">Reserved</SheetHeader>
              <SheetHeader align="right">Purchase</SheetHeader>
              <SheetHeader align="right">Sell</SheetHeader>
              <SheetHeader align="right">Dispatch out</SheetHeader>
              <SheetHeader align="right">Dispatch receive</SheetHeader>
              <SheetHeader align="right">Defect</SheetHeader>
              <SheetHeader align="right">Velocity/day</SheetHeader>
              <SheetHeader>Cover</SheetHeader>
              <SheetHeader align="right">Retail value</SheetHeader>
              <SheetHeader>Product health</SheetHeader>
              <SheetHeader>Recommendation</SheetHeader>
              {stores.map((store) => {
                const storeId = Number(store.id);
                const collapsed = collapsedStores[storeId] !== false;
                if (collapsed) {
                  return (
                    <SheetHeader key={`collapsed-${storeId}`}>
                      <div className="relative pr-7">
                        <span>Store ({store.name || `Store ${store.id}`})</span>
                        <button
                          type="button"
                          onClick={() => setCollapsedStores((prev) => ({ ...prev, [storeId]: false }))}
                          className="absolute right-0 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                          title={`Open ${store.name || `Store ${store.id}`} columns`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </SheetHeader>
                  );
                }

                return visibleStoreColumns.map((column) => (
                  <StoreColumnHeader
                    key={`${storeId}-${column.key}`}
                    store={store}
                    column={column}
                    collapsed={collapsed}
                    onToggle={() => setCollapsedStores((prev) => ({ ...prev, [storeId]: true }))}
                  />
                ));
              })}
            </tr>
          </thead>
          <tbody>
            {products.map((item) => (
              <tr key={item.group_key} className="group hover:bg-gray-50 dark:hover:bg-gray-900">
                <ProductFrozenCell item={item} rowSpan={1} />
                <SheetCell className="min-w-[160px]">{item.category_name || 'Uncategorized'}</SheetCell>
                <SheetCell className="min-w-[160px]">{item.subcategory_name || '-'}</SheetCell>
                <SheetCell className="min-w-[220px] p-1"><VariationStockCell item={item} /></SheetCell>
                <SheetCell align="right" strong>{formatPcs(globalAvailableStock(item))}</SheetCell>
                <SheetCell align="right" strong>{formatPcs(physicalStock(item))}</SheetCell>
                <SheetCell align="right">{formatPcs(item.reserved_stock)}</SheetCell>
                <SheetCell align="right">{number(item.total_purchase)}</SheetCell>
                <SheetCell align="right">{number(item.total_sell)}</SheetCell>
                <SheetCell align="right">{number(item.total_dispatch_out)}</SheetCell>
                <SheetCell align="right">{number(item.total_dispatch_received)}</SheetCell>
                <SheetCell align="right">{number(item.total_defect)}</SheetCell>
                <SheetCell align="right">{number(item.velocity_per_day, 3)}</SheetCell>
                <SheetCell>{daysText(item.days_of_cover)}</SheetCell>
                <SheetCell align="right">{money(item.stock_value)}</SheetCell>
                <SheetCell><StatusBadge status={item.stock_status} /></SheetCell>
                <SheetCell className="min-w-[320px]">{recommendationText(item)}</SheetCell>
                {stores.map((storeOption) => {
                  const storeId = Number(storeOption.id);
                  const store = getStoreRow(item, storeId);
                  const batches = getStoreBatches(store);
                  const collapsed = collapsedStores[storeId] !== false;

                  if (collapsed) {
                    return (
                      <SheetCell key={`${item.group_key}-${storeId}-collapsed`} className="min-w-[230px]">
                        <StoreCollapsedCell store={store} />
                      </SheetCell>
                    );
                  }

                  return visibleStoreColumns.map((column) => (
                    <SheetCell
                      key={`${item.group_key}-${storeId}-${column.key}`}
                      align={column.align || 'left'}
                      strong={['stock', 'batch_remaining'].includes(column.key)}
                      className={column.className || 'min-w-[140px]'}
                    >
                      {column.render(store, batches)}
                    </SheetCell>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ViewInventoryPageContent() {
  const { darkMode, setDarkMode } = useTheme();
  const { role } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<number>(0);
  const [sizeFilter, setSizeFilter] = useState('');
  const [datePreset, setDatePreset] = useState<InventoryDatePreset>('365');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [data, setData] = useState<InventoryOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canViewCostPrice = ['super-admin', 'admin'].includes(String(role || ''));

  const fetchCategories = useCallback(async () => {
    try {
      const res: any = await categoryService.getTree(true);
      setCategories(Array.isArray(res) ? res : (res?.data || []));
    } catch (e) {
      console.warn('Failed to load categories', e);
    }
  }, []);

  const categoryOptions = useMemo(() => flattenCategoryOptions(categories), [categories]);
  const selectedCategoryIdsForFilter = useMemo(
    () => collectCategoryAndDescendantIds(categories, selectedCategoryIds),
    [categories, selectedCategoryIds]
  );
  const selectedCategoryFilterKey = selectedCategoryIdsForFilter.join(',');
  const filteredCategoryOptions = useMemo(() => {
    const term = categorySearchTerm.trim().toLowerCase();
    if (!term) return categoryOptions;
    return categoryOptions.filter((category) =>
      category.fullPath.toLowerCase().includes(term) ||
      category.title.toLowerCase().includes(term) ||
      category.label.toLowerCase().includes(term)
    );
  }, [categoryOptions, categorySearchTerm]);
  const selectedCategoryOptions = useMemo(
    () => categoryOptions.filter((category) => selectedCategoryIds.includes(category.id)),
    [categoryOptions, selectedCategoryIds]
  );

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await inventoryService.getInventoryOverview({
        date_preset: datePreset,
        start_date: datePreset === 'custom' ? startDate || undefined : undefined,
        end_date: datePreset === 'custom' ? endDate || undefined : undefined,
        category_ids: selectedCategoryFilterKey || undefined,
        store_id: selectedStoreId || undefined,
        size: sizeFilter.trim() || undefined,
        search: appliedSearch || undefined,
        page,
        per_page: perPage,
        skipStoreScope: true,
      });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load inventory overview.');
    } finally {
      setLoading(false);
    }
  }, [datePreset, startDate, endDate, selectedCategoryFilterKey, selectedStoreId, sizeFilter, appliedSearch, page, perPage]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const resetToFirstPage = () => setPage(1);

  const summary = data?.summary;
  const products = data?.items || [];
  const storeOptions = data?.stores || [];
  const selectedStoreName = selectedStoreId
    ? storeOptions.find((store) => Number(store.id) === Number(selectedStoreId))?.name || `Store ${selectedStoreId}`
    : 'All branches';
  const tableStores = selectedStoreId
    ? storeOptions.filter((store) => Number(store.id) === Number(selectedStoreId))
    : storeOptions;

  const fetchFilteredProductsForExport = useCallback(async () => {
    const exportPerPage = 500;
    const baseParams = {
      date_preset: datePreset,
      start_date: datePreset === 'custom' ? startDate || undefined : undefined,
      end_date: datePreset === 'custom' ? endDate || undefined : undefined,
      category_ids: selectedCategoryFilterKey || undefined,
      store_id: selectedStoreId || undefined,
      size: sizeFilter.trim() || undefined,
      search: appliedSearch || undefined,
      per_page: exportPerPage,
      skipStoreScope: true,
    };

    const first = await inventoryService.getInventoryOverview({
      ...baseParams,
      page: 1,
    });

    let exportProducts = first.data.items || [];
    const lastPage = first.data.last_page || 1;

    for (let currentPage = 2; currentPage <= lastPage; currentPage += 1) {
      const res = await inventoryService.getInventoryOverview({
        ...baseParams,
        page: currentPage,
      });
      exportProducts = [...exportProducts, ...(res.data.items || [])];
    }

    return exportProducts;
  }, [datePreset, startDate, endDate, selectedCategoryFilterKey, selectedStoreId, sizeFilter, appliedSearch]);

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true);
      const exportProducts = data && data.last_page <= 1 ? products : await fetchFilteredProductsForExport();

      if (!exportProducts.length) {
        alert('No inventory rows found for the selected view.');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const branchSlug = selectedStoreName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'all-branches';
      downloadCsvFile(inventoryProductsToCsv(exportProducts, canViewCostPrice), `inventory_${branchSlug}_${stamp}.csv`);
    } catch (e) {
      console.error('Failed to export selected inventory view:', e);
      alert('Failed to export the selected inventory view. Please try again.');
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Inventory View New</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  New spreadsheet-style inventory view where each branch has collapsible stock, movement, PO, batch, vendor and price columns.
                </p>
                {data?.filters && (
                  <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Movement period: {formatDate(data.filters.start_date)} to {formatDate(data.filters.end_date)} · Branch: {selectedStoreName} · Global-available is latest live stock; physical stock is global-available minus reserved.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={loading || exportingCsv || !products.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className={`h-4 w-4 ${exportingCsv ? 'animate-pulse' : ''}`} />
                  {exportingCsv ? 'Exporting...' : 'Export CSV'}
                </button>
                <button
                  type="button"
                  onClick={fetchOverview}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</label>
                  <select
                    value={datePreset}
                    onChange={(e) => {
                      setDatePreset(e.target.value as InventoryDatePreset);
                      resetToFirstPage();
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    {DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Branch / Store</label>
                  <select
                    value={selectedStoreId || ''}
                    onChange={(e) => {
                      setSelectedStoreId(Number(e.target.value || 0));
                      resetToFirstPage();
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">All branches</option>
                    {storeOptions.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}{store.store_code ? ` (${store.store_code})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] font-semibold text-gray-400">Select a branch to show only that branch's live stock and movement.</p>
                </div>

                {datePreset === 'custom' && (
                  <>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Start</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); resetToFirstPage(); }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">End</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); resetToFirstPage(); }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </>
                )}

                <div className={datePreset === 'custom' ? 'lg:col-span-3' : 'lg:col-span-3'}>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Categories / Subcategories</label>
                  <div className="rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-700">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={categorySearchTerm}
                        onChange={(e) => setCategorySearchTerm(e.target.value)}
                        placeholder="Search parent category, subcategory, nested category..."
                        className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-xs font-semibold text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      />
                      {categorySearchTerm && (
                        <button
                          type="button"
                          onClick={() => setCategorySearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {selectedCategoryOptions.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {selectedCategoryOptions.map((category) => (
                          <button
                            type="button"
                            key={category.id}
                            onClick={() => {
                              setSelectedCategoryIds((prev) => prev.filter((id) => id !== category.id));
                              resetToFirstPage();
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                            title={category.fullPath}
                          >
                            {category.title}
                            <X className="h-3 w-3" />
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setSelectedCategoryIds([]); resetToFirstPage(); }}
                          className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                        >
                          Clear all
                        </button>
                      </div>
                    )}

                    <div className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                      {filteredCategoryOptions.length > 0 ? (
                        filteredCategoryOptions.map((category) => {
                          const checked = selectedCategoryIds.includes(category.id);
                          return (
                            <label
                              key={category.id}
                              className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-2 py-2 text-xs font-semibold text-gray-800 last:border-b-0 hover:bg-white dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
                              style={{ paddingLeft: `${8 + category.depth * 18}px` }}
                              title={category.fullPath}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const categoryId = category.id;
                                  const isChecked = e.currentTarget.checked;
                                  setSelectedCategoryIds((prev) =>
                                    isChecked
                                      ? Array.from(new Set([...prev, categoryId]))
                                      : prev.filter((id) => id !== categoryId)
                                  );
                                  resetToFirstPage();
                                }}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="min-w-0 flex-1 truncate">{category.label}</span>
                              {category.depth > 0 && <span className="text-[10px] font-bold uppercase text-gray-400">Sub</span>}
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-3 py-4 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">No matching category found.</div>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-gray-400">Selecting a parent category also includes all nested subcategories in the inventory filter.</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Size / Variation</label>
                  <input
                    value={sizeFilter}
                    onChange={(e) => { setSizeFilter(e.target.value); resetToFirstPage(); }}
                    placeholder="e.g. XL, 42, 6 Yards"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setAppliedSearch(draftSearch.trim());
                          resetToFirstPage();
                        }
                      }}
                      placeholder="Product, SKU, variation"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2 lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => { setAppliedSearch(draftSearch.trim()); resetToFirstPage(); }}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {summary && (
              <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
                <MetricCard icon={Package} label="Products" value={number(summary.total_products)} hint={`${number(summary.page_products)} on page`} />
                <MetricCard icon={Boxes} label="Global Available" value={number(summary.total_current_stock)} />
                <MetricCard icon={Boxes} label="Physical Stock" value={number(summary.total_available_stock)} hint="Global - reserved" />
                <MetricCard icon={ShoppingCart} label="Sold" value={number(summary.total_sell)} hint="In selected period" />
                <MetricCard icon={CalendarDays} label="Purchased" value={number(summary.total_purchase)} hint="PO received/ordered" />
                <MetricCard icon={Truck} label="Dispatch Out" value={number(summary.total_dispatch_out)} />
                <MetricCard icon={Building2} label="Dispatch Receive" value={number(summary.total_dispatch_received)} />
                <MetricCard icon={AlertTriangle} label="Low Stock" value={number(summary.low_stock_count)} />
                <MetricCard icon={ArrowRightLeft} label="Suggestions" value={number(summary.recommendation_count)} />
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <p className="text-sm font-black text-gray-900 dark:text-white">Inventory sheet</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Branch/store columns are grouped by branch. Each branch is collapsed by default; open only the branches you need. CSV export respects the current branch/date/category/subcategory/size/search filters.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Rows</span>
                  <select
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center p-16 text-gray-500 dark:text-gray-400">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading inventory sheet...
                </div>
              ) : products.length === 0 ? (
                <div className="p-16 text-center text-gray-500 dark:text-gray-400">
                  <Package className="mx-auto mb-3 h-12 w-12 opacity-60" />
                  No products found for this filter.
                </div>
              ) : (
                <InventorySheetTable products={products} stores={tableStores} canViewCostPrice={canViewCostPrice} />
              )}

              {data && data.last_page > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    Page {data.page} of {data.last_page} · {number(data.total)} product groups
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-white"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= data.last_page || loading}
                      onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-white"
                    >
                      Next
                    </button>
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

export default function ViewInventoryPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-300">Loading inventory view new...</div>}>
      <ViewInventoryPageContent />
    </Suspense>
  );
}
