'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  BarChart3,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Tag,
  Package,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import orderService, { type Order as ApiOrder, type OrderFilters } from '@/services/orderService';
import inventoryService, { type GlobalInventoryItem } from '@/services/inventoryService';
import productService, { type Product } from '@/services/productService';
import categoryService, { type Category } from '@/services/groupInventory';

type Metric = 'units' | 'net_sales';

type ProductAgg = {
  product_id: number;
  name: string;
  sku: string;
  category_id: number;
  units: number;
  gross: number;
  discount: number;
  tax: number;
  net: number;
  discountedNet: number;
  fullPriceNet: number;
};

type CategoryAgg = {
  category_id: number;
  category_name: string;
  units: number;
  net: number;
  stock_units: number;
};

type WeeklyRow = {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  top: { category: string; units: number }[];
  slow: { category: string; units: number }[];
};

function toNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  const n = Number(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function yyyyMmDd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function getWeekStartISO(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday as week start
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return yyyyMmDd(d);
}

function formatMoney(n: number): string {
  // Keep it simple (no locale surprises)
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  return fixed;
}

// Minimal CSV parser (supports quoted fields + commas + newlines)
function parseCsvText(text: string, maxRows = 60): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) break;
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    field += ch;
  }

  if (rows.length < maxRows && (field.length > 0 || row.length > 0)) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export default function InventoryReportsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState<string>(yyyyMmDd(addDays(today, -30)));
  const [dateTo, setDateTo] = useState<string>(yyyyMmDd(today));
  const [metric, setMetric] = useState<Metric>('units');
  const [topN, setTopN] = useState<number>(10);
  const [lowThresholdUnits, setLowThresholdUnits] = useState<number>(5);
  const [weeksToShow, setWeeksToShow] = useState<number>(8);
  const [types, setTypes] = useState({
    counter: true,
    social_commerce: true,
    ecommerce: true,
  });
  const [statuses, setStatuses] = useState({
    confirmed: true,
    completed: true,
    pending: false,
  });

  // CSV Exports (Reporting API)
  const [csvStoreId, setCsvStoreId] = useState('');
  const [csvStatus, setCsvStatus] = useState(''); // empty = all statuses
  const [csvCustomerId, setCsvCustomerId] = useState(''); // Sales/Booking CSV only
  const [csvCategoryId, setCsvCategoryId] = useState(''); // Stock CSV only
  const [csvProductId, setCsvProductId] = useState(''); // Stock/Booking CSV only
  const [csvIncludeInactive, setCsvIncludeInactive] = useState(false); // Stock CSV only
  const [csvBusy, setCsvBusy] = useState<{ category: boolean; sales: boolean; stock: boolean; booking: boolean }>({
    category: false,
    sales: false,
    stock: false,
    booking: false,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewHeader, setPreviewHeader] = useState<string[]>([]);
  const [previewBody, setPreviewBody] = useState<string[][]>([]);
  const [previewError, setPreviewError] = useState('');

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isTruncated, setIsTruncated] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventory, setInventory] = useState<GlobalInventoryItem[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    setIsTruncated(false);
    try {
      // Fetch reference data (products/categories/stock)
      const [catRes, invRes] = await Promise.all([
        categoryService.getCategories({ per_page: 1000 }),
        inventoryService.getGlobalInventory(),
      ]);

      const categoriesData: Category[] = (catRes as any)?.data?.data || (catRes as any)?.data || [];
      setCategories(categoriesData);

      const inventoryData: GlobalInventoryItem[] = (invRes as any)?.data || [];
      setInventory(inventoryData);

      // Products can be paginated; fetch multiple pages up to a sane limit.
      const allProducts: Product[] = [];
      let page = 1;
      const perPage = 500;
      for (let i = 0; i < 10; i++) {
        const res = await productService.getAll({ per_page: perPage, page });
        allProducts.push(...(res.data || []));
        if (page >= (res.last_page || 1)) break;
        page += 1;
      }
      setProducts(allProducts);

      // Fetch orders based on current filters
      const fetched = await fetchOrders();
      setOrders(fetched.orders);
      setIsTruncated(fetched.isTruncated);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async (): Promise<{ orders: ApiOrder[]; isTruncated: boolean }> => {
    const selectedTypes = Object.entries(types)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const selectedStatuses = Object.entries(statuses)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const maxPagesPerQuery = 25; // hard limit to protect the browser
    const perPage = 200;
    let truncated = false;

    const all: ApiOrder[] = [];

    for (const order_type of selectedTypes) {
      for (const status of selectedStatuses) {
        let page = 1;
        while (true) {
          const params: OrderFilters = {
            order_type: order_type as any,
            status,
            date_from: dateFrom,
            date_to: dateTo,
            sort_by: 'created_at',
            sort_order: 'desc',
            per_page: perPage,
            page,
          };

          const res = await orderService.getAll(params);
          all.push(...(res.data || []));
          if (page >= (res.last_page || 1)) break;
          page += 1;
          if (page > maxPagesPerQuery) {
            truncated = true;
            break;
          }
        }
      }
    }

    // De-dup by order id (because we may fetch multiple statuses/types)
    const uniq = new Map<number, ApiOrder>();
    for (const o of all) uniq.set(o.id, o);
    return { orders: Array.from(uniq.values()), isTruncated: truncated };
  };

  // --- CSV Exports (Reporting API) helpers ---
  const buildCategorySalesQuery = () => {
    const q = new URLSearchParams();
    if (dateFrom) q.set('date_from', dateFrom);
    if (dateTo) q.set('date_to', dateTo);
    if (csvStoreId.trim()) q.set('store_id', csvStoreId.trim());
    if (csvStatus.trim()) q.set('status', csvStatus.trim());
    return q;
  };

  const buildSalesQuery = () => {
    const q = buildCategorySalesQuery();
    if (csvCustomerId.trim()) q.set('customer_id', csvCustomerId.trim());
    return q;
  };

  const buildStockQuery = () => {
    const q = new URLSearchParams();
    if (csvStoreId.trim()) q.set('store_id', csvStoreId.trim());
    if (csvCategoryId.trim()) q.set('category_id', csvCategoryId.trim());
    if (csvProductId.trim()) q.set('product_id', csvProductId.trim());
    if (csvIncludeInactive) q.set('include_inactive', 'true');
    return q;
  };

  const buildBookingQuery = () => {
    const q = new URLSearchParams();
    if (dateFrom) q.set('date_from', dateFrom);
    if (dateTo) q.set('date_to', dateTo);
    if (csvStoreId.trim()) q.set('store_id', csvStoreId.trim());
    if (csvStatus.trim()) q.set('status', csvStatus.trim());
    if (csvCustomerId.trim()) q.set('customer_id', csvCustomerId.trim());
    if (csvProductId.trim()) q.set('product_id', csvProductId.trim());
    return q;
  };

  const getAuthHeader = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') || '' : '';
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const downloadCsv = async (endpoint: string, query: URLSearchParams) => {
    const res = await fetch(`${endpoint}?${query.toString()}`, { headers: { ...getAuthHeader() } });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Failed to download report');
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/i);
    const filename = m?.[1] || 'report.csv';

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const previewCsv = async (endpoint: string, query: URLSearchParams) => {
    const res = await fetch(`${endpoint}?${query.toString()}`, { headers: { ...getAuthHeader() } });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Failed to load report');
    }
    const text = await res.text();
    const parsed = parseCsvText(text, 60);
    const header = parsed[0] || [];
    const body = parsed.slice(1);
    return { header, body };
  };

  const doDownloadCategory = async () => {
    setCsvBusy((s) => ({ ...s, category: true }));
    setPreviewError('');
    try {
      await downloadCsv('/api/reporting/csv/category-sales', buildCategorySalesQuery());
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to download CSV');
    } finally {
      setCsvBusy((s) => ({ ...s, category: false }));
    }
  };

  const doDownloadSales = async () => {
    setCsvBusy((s) => ({ ...s, sales: true }));
    setPreviewError('');
    try {
      await downloadCsv('/api/reporting/csv/sales', buildSalesQuery());
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to download CSV');
    } finally {
      setCsvBusy((s) => ({ ...s, sales: false }));
    }
  };

  const doDownloadStock = async () => {
    setCsvBusy((s) => ({ ...s, stock: true }));
    setPreviewError('');
    try {
      await downloadCsv('/api/reporting/csv/stock', buildStockQuery());
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to download CSV');
    } finally {
      setCsvBusy((s) => ({ ...s, stock: false }));
    }
  };

  const doDownloadBooking = async () => {
    setCsvBusy((s) => ({ ...s, booking: true }));
    setPreviewError('');
    try {
      await downloadCsv('/api/reporting/csv/booking', buildBookingQuery());
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to download CSV');
    } finally {
      setCsvBusy((s) => ({ ...s, booking: false }));
    }
  };

  const doPreview = async (type: 'category' | 'sales' | 'stock' | 'booking') => {
    setPreviewError('');
    try {
      const endpoint =
        type === 'category'
          ? '/api/reporting/csv/category-sales'
          : type === 'sales'
            ? '/api/reporting/csv/sales'
            : type === 'stock'
              ? '/api/reporting/csv/stock'
              : '/api/reporting/csv/booking';

      const q =
        type === 'category'
          ? buildCategorySalesQuery()
          : type === 'sales'
            ? buildSalesQuery()
            : type === 'stock'
              ? buildStockQuery()
              : buildBookingQuery();

      const { header, body } = await previewCsv(endpoint, q);
      setPreviewTitle(
        type === 'category'
          ? 'Category Sales CSV'
          : type === 'sales'
            ? 'Sales CSV'
            : type === 'stock'
              ? 'Stock CSV'
              : 'Booking CSV'
      );
      setPreviewHeader(header);
      setPreviewBody(body);
      setPreviewOpen(true);
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to preview CSV');
    }
  };

  const categoryName = (categoryId: number): string => {
    if (!categoryId) return 'Uncategorized';
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return 'Uncategorized';
    if (cat.parent_id) {
      const parent = categories.find((p) => p.id === cat.parent_id);
      return parent ? `${parent.title} / ${cat.title}` : cat.title;
    }
    return cat.title;
  };

  const report = useMemo(() => {
    // Maps
    const productById = new Map<number, Product>();
    products.forEach((p) => productById.set(p.id, p));

    const stockByProductId = new Map<number, number>();
    inventory.forEach((inv) => stockByProductId.set(inv.product_id, inv.total_quantity || 0));

    const productAgg = new Map<number, ProductAgg>();
    const categoryAgg = new Map<number, CategoryAgg>();
    const weekly = new Map<string, Map<number, number>>(); // weekStart -> categoryId -> units

    let discountedSales = 0;
    let fullPriceSales = 0;
    let totalUnits = 0;
    let totalNetSales = 0;

    for (const o of orders) {
      // Basic guard
      if (!o || !Array.isArray(o.items)) continue;
      if (String(o.status || '').toLowerCase() === 'cancelled') continue;

      const orderDate = new Date(o.order_date || o.created_at);
      const weekStart = getWeekStartISO(orderDate);

      for (const item of o.items || []) {
        const qty = toNumber(item.quantity);
        if (qty <= 0) continue;

        const unitPrice = toNumber(item.unit_price);
        const gross = unitPrice * qty;
        const discount = toNumber(item.discount_amount);
        const tax = toNumber(item.tax_amount);
        const totalAmount = toNumber(item.total_amount);
        const net = totalAmount > 0 ? totalAmount : gross - discount + tax;

        const discounted = discount > 0.000001;

        totalUnits += qty;
        totalNetSales += net;
        if (discounted) discountedSales += net;
        else fullPriceSales += net;

        const product = productById.get(item.product_id);
        const productName =
          product?.name || (item as any).product_name || (item as any).name || 'Unknown Product';
        const sku =
          product?.sku || (item as any).product_sku || (item as any).sku || (item as any).productSku || 'NO-SKU';
        const category_id = product?.category_id || 0;

        // Product agg
        const existing = productAgg.get(item.product_id);
        const next: ProductAgg = existing
          ? { ...existing }
          : {
              product_id: item.product_id,
              name: productName,
              sku,
              category_id,
              units: 0,
              gross: 0,
              discount: 0,
              tax: 0,
              net: 0,
              discountedNet: 0,
              fullPriceNet: 0,
            };
        next.units += qty;
        next.gross += gross;
        next.discount += discount;
        next.tax += tax;
        next.net += net;
        if (discounted) next.discountedNet += net;
        else next.fullPriceNet += net;
        productAgg.set(item.product_id, next);

        // Category agg
        const catId = category_id || 0;
        const catExisting = categoryAgg.get(catId);
        const catNext: CategoryAgg = catExisting
          ? { ...catExisting }
          : {
              category_id: catId,
              category_name: categoryName(catId),
              units: 0,
              net: 0,
              stock_units: 0,
            };
        catNext.units += qty;
        catNext.net += net;
        categoryAgg.set(catId, catNext);

        // Weekly
        if (!weekly.has(weekStart)) weekly.set(weekStart, new Map());
        const wk = weekly.get(weekStart)!;
        wk.set(catId, (wk.get(catId) || 0) + qty);
      }
    }

    // Attach category stock
    for (const p of products) {
      const catId = p.category_id || 0;
      const stock = stockByProductId.get(p.id) || 0;
      const cat = categoryAgg.get(catId) || {
        category_id: catId,
        category_name: categoryName(catId),
        units: 0,
        net: 0,
        stock_units: 0,
      };
      cat.stock_units += stock;
      categoryAgg.set(catId, cat);
    }

    // Lists
    const productsList = Array.from(productAgg.values());
    const categoriesList = Array.from(categoryAgg.values());

    const sortByMetric = <T extends { units: number; net: number }>(arr: T[], m: Metric) => {
      const key = m === 'units' ? 'units' : 'net';
      return [...arr].sort((a: any, b: any) => (b[key] || 0) - (a[key] || 0));
    };

    const topProducts = sortByMetric(productsList as any, metric).slice(0, topN);
    const topCategories = sortByMetric(categoriesList as any, metric).slice(0, topN);

    const zeroSellingProducts = products
      .filter((p) => (stockByProductId.get(p.id) || 0) > 0)
      .filter((p) => !productAgg.has(p.id))
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        category: categoryName(p.category_id || 0),
        stock: stockByProductId.get(p.id) || 0,
        units: 0,
        net: 0,
      }))
      .slice(0, 200);

    const lowSellingProducts = productsList
      .filter((p) => (stockByProductId.get(p.product_id) || 0) > 0)
      .filter((p) => p.units > 0 && p.units <= lowThresholdUnits)
      .sort((a, b) => a.units - b.units)
      .slice(0, 200)
      .map((p) => ({
        ...p,
        stock: stockByProductId.get(p.product_id) || 0,
        category: categoryName(p.category_id || 0),
        net: p.net, // ensure net is explicitly included for type safety
      }));

    const zeroSellingCategories = categoriesList
      .filter((c) => c.stock_units > 0)
      .filter((c) => c.units === 0)
      .sort((a, b) => b.stock_units - a.stock_units)
      .slice(0, 100);

    const lowSellingCategories = categoriesList
      .filter((c) => c.stock_units > 0)
      .filter((c) => c.units > 0 && c.units <= lowThresholdUnits)
      .sort((a, b) => a.units - b.units)
      .slice(0, 100);

    // Category sell-through (sold / (sold + stock))
    const categorySellThrough = categoriesList
      .filter((c) => c.stock_units > 0 || c.units > 0)
      .map((c) => {
        const denom = c.units + c.stock_units;
        const sellThrough = denom > 0 ? (c.units / denom) * 100 : 0;
        const soldVsStock = c.stock_units > 0 ? (c.units / c.stock_units) * 100 : 0;
        return { ...c, sellThrough, soldVsStock };
      })
      .sort((a, b) => b.sellThrough - a.sellThrough);

    // Weekly top/slow categories
    const weekKeys = Array.from(weekly.keys()).sort((a, b) => (a < b ? 1 : -1));
    const weeks = weekKeys.slice(0, weeksToShow).map((wk) => {
      const map = weekly.get(wk) || new Map();
      const rows = Array.from(map.entries()).map(([catId, units]) => ({
        catId,
        category: categoryName(catId),
        units,
      }));
      rows.sort((a, b) => b.units - a.units);

      const top = rows.slice(0, 5).map((r) => ({ category: r.category, units: r.units }));
      const slow = [...rows]
        .sort((a, b) => a.units - b.units)
        .slice(0, 5)
        .map((r) => ({ category: r.category, units: r.units }));

      const start = new Date(wk);
      const end = addDays(start, 6);
      return {
        weekStart: wk,
        weekEnd: yyyyMmDd(end),
        top,
        slow,
      } as WeeklyRow;
    });

    const discountedPct = totalNetSales > 0 ? (discountedSales / totalNetSales) * 100 : 0;
    const fullPct = totalNetSales > 0 ? (fullPriceSales / totalNetSales) * 100 : 0;

    return {
      totals: {
        orders: orders.length,
        units: totalUnits,
        netSales: totalNetSales,
        discountedSales,
        fullPriceSales,
        discountedPct,
        fullPct,
      },
      topProducts: topProducts as ProductAgg[],
      topCategories: topCategories as CategoryAgg[],
      zeroSellingProducts,
      lowSellingProducts,
      zeroSellingCategories,
      lowSellingCategories,
      categorySellThrough,
      weeks,
    };
  }, [orders, products, categories, inventory, metric, topN, lowThresholdUnits, weeksToShow]);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    setIsTruncated(false);
    try {
      const fetched = await fetchOrders();
      setOrders(fetched.orders);
      setIsTruncated(fetched.isTruncated);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to refresh orders');
    } finally {
      setLoading(false);
    }
  };

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <button
      type="button"
      onClick={onChange}
      className={`px-3 py-2 rounded-lg text-sm border transition-colors
        ${checked
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}
      `}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading inventory reports...</p>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-6">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-6 h-6" />
                  Inventory Sales Reports
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  High/low selling, discount share, sell-through, and weekly movement.
                </p>
                {isTruncated && (
                  <div className="mt-2 inline-flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    Data was truncated (too many pages). Narrow your date range for full accuracy.
                  </div>
                )}
                {error && (
                  <div className="mt-2 inline-flex items-center gap-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </div>

              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> Date from
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> Date to
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort metric</label>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="units">Units sold</option>
                    <option value="net_sales">Net sales (BDT)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Order types:</span>
                <Toggle
                  checked={types.counter}
                  onChange={() => setTypes((p) => ({ ...p, counter: !p.counter }))}
                  label="Counter"
                />
                <Toggle
                  checked={types.social_commerce}
                  onChange={() => setTypes((p) => ({ ...p, social_commerce: !p.social_commerce }))}
                  label="Social Commerce"
                />
                <Toggle
                  checked={types.ecommerce}
                  onChange={() => setTypes((p) => ({ ...p, ecommerce: !p.ecommerce }))}
                  label="E-commerce"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Order status:</span>
                <Toggle
                  checked={statuses.confirmed}
                  onChange={() => setStatuses((p) => ({ ...p, confirmed: !p.confirmed }))}
                  label="Confirmed"
                />
                <Toggle
                  checked={statuses.completed}
                  onChange={() => setStatuses((p) => ({ ...p, completed: !p.completed }))}
                  label="Completed"
                />
                <Toggle
                  checked={statuses.pending}
                  onChange={() => setStatuses((p) => ({ ...p, pending: !p.pending }))}
                  label="Pending"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Top N</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={topN}
                    onChange={(e) => setTopN(Math.max(1, Math.min(50, toNumber(e.target.value))))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Low-selling threshold (units)</label>
                  <input
                    type="number"
                    min={1}
                    value={lowThresholdUnits}
                    onChange={(e) => setLowThresholdUnits(Math.max(1, toNumber(e.target.value)))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Weekly rows to show</label>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    value={weeksToShow}
                    onChange={(e) => setWeeksToShow(Math.max(1, Math.min(26, toNumber(e.target.value))))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                After changing filters, hit <span className="font-semibold">Refresh</span>.
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Orders (in range)</p>
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{report.totals.orders}</p>
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Units sold</p>
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{report.totals.units}</p>
                  <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                    <Package className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Net sales</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">৳ {formatMoney(report.totals.netSales)}</p>
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                    <Tag className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sales Distribution</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200 mb-1">
                    <span className="inline-flex items-center gap-1 font-medium">Full Value</span>
                    <span className="font-bold">{report.totals.fullPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex shadow-inner">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-1000" 
                      style={{ width: `${Math.min(100, Math.max(0, report.totals.fullPct))}%` }} 
                    />
                    <div 
                      className="h-full bg-blue-500 transition-all duration-1000" 
                      style={{ width: `${Math.min(100, Math.max(0, report.totals.discountedPct))}%` }} 
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-2 font-medium">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 
                      ৳ {formatMoney(report.totals.fullPriceSales)}
                    </span>
                    <span className="flex items-center gap-1 text-right">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> 
                      ৳ {formatMoney(report.totals.discountedSales)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Insights Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm h-fit">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    Top Category Performance
                  </h3>
                  <span className="text-xs text-gray-500 font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">By {metric === 'units' ? 'Units' : 'Sales'}</span>
                </div>
                <div className="space-y-4">
                  {report.topCategories.slice(0, 7).map((c, i) => {
                    const maxVal = Math.max(...report.topCategories.map(cat => metric === 'units' ? cat.units : cat.net), 1);
                    return (
                        <ProgressBarChart 
                          key={c.category_id}
                          label={c.category_name}
                          value={metric === 'units' ? c.units : `৳ ${formatMoney(c.net)}`}
                          percentage={( (metric === 'units' ? c.units : c.net) / maxVal ) * 100}
                          colorClass={
                            i === 0 ? "bg-gradient-to-r from-blue-600 to-indigo-600" :
                            i === 1 ? "bg-gradient-to-r from-purple-600 to-pink-600" :
                            "bg-gradient-to-r from-blue-400 to-blue-600"
                          }
                        />
                    );
                  })}
                  {report.topCategories.length === 0 && <p className="text-center text-sm py-10 opacity-50">No data to display</p>}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm h-fit">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-500" />
                    Top Product Performance
                  </h3>
                  <span className="text-xs text-gray-500 font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">By {metric === 'units' ? 'Units' : 'Sales'}</span>
                </div>
                <div className="space-y-4">
                  {report.topProducts.slice(0, 7).map((p, i) => {
                    const maxVal = Math.max(...report.topProducts.map(prod => metric === 'units' ? prod.units : prod.net), 1);
                    return (
                        <ProgressBarChart 
                          key={p.product_id}
                          label={p.name}
                          subLabel={p.sku}
                          value={metric === 'units' ? p.units : `৳ ${formatMoney(p.net)}`}
                          percentage={( (metric === 'units' ? p.units : p.net) / maxVal ) * 100}
                          colorClass={
                            i === 0 ? "bg-gradient-to-r from-emerald-600 to-teal-600" :
                            i === 1 ? "bg-gradient-to-r from-orange-600 to-amber-600" :
                            "bg-gradient-to-r from-purple-400 to-purple-600"
                          }
                        />
                    );
                  })}
                  {report.topProducts.length === 0 && <p className="text-center text-sm py-10 opacity-50">No data to display</p>}
                </div>
              </div>
            </div>

            {/* High selling */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" /> High selling products
                  </h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Top {topN}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Product</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">SKU</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Units</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topProducts.map((p) => (
                        <tr key={p.product_id} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3 text-sm text-gray-900 dark:text-white font-medium truncate max-w-[220px]">{p.name}</td>
                          <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400 font-mono">{p.sku}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{p.units}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{formatMoney(p.net)}</td>
                        </tr>
                      ))}
                      {report.topProducts.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                            No sales data for this range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" /> High selling categories
                  </h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Top {topN}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Category</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Units</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topCategories.map((c) => (
                        <tr key={c.category_id} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3 text-sm text-gray-900 dark:text-white font-medium">{c.category_name}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.units}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{formatMoney(c.net)}</td>
                        </tr>
                      ))}
                      {report.topCategories.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                            No sales data for this range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Low / Zero selling */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingDown className="w-5 h-5" /> Zero & low selling products
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Only considers products that currently have stock.
                  </p>
                </div>
                <div className="p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Zero selling (in-stock)</div>
                  <div className="max-h-52 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Product</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.zeroSellingProducts.map((p) => (
                          <tr key={p.product_id} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="py-2 px-3 text-sm text-gray-900 dark:text-white truncate max-w-[260px]">
                              {p.name}
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{p.sku}</div>
                            </td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{p.stock}</td>
                          </tr>
                        ))}
                        {report.zeroSellingProducts.length === 0 && (
                          <tr>
                            <td colSpan={2} className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                              None 🎉
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Low selling (≤ {lowThresholdUnits} units)
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Product</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Sold</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.lowSellingProducts.map((p) => (
                          <tr key={p.product_id} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="py-2 px-3 text-sm text-gray-900 dark:text-white truncate max-w-[260px]">
                              {p.name}
                              <div className="text-xs text-gray-500 dark:text-gray-400">{p.category}</div>
                            </td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{p.units}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{p.stock}</td>
                          </tr>
                        ))}
                        {report.lowSellingProducts.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                              None for this threshold.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingDown className="w-5 h-5" /> Zero & low selling categories
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Uses current stock + sales in the selected date range.
                  </p>
                </div>
                <div className="p-4">
                  <div className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Zero selling (in-stock)</div>
                  <div className="max-h-52 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Category</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.zeroSellingCategories.map((c) => (
                          <tr key={c.category_id} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="py-2 px-3 text-sm text-gray-900 dark:text-white">{c.category_name}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.stock_units}</td>
                          </tr>
                        ))}
                        {report.zeroSellingCategories.length === 0 && (
                          <tr>
                            <td colSpan={2} className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                              None 🎉
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Low selling (≤ {lowThresholdUnits} units)
                  </div>
                  <div className="max-h-64 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Category</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Sold</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.lowSellingCategories.map((c) => (
                          <tr key={c.category_id} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="py-2 px-3 text-sm text-gray-900 dark:text-white">{c.category_name}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.units}</td>
                            <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.stock_units}</td>
                          </tr>
                        ))}
                        {report.lowSellingCategories.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                              None for this threshold.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Category-wise sales % on stock */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <Package className="w-5 h-5" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Category sell-through (sales % on stock)</h2>
              </div>
              <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
                Sell-through = <span className="font-semibold">sold / (sold + current stock)</span>. (Also shown: sold vs current stock)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Category</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Sold</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Sell-through</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Sold/Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categorySellThrough.slice(0, 50).map((c) => (
                        <tr key={c.category_id} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-3 text-sm text-gray-900 dark:text-white font-medium">{c.category_name}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.units}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">{c.stock_units}</td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-semibold">{c.sellThrough.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex shadow-inner">
                                <div 
                                  className={`h-full rounded-full ${c.sellThrough > 50 ? 'bg-emerald-500' : c.sellThrough > 20 ? 'bg-blue-500' : 'bg-gray-400'} transition-all duration-1000`} 
                                  style={{ width: `${Math.min(100, Math.max(0, c.sellThrough))}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-sm text-right text-gray-900 dark:text-white">
                            <div className="flex items-center justify-end gap-2">
                              <span>{c.soldVsStock.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex shadow-inner">
                                <div 
                                  className={`h-full rounded-full ${c.soldVsStock > 50 ? 'bg-purple-500' : 'bg-sky-500'} transition-all`} 
                                  style={{ width: `${Math.min(100, Math.max(0, c.soldVsStock))}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                    ))}
                    {report.categorySellThrough.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                          No data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CSV Exports */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">CSV Exports</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Store ID (optional)</label>
                    <input
                      value={csvStoreId}
                      onChange={(e) => setCsvStoreId(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Status (optional)</label>
                    <select
                      value={csvStatus}
                      onChange={(e) => setCsvStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="">All statuses</option>
                      <option value="completed">completed</option>
                      <option value="confirmed">confirmed</option>
                      <option value="pending">pending</option>
                      <option value="pending_assignment">pending_assignment</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Customer ID (Sales CSV only)</label>
                    <input
                      value={csvCustomerId}
                      onChange={(e) => setCsvCustomerId(e.target.value)}
                      placeholder="e.g. 25"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => loadAll()}
                      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Refresh data
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Category ID (Stock CSV only)</label>
                    <input
                      value={csvCategoryId}
                      onChange={(e) => setCsvCategoryId(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Product ID (Stock/Booking CSV)</label>
                    <input
                      value={csvProductId}
                      onChange={(e) => setCsvProductId(e.target.value)}
                      placeholder="e.g. 105"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                      <input
                        type="checkbox"
                        checked={csvIncludeInactive}
                        onChange={(e) => setCsvIncludeInactive(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Include inactive batches (Stock)
                    </label>
                  </div>
                  <div className="flex items-end">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Date range applies to: <span className="font-semibold">Category Sales</span>, <span className="font-semibold">Sales</span>, <span className="font-semibold">Booking</span>
                    </div>
                  </div>
                </div>

                {previewError && (
                  <div className="mt-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                    {previewError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Category Sales CSV</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Grouped by product category with VAT (7.5) and net breakdown.</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => doPreview('category')}
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Preview
                      </button>
                      <button
                        disabled={csvBusy.category}
                        onClick={doDownloadCategory}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {csvBusy.category ? 'Preparing…' : 'Download CSV'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Sales CSV</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Order-level export (customer, products, delivery, payment, status).</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => doPreview('sales')}
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Preview
                      </button>
                      <button
                        disabled={csvBusy.sales}
                        onClick={doDownloadSales}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {csvBusy.sales ? 'Preparing…' : 'Download CSV'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Stock CSV</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Batch-wise stock with sold quantity + remaining stock value. Filters: store/category/product, include inactive.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => doPreview('stock')}
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Preview
                      </button>
                      <button
                        disabled={csvBusy.stock}
                        onClick={doDownloadStock}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {csvBusy.stock ? 'Preparing…' : 'Download CSV'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Booking CSV</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Order-items export with barcode, batch pricing, and payable/paid/due. Filters: date/store/status/customer/product.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => doPreview('booking')}
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Preview
                      </button>
                      <button
                        disabled={csvBusy.booking}
                        onClick={doDownloadBooking}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                      >
                        {csvBusy.booking ? 'Preparing…' : 'Download CSV'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  Date range: <span className="font-semibold">{dateFrom}</span> → <span className="font-semibold">{dateTo}</span> (applies to Category Sales, Sales, Booking).
                </div>
              </div>
            </div>

            {/* Weekly report */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Weekly best selling & slow moving categories</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Based on units sold per week (Mon–Sun).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Week</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Best selling</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Slow moving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.weeks.map((w) => (
                      <tr key={w.weekStart} className="border-t border-gray-100 dark:border-gray-700 align-top">
                        <td className="py-3 px-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                          {w.weekStart} → {w.weekEnd}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-900 dark:text-white">
                          {w.top.length === 0 ? (
                            <span className="text-gray-500 dark:text-gray-400">No sales</span>
                          ) : (
                            <ul className="space-y-1">
                              {w.top.map((r, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-3">
                                  <span className="truncate max-w-[320px]">{r.category}</span>
                                  <span className="text-gray-600 dark:text-gray-400">{r.units}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-900 dark:text-white">
                          {w.slow.length === 0 ? (
                            <span className="text-gray-500 dark:text-gray-400">No sales</span>
                          ) : (
                            <ul className="space-y-1">
                              {w.slow.map((r, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-3">
                                  <span className="truncate max-w-[320px]">{r.category}</span>
                                  <span className="text-gray-600 dark:text-gray-400">{r.units}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                    {report.weeks.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-10 text-center text-sm text-gray-600 dark:text-gray-400">
                          No weekly data for this range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CSV Preview Modal */}
            {previewOpen && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
                <div
                  className="w-full max-w-5xl max-h-[85vh] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{previewTitle}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Showing first {previewBody.length} rows</p>
                    </div>
                    <button
                      onClick={() => setPreviewOpen(false)}
                      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/40 sticky top-0">
                        <tr>
                          {previewHeader.map((h, idx) => (
                            <th
                              key={idx}
                              className="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewBody.map((r, ridx) => (
                          <tr key={ridx} className="border-t border-gray-100 dark:border-gray-700">
                            {r.map((c, cidx) => (
                              <td key={cidx} className="py-2 px-3 text-gray-900 dark:text-white whitespace-nowrap">
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {previewBody.length === 0 && (
                          <tr>
                            <td colSpan={previewHeader.length || 1} className="py-10 text-center text-gray-600 dark:text-gray-400">
                              No rows.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* Subcomponents for visualization */

function ProgressBarChart({ label, subLabel, value, percentage, colorClass }: { label: string, subLabel?: string, value: string | number, percentage: number, colorClass: string }) {
  return (
    <div className="space-y-1.5 grayscale-[0.2] hover:grayscale-0 transition-all group">
      <div className="flex items-center justify-between text-xs gap-3">
        <div className="flex-1 truncate">
          <span className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{label}</span>
          {subLabel && <span className="ml-2 text-gray-400 dark:text-gray-500 font-mono text-[10px]">{subLabel}</span>}
        </div>
        <span className="font-black text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900/50 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-800 shadow-sm">{value}</span>
      </div>
      <div className="relative w-full h-3 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden shadow-inner group-hover:h-4 transition-all duration-300">
        <div 
          className={`absolute left-0 top-0 h-full rounded-full ${colorClass} transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-sm`}
          style={{ width: `${Math.min(100, Math.max(3, percentage))}%` }}
        />
        {/* Shimmer effect for premium feel */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
      </div>
    </div>
  );
}
