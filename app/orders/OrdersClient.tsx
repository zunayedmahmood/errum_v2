'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { computeMenuPosition } from '@/lib/menuPosition';
import {
  ShoppingBag,
  Search,
  MoreVertical,
  Eye,
  Package,
  Wrench,
  XCircle,
  Loader,
  Globe,
  Edit,
  RefreshCw,
  ArrowLeftRight,
  X,
  Truck,
  Printer,
  Settings,
  CheckCircle,
  HandCoins,
  Copy,
  ExternalLink,
} from 'lucide-react';

import orderService, { type Order as BackendOrder } from '@/services/orderService';
import pathaoOrderLookupService, {
  type PathaoBulkLookupItem,
  type PathaoLookupData,
} from '@/services/pathaoOrderLookupService';
import paymentService from '@/services/paymentService';
import type { PaymentMethod } from '@/services/paymentMethodService';
import axios from '@/lib/axios';
import batchService from '@/services/batchService';
import productService from '@/services/productService';
import serviceManagementService from '@/services/serviceManagementService';

import ReturnProductModal from '@/components/sales/ReturnProductModal';
import ExchangeProductModal from '@/components/sales/ExchangeProductModal';
import ActivityLogPanel from '@/components/activity/ActivityLogPanel';
import productReturnService, { type CreateReturnRequest } from '@/services/productReturnService';
import refundService, { type CreateRefundRequest } from '@/services/refundService';

import shipmentService from '@/services/shipmentService';
import { checkQZStatus, printReceipt, printBulkReceipts, getPrinters, savePreferredPrinter } from '@/lib/qz-tray';

interface Order {
  id: number;
  orderNumber: string;
  orderType: string;
  orderTypeLabel: string;
  date: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    id: number;
    productId?: number;
    imageUrl?: string | null;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    discount: number;
  }>;
  services: Array<{
    id: number;
    serviceId?: number;
    name: string;
    category?: string;
    quantity: number;
    price: number;
    discount: number;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  amounts: {
    total: number;
    paid: number;
    due: number;
  };

  // ✅ backend order status
  status: string;
  statusLabel: string;

  // ✅ payment status separate
  paymentStatus: string;
  paymentStatusLabel: string;

  // Intended courier marker
  intendedCourier?: string | null;

  // Installments / EMI
  isInstallment?: boolean;
  installmentInfo?: {
    total_installments?: number;
    paid_installments?: number;
    installment_amount?: number;
    next_payment_due?: string | null;
    start_date?: string | null;
  } | null;

  salesBy: string;
  store: string;
  storeId?: number;
  notes?: string;

  shipping_address?: any;

  createdAt?: string;
  orderDateRaw?: string;
}

// Types expected by ReturnProductModal / ExchangeProductModal
type ReturnModalOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  batch_id: number;
  batch_number?: string;
  barcode_id?: number;
  barcode?: string;
  quantity: number;
  unit_price: string;
  total_amount: string;
};

type ReturnModalOrder = {
  id: number;
  order_number: string;
  store: { id: number; name: string };
  customer?: { name: string; phone: string };
  items: ReturnModalOrderItem[];
  total_amount: string;
  paid_amount: string;
  outstanding_amount: string;
};

type ExchangeModalOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  batch_id: number;
  batch_number?: string;
  barcode_id?: number;
  barcode?: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  total_price: string;
};

type ExchangeModalOrder = {
  id: number;
  order_number: string;
  customer?: { id: number; name: string; phone: string };
  store: { id: number; name: string };
  items: ExchangeModalOrderItem[];
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
};

const toReturnModalOrder = (o: BackendOrder): ReturnModalOrder => ({
  id: o.id,
  order_number: o.order_number,
  store: { id: o.store?.id ?? 0, name: o.store?.name ?? '' },
  customer: o.customer ? { name: o.customer.name, phone: o.customer.phone } : undefined,
  items: (o.items ?? []).map((it) => ({
    id: it.id,
    product_id: it.product_id,
    product_name: it.product_name,
    product_sku: it.product_sku,
    batch_id: it.batch_id,
    batch_number: it.batch_number,
    barcode_id: it.barcode_id,
    barcode: it.barcode,
    quantity: it.quantity,
    unit_price: it.unit_price ?? '0',
    total_amount: it.total_amount ?? '0',
  })),
  total_amount: o.total_amount ?? '0',
  paid_amount: o.paid_amount ?? '0',
  outstanding_amount: o.outstanding_amount ?? '0',
});

const toExchangeModalOrder = (o: BackendOrder): ExchangeModalOrder => ({
  id: o.id,
  order_number: o.order_number,
  customer: o.customer ? { id: o.customer.id, name: o.customer.name, phone: o.customer.phone } : undefined,
  store: { id: o.store?.id ?? 0, name: o.store?.name ?? '' },
  items: (o.items ?? []).map((it) => ({
    id: it.id,
    product_id: it.product_id,
    product_name: it.product_name,
    product_sku: it.product_sku,
    batch_id: it.batch_id,
    batch_number: it.batch_number,
    barcode_id: it.barcode_id,
    barcode: it.barcode,
    quantity: it.quantity,
    unit_price: it.unit_price ?? '0',
    discount_amount: it.discount_amount ?? '0',
    tax_amount: it.tax_amount ?? '0',
    total_amount: it.total_amount ?? '0',
    total_price: it.total_amount ?? '0',
  })),
  subtotal_amount: o.subtotal ?? '0',
  tax_amount: o.tax_amount ?? '0',
  total_amount: o.total_amount ?? '0',
  paid_amount: o.paid_amount ?? '0',
});

const normalize = (v: any) => String(v ?? '').trim().toLowerCase();

const titleCase = (s: string) =>
  s
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const sanitizePhone = (phone?: string) => String(phone || '').replace(/[^0-9+]/g, '');

const buildPathaoTrackingUrl = (consignmentId: string, phone?: string) => {
  const cid = encodeURIComponent(String(consignmentId || '').trim());
  const ph = encodeURIComponent(sanitizePhone(phone));
  // Pathao merchant panel tracking page
  return `https://merchant.pathao.com/tracking?consignment_id=${cid}&phone=${ph}`;
};

const getApiBaseUrl = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || '';
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
};

const toPublicImageUrl = (imagePath?: string | null) => {
  if (!imagePath) return null;
  const p = String(imagePath);
  if (!p) return null;
  if (p.startsWith('http')) return p;
  if (p.startsWith('/storage/')) return `${getApiBaseUrl()}${p}`;
  if (p.startsWith('storage/')) return `${getApiBaseUrl()}/${p}`;
  // default: assume it's a storage relative path
  return `${getApiBaseUrl()}/storage/${p.replace(/^\//, '')}`;
};

const pickOrderItemImage = (item: any): string | null => {
  // Try common fields that backend might return
  const direct =
    item?.product_image ||
    item?.image_url ||
    item?.image ||
    item?.thumbnail ||
    item?.product?.image_url ||
    item?.product?.image ||
    item?.product?.thumbnail;

  if (direct) return toPublicImageUrl(direct);

  const imgs: any[] =
    item?.product?.images || item?.images || item?.product_images || item?.product?.product_images || [];
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((x) => x?.is_primary && x?.is_active) || imgs.find((x) => x?.is_primary) || imgs[0];
    const path = primary?.image_url || primary?.image_path || primary?.url;
    return toPublicImageUrl(path);
  }

  return null;
};

const getTodayFilterValue = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Pathao lookup types (used for Social Commerce address editing)
type PathaoCity = { city_id: number; city_name: string };
type PathaoZone = { zone_id: number; zone_name: string };
type PathaoArea = { area_id: number; area_name: string };

export default function OrdersDashboard() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);

  // 🚚 Pathao lookup (order_number -> lookup info)
  const [pathaoLookupByOrderNumber, setPathaoLookupByOrderNumber] = useState<Record<string, PathaoBulkLookupItem>>({});
  const [selectedOrderPathao, setSelectedOrderPathao] = useState<PathaoLookupData | null>(null);
  const [isPathaoLookupLoading, setIsPathaoLookupLoading] = useState(false);
  const pathaoInFlightRef = useRef<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(getTodayFilterValue());

  // ✅ NEW: Order type filter (All / Social / E-Com)
  const [orderTypeFilter, setOrderTypeFilter] = useState('All Types');

  // ✅ Separate filters
  const [orderStatusFilter, setOrderStatusFilter] = useState('All Order Status');
  
const [paymentStatusFilter, setPaymentStatusFilter] = useState('All Payment Status');

  // Courier marker filters / edit
  const [courierFilter, setCourierFilter] = useState('All Couriers');
  const [availableCouriers, setAvailableCouriers] = useState<string[]>([]);
  const [showCourierModal, setShowCourierModal] = useState(false);
  const [courierModalOrder, setCourierModalOrder] = useState<Order | null>(null);
  const [courierModalValue, setCourierModalValue] = useState<string>('');
  const [isSavingCourier, setIsSavingCourier] = useState(false);

  const searchParams = useSearchParams();
  const initialViewMode = useMemo(() => {
    const v = (searchParams.get('view') || searchParams.get('tab') || '').toLowerCase();
    return v === 'installments' || v === 'emi' ? 'installments' : 'online';
  }, [searchParams]);

  const [viewMode, setViewMode] = useState<'online' | 'installments'>(() => initialViewMode);

  // Keep in sync if query changes (e.g., sidebar click while already on /orders)
  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  // Default to Pending in Online Orders (as requested) for faster workflow.
  // Keeps Installments on "All" because installment statuses vary.
  const didInitQuickDefaultsRef = useRef(false);
  useEffect(() => {
    if (didInitQuickDefaultsRef.current) return;
    didInitQuickDefaultsRef.current = true;

    if (initialViewMode === 'online') {
      setOrderStatusFilter('pending');
    } else {
      setOrderStatusFilter('All Order Status');
    }

    setCourierFilter('pathao');
  }, [initialViewMode]);


  // ♻️ Restore cached Pathao lookup results (10 min TTL)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem('pathao_lookup_cache_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      const map = parsed?.map || {};
      if (ts && Date.now() - ts < 10 * 60 * 1000 && map && typeof map === 'object') {
        setPathaoLookupByOrderNumber(map);
      }
    } catch {
      // ignore
    }
  }, []);

  // ♻️ Save Pathao lookup cache
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('pathao_lookup_cache_v1', JSON.stringify({ ts: Date.now(), map: pathaoLookupByOrderNumber }));
    } catch {
      // ignore
    }
  }, [pathaoLookupByOrderNumber]);


  const [selectedBackendOrder, setSelectedBackendOrder] = useState<any | null>(null);

  // Installment collection modal
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [installmentOrderId, setInstallmentOrderId] = useState<number | null>(null);
  const [installmentAmountInput, setInstallmentAmountInput] = useState('');
  const [installmentMethodId, setInstallmentMethodId] = useState<number | ''>('');
  const [installmentRef, setInstallmentRef] = useState('');
  const [installmentNotes, setInstallmentNotes] = useState('');
  const [installmentMethods, setInstallmentMethods] = useState<PaymentMethod[]>([]);
  const [isCollectingInstallment, setIsCollectingInstallment] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editableOrder, setEditableOrder] = useState<Order | null>(null);

  // ✅ Image preview in Order Details (tap product image to zoom)
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const [userName, setUserName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // 🔁 Return / Exchange
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<BackendOrder | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);

  // 🧃 Product picker (for Edit Order)
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [pickerBatches, setPickerBatches] = useState<any[]>([]);
  const [pickerStoreId, setPickerStoreId] = useState<number | null>(null);

  // 🛠️ Service picker (for Edit Order)
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [serviceResults, setServiceResults] = useState<any[]>([]);
  const [isServiceLoading, setIsServiceLoading] = useState(false);
  const [servicesTouched, setServicesTouched] = useState(false);

  // 🖼️ Product thumbnails (used in View Details / Edit Order / Packing-like tables)
  const [productThumbsById, setProductThumbsById] = useState<Record<number, string>>({});

  const ensureProductThumbs = useCallback(async (productIds: Array<number | null | undefined>) => {
    const ids = Array.from(new Set(productIds.filter((x): x is number => typeof x === 'number' && x > 0)));
    if (ids.length === 0) return;

    const missing = ids.filter((id) => !productThumbsById[id]);
    if (missing.length === 0) return;

    const fetched: Record<number, string> = {};
    await Promise.all(
      missing.map(async (id) => {
        try {
          const prod: any = await productService.getById(id);
          const imgs: any[] = prod?.images || [];
          const primary =
            imgs.find((x) => x?.is_primary && x?.is_active) || imgs.find((x) => x?.is_primary) || imgs[0];
          const path = primary?.image_url || primary?.image_path || primary?.url;
          const url = toPublicImageUrl(path);
          if (url) fetched[id] = url;
        } catch (e) {
          // ignore (fallback to placeholder)
        }
      })
    );

    if (Object.keys(fetched).length > 0) {
      setProductThumbsById((prev) => ({ ...prev, ...fetched }));
    }
  }, [productThumbsById]);

  const getItemThumbSrc = useCallback(
    (item: { productId?: number; imageUrl?: string | null }) => {
      return (
        item.imageUrl ||
        (item.productId ? productThumbsById[item.productId] : null) ||
        '/placeholder-product.png'
      );
    },
    [productThumbsById]
  );


  // 📦 Address editing (Social Commerce: Pathao / International, E-commerce checkout)
  const [scIsInternational, setScIsInternational] = useState(false);

  // ✅ NEW: Pathao auto location (address -> city/zone/area mapping happens inside Pathao)
  // If enabled, City/Zone/Area are optional in the editor.
  const [scUsePathaoAutoLocation, setScUsePathaoAutoLocation] = useState<boolean>(true);

  const [pathaoCities, setPathaoCities] = useState<PathaoCity[]>([]);
  const [pathaoZones, setPathaoZones] = useState<PathaoZone[]>([]);
  const [pathaoAreas, setPathaoAreas] = useState<PathaoArea[]>([]);

  const [pathaoCityId, setPathaoCityId] = useState<string>('');
  const [pathaoZoneId, setPathaoZoneId] = useState<string>('');
  const [pathaoAreaId, setPathaoAreaId] = useState<string>('');

  const [scStreetAddress, setScStreetAddress] = useState('');
  const [scPostalCode, setScPostalCode] = useState('');

  const [scCountry, setScCountry] = useState('');
  const [scState, setScState] = useState('');
  const [scCity, setScCity] = useState('');
  const [scInternationalPostalCode, setScInternationalPostalCode] = useState('');
  const [scInternationalStreet, setScInternationalStreet] = useState('');

  const [ecAddress1, setEcAddress1] = useState('');
  const [ecAddress2, setEcAddress2] = useState('');
  const [ecCity, setEcCity] = useState('');
  const [ecState, setEcState] = useState('');
  const [ecPostalCode, setEcPostalCode] = useState('');
  const [ecCountry, setEcCountry] = useState('Bangladesh');
  const [ecLandmark, setEcLandmark] = useState('');

  // ✅ Bulk selection + operations (Pathao + Print)
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [isPrintingBulk, setIsPrintingBulk] = useState(false);

  const [bulkPrintProgress, setBulkPrintProgress] = useState<{
    show: boolean;
    current: number;
    total: number;
    success: number;
    failed: number;
    details?: Array<{ orderId?: number; orderNumber?: string; status?: 'success' | 'failed'; message?: string }>;
  }>({ show: false, current: 0, total: 0, success: 0, failed: 0, details: [] });

  const [pathaoProgress, setPathaoProgress] = useState<{
    show: boolean;
    current: number;
    total: number;
    success: number;
    failed: number;
    batchCode?: string;
    batchStatus?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'preparing' | 'error';
    details: Array<{ orderId?: number; orderNumber?: string; status: 'success' | 'failed'; message: string }>;
  }>({ show: false, current: 0, total: 0, success: 0, failed: 0, batchCode: undefined, batchStatus: 'preparing', details: [] });

  // ✅ QZ / printer state
  const [qzConnected, setQzConnected] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [showPrinterSelect, setShowPrinterSelect] = useState(false);

  // ✅ Single action loading (per-order)
  const [singleActionLoading, setSingleActionLoading] = useState<{
    orderId: number;
    action: 'print' | 'pathao';
  } | null>(null);

  const isSingleLoading = (orderId: number, action: 'print' | 'pathao') =>
    singleActionLoading?.orderId === orderId && singleActionLoading?.action === action;

  useEffect(() => {
    const name = localStorage.getItem('userName') || '';
    setUserName(name);
    loadOrders();
    if (viewMode === 'online') {
      // Courier dropdown options (safe if endpoint is missing)
      loadAvailableCouriers();
    }
    checkPrinterStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);


  const parseMoney = (val: any) => Number(String(val ?? '0').replace(/[^0-9.-]/g, ''));
  const cleanText = (val: any) => (val == null ? '' : String(val)).trim();

  const formatShippingAddress = (shipping: any): string => {
    if (!shipping) return '';
    if (typeof shipping === 'string') return shipping;

    const s: any = shipping || {};
    const line1 = s.address_line1 || s.address_line_1 || s.street || s.address || '';
    const line2 = s.address_line2 || s.address_line_2 || '';

    // E-commerce pattern
    if (line1 || line2) {
      const parts: string[] = [];
      if (line1) parts.push(String(line1));
      if (line2) parts.push(String(line2));
      const cityState = [s.city, s.state].filter(Boolean).join(', ');
      const pc = s.postal_code || s.postalCode || '';
      if (cityState) parts.push(pc ? `${cityState} ${pc}` : cityState);
      else if (pc) parts.push(String(pc));
      if (s.country) parts.push(String(s.country));
      if (s.landmark) parts.push(`Landmark: ${String(s.landmark)}`);
      return parts.filter(Boolean).join(', ');
    }

    // Social commerce / Pathao pattern
    if (s.street || s.city || s.area || s.zone || s.postal_code) {
      const parts: string[] = [];
      if (s.street) parts.push(String(s.street));
      if (s.area) parts.push(String(s.area));
      if (s.zone) parts.push(String(s.zone));
      if (s.city) parts.push(String(s.city));
      const pc = s.postal_code || s.postalCode || '';
      const out = parts.filter(Boolean).join(', ');
      return pc ? `${out}${out ? ' - ' : ''}${pc}` : out;
    }

    // Fallbacks
    if (s.address) return String(s.address);
    try {
      return JSON.stringify(s);
    } catch {
      return String(s);
    }
  };


  
  // ✅ Pathao lookup helpers (for editing Social Commerce address)
  const fetchPathaoCities = async () => {
    try {
      const res = await axios.get('/shipments/pathao/cities');
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setPathaoCities(data);
    } catch (err) {
      console.error('Failed to load Pathao cities', err);
      setPathaoCities([]);
    }
  };

  const fetchPathaoZones = async (cityId: number) => {
    try {
      const res = await axios.get(`/shipments/pathao/zones/${cityId}`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setPathaoZones(data);
    } catch (err) {
      console.error('Failed to load Pathao zones', err);
      setPathaoZones([]);
    }
  };

  const fetchPathaoAreas = async (zoneId: number) => {
    try {
      const res = await axios.get(`/shipments/pathao/areas/${zoneId}`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      setPathaoAreas(data);
    } catch (err) {
      console.error('Failed to load Pathao areas', err);
      setPathaoAreas([]);
    }
  };

  // Prefill address fields when opening the editor
  useEffect(() => {
    if (!showEditModal || !editableOrder) return;

    const orderType = normalize(editableOrder.orderType);
    const sa: any =
      editableOrder.shipping_address && typeof editableOrder.shipping_address === 'object'
        ? editableOrder.shipping_address
        : {};

    if (orderType === 'social_commerce') {
      const isIntl = !!sa?.country && !sa?.pathao_city_id;
      setScIsInternational(isIntl);

      if (isIntl) {
        setScCountry(sa.country || '');
        setScState(sa.state || '');
        setScCity(sa.city || '');
        setScInternationalPostalCode(sa.postal_code || '');
        setScInternationalStreet(sa.street || sa.address || '');
      } else {
        const hasAllIds = !!sa.pathao_city_id && !!sa.pathao_zone_id && !!sa.pathao_area_id;
        setScUsePathaoAutoLocation(!hasAllIds);
        setPathaoCityId(sa.pathao_city_id ? String(sa.pathao_city_id) : '');
        setPathaoZoneId(sa.pathao_zone_id ? String(sa.pathao_zone_id) : '');
        setPathaoAreaId(sa.pathao_area_id ? String(sa.pathao_area_id) : '');
        setScStreetAddress(sa.street || '');
        setScPostalCode(sa.postal_code || '');
      }
    } else if (orderType === 'ecommerce') {
      setEcAddress1(sa.address_line1 || sa.address_line_1 || sa.street || (typeof editableOrder.customer.address === 'string' ? editableOrder.customer.address : '') || '');
      setEcAddress2(sa.address_line2 || sa.address_line_2 || '');
      setEcCity(sa.city || '');
      setEcState(sa.state || '');
      setEcPostalCode(sa.postal_code || '');
      setEcCountry(sa.country || 'Bangladesh');
      setEcLandmark(sa.landmark || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, editableOrder?.id]);

  // Load Pathao cities when editing a Social Commerce order
  useEffect(() => {
    if (!showEditModal) return;
    if (normalize(editableOrder?.orderType) !== 'social_commerce') return;
    if (scIsInternational) return;
    if (scUsePathaoAutoLocation) return;

    fetchPathaoCities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, editableOrder?.orderType, scIsInternational, scUsePathaoAutoLocation]);

  // If auto-location is enabled, clear any manual Pathao selections
  useEffect(() => {
    if (!showEditModal) return;
    if (normalize(editableOrder?.orderType) !== 'social_commerce') return;
    if (scIsInternational) return;

    if (scUsePathaoAutoLocation) {
      setPathaoCityId('');
      setPathaoZoneId('');
      setPathaoAreaId('');
      setPathaoZones([]);
      setPathaoAreas([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scUsePathaoAutoLocation, showEditModal, editableOrder?.orderType, scIsInternational]);

  // Cascading: City -> Zones
  useEffect(() => {
    if (!showEditModal) return;
    if (normalize(editableOrder?.orderType) !== 'social_commerce') return;
    if (scIsInternational) return;
    if (scUsePathaoAutoLocation) return;

    if (!pathaoCityId) {
      setPathaoZones([]);
      setPathaoZoneId('');
      setPathaoAreas([]);
      setPathaoAreaId('');
      return;
    }

    fetchPathaoZones(Number(pathaoCityId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathaoCityId]);

  // Cascading: Zone -> Areas
  useEffect(() => {
    if (!showEditModal) return;
    if (normalize(editableOrder?.orderType) !== 'social_commerce') return;
    if (scIsInternational) return;
    if (scUsePathaoAutoLocation) return;

    if (!pathaoZoneId) {
      setPathaoAreas([]);
      setPathaoAreaId('');
      return;
    }

    fetchPathaoAreas(Number(pathaoZoneId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathaoZoneId]);


const derivePaymentStatus = (order: any) => {
    const raw = normalize(order?.payment_status);
    if (raw) return raw;
    const total = parseMoney(order?.total_amount);
    const due = parseMoney(order?.outstanding_amount);
    if (total <= 0) return 'pending';
    if (due <= 0) return 'paid';
    if (due < total) return 'partially_paid';
    return 'pending';
  };

  const statusLabel = (raw: string) => {
    const s = normalize(raw);
    return s ? titleCase(s) : 'Unknown';
  };

  const getOrderStatusBadge = (raw: string) => {
    const s = normalize(raw);
    const cls =
      s === 'delivered' || s === 'completed'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        : s === 'shipped'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        : s === 'processing' || s === 'confirmed' || s === 'ready_for_pickup'
        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
        : s === 'cancelled'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        : s === 'refunded'
        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';

    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
        {statusLabel(raw)}
      </span>
    );
  };

  const getPaymentStatusBadge = (raw: string, compact = true) => {
    const s = normalize(raw);
    const cls =
      s === 'paid'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        : s === 'partially_paid'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : s === 'overdue'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        : s === 'failed'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        : s === 'refunded'
        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';

    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
        {compact ? statusLabel(raw) : `Payment: ${statusLabel(raw)}`}
      </span>
    );
  };

  // 🔧 Central transformer
  const transformOrder = (order: any): Order => {
    const paid = parseMoney(order.paid_amount);
    const due = parseMoney(order.outstanding_amount);
    const total = parseMoney(order.total_amount);

    const oStatusRaw = order.status ?? '';
    const pStatusRaw = derivePaymentStatus(order);


    // 🧩 Products vs Services (POS can create orders with services)
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const looksLikeService = (it: any) =>
      Boolean(
        it?.service_id ||
          it?.serviceId ||
          it?.is_service ||
          it?.isService ||
          normalize(it?.item_type) === 'service' ||
          normalize(it?.type) === 'service'
      );

    const productItems = rawItems
      .filter((it: any) => !looksLikeService(it))
      .map((item: any) => {
        const unitPrice = parseMoney(item.unit_price);
        const discountAmount = parseMoney(item.discount_amount);
        return {
          id: item.id,
          productId: item.product_id,
          imageUrl: pickOrderItemImage(item),
          name: item.product_name,
          sku: item.product_sku,
          quantity: item.quantity,
          price: unitPrice,
          discount: discountAmount,
        };
      });

    const servicesFromItems = rawItems
      .filter((it: any) => looksLikeService(it))
      .map((it: any, i: number) => {
        const unitPrice = parseMoney(it.unit_price ?? it.price ?? 0);
        const discountAmount = parseMoney(it.discount_amount ?? it.discount ?? 0);
        const id = Number(it?.id) || -(Number(order.id || 0) * 10000 + (i + 1));
        const serviceId = Number(it?.service_id ?? it?.serviceId ?? 0) || undefined;

        return {
          id,
          serviceId,
          name: it?.service_name || it?.product_name || it?.name || '',
          category: it?.category || it?.service_category || it?.service?.category || undefined,
          quantity: Number(it?.quantity ?? 1) || 1,
          price: unitPrice,
          discount: discountAmount,
        };
      });

    const rawServices: any[] =
      (order.services ??
        order.service_items ??
        order.order_services ??
        order.orderServices ??
        order.serviceItems ??
        []) as any[];

    const services =
      Array.isArray(rawServices) && rawServices.length > 0
        ? rawServices.map((s: any, i: number) => {
            const unitPrice = parseMoney(s?.unit_price ?? s?.price ?? s?.base_price ?? 0);
            const discountAmount = parseMoney(s?.discount_amount ?? s?.discount ?? 0);

            const id =
              Number(s?.id ?? s?.order_service_id ?? s?.orderServiceId ?? s?.pivot?.id) ||
              -(Number(order.id || 0) * 10000 + (i + 1));
            const serviceId = Number(s?.service_id ?? s?.serviceId ?? s?.service?.id ?? 0) || undefined;

            return {
              id,
              serviceId,
              name: s?.service_name || s?.name || s?.service?.name || '',
              category: s?.category || s?.service_category || s?.service?.category || undefined,
              quantity: Number(s?.quantity ?? 1) || 1,
              price: unitPrice,
              discount: discountAmount,
            };
          })
        : servicesFromItems;
    return {
      id: order.id,
      orderNumber: order.order_number,
      orderType: order.order_type,
      orderTypeLabel: order.order_type_label ?? titleCase(order.order_type ?? ''),
      date: new Date(order.order_date).toLocaleDateString('en-GB'),
      customer: {
        name: order.customer_name ?? order.customer?.name ?? '',
        phone: order.customer_phone ?? order.customer?.phone ?? '',
        email: order.customer_email ?? order.customer?.email ?? '',
        address: order.customer_address != null ? order.customer_address : formatShippingAddress(order.shipping_address),
      },
      items: productItems,
      services,

      subtotal: parseMoney(order.subtotal),
      discount: parseMoney(order.discount_amount),
      shipping: parseMoney(order.shipping_amount),
      amounts: {
        total: total,
        paid: paid,
        due: due,
      },

      status: normalize(oStatusRaw) || 'pending',
      statusLabel: statusLabel(oStatusRaw || 'pending'),

      paymentStatus: normalize(pStatusRaw) || 'pending',
      paymentStatusLabel: statusLabel(pStatusRaw || 'pending'),

      intendedCourier: order.intended_courier ?? order.intendedCourier ?? null,

      isInstallment: Boolean(order.is_installment || order.is_installment_payment || order.installment_info || order.installment_plan),
      installmentInfo: (order.installment_info ?? order.installment_plan ?? null),

      salesBy: order.salesman?.name || userName || 'N/A',
      store: order.store?.name || '',
      storeId: order.store?.id,
      notes: order.notes || '',
      shipping_address: order.shipping_address ?? null,

            createdAt: order.created_at,
      orderDateRaw: order.order_date,
    };
  };

  const recalcOrderTotals = (order: Order): Order => {
    const productsSubtotal = order.items.reduce((sum, item) => sum + (item.price - item.discount) * item.quantity, 0);
    const servicesSubtotal = (order.services || []).reduce((sum, s) => sum + (s.price - s.discount) * s.quantity, 0);
    const subtotal = productsSubtotal + servicesSubtotal;
    const discount = order.discount ?? 0;
    const shipping = order.shipping ?? 0;
    const total = subtotal - discount + shipping;
    const paid = order.amounts.paid ?? 0;
    const due = total - paid;

    return {
      ...order,
      subtotal,
      amounts: {
        ...order.amounts,
        total,
        due,
      },
    };
  };

  const normalizeCourier = (v: any) => normalize(v).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Only these values are allowed as order markers in UI
  const getAllowedCourierValue = (raw: any): string => {
    const n = normalizeCourier(raw);
    if (!n) return '';
    if (n === 'pathao') return 'pathao';
    if (n === 'sundarban') return 'Sundarban';
    if (n === 'pending') return 'Pending';
    if (n === 'partial order' || n === 'partialorder') return 'Partial Order';
    return '';
  };

  const courierLabel = (raw: any): string => {
    const allowed = getAllowedCourierValue(raw);
    if (!allowed) return 'Unassigned';

    const n = normalizeCourier(allowed);
    if (n === 'pathao') return 'Pathao';
    if (n === 'sundarban') return 'Sundarban';
    if (n === 'pending') return 'Pending';
    if (n === 'partial order') return 'Partial Order';
    return String(allowed);
  };

  const getCourierBadge = (raw: any) => {
    const allowed = getAllowedCourierValue(raw);
    if (!allowed) return null;

    const n = normalizeCourier(allowed);
    const cls =
      n === 'pathao'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
        : n === 'sundarban'
        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
        : n === 'pending'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';

    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
        {courierLabel(allowed)}
      </span>
    );
  };

  // ✅ Hydrate intended courier from DB using the official lookup API
  // This avoids relying on localStorage/sessionStorage and guarantees correctness after reload.
  const hydrateCouriersFromDB = async (list: Order[]): Promise<Order[]> => {
    try {
      const missingIds = list
        .filter((o) => !normalizeCourier(o.intendedCourier))
        .map((o) => o.id)
        .filter((id) => Number.isFinite(id) && id > 0);

      if (missingIds.length === 0) return list;

      const chunks: number[][] = [];
      for (let i = 0; i < missingIds.length; i += 100) chunks.push(missingIds.slice(i, i + 100));

      const map = new Map<number, string | null>();
      for (const chunk of chunks) {
        const res = await orderService.bulkLookupCouriers(chunk);
        (res?.orders || []).forEach((row: any) => {
          const id = Number(row?.order_id);
          if (!Number.isFinite(id) || id <= 0) return;
          const v = row?.intended_courier;
          map.set(id, v === undefined ? null : (v as any));
        });
      }

      return list.map((o) => {
        const currentAllowed = getAllowedCourierValue(o.intendedCourier);
        if (currentAllowed) return { ...o, intendedCourier: currentAllowed };

        if (!map.has(o.id)) return { ...o, intendedCourier: null };

        const dbAllowed = getAllowedCourierValue(map.get(o.id));
        return { ...o, intendedCourier: dbAllowed || null };
      });
    } catch (e) {
      console.warn('Failed to hydrate courier markers from DB:', e);
      return list;
    }
  };

  const DEFAULT_COURIERS = useMemo(() => ['pathao', 'Sundarban', 'Pending', 'Partial Order'], []);

  const allowedCourierMap = useMemo(() => {
    const map = new Map<string, string>();
    DEFAULT_COURIERS.forEach((c) => map.set(normalizeCourier(c), String(c)));
    return map;
  }, [DEFAULT_COURIERS]);

  const courierFilterOptions = useMemo(() => {
    // Keep the marker list fixed so no legacy courier tags (RedX, etc.) show up in filters/modals
    return [...DEFAULT_COURIERS];
  }, [DEFAULT_COURIERS]);

  const loadAvailableCouriers = async () => {
    try {
      const list = await orderService.getAvailableCouriers();
      const names = Array.from(
        new Set(
          (list || [])
            .map((x) => x?.courier_name)
            .filter(Boolean)
            .map((x) => allowedCourierMap.get(normalizeCourier(x)) || null)
            .filter(Boolean) as string[]
        )
      );
      setAvailableCouriers(names);
    } catch (e) {
      console.warn('Failed to load available couriers:', e);
      setAvailableCouriers([]);
    }
  };

  // ✅ Social Commerce + E-Commerce orders
  const loadOrders = async () => {
    setIsLoading(true);
    try {
      let allOrders: any[] = [];

      if (viewMode === 'installments') {
        const inst = await orderService.getAll({
          order_type: 'counter',
          installment_only: true,
          sort_by: 'created_at',
          sort_order: 'desc',
          per_page: 1000,
        });

        allOrders = inst.data || [];
      } else {
        const [social, ecommerce] = await Promise.all([
          orderService.getAll({
            order_type: 'social_commerce',
            sort_by: 'created_at',
            sort_order: 'desc',
            per_page: 1000,
          }),
          orderService.getAll({
            order_type: 'ecommerce',
            sort_by: 'created_at',
            sort_order: 'desc',
            per_page: 1000,
          }),
        ]);

        allOrders = [...(social.data || []), ...(ecommerce.data || [])];
      }

      allOrders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const transformedOrders = allOrders.map((o: any) => transformOrder(o));
      const hydrated = await hydrateCouriersFromDB(transformedOrders);

      setOrders(hydrated);
      setFilteredOrders(hydrated);
    } catch (error: any) {
      console.error('Get orders error:', error);
      alert('Failed to fetch orders: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ QZ Tray status / printers
  const checkPrinterStatus = async () => {
    try {
      const status = await checkQZStatus();
      setQzConnected(status.connected);

      if (status.connected) {
        const printerList = await getPrinters();
        setPrinters(printerList);

        const savedPrinter = localStorage.getItem('preferredPrinter') || localStorage.getItem('defaultPrinter');
        if (savedPrinter && printerList.includes(savedPrinter)) {
          setSelectedPrinter(savedPrinter);
        } else if (printerList.length > 0) {
          setSelectedPrinter(printerList[0]);
        }
      }
    } catch (error) {
      console.error('Failed to check printer status:', error);
      setQzConnected(false);
    }
  };

  const handlePrinterSelect = (printer: string) => {
    setSelectedPrinter(printer);
    savePreferredPrinter(printer);
    setShowPrinterSelect(false);
  };

  const paymentStatusOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => set.add(o.paymentStatus));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  // ⚡ Quick top tabs (status + courier) for fast switching
  const quickStatusTabs = useMemo(
    () => [
      { label: 'Pending', value: 'pending' },
      { label: 'Confirmed', value: 'confirmed' },
      { label: 'Cancelled', value: 'cancelled' },
      { label: 'Returned', value: 'returned' },
      { label: 'All', value: 'All Order Status' },
    ],
    []
  );

  const quickCourierTabs = useMemo(() => ['All Couriers', ...courierFilterOptions], [courierFilterOptions]);


  useEffect(() => {
    let filtered = orders;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.id.toString().includes(q) ||
          o.orderNumber?.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.phone.includes(search.trim())
      );
    }

    if (dateFilter.trim()) {
      filtered = filtered.filter((o) => {
        const orderDate = o.date;
        let filterDateFormatted = dateFilter;
        if (dateFilter.includes('-') && dateFilter.split('-')[0].length === 4) {
          const [year, month, day] = dateFilter.split('-');
          filterDateFormatted = `${day}/${month}/${year}`;
        }
        return orderDate === filterDateFormatted;
      });
    }

    // ✅ NEW: order type filter
    if (orderTypeFilter !== 'All Types') {
      const target = normalize(orderTypeFilter);
      filtered = filtered.filter((o) => normalize(o.orderType) === target);
    }

    if (orderStatusFilter !== 'All Order Status') {
      const target = normalize(orderStatusFilter);
      filtered = filtered.filter((o) => normalize(o.status) === target);
    }

    if (paymentStatusFilter !== 'All Payment Status') {
      const target = normalize(paymentStatusFilter);
      filtered = filtered.filter((o) => normalize(o.paymentStatus) === target);
    }

    // ✅ Courier marker filter
    if (courierFilter !== 'All Couriers') {
      const target = normalizeCourier(courierFilter);
      filtered = filtered.filter((o) => normalizeCourier(o.intendedCourier) === target);
    }

    setFilteredOrders(filtered);
  }, [search, dateFilter, orderTypeFilter, orderStatusFilter, paymentStatusFilter, courierFilter, orders]);

  // 🧾 Bulk lookup Pathao status for displayed orders
  const filteredOrderNumbers = useMemo(() => {
    return (filteredOrders || []).map((o) => o.orderNumber).filter(Boolean);
  }, [filteredOrders]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const unique = Array.from(new Set(filteredOrderNumbers));
      if (unique.length === 0) return;

      // Only fetch missing and not-in-flight order numbers
      const missing = unique.filter(
        (n) => !pathaoLookupByOrderNumber[n] && !pathaoInFlightRef.current.has(n)
      );

      if (missing.length === 0) return;

      // Mark in-flight to avoid duplicate concurrent requests
      missing.forEach((n) => pathaoInFlightRef.current.add(n));
      setIsPathaoLookupLoading(true);

      try {
        for (let i = 0; i < missing.length; i += 100) {
          if (cancelled) return;
          const chunk = missing.slice(i, i + 100);
          const res = await pathaoOrderLookupService.lookupBulk(chunk);
          if (cancelled) return;

          const next: Record<string, PathaoBulkLookupItem> = {};
          (res.data || []).forEach((item) => {
            if (item?.order_number) next[item.order_number] = item;
          });

          if (Object.keys(next).length > 0) {
            setPathaoLookupByOrderNumber((prev) => ({ ...prev, ...next }));
          }
        }
      } catch (e) {
        console.error('Failed to bulk lookup Pathao orders:', e);
      } finally {
        // Clear in-flight markers
        missing.forEach((n) => pathaoInFlightRef.current.delete(n));
        if (!cancelled) setIsPathaoLookupLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [filteredOrderNumbers, pathaoLookupByOrderNumber]);

  const handleViewDetails = async (order: Order) => {
    setIsLoadingDetails(true);
    setShowDetailsModal(true);
    setActiveMenu(null);

    try {
      const fullOrder = await orderService.getById(order.id);
      setSelectedBackendOrder(fullOrder);
      const transformedOrder = transformOrder(fullOrder);
      setSelectedOrder(transformedOrder);
      // Ensure we always pass an array (never undefined) and keep types narrow for TS
      ensureProductThumbs((fullOrder.items ?? []).map((it: any) => it?.product_id));

      // 🔎 Pathao lookup for this order (for tracking info)
      try {
        const odNo = fullOrder?.order_number || transformedOrder.orderNumber;
        if (odNo) {
          const lookup = await pathaoOrderLookupService.lookupSingle(odNo);
          setSelectedOrderPathao(lookup);
          setPathaoLookupByOrderNumber((prev) => ({
            ...prev,
            [lookup.order_number]: {
              ...lookup,
              found: true,
            },
          }));
        } else {
          setSelectedOrderPathao(null);
        }
      } catch (e) {
        console.warn('Pathao lookup failed for order:', e);
        setSelectedOrderPathao(null);
      }
    } catch (error: any) {
      console.error('Failed to load order details:', error);
      alert('Failed to load order details: ' + error.message);
      setShowDetailsModal(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const openCourierEditor = (order: Order) => {
    setActiveMenu(null);
    setCourierModalOrder(order);
    const current = order.intendedCourier ? String(order.intendedCourier) : '';
    const normalizedCurrent = normalizeCourier(current);
    setCourierModalValue(current && allowedCourierMap.has(normalizedCurrent) ? (allowedCourierMap.get(normalizedCurrent) as string) : '');
    setShowCourierModal(true);
  };

  const saveCourierMarker = async () => {
    if (!courierModalOrder) return;
    const nextRaw = courierModalValue?.trim() ? courierModalValue.trim() : '';
    const nextVal = nextRaw ? (allowedCourierMap.get(normalizeCourier(nextRaw)) || nextRaw) : null;

    setIsSavingCourier(true);
    try {
      const res = await orderService.setIntendedCourier(courierModalOrder.id, nextVal);
      const applied = res?.intended_courier ?? nextVal;

      setOrders((prev) =>
        prev.map((o) => (o.id === courierModalOrder.id ? { ...o, intendedCourier: applied } : o))
      );

      if (applied) {
        const mappedApplied = allowedCourierMap.get(normalizeCourier(applied));
        if (mappedApplied) {
          setAvailableCouriers((prev) => Array.from(new Set([...(prev || []), mappedApplied])));
        }
      }

      setShowCourierModal(false);
      setCourierModalOrder(null);
      alert('Order marker updated successfully');
    } catch (e: any) {
      alert(e?.message || 'Failed to update order marker');
    } finally {
      setIsSavingCourier(false);
    }
  };


  const openCollectInstallment = async (order: Order) => {
    try {
      setActiveMenu(null);
      setIsCollectingInstallment(false);
      setInstallmentOrderId(order.id);

      // Load active payment methods (once)
      if (installmentMethods.length === 0) {
        // Use the backend endpoint that does NOT require customer_type
        // GET /api/payment-methods/all
        const res = await axios.get('/payment-methods/all');
        const methods: PaymentMethod[] =
          res?.data?.data?.payment_methods || res?.data?.data?.payment_methods || res?.data?.data || [];

        setInstallmentMethods(Array.isArray(methods) ? methods : []);
        if (Array.isArray(methods) && methods.length && installmentMethodId === '') {
          setInstallmentMethodId(methods[0].id);
        }
      }

      // Fetch latest backend order (so installment info is accurate)
      const full = await orderService.getById(order.id);
      setSelectedBackendOrder(full);

      const info = full.installment_info ?? full.installment_plan ?? null;
      const outstanding = parseMoney(full.outstanding_amount);

      const suggested = Math.min(
        outstanding,
        Number(info?.installment_amount ?? outstanding) || outstanding
      );

      setInstallmentAmountInput((suggested || 0).toFixed(2));
      setInstallmentNotes('');
      setInstallmentRef('');
      setShowInstallmentModal(true);
    } catch (e: any) {
      console.error('Failed to open installment modal:', e);
      alert(e?.message || 'Failed to open installment modal');
    }
  };

  const submitInstallmentPayment = async () => {
    if (!installmentOrderId) return;

    const amt = parseMoney(installmentAmountInput);
    const methodId = Number(installmentMethodId || 0);

    if (!methodId) {
      alert('Please select a payment method');
      return;
    }
    if (!amt || amt <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsCollectingInstallment(true);
    try {
      await paymentService.addInstallmentPayment(installmentOrderId, {
        payment_method_id: methodId,
        amount: amt,
        transaction_reference: installmentRef ? installmentRef.trim() : undefined,
        notes: installmentNotes ? installmentNotes.trim() : undefined,
      });

      // Refresh list + details
      await loadOrders();

      try {
        const full = await orderService.getById(installmentOrderId);
        setSelectedBackendOrder(full);
        const transformed = transformOrder(full);
        setSelectedOrder((prev) => (prev?.id === installmentOrderId ? transformed : prev));
      } catch (err) {
        // ignore
      }

      setShowInstallmentModal(false);
      alert('Installment payment added successfully');
    } catch (e: any) {
      console.error('Failed to add installment payment:', e);
      alert(e?.message || 'Failed to add installment payment');
    } finally {
      setIsCollectingInstallment(false);
    }
  };

  const handleEditOrder = async (order: Order) => {
    setActiveMenu(null);
    setIsLoadingDetails(true);
    setShowEditModal(true);

    try {
      const fullOrder = await orderService.getById(order.id);
      setSelectedBackendOrder(fullOrder);
      const transformedOrder = transformOrder(fullOrder);

      setSelectedOrder(transformedOrder);
      setEditableOrder(transformedOrder);
      setServicesTouched(false);
      ensureProductThumbs((fullOrder.items ?? []).map((it: any) => it?.product_id));
      if (fullOrder.store?.id) {
        setPickerStoreId(fullOrder.store.id);
      }
    } catch (error: any) {
      console.error('Failed to load order details:', error);
      alert('Failed to load order details: ' + error.message);
      setShowEditModal(false);
      setEditableOrder(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const reloadEditableOrder = async (orderId: number) => {
    try {
      const fullOrder = await orderService.getById(orderId);
      const transformed = transformOrder(fullOrder);
      setSelectedOrder(transformed);
      setEditableOrder(transformed);
      ensureProductThumbs((fullOrder.items ?? []).map((it: any) => it?.product_id));
      await loadOrders();
    } catch (e: any) {
      console.error('Failed to reload order after item change:', e);
      alert('Order updated, but failed to refresh details. Please reopen the editor.');
    }
  };

  const canReturnOrExchange = (statusRaw: any) => {
    const s = normalize(statusRaw);
    return s === 'delivered' || s === 'completed';
  };

  const openReturnModal = async (order: Order) => {
    setActiveMenu(null);
    try {
      const fullOrder = await orderService.getById(order.id);

      if (!canReturnOrExchange(fullOrder.status)) {
        alert(
          `Return is available only for delivered/completed orders.\n\nOrder: ${fullOrder.order_number}\nCurrent status: ${fullOrder.status}`
        );
        return;
      }

      setSelectedOrderForAction(fullOrder);
      setShowReturnModal(true);
    } catch (error: any) {
      console.error('Failed to load order for return:', error);
      alert('Failed to load order details for return. Please try again.');
    }
  };

  const openExchangeModal = async (order: Order) => {
    setActiveMenu(null);
    try {
      const fullOrder = await orderService.getById(order.id);

      if (!canReturnOrExchange(fullOrder.status)) {
        alert(
          `Exchange is available only for delivered/completed orders.\n\nOrder: ${fullOrder.order_number}\nCurrent status: ${fullOrder.status}`
        );
        return;
      }

      setSelectedOrderForAction(fullOrder);
      setShowExchangeModal(true);
    } catch (error: any) {
      console.error('Failed to load order for exchange:', error);
      alert('Failed to load order details for exchange. Please try again.');
    }
  };

  const handleReturnSubmit = async (returnData: {
    selectedProducts: Array<{ order_item_id: number; quantity: number; product_barcode_id?: number }>;
    refundMethods: { cash: number; card: number; bkash: number; nagad: number; total: number };
    returnReason:
      | 'defective_product'
      | 'wrong_item'
      | 'not_as_described'
      | 'customer_dissatisfaction'
      | 'size_issue'
      | 'color_issue'
      | 'quality_issue'
      | 'late_delivery'
      | 'changed_mind'
      | 'duplicate_order'
      | 'other';
    returnType: 'customer_return' | 'store_return' | 'warehouse_return';
    receivedAtStoreId: number;
    customerNotes?: string;
  }) => {
    try {
      if (!selectedOrderForAction) return;

      const returnRequest: CreateReturnRequest = {
        order_id: selectedOrderForAction.id,
        return_reason: returnData.returnReason,
        return_type: returnData.returnType,
        received_at_store_id: returnData.receivedAtStoreId,
        items: returnData.selectedProducts.map((item) => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          product_barcode_id: item.product_barcode_id,
        })),
        customer_notes: returnData.customerNotes || 'Return initiated from Orders dashboard',
      };

      const returnResponse = await productReturnService.create(returnRequest);
      const returnId = returnResponse.data.id;

      await productReturnService.update(returnId, {
        quality_check_passed: true,
        quality_check_notes: 'Auto-approved via Orders dashboard',
      });

      await productReturnService.approve(returnId, { internal_notes: 'Approved via Orders dashboard' });
      await productReturnService.process(returnId, { restore_inventory: true });
      await productReturnService.complete(returnId);

      if (returnData.refundMethods.total > 0) {
        const refundRequest: CreateRefundRequest = {
          return_id: returnId,
          refund_type: 'partial_amount',
          refund_amount: returnData.refundMethods.total,
          refund_method: 'cash',
          refund_method_details: {
            cash: returnData.refundMethods.cash,
            card: returnData.refundMethods.card,
            bkash: returnData.refundMethods.bkash,
            nagad: returnData.refundMethods.nagad,
          },
          internal_notes: 'Refund processed via Orders dashboard',
        };

        const refundResponse = await refundService.create(refundRequest);
        const refundId = refundResponse.data.id;

        await refundService.process(refundId);
        await refundService.complete(refundId, { transaction_reference: `ORD-REFUND-${Date.now()}` });
      }

      await loadOrders();
      alert('✅ Return processed successfully!');

      setShowReturnModal(false);
      setSelectedOrderForAction(null);
    } catch (error: any) {
      console.error('❌ Return processing failed:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to process return';
      alert(`Error: ${errorMsg}`);
    }
  };

  const handleExchangeSubmit = async (exchangeData: {
    removedProducts: Array<{ order_item_id: number; quantity: number; product_barcode_id?: number }>;
    replacementProducts: Array<{
      product_id: number;
      batch_id: number;
      quantity: number;
      unit_price: number;
      barcode?: string;
      barcode_id?: number;
    }>;
    paymentRefund: {
      type: 'payment' | 'refund' | 'none';
      cash: number;
      card: number;
      bkash: number;
      nagad: number;
      total: number;
    };
    exchangeAtStoreId: number;
  }) => {
    try {
      if (!selectedOrderForAction) return;

      const returnRequest: CreateReturnRequest = {
        order_id: selectedOrderForAction.id,
        return_reason: 'other',
        return_type: 'customer_return',
        received_at_store_id: exchangeData.exchangeAtStoreId,
        items: exchangeData.removedProducts.map((item) => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          product_barcode_id: item.product_barcode_id,
        })),
        customer_notes: `Exchange transaction - Original Order: ${selectedOrderForAction.order_number}`,
      };

      const returnResponse = await productReturnService.create(returnRequest);
      const returnId = returnResponse.data.id;
      const returnNumber = returnResponse.data.return_number;

      await productReturnService.update(returnId, {
        quality_check_passed: true,
        quality_check_notes: 'Exchange - Auto-approved via Orders dashboard',
      });
      await productReturnService.approve(returnId, { internal_notes: 'Exchange - Auto-approved via Orders dashboard' });
      await productReturnService.process(returnId, { restore_inventory: true });
      await productReturnService.complete(returnId);

      const refundRequest: CreateRefundRequest = {
        return_id: returnId,
        refund_type: 'full',
        refund_method: 'cash',
        internal_notes: `Full refund for exchange - Original Order: ${selectedOrderForAction.order_number}`,
      };

      const refundResponse = await refundService.create(refundRequest);
      const refundId = refundResponse.data.id;

      await refundService.process(refundId);
      await refundService.complete(refundId, { transaction_reference: `EXCHANGE-REFUND-${Date.now()}` });

      const newOrderTotal = exchangeData.replacementProducts.reduce((sum, p) => sum + p.unit_price * p.quantity, 0);


      // ✅ Avoid hardcoding payment_method_id (IDs can differ per environment)
      let paymentMethodId = 1;
      try {
        const pmRes = await axios.get('/payment-methods/all');
        const methods: any[] =
          (pmRes as any)?.data?.data?.payment_methods ||
          (pmRes as any)?.data?.data ||
          (pmRes as any)?.data ||
          [];

        const normalized = (v: any) => String(v ?? '').toLowerCase().trim();
        const cash =
          methods.find((m) => normalized(m?.type) === 'cash') ||
          methods.find((m) => normalized(m?.name).includes('cash')) ||
          methods.find((m) => normalized(m?.name).includes('ক্যাশ')) ||
          methods[0];

        paymentMethodId = Number(cash?.id) || 1;
      } catch (e) {
        console.warn('Failed to load payment methods, falling back to id=1', e);
      }

      const newOrderData = {
        order_type: selectedOrderForAction.order_type as 'social_commerce' | 'ecommerce',
        store_id: exchangeData.exchangeAtStoreId,
        customer_id: selectedOrderForAction.customer?.id,
        items: exchangeData.replacementProducts.map((p) => ({
          product_id: p.product_id,
          batch_id: p.batch_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          barcode: p.barcode,
})),
        payment: {
          payment_method_id: paymentMethodId,
amount: newOrderTotal,
          payment_type: 'full' as const,
        },
        notes: `Exchange from order #${selectedOrderForAction.order_number} | Return: #${returnNumber}`,
      };

      const newOrder = await orderService.create(newOrderData);
      await orderService.complete(newOrder.id);

      await loadOrders();

      let msg = `✅ Exchange processed successfully!\n\n📦 Return: #${returnNumber}\n🛒 New Order: #${newOrder.order_number}`;
      if (exchangeData.paymentRefund.type === 'payment') {
        msg += `\n\n💳 Customer paid additional: ৳${exchangeData.paymentRefund.total.toLocaleString()}`;
      } else if (exchangeData.paymentRefund.type === 'refund') {
        msg += `\n\n💵 Give customer back: ৳${exchangeData.paymentRefund.total.toLocaleString()}`;
      } else {
        msg += `\n\n📊 Even exchange (no difference)`;
      }
      alert(msg);

      setShowExchangeModal(false);
      setSelectedOrderForAction(null);
    } catch (error: any) {
      console.error('❌ Exchange processing failed:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to process exchange';
      alert(`❌ Exchange failed: ${errorMsg}`);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await orderService.cancel(orderId, 'Cancelled by user');
      await loadOrders();
      setActiveMenu(null);
      alert('Order cancelled successfully!');
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      alert(`Failed to cancel order: ${error.message}`);
    }
  };

  const getOrderTypeBadge = (orderType: string) => {
    if (orderType === 'social_commerce') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          <ShoppingBag className="h-3 w-3" />
          Social
        </span>
      );
    }
    if (orderType === 'ecommerce') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Globe className="h-3 w-3" />
          E-Com
        </span>
      );
    }
    if (orderType === 'counter') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
          <Package className="h-3 w-3" />
          Counter
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
        <Package className="h-3 w-3" />
        Other
      </span>
    );
  };

  const getDeliveryBadge = (orderNumber: string) => {
    const info = pathaoLookupByOrderNumber[orderNumber];
    if (!info) {
      return isPathaoLookupLoading ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Loader className="h-3 w-3 animate-spin" />
          Checking
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Package className="h-3 w-3" />
          —
        </span>
      );
    }

    if (info.is_sent_via_pathao) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Truck className="h-3 w-3" />
          Pathao
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
        <Package className="h-3 w-3" />
        Regular
      </span>
    );
  };

  const totalRevenue = orders.reduce((sum, order) => sum + order.amounts.total, 0);
  const paidOrders = orders.filter((o) => normalize(o.paymentStatus) === 'paid').length;
  const dueOrders = orders.filter((o) => normalize(o.paymentStatus) !== 'paid').length;

  // ✅ Bulk selection helpers
  const handleToggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleToggleSelect = (orderId: number) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // ✅ Bulk: Send to Pathao
  const handleBulkSendToPathao = async () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one order to send to Pathao.');
      return;
    }
    if (!confirm(`Send ${selectedOrders.size} order(s) to Pathao?`)) return;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    setIsSendingBulk(true);
    setPathaoProgress({
      show: true,
      current: 0,
      total: selectedOrders.size,
      success: 0,
      failed: 0,
      batchCode: undefined,
      batchStatus: 'preparing',
      details: [],
    });

    let successCount = 0;
    let failedCount = 0;

    try {
      const selectedOrdersList = orders.filter((o) => selectedOrders.has(o.id));
      const shipmentIdsToSend: number[] = [];
      const detailsBuffer: Array<{ orderId?: number; orderNumber?: string; status: 'success' | 'failed'; message: string }> = [];

      for (let idx = 0; idx < selectedOrdersList.length; idx++) {
        const order = selectedOrdersList[idx];
        setPathaoProgress((prev) => ({ ...prev, current: idx + 1 }));

        try {
          let existingShipment: any = null;
          try {
            existingShipment = await shipmentService.getByOrderId(order.id);
          } catch {
            existingShipment = null;
          }

          if (existingShipment) {
            if (existingShipment.pathao_consignment_id) {
              failedCount++;
              detailsBuffer.push({ orderId: order.id, orderNumber: order.orderNumber, status: 'failed', message: 'Already sent to Pathao' });
              setPathaoProgress((prev) => ({ ...prev, failed: failedCount, details: [...prev.details, detailsBuffer[detailsBuffer.length - 1]] }));
              continue;
            }
            shipmentIdsToSend.push(existingShipment.id);
          } else {
            const newShipment = await shipmentService.create({
              order_id: order.id,
              delivery_type: 'home_delivery',
              package_weight: 1.0,
              send_to_pathao: false,
            });
            shipmentIdsToSend.push(newShipment.id);
          }
        } catch (error: any) {
          failedCount++;
          const item = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'failed' as const,
            message: error?.response?.data?.message || error.message || 'Failed',
          };
          detailsBuffer.push(item);
          setPathaoProgress((prev) => ({ ...prev, failed: failedCount, details: [...prev.details, item] }));
        }

        await wait(250);
      }

      if (shipmentIdsToSend.length === 0) {
        setPathaoProgress((prev) => ({
          ...prev,
          current: prev.total,
          success: successCount,
          failed: failedCount,
          batchStatus: 'completed',
        }));

        alert(`Bulk Send to Pathao Completed!\n\nSuccess: ${successCount}\nFailed: ${failedCount}`);
        setSelectedOrders(new Set());
        await loadOrders();
        return;
      }

      // Start queue batch send (default async mode)
      const started = await shipmentService.startBulkSendToPathao(shipmentIdsToSend);

      // Backward compatible handling if server responds in sync mode
      if ('success' in started && 'failed' in started) {
        for (const item of started.success || []) {
          successCount++;
          detailsBuffer.push({
            orderNumber: item.shipment_number,
            status: 'success',
            message: `Consignment ID: ${item.pathao_consignment_id}`,
          });
        }

        for (const item of started.failed || []) {
          failedCount++;
          detailsBuffer.push({
            orderNumber: item.shipment_number,
            status: 'failed',
            message: item.reason,
          });
        }

        setPathaoProgress((prev) => ({
          ...prev,
          current: prev.total,
          success: successCount,
          failed: failedCount,
          batchStatus: 'completed',
          details: detailsBuffer,
        }));
      } else {
        const batchCode = started.batch_code;
        const immediateFailures = Array.isArray(started.immediate_failures) ? started.immediate_failures : [];

        if (immediateFailures.length > 0) {
          failedCount += immediateFailures.length;
          immediateFailures.forEach((f) => {
            detailsBuffer.push({
              orderNumber: f.shipment_number,
              status: 'failed',
              message: f.reason,
            });
          });
        }

        setPathaoProgress((prev) => ({
          ...prev,
          batchCode,
          batchStatus: 'processing',
          details: [...detailsBuffer],
          failed: failedCount,
        }));

        let summary = await shipmentService.getBulkStatus(batchCode);

        while (summary.status === 'pending' || summary.status === 'processing') {
          successCount = summary.success;
          const queuedFailed = summary.failed;
          const processedWithPrechecks = failedCount + summary.processed;

          setPathaoProgress((prev) => ({
            ...prev,
            batchCode,
            batchStatus: summary.status,
            current: Math.min(prev.total, processedWithPrechecks),
            success: successCount,
            failed: failedCount + queuedFailed,
          }));

          await wait(2000);
          summary = await shipmentService.getBulkStatus(batchCode);
        }

        // Final status update
        successCount = summary.success;
        failedCount = failedCount + summary.failed;

        // Pull per-shipment final details
        try {
          const finalDetails = await shipmentService.getBulkStatusDetails(batchCode);
          for (const item of finalDetails.results || []) {
            detailsBuffer.push({
              orderNumber: item.order_number || item.shipment_number,
              status: item.success ? 'success' : 'failed',
              message: item.success
                ? `Consignment ID: ${item.consignment_id || 'N/A'}`
                : item.message || 'Failed to send',
            });
          }
        } catch (detailsErr) {
          console.warn('Could not fetch final bulk details:', detailsErr);
        }

        setPathaoProgress((prev) => ({
          ...prev,
          batchCode,
          batchStatus: summary.status,
          current: prev.total,
          success: successCount,
          failed: failedCount,
          details: detailsBuffer,
        }));
      }

      alert(`Bulk Send to Pathao Completed!\n\nSuccess: ${successCount}\nFailed: ${failedCount}`);
      setSelectedOrders(new Set());
      // Set courier marker to Pathao in DB (persists after reload + can be filtered)
      try {
        const ids = selectedOrdersList
          .map((o) => Number(o?.id))
          .filter((id) => Number.isFinite(id) && id > 0);

        if (ids.length > 0) {
          const idSet = new Set<number>(ids);
          const concurrency = Math.min(5, ids.length);
          let idx = 0;

          const worker = async () => {
            while (idx < ids.length) {
              const current = ids[idx++];
              try {
                await orderService.setIntendedCourier(current, 'pathao');
              } catch {
                // ignore per-order failures
              }
            }
          };

          await Promise.all(Array.from({ length: concurrency }, () => worker()));

          // optimistic UI update
          setOrders((prev) => prev.map((o) => (idSet.has(o.id) ? { ...o, intendedCourier: 'pathao' } : o)));
        }
      } catch (e) {
        console.warn('Failed to set intended courier for bulk Pathao send:', e);
      }

      await loadOrders();
    } catch (error: any) {
      console.error('Bulk send to Pathao error:', error);
      alert(`Failed to complete bulk send: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setIsSendingBulk(false);
      setTimeout(() => {
        setPathaoProgress({
          show: false,
          current: 0,
          total: 0,
          success: 0,
          failed: 0,
          batchCode: undefined,
          batchStatus: 'preparing',
          details: [],
        });
      }, 2500);
    }
  };

    const isSocialOrder = (o: Order | any) => {
    const t = String((o as any)?.orderType || (o as any)?.order_type || '').toLowerCase();
    const lbl = String((o as any)?.orderTypeLabel || '').toLowerCase();
    return t === 'social_commerce' || t === 'social' || lbl.includes('social');
  };

  // ✅ Bulk: Print social commerce invoices (A5)
  const handleBulkPrintInvoices = async () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one order to print.');
      return;
    }

    const selectedOrdersList = filteredOrders.filter((o) => selectedOrders.has(o.id));
    const socialList = selectedOrdersList.filter(isSocialOrder);

    if (socialList.length === 0) {
      alert('No Social Commerce orders selected. Please select Social Commerce orders to print invoices.');
      return;
    }

    // Try to refresh printer status, but don't block printing if QZ is offline.
    try {
      await checkPrinterStatus();
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (e) {
      console.warn('QZ Tray status check failed - will use browser preview fallback.', e);
    }

    let status: { connected: boolean } = { connected: false };
    try {
      status = await checkQZStatus();
    } catch {}

    setIsPrintingBulk(true);
    setBulkPrintProgress({ show: true, current: 0, total: socialList.length, success: 0, failed: 0 });

    try {
      const fullOrders: any[] = [];

      // fetch full orders one-by-one (keeps backend load safe)
      for (let i = 0; i < socialList.length; i++) {
        const o = socialList[i];
        setBulkPrintProgress((prev) => ({ ...prev, current: i + 1 }));

        try {
          const fullOrder = await orderService.getById(o.id);
          fullOrders.push(fullOrder);
        } catch (e) {
          console.error('Failed to fetch order for invoice:', o.id, e);
          setBulkPrintProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // If QZ is offline, open ONE bulk preview window (Print → Save as PDF).
      if (!status.connected) {
        await printBulkReceipts(fullOrders, undefined, { template: 'social_invoice', title: 'Social Invoices' });
        alert('Opened invoice preview. Use Print → Save as PDF.');
        return;
      }

      // QZ online: print one-by-one
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < fullOrders.length; i++) {
        const fullOrder = fullOrders[i];
        setBulkPrintProgress((prev) => ({ ...prev, current: i + 1 }));

        try {
          await printReceipt(fullOrder as any, selectedPrinter, { template: 'social_invoice', title: 'Invoice' });
          successCount++;
          setBulkPrintProgress((prev) => ({ ...prev, success: successCount }));
        } catch {
          failedCount++;
          setBulkPrintProgress((prev) => ({ ...prev, failed: failedCount }));
        }

        await new Promise((resolve) => setTimeout(resolve, 650));
      }

      alert(`Bulk invoice print completed!\nSuccess: ${successCount}\nFailed: ${failedCount}`);
    } finally {
      setIsPrintingBulk(false);
      setTimeout(() => {
        setBulkPrintProgress((prev) => ({ ...prev, show: false }));
      }, 1200);
    }
  };

// ✅ Bulk: Print receipts
  const handleBulkPrintReceipts = async () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one order to print.');
      return;
    }

    // Try to refresh printer status, but don't block printing if QZ is offline.
    try {
      await checkPrinterStatus();
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (e) {
      console.warn('QZ Tray status check failed - will use browser preview fallback.', e);
    }

    let status: { connected: boolean } = { connected: false };
    try {
      status = await checkQZStatus();
    } catch (e) {
      console.warn('checkQZStatus failed - assuming offline.', e);
    }

    if (status.connected && !selectedPrinter) {
      setShowPrinterSelect(true);
      alert('Please select a printer first.');
      return;
    }

    if (!confirm(`Print receipts for ${selectedOrders.size} order(s)?`)) return;

    setIsPrintingBulk(true);
    setBulkPrintProgress({
      show: true,
      current: 0,
      total: selectedOrders.size,
      success: 0,
      failed: 0,
      details: [],
    });

    try {
      const selectedOrdersList = orders.filter((o) => selectedOrders.has(o.id));

      // Always fetch full orders so receipt layout has complete data
      const fullOrders: any[] = [];
      for (let i = 0; i < selectedOrdersList.length; i++) {
        const o = selectedOrdersList[i];
        setBulkPrintProgress((prev) => ({ ...prev, current: i + 1 }));

        try {
          const fullOrder = await orderService.getById(o.id);
          fullOrders.push(fullOrder);
        } catch (e) {
          console.error('Failed to fetch order for receipt:', o.id, e);
          setBulkPrintProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // If QZ is offline, open ONE bulk preview window (Print → Save as PDF).
      if (!status.connected) {
        await printBulkReceipts(fullOrders);
        alert('Opened receipt preview. Use Print → Save as PDF.');
        return;
      }

      // QZ online: print one-by-one (so we can track success/fail counts)
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < fullOrders.length; i++) {
        const fullOrder = fullOrders[i];
        setBulkPrintProgress((prev) => ({ ...prev, current: i + 1 }));

        try {
          await printReceipt(fullOrder as any, selectedPrinter);
          successCount++;
          setBulkPrintProgress((prev) => ({ ...prev, success: successCount }));
        } catch {
          failedCount++;
          setBulkPrintProgress((prev) => ({ ...prev, failed: failedCount }));
        }

        await new Promise((resolve) => setTimeout(resolve, 650));
      }

      alert(`Bulk print completed!\nSuccess: ${successCount}\nFailed: ${failedCount}`);
    } finally {
      setIsPrintingBulk(false);
      setTimeout(() => {
        setBulkPrintProgress((prev) => ({ ...prev, show: false }));
      }, 1200);
    }
  };

  // ✅ Single: Send one order to Pathao
  const handleSingleSendToPathao = async (order: Order) => {
    if (!confirm(`Send order ${order.orderNumber} to Pathao?`)) return;

    setSingleActionLoading({ orderId: order.id, action: 'pathao' });
    setActiveMenu(null);

    try {
      let shipment: any = null;
      try {
        shipment = await shipmentService.getByOrderId(order.id);
      } catch {
        shipment = null;
      }

      if (shipment?.pathao_consignment_id) {
        alert(`Already sent to Pathao.\nConsignment ID: ${shipment.pathao_consignment_id}`);
        return;
      }

      if (!shipment?.id) {
        shipment = await shipmentService.create({
          order_id: order.id,
          delivery_type: 'home_delivery',
          package_weight: 1.0,
          send_to_pathao: false,
        });
      }

      const shipmentId = shipment?.id;
      if (!shipmentId) {
        alert('Failed to create/get shipment ID for this order.');
        return;
      }

      const sent = await shipmentService.sendToPathao(shipmentId);
      alert(
        `✅ Sent to Pathao successfully!\n\nShipment: ${sent?.shipment_number ?? shipment?.shipment_number ?? ''}\nConsignment ID: ${
          sent?.pathao_consignment_id ?? ''
        }`
      );

      // Set courier marker to Pathao in DB (persists after reload)
      try {
        await orderService.setIntendedCourier(order.id, 'pathao');
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, intendedCourier: 'pathao' } : o)));
      } catch (e) {
        console.warn('Failed to set intended courier for this order:', e);
      }

      await loadOrders();
    } catch (error: any) {
      console.error('Single send to Pathao error:', error);
      alert(`Failed to send to Pathao: ${error?.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setSingleActionLoading(null);
    }
  };

  // ✅ Single: Print one receipt
  const handleSinglePrintReceipt = async (order: Order) => {
    if (!confirm(`Print receipt for order ${order.orderNumber}?`)) return;

    setSingleActionLoading({ orderId: order.id, action: 'print' });
    setActiveMenu(null);

    try {
      // Try to refresh printers, but don't block preview fallback.
      try {
        await checkPrinterStatus();
      } catch (e) {
        console.warn('Printer status check failed - will use browser preview fallback.', e);
      }

      let status: { connected: boolean } = { connected: false };
      try {
        status = await checkQZStatus();
      } catch (e) {
        console.warn('checkQZStatus failed - assuming offline.', e);
      }

      if (status.connected && !selectedPrinter) {
        setShowPrinterSelect(true);
        alert('Please select a printer first.');
        return;
      }

      if (!status.connected) {
        alert('QZ Tray is offline. Opening receipt preview (Print → Save as PDF).');
      }

      const fullOrder = await orderService.getById(order.id);
      await printReceipt(fullOrder as any, status.connected ? selectedPrinter : undefined);

      alert('✅ Receipt ready (printed or opened in preview)!');
    } catch (error: any) {
      console.error('Single print error:', error);
      alert(`Failed to print receipt: ${error?.message || 'Unknown error'}`);
    } finally {
      setSingleActionLoading(null);
    }
  };

  const handleSinglePrintInvoice = async (order: Order) => {
    if (!isSocialOrder(order)) {
      alert('Invoice printing is only available for Social Commerce orders.');
      return;
    }

    if (!confirm(`Print invoice for order ${order.orderNumber}?`)) return;

    setSingleActionLoading({ orderId: order.id, action: 'print' });
    setActiveMenu(null);

    try {
      try {
        await checkPrinterStatus();
      } catch (e) {
        console.warn('Printer status check failed - will use browser preview fallback.', e);
      }

      let status: { connected: boolean } = { connected: false };
      try {
        status = await checkQZStatus();
      } catch {}

      if (!status.connected) {
        alert('QZ Tray is offline. Opening invoice preview (Print → Save as PDF).');
      }

      const fullOrder = await orderService.getById(order.id);
      await printReceipt(fullOrder as any, status.connected ? selectedPrinter : undefined, {
        template: 'social_invoice',
        title: 'Invoice',
      });

      alert('✅ Invoice ready (printed or opened in preview)!');
    } catch (error: any) {
      console.error('Single invoice print error:', error);
      alert(`Failed to print invoice: ${error?.message || 'Unknown error'}`);
    } finally {
      setSingleActionLoading(null);
    }
  };



  // 🔁 Product picker helpers
  const fetchBatchesForStore = async (storeId: number) => {
    try {
      setIsProductLoading(true);

      try {
        const batchesData = await batchService.getAvailableBatches(storeId);
        if (batchesData && batchesData.length > 0) {
          const availableBatches = batchesData.filter((batch: any) => batch.quantity > 0);
          setPickerBatches(availableBatches);
          return;
        }
      } catch (err) {
        console.warn('getAvailableBatches failed, trying getBatchesArray...', err);
      }

      try {
        const batchesData = await batchService.getBatchesArray({
          store_id: storeId,
          status: 'available',
        });
        if (batchesData && batchesData.length > 0) {
          const availableBatches = batchesData.filter((batch: any) => batch.quantity > 0);
          setPickerBatches(availableBatches);
          return;
        }
      } catch (err) {
        console.warn('getBatchesArray failed, trying getBatchesByStore...', err);
      }

      try {
        const batchesData = await batchService.getBatchesByStore(storeId);
        if (batchesData && batchesData.length > 0) {
          const availableBatches = batchesData.filter((batch: any) => batch.quantity > 0);
          setPickerBatches(availableBatches);
          return;
        }
      } catch (err) {
        console.error('All batch fetch methods failed', err);
      }

      setPickerBatches([]);
    } finally {
      setIsProductLoading(false);
    }
  };

  const fetchProductResults = async (query: string) => {
    if (!pickerStoreId) return;
    if (!query.trim()) {
      setProductResults([]);
      return;
    }

    setIsProductLoading(true);
    try {
      const products = await productService.advancedSearchAll(
        {
          query,
          is_archived: false,
          enable_fuzzy: true,
          fuzzy_threshold: 60,
          search_fields: ['name', 'sku', 'description', 'category', 'custom_fields'],
          per_page: 50,
        },
        { max_items: 5000 }
      );

      const results: any[] = [];

      for (const prod of products) {
        const imgPath =
          prod?.images?.[0]?.image_url ||
          prod?.images?.[0]?.image_path ||
          (prod as any)?.image_url ||
          (prod as any)?.image_path ||
          (prod as any)?.thumbnail;
        const imageUrl = toPublicImageUrl(imgPath);

        const productBatches = pickerBatches.filter((batch: any) => {
          const batchProductId = batch.product?.id || batch.product_id;
          return batchProductId === prod.id && batch.quantity > 0;
        });

        if (productBatches.length > 0) {
          for (const batch of productBatches) {
            results.push({
              id: prod.id,
              name: prod.name,
              sku: prod.sku,
              imageUrl,
              batchId: batch.id,
              batchNumber: batch.batch_number,
              price: parseMoney(batch.sell_price),
              available: batch.quantity,
              relevance_score: (prod as any).relevance_score || 0,
              search_stage: (prod as any).search_stage || 'api',
            });
          }
        }
      }

      results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      setProductResults(results);
    } catch (err) {
      console.error('Product search failed', err);
      setProductResults([]);
    } finally {
      setIsProductLoading(false);
    }
  };

  useEffect(() => {
    if (!showProductPicker || !productSearch.trim()) {
      setProductResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      fetchProductResults(productSearch);
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, showProductPicker, pickerStoreId, pickerBatches]);

  const handleSelectProductForOrder = async (product: any) => {
    if (!editableOrder) return;

    try {
      const itemPayload = {
        order_id: editableOrder.id,
        store_id: editableOrder.storeId ?? null,

        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,

        batch_id: product.batchId,

        quantity: 1,
        unit_price: product.price,
        discount_amount: 0,
      };

      const payload = {
        ...itemPayload,
        items: [itemPayload],
      };

      const res = await axios.post(`/orders/${editableOrder.id}/items`, payload);
      console.log('Add item response:', res.data);

      await reloadEditableOrder(editableOrder.id);

      setShowProductPicker(false);
      setProductSearch('');
      setProductResults([]);
    } catch (err: any) {
      console.error('Failed to add item to order (full error):', err);
      const backendData = err?.response?.data;
      const msg =
        backendData?.message ||
        backendData?.error ||
        JSON.stringify(backendData || {}) ||
        err?.message ||
        'Failed to add item to order.';
      alert(msg);
    }
  };

  const openProductPicker = () => {
    if (!editableOrder?.storeId && !pickerStoreId) {
      alert('Store information is missing for this order.');
      return;
    }
    const storeId = editableOrder?.storeId || pickerStoreId;
    if (!storeId) return;
    setPickerStoreId(storeId);
    fetchBatchesForStore(storeId);
    setShowProductPicker(true);
    setProductSearch('');
    setProductResults([]);
  };


  // 🛠️ Services in orders (created from POS as separate service lines)
  const loadServicesOnce = useCallback(async () => {
    if (availableServices.length > 0) return;
    setIsServiceLoading(true);
    try {
      const list = await serviceManagementService.getActiveServices();
      setAvailableServices(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load services:', e);
      setAvailableServices([]);
    } finally {
      setIsServiceLoading(false);
    }
  }, [availableServices.length]);

  useEffect(() => {
    if (!showServicePicker) return;
    loadServicesOnce();
  }, [showServicePicker, loadServicesOnce]);

  useEffect(() => {
    if (!showServicePicker) return;

    const q = serviceSearch.trim().toLowerCase();
    const base = Array.isArray(availableServices) ? availableServices : [];
    const filtered = q
      ? base.filter((s: any) => String(s?.name || '').toLowerCase().includes(q))
      : base;

    // Keep list short in UI for performance
    setServiceResults(filtered.slice(0, 60));
  }, [serviceSearch, availableServices, showServicePicker]);

  const handleSelectServiceForOrder = (svc: any) => {
    if (!editableOrder) return;

    const serviceId = Number(svc?.id) || undefined;
    const name = String(svc?.name || '').trim();
    const category = svc?.category ? String(svc.category) : undefined;
    const basePrice = Number(svc?.basePrice ?? svc?.base_price ?? 0) || 0;

    setEditableOrder((prev) => {
      if (!prev) return prev;

      // If the same service already exists, just increase qty
      const idx = prev.services.findIndex((x) => x.serviceId && serviceId && Number(x.serviceId) === Number(serviceId));
      const nextServices = [...prev.services];

      if (idx >= 0) {
        nextServices[idx] = { ...nextServices[idx], quantity: (nextServices[idx].quantity || 0) + 1 };
      } else {
        const fallbackId = -(Number(prev.id || 0) * 10000 + (nextServices.length + 1));
        nextServices.push({
          id: fallbackId,
          serviceId,
          name,
          category,
          quantity: 1,
          price: basePrice,
          discount: 0,
        });
      }

      return recalcOrderTotals({ ...prev, services: nextServices });
    });

    setServicesTouched(true);
    setShowServicePicker(false);
    setServiceSearch('');
  };

  const handleRemoveServiceLine = (serviceLineId: number) => {
    setEditableOrder((prev) => {
      if (!prev) return prev;
      const nextServices = prev.services.filter((s) => s.id !== serviceLineId);
      return recalcOrderTotals({ ...prev, services: nextServices });
    });
    setServicesTouched(true);
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!editableOrder) return;
    if (!confirm('Remove this item from the order?')) return;

    try {
      await axios.delete(`/orders/${editableOrder.id}/items/${itemId}`);
      await reloadEditableOrder(editableOrder.id);
    } catch (error: any) {
      console.error('Failed to remove item:', error);
      const backendData = error?.response?.data;
      const msg =
        backendData?.message ||
        backendData?.error ||
        JSON.stringify(backendData || {}) ||
        error?.message ||
        'Failed to remove item.';
      alert(msg);
    }
  };

  const handleUpdateItem = async (itemIndex: number) => {
    if (!editableOrder) return;

    const item = editableOrder.items[itemIndex];
    try {
      await axios.put(`/orders/${editableOrder.id}/items/${item.id}`, {
        quantity: item.quantity,
        unit_price: item.price,
        discount_amount: item.discount ?? 0,
      });

      await reloadEditableOrder(editableOrder.id);
    } catch (error: any) {
      console.error('Failed to update item:', error);
      const backendData = error?.response?.data;
      const msg =
        backendData?.message ||
        backendData?.error ||
        JSON.stringify(backendData || {}) ||
        error?.message ||
        'Failed to update item.';
      alert(msg);
    }
  };

  const handleSaveOrder = async () => {
    if (!editableOrder) return;

    try {
      setIsSavingOrder(true);


      const orderType = normalize(editableOrder.orderType);

      const customerName = editableOrder.customer.name || null;
      const customerPhone = editableOrder.customer.phone || null;
      const customerEmail = editableOrder.customer.email || null;

      let shipping_address: any =
        editableOrder.shipping_address && typeof editableOrder.shipping_address === 'object'
          ? { ...(editableOrder.shipping_address as any) }
          : {};

      let customer_address_text =
        formatShippingAddress(shipping_address) ||
        (typeof editableOrder.customer.address === 'string' ? editableOrder.customer.address : '') ||
        '';

      // Build shipping_address + customer_address based on order type
      if (orderType === 'social_commerce') {
        const cityObj = pathaoCities.find((c) => String(c.city_id) === String(pathaoCityId));
        const zoneObj = pathaoZones.find((z) => String(z.zone_id) === String(pathaoZoneId));
        const areaObj = pathaoAreas.find((a) => String(a.area_id) === String(pathaoAreaId));

        if (scIsInternational) {
          shipping_address = {
            ...shipping_address,
            name: customerName ?? shipping_address.name ?? '',
            phone: customerPhone ?? shipping_address.phone ?? '',
            street: scInternationalStreet,
            address_line1: scInternationalStreet,
            address_line_1: scInternationalStreet,
            city: scCity,
            state: scState || undefined,
            country: scCountry,
            postal_code: scInternationalPostalCode || undefined,
          };

          const parts = [scInternationalStreet, scCity, scState, scCountry].filter(Boolean);
          customer_address_text = parts.join(', ') + (scInternationalPostalCode ? ` - ${scInternationalPostalCode}` : '');
        } else {
          const isAuto = scUsePathaoAutoLocation;

          if (isAuto) {
            // ✅ Auto mode: no city/zone/area IDs (Pathao will infer from address text)
            shipping_address = {
              ...shipping_address,
              name: customerName ?? shipping_address.name ?? '',
              phone: customerPhone ?? shipping_address.phone ?? '',
              street: scStreetAddress,
              address_line1: scStreetAddress,
              address_line_1: scStreetAddress,
              city: shipping_address.city || cityObj?.city_name || scCity || 'Dhaka',
              country: shipping_address.country || 'Bangladesh',
              postal_code: scPostalCode || undefined,
            };

            customer_address_text = `${scStreetAddress}${scPostalCode ? ` - ${scPostalCode}` : ''}`;
          } else {
            const cityIdNum = pathaoCityId ? Number(pathaoCityId) : undefined;
            const zoneIdNum = pathaoZoneId ? Number(pathaoZoneId) : undefined;
            const areaIdNum = pathaoAreaId ? Number(pathaoAreaId) : undefined;

            shipping_address = {
              ...shipping_address,
              name: customerName ?? shipping_address.name ?? '',
              phone: customerPhone ?? shipping_address.phone ?? '',
              street: scStreetAddress,
              address_line1: scStreetAddress,
              address_line_1: scStreetAddress,
              area: areaObj?.area_name || shipping_address.area || '',
              city: cityObj?.city_name || shipping_address.city || '',
              country: shipping_address.country || 'Bangladesh',
              pathao_city_id: cityIdNum,
              pathao_zone_id: zoneIdNum,
              pathao_area_id: areaIdNum,
              postal_code: scPostalCode || undefined,
            };

            const parts = [scStreetAddress, areaObj?.area_name || '', zoneObj?.zone_name || '', cityObj?.city_name || ''].filter(Boolean);
            customer_address_text = parts.join(', ') + (scPostalCode ? ` - ${scPostalCode}` : '');
          }
        }
      } else if (orderType === 'ecommerce') {
        shipping_address = {
          ...shipping_address,
          name: customerName ?? shipping_address.name ?? '',
          phone: customerPhone ?? shipping_address.phone ?? '',
          email: customerEmail ?? shipping_address.email ?? undefined,
          address_line1: ecAddress1,
          address_line_1: ecAddress1,
          address_line2: ecAddress2 || undefined,
          address_line_2: ecAddress2 || undefined,
          city: ecCity,
          state: ecState,
          postal_code: ecPostalCode,
          country: ecCountry || shipping_address.country || 'Bangladesh',
          landmark: ecLandmark || undefined,
        };

        const parts = [ecAddress1, ecAddress2, ecCity, ecState].filter(Boolean);
        customer_address_text = parts.join(', ') + (ecPostalCode ? ` ${ecPostalCode}` : '');
      }

      // Canonicalize shipping payload to match backend validation rules
      if (shipping_address && typeof shipping_address === 'object' && Object.keys(shipping_address).length > 0) {
        const normalizedLine1 = cleanText(
          shipping_address.address_line1 ||
            shipping_address.address_line_1 ||
            shipping_address.street ||
            shipping_address.address ||
            customer_address_text
        );

        const normalizedCity = cleanText(
          shipping_address.city ||
            (orderType === 'ecommerce' ? ecCity : scCity) ||
            pathaoCities.find((c) => String(c.city_id) === String(pathaoCityId))?.city_name ||
            'Dhaka'
        );

        const normalizedCountry = cleanText(
          shipping_address.country ||
            (orderType === 'ecommerce' ? ecCountry : scCountry) ||
            'Bangladesh'
        );

        if (normalizedLine1) {
          shipping_address.address_line1 = normalizedLine1;
          shipping_address.address_line_1 = shipping_address.address_line_1 || normalizedLine1;
          shipping_address.street = shipping_address.street || normalizedLine1;
        }

        shipping_address.city = normalizedCity;
        shipping_address.country = normalizedCountry;
      }

      const payloadBase: any = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_address: customer_address_text || null,
        discount_amount: editableOrder.discount ?? 0,
        shipping_amount: editableOrder.shipping ?? 0,
        notes: editableOrder.notes ?? '',
        ...(servicesTouched
          ? {
              services: (editableOrder.services || []).map((s) => ({
                // Some backends require line id for updates; safe to omit if it's a client-only temp id
                ...(s.id > 0 ? { id: s.id } : {}),
                service_id: s.serviceId ?? undefined,
                service_name: s.name,
                category: s.category ?? undefined,
                quantity: s.quantity,
                unit_price: s.price,
                discount_amount: s.discount ?? 0,
              })),
            }
          : {}),
      };

      const payloadWithShipping =
        shipping_address && typeof shipping_address === 'object' && Object.keys(shipping_address).length > 0
          ? { ...payloadBase, shipping_address }
          : payloadBase;

      let response: any;
      try {
        response = await axios.patch(`/orders/${editableOrder.id}`, payloadWithShipping);
      } catch (error: any) {
        // Fallback: if backend rejects shipping_address updates, retry without it
        const backendData = error?.response?.data;
        const txt = JSON.stringify(backendData || {}).toLowerCase();
        const maybeShippingErr = txt.includes('shipping_address') || txt.includes('shipping address');

        if (payloadWithShipping?.shipping_address && maybeShippingErr) {
          response = await axios.patch(`/orders/${editableOrder.id}`, payloadBase);
        } else {
          throw error;
        }
      }



      if (response.data?.success) {
        const updated = transformOrder(response.data.data);
        setSelectedOrder(updated);
        setEditableOrder(updated);
        await loadOrders();
        alert('Order updated successfully.');
        setShowEditModal(false);
      } else {
        alert(response.data?.message || 'Failed to update order.');
      }
    } catch (error: any) {
      console.error('Failed to save order:', error);
      const backendData = error?.response?.data;
      const msg =
        backendData?.message ||
        backendData?.error ||
        JSON.stringify(backendData || {}) ||
        error?.message ||
        'Failed to save order.';
      alert(msg);
    } finally {
      setIsSavingOrder(false);
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-white dark:bg-black">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto bg-white dark:bg-black">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-800">
              <div className="px-4 py-2">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-black dark:bg-white rounded">
                      <ShoppingBag className="w-4 h-4 text-white dark:text-black" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-black dark:text-white leading-none">Orders</h1>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-none mt-0.5">
                        {filteredOrders.length} of {orders.length} orders
                      </p>
                    </div>
                  </div>

                  {/* Printer selector */}
                  {qzConnected && (
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-[10px]">
                        <div className="w-1 h-1 rounded-full bg-black dark:bg-white" />
                        <span className="font-medium text-black dark:text-white">Printer</span>
                      </div>

                      <div className="relative">
                        <button
                          onClick={() => setShowPrinterSelect(!showPrinterSelect)}
                          className="flex items-center gap-1 px-2 py-1 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 rounded transition-colors"
                        >
                          <Settings className="w-3 h-3 text-black dark:text-white" />
                          <span className="text-[10px] font-medium text-black dark:text-white truncate max-w-[120px]">
                            {selectedPrinter || 'Select'}
                          </span>
                        </button>

                        {showPrinterSelect && (
                          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 rounded shadow-lg w-64 z-50">
                            <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-800">
                              <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Printers</p>
                            </div>
                            {printers.map((printer) => (
                              <button
                                key={printer}
                                onClick={() => handlePrinterSelect(printer)}
                                className={`w-full px-2 py-1.5 text-left text-[10px] transition-colors ${
                                  selectedPrinter === printer
                                    ? 'bg-black dark:bg-white text-white dark:text-black font-medium'
                                    : 'text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-900'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate">{printer}</span>
                                  {selectedPrinter === printer && (
                                    <CheckCircle className="w-2.5 h-2.5 flex-shrink-0 ml-1" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-medium">Total</p>
                    <p className="text-lg font-bold text-black dark:text-white leading-none mt-0.5">{orders.length}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-medium">Paid</p>
                    <p className="text-lg font-bold text-black dark:text-white leading-none mt-0.5">{paidOrders}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-medium">Due/Not Paid</p>
                    <p className="text-lg font-bold text-black dark:text-white leading-none mt-0.5">{dueOrders}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-medium">Revenue</p>
                    <p className="text-lg font-bold text-black dark:text-white leading-none mt-0.5">
                      ৳{(totalRevenue / 1000).toFixed(0)}k
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="max-w-7xl mx-auto px-4 py-3">
              {/* View mode */}
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => {
                    setViewMode('online');
                    setOrderTypeFilter('All Types');
                    setOrderStatusFilter('pending');
                    setPaymentStatusFilter('All Payment Status');
                    setCourierFilter('All Couriers');
                    setSearch('');
                    setDateFilter('');
                    setSelectedOrders(new Set());
                  }}
                  className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${
                    viewMode === 'online'
                      ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                      : 'bg-white text-black border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  Online Orders
                </button>

                <button
                  onClick={() => {
                    setViewMode('installments');
                    setOrderTypeFilter('All Types');
                    setOrderStatusFilter('All Order Status');
                    setPaymentStatusFilter('All Payment Status');
                    setCourierFilter('All Couriers');
                    setSearch('');
                    setDateFilter('');
                    setSelectedOrders(new Set());
                  }}
                  className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${
                    viewMode === 'installments'
                      ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                      : 'bg-white text-black border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  Installments (EMI)
                </button>

                {viewMode === 'installments' && (
                  <span className="text-[10px] text-gray-600 dark:text-gray-400 ml-1">
                    Showing counter installment orders only
                  </span>
                )}
              </div>


              {/* ⚡ Quick filters (2-row): Status then Courier */}
              <div className="mb-3 border border-gray-200 dark:border-gray-800 rounded p-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wide">
                    Order Status
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderStatusFilter(viewMode === 'online' ? 'pending' : 'All Order Status');
                      setCourierFilter('All Couriers');
                    }}
                    className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    title="Reset quick filters"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-1 flex flex-wrap gap-1.5">
                  {quickStatusTabs.map((t) => {
                    const active =
                      t.value === 'All Order Status'
                        ? orderStatusFilter === 'All Order Status'
                        : normalize(orderStatusFilter) === normalize(t.value);

                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setOrderStatusFilter(t.value)}
                        className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                            : 'bg-white text-black border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {viewMode === 'online' && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wide">
                      Add Order Marker
                    </p>

                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {quickCourierTabs.map((c) => {
                        const active =
                          c === 'All Couriers'
                            ? courierFilter === 'All Couriers'
                            : normalizeCourier(courierFilter) === normalizeCourier(c);

                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setCourierFilter(c)}
                            className={`px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors ${
                              active
                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                : 'bg-white text-black border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800'
                            }`}
                            title={c === 'All Couriers' ? 'All order markers' : `Order Marker: ${courierLabel(c)}`}
                          >
                            {c === 'All Couriers' ? 'All' : courierLabel(c)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search order no / customer / phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </div>

                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />

                {/* ✅ NEW: Order type filter */}
                <select
                  value={orderTypeFilter}
                  onChange={(e) => setOrderTypeFilter(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                >
                  <option value="All Types">All Types</option>
                  {viewMode === 'online' ? (
                    <>
                      <option value="social_commerce">Social Commerce</option>
                      <option value="ecommerce">E-Commerce</option>
                    </>
                  ) : (
                    <>
                      <option value="counter">Counter</option>
                    </>
                  )}
                </select>

                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                >
                  <option>All Payment Status</option>
                  {paymentStatusOptions.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-500">
                Showing {filteredOrders.length} of {orders.length} orders
              </p>
            </div>

            {/* Bulk Actions */}
            {viewMode === 'online' && (
            <div className="max-w-7xl mx-auto px-4">
              {selectedOrders.size > 0 && (
                <div className="mb-2 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-black dark:bg-white rounded flex items-center justify-center">
                        <span className="text-white dark:text-black text-[10px] font-bold">{selectedOrders.size}</span>
                      </div>
                      <p className="text-[10px] font-semibold text-black dark:text-white">{selectedOrders.size} selected</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={handleBulkPrintReceipts}
                        disabled={isPrintingBulk}
                        className="flex items-center gap-1 px-2 py-1 bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black rounded transition-colors disabled:opacity-50 text-[10px] font-medium"
                      >
                        <Printer className="w-3 h-3" />
                        {isPrintingBulk ? 'Printing' : 'Print'}
                      </button>

                      <button
                        onClick={handleBulkPrintInvoices}
                        disabled={isPrintingBulk}
                        className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 text-[10px] font-medium"
                        title="Print A5 invoices for selected Social Commerce orders"
                      >
                        <Printer className="w-3 h-3" />
                        {isPrintingBulk ? 'Printing' : 'Invoices'}
                      </button>


                      <button
                        onClick={handleBulkSendToPathao}
                        disabled={isSendingBulk}
                        className="flex items-center gap-1 px-2 py-1 bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black rounded transition-colors disabled:opacity-50 text-[10px] font-medium"
                      >
                        <Truck className="w-3 h-3" />
                        {isSendingBulk ? 'Sending' : 'Pathao'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk Progress: Pathao */}
              {pathaoProgress.show && (
                <div className="mb-2 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-black dark:text-white flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Pathao {pathaoProgress.current}/{pathaoProgress.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        <CheckCircle className="w-3 h-3 text-black dark:text-white" />
                        <span className="text-[10px] font-medium text-black dark:text-white">{pathaoProgress.success}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <XCircle className="w-3 h-3 text-gray-500" />
                        <span className="text-[10px] font-medium text-gray-500">{pathaoProgress.failed}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1">
                    <div
                      className="bg-black dark:bg-white h-1 rounded-full transition-all"
                      style={{
                        width: `${pathaoProgress.total > 0 ? (pathaoProgress.current / pathaoProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {pathaoProgress.batchCode ? (
                    <p className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
                      Batch: <span className="font-mono">{pathaoProgress.batchCode}</span>
                      {pathaoProgress.batchStatus ? ` • ${pathaoProgress.batchStatus}` : ''}
                    </p>
                  ) : null}
                </div>
              )}

              {/* Bulk Progress: Print */}
              {bulkPrintProgress.show && (
                <div className="mb-2 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-black dark:text-white flex items-center gap-1">
                      <Printer className="w-3 h-3" />
                      Print {bulkPrintProgress.current}/{bulkPrintProgress.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        <CheckCircle className="w-3 h-3 text-black dark:text-white" />
                        <span className="text-[10px] font-medium text-black dark:text-white">{bulkPrintProgress.success}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <XCircle className="w-3 h-3 text-gray-500" />
                        <span className="text-[10px] font-medium text-gray-500">{bulkPrintProgress.failed}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1">
                    <div
                      className="bg-black dark:bg-white h-1 rounded-full transition-all"
                      style={{
                        width: `${bulkPrintProgress.total > 0 ? (bulkPrintProgress.current / bulkPrintProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            )}

            {/* Orders Table */}
            <div className="max-w-7xl mx-auto px-4 pb-4">
              {isLoading ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-800">
                  <Loader className="animate-spin h-12 w-12 text-black dark:text-white mx-auto" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-4">Loading orders...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-800">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No orders found</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  {/* 📱 Mobile-first cards */}
                  <div className="md:hidden">
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                          onChange={handleToggleSelectAll}
                          className="h-4 w-4"
                        />
                        Select all
                      </label>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {filteredOrders.length} shown
                      </span>
                    </div>

                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                      {filteredOrders.map((order) => (
                        <div key={order.id} className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedOrders.has(order.id)}
                                onChange={() => handleToggleSelect(order.id)}
                                className="h-4 w-4 mt-1"
                              />

                              <div className="min-w-0">
                                <p className="text-sm font-bold text-black dark:text-white leading-tight">
                                  {order.orderNumber}
                                </p>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                                  {order.customer.name} • {order.customer.phone}
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">{order.date}</p>

                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {getOrderTypeBadge(order.orderType)}
                                  {getDeliveryBadge(order.orderNumber)}
                                  {viewMode === 'online' && getCourierBadge(order.intendedCourier)}
                                  {order.isInstallment && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                      EMI
                                    </span>
                                  )}
                                  {getOrderStatusBadge(order.status)}
                                  {getPaymentStatusBadge(order.paymentStatus)}
                                </div>
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-black dark:text-white">৳{order.amounts.total.toFixed(2)}</p>
                              {order.amounts.due > 0 && (
                                <p className="text-[11px] text-red-600 dark:text-red-400">Due: ৳{order.amounts.due.toFixed(2)}</p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewDetails(order)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-semibold text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const { top, left } = computeMenuPosition(rect, 224, 360, 4, 8);
                                setMenuPosition({ top, left });
                                setActiveMenu(activeMenu === order.id ? null : order.id);
                              }}
                              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                              title="More Actions"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 🖥️ Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase w-10">
                          <input
                            type="checkbox"
                            checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                            onChange={handleToggleSelectAll}
                            className="h-4 w-4"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Order No
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Delivery
                        </th>
                        {viewMode === 'online' && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                            Order Marker
                          </th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {filteredOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedOrders.has(order.id)}
                              onChange={() => handleToggleSelect(order.id)}
                              className="h-4 w-4"
                            />
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-black dark:text-white">{order.orderNumber}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-500">#{order.id}</p>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {getOrderTypeBadge(order.orderType)}
                              {order.isInstallment && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 w-fit">
                                  EMI
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {getDeliveryBadge(order.orderNumber)}
                              {pathaoLookupByOrderNumber[order.orderNumber]?.is_sent_via_pathao &&
                                pathaoLookupByOrderNumber[order.orderNumber]?.pathao_consignment_id && (
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {pathaoLookupByOrderNumber[order.orderNumber]?.pathao_consignment_id}
                                  </span>
                                )}
                            </div>
                          </td>

                          {viewMode === 'online' && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {getCourierBadge(order.intendedCourier)}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCourierEditor(order);
                                  }}
                                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                  title="Edit order marker"
                                >
                                  <Edit className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                                </button>
                              </div>
                            </td>
                          )}

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                  {(order.customer.name || '?').charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-black dark:text-white">{order.customer.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-500">{order.customer.phone}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{order.date}</p>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {getOrderStatusBadge(order.status)}
                              <div className="flex items-center gap-1">{getPaymentStatusBadge(order.paymentStatus)}</div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-black dark:text-white">৳{order.amounts.total.toFixed(2)}</p>
                            {order.amounts.due > 0 && (
                              <p className="text-xs text-red-600 dark:text-red-400">Due: ৳{order.amounts.due.toFixed(2)}</p>
                            )}
                            {order.isInstallment && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                                EMI {Number(order.installmentInfo?.paid_installments ?? 0)}/{Number(order.installmentInfo?.total_installments ?? 0) || '-'}
                                {order.installmentInfo?.next_payment_due ? ` • Next: ${new Date(order.installmentInfo.next_payment_due).toLocaleDateString('en-GB')}` : ''}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleViewDetails(order)}
                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const { top, left } = computeMenuPosition(rect, 224, 360, 4, 8);

                                  setMenuPosition({ top, left });
                                  setActiveMenu(activeMenu === order.id ? null : order.id);
                                }}
                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                title="More Actions"
                              >
                                <MoreVertical className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                              </button>
                            </div>
                          </td>
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

      {/* Collect Installment Modal */}
      {showInstallmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full border border-gray-200 dark:border-gray-800">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-black dark:text-white">Collect Installment</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Order #{installmentOrderId || '-'}
                </p>
              </div>
              <button
                onClick={() => setShowInstallmentModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XCircle className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] text-gray-700 dark:text-gray-300 mb-1">Amount (৳)</label>
                <input
                  value={installmentAmountInput}
                  onChange={(e) => setInstallmentAmountInput(e.target.value)}
                  inputMode="decimal"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  Tip: you can adjust the amount if you’re giving discount or collecting partial.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
                <select
                  value={installmentMethodId}
                  onChange={(e) => setInstallmentMethodId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                >
                  <option value="">Select method</option>
                  {installmentMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-gray-700 dark:text-gray-300 mb-1">Transaction Reference (optional)</label>
                <input
                  value={installmentRef}
                  onChange={(e) => setInstallmentRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  placeholder="bKash / Card / Bank ref"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                <textarea
                  value={installmentNotes}
                  onChange={(e) => setInstallmentNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  rows={2}
                  placeholder="e.g., Installment #2, discount applied"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowInstallmentModal(false)}
                className="px-3 py-2 text-xs font-semibold border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-black dark:text-white"
              >
                Cancel
              </button>

              <button
                onClick={submitInstallmentPayment}
                disabled={isCollectingInstallment}
                className="px-3 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <HandCoins className="h-4 w-4" />
                {isCollectingInstallment ? 'Processing...' : 'Collect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Marker Modal */}
      {showCourierModal && courierModalOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full border border-gray-200 dark:border-gray-800">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-black dark:text-white">Add Order Marker</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {courierModalOrder.orderNumber} • #{courierModalOrder.id}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCourierModal(false);
                  setCourierModalOrder(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XCircle className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-2">
              <label className="block text-[11px] text-gray-700 dark:text-gray-300">Add Order Marker</label>
              <select
                value={courierModalValue}
                onChange={(e) => setCourierModalValue(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              >
                <option value="">Unassigned</option>
                {courierFilterOptions.map((c) => (
                  <option key={c} value={c}>
                    {courierLabel(c)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                This is just an order marker for tracking & filtering. You can change it anytime.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCourierModal(false);
                  setCourierModalOrder(null);
                }}
                className="px-3 py-2 text-xs font-semibold border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-black dark:text-white"
              >
                Cancel
              </button>

              <button
                onClick={saveCourierMarker}
                disabled={isSavingCourier}
                className="px-3 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Truck className="h-4 w-4" />
                {isSavingCourier ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Position Dropdown Menu */}
      {activeMenu !== null && menuPosition && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl w-56 z-[60]"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) handleViewDetails(order);
            }}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 rounded-t-lg border-b border-gray-100 dark:border-gray-700"
          >
            <Eye className="h-5 w-5 flex-shrink-0" />
            <span>View Details</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) handleEditOrder(order);
            }}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
          >
            <Edit className="h-5 w-5 flex-shrink-0" />
            <span>Edit Order</span>
          </button>

          {viewMode === 'online' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const order = filteredOrders.find((o) => o.id === activeMenu);
                if (order) openCourierEditor(order);
              }}
              className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
            >
              <Truck className="h-5 w-5 flex-shrink-0" />
              <span>Add Order Marker</span>
            </button>
          )}

          {(() => {
            const order = filteredOrders.find((o) => o.id === activeMenu);
            if (!order || !order.isInstallment || (order.amounts?.due ?? 0) <= 0) return null;

            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const o = filteredOrders.find((x) => x.id === activeMenu);
                  if (o) openCollectInstallment(o);
                }}
                className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
              >
                <HandCoins className="h-5 w-5 flex-shrink-0" />
                <span>Collect Installment</span>
              </button>
            );
          })()}

          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) handleSinglePrintReceipt(order);
            }}
            disabled={(() => {
              const order = filteredOrders.find((o) => o.id === activeMenu);
              return order ? isSingleLoading(order.id, 'print') : false;
            })()}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 disabled:opacity-50"
          >
            <Printer className="h-5 w-5 flex-shrink-0" />
            <span>
              {(() => {
                const order = filteredOrders.find((o) => o.id === activeMenu);
                return order && isSingleLoading(order.id, 'print') ? 'Printing...' : 'Print Receipt';
              })()}
            </span>
          </button>

          {(() => {
            const order = filteredOrders.find((o) => o.id === activeMenu);
            if (!order || !isSocialOrder(order)) return null;

            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const o = filteredOrders.find((x) => x.id === activeMenu);
                  if (o) handleSinglePrintInvoice(o);
                }}
                disabled={(() => {
                  const o = filteredOrders.find((x) => x.id === activeMenu);
                  return o ? isSingleLoading(o.id, 'print') : false;
                })()}
                className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 disabled:opacity-50"
              >
                <Printer className="h-5 w-5 flex-shrink-0" />
                <span>
                  {(() => {
                    const o = filteredOrders.find((x) => x.id === activeMenu);
                    return o && isSingleLoading(o.id, 'print') ? 'Printing...' : 'Print Invoice';
                  })()}
                </span>
              </button>
            );
          })()}


          {viewMode === 'online' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) handleSingleSendToPathao(order);
            }}
            disabled={(() => {
              const order = filteredOrders.find((o) => o.id === activeMenu);
              return order ? isSingleLoading(order.id, 'pathao') : false;
            })()}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700 disabled:opacity-50"
          >
            <Truck className="h-5 w-5 flex-shrink-0" />
            <span>
              {(() => {
                const order = filteredOrders.find((o) => o.id === activeMenu);
                return order && isSingleLoading(order.id, 'pathao') ? 'Sending...' : 'Send to Pathao';
              })()}
            </span>
          </button>
          )}


          {viewMode === 'online' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) openReturnModal(order);
            }}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
          >
            <RefreshCw className="h-5 w-5 flex-shrink-0" />
            <span>Return Order</span>
          </button>
          )}


          {viewMode === 'online' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) openExchangeModal(order);
            }}
            className="w-full px-4 py-3 text-left text-sm font-medium text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3 border-b-2 border-gray-300 dark:border-gray-600"
          >
            <ArrowLeftRight className="h-5 w-5 flex-shrink-0" />
            <span>Exchange Order</span>
          </button>
          )}


          <button
            onClick={(e) => {
              e.stopPropagation();
              const order = filteredOrders.find((o) => o.id === activeMenu);
              if (order) handleCancelOrder(order.id);
            }}
            className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3 rounded-b-lg"
          >
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <span>Cancel Order</span>
          </button>
        </div>
      )}

      {/* 🖼️ Product image preview (from Order Details) */}
      {imagePreview && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl border border-gray-200 dark:border-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-black dark:text-white truncate">{imagePreview.name}</p>
              <button
                onClick={() => setImagePreview(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            <div className="p-3">
              <img
                src={imagePreview.url}
                alt={imagePreview.name}
                className="w-full max-h-[70vh] object-contain rounded-lg bg-white dark:bg-black"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-product.png';
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-gray-200 dark:border-gray-800">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-black dark:text-white">Order Details</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedOrder?.orderNumber || 'Loading...'}</p>
              </div>
              {selectedOrder?.isInstallment && (selectedOrder.amounts?.due ?? 0) > 0 && (
                <button
                  onClick={() => openCollectInstallment(selectedOrder)}
                  className="px-3 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  <HandCoins className="h-4 w-4" />
                  Collect Installment
                </button>
              )}

              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedOrder(null);
                  setSelectedBackendOrder(null);
                  setImagePreview(null);
                  setSelectedOrderPathao(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XCircle className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="p-12 text-center">
                <Loader className="animate-spin h-12 w-12 text-black dark:text-white mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading order details...</p>
              </div>
            ) : selectedOrder ? (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-1">Order Type</p>
                    {getOrderTypeBadge(selectedOrder.orderType)}
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-1">Order Status</p>
                    {getOrderStatusBadge(selectedOrder.status)}
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-1">Payment Status</p>
                    {getPaymentStatusBadge(selectedOrder.paymentStatus, false)}
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-1">Date</p>
                    <p className="text-sm font-medium text-black dark:text-white">{selectedOrder.date}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-1">Store</p>
                    <p className="text-sm font-medium text-black dark:text-white">{selectedOrder.store}</p>
                  </div>
                </div>

                {/* 🚚 Delivery / Pathao Tracking */}
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-500 uppercase mb-2">Delivery</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {getDeliveryBadge(selectedOrder.orderNumber)}
                        {selectedOrderPathao?.is_sent_via_pathao && selectedOrderPathao?.pathao_consignment_id ? (
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            Consignment: <span className="font-semibold">{selectedOrderPathao.pathao_consignment_id}</span>
                          </span>
                        ) : null}
                      </div>

                      {selectedOrderPathao?.is_sent_via_pathao ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 dark:text-gray-400">Pathao Status</span>
                            <span className="font-medium text-black dark:text-white">
                              {selectedOrderPathao.pathao_status ? titleCase(selectedOrderPathao.pathao_status) : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 dark:text-gray-400">Shipment Status</span>
                            <span className="font-medium text-black dark:text-white">
                              {selectedOrderPathao.shipment_status ? titleCase(selectedOrderPathao.shipment_status) : '—'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {selectedOrderPathao ? 'This order was not sent via Pathao.' : 'Checking Pathao status...'}
                        </p>
                      )}
                    </div>

                    {selectedOrderPathao?.is_sent_via_pathao && selectedOrderPathao?.pathao_consignment_id ? (
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(selectedOrderPathao.pathao_consignment_id || '');
                              alert('Consignment ID copied');
                            } catch {
                              // ignore
                            }
                          }}
                          className="px-3 py-2 text-xs font-semibold border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy ID
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const url = buildPathaoTrackingUrl(
                              selectedOrderPathao.pathao_consignment_id || '',
                              selectedOrder.customer?.phone
                            );
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          className="px-3 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center gap-2"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Track
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedOrder.isInstallment && (
                  <div>
                    <h3 className="text-sm font-bold text-black dark:text-white mb-3">Installment Summary</h3>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                      {(() => {
                        const info = selectedOrder.installmentInfo || (selectedBackendOrder?.installment_info ?? selectedBackendOrder?.installment_plan ?? null);
                        const totalIns = Number(info?.total_installments ?? 0) || 0;
                        const paidIns = Number(info?.paid_installments ?? selectedBackendOrder?.installment_info?.paid_installments ?? 0) || 0;
                        const insAmt = Number(info?.installment_amount ?? 0) || 0;
                        const nextDue = info?.next_payment_due ?? selectedBackendOrder?.installment_info?.next_payment_due ?? null;

                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-gray-700 dark:text-gray-300">Installments</p>
                              <p className="text-sm font-medium text-black dark:text-white">
                                {paidIns}/{totalIns || '-'}
                              </p>
                            </div>

                            {insAmt > 0 && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-700 dark:text-gray-300">Suggested per installment</p>
                                <p className="text-sm font-medium text-black dark:text-white">৳{insAmt.toFixed(2)}</p>
                              </div>
                            )}

                            {nextDue && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-700 dark:text-gray-300">Next due</p>
                                <p className="text-sm font-medium text-black dark:text-white">
                                  {new Date(nextDue).toLocaleDateString('en-GB')}
                                </p>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Outstanding</p>
                              <p className="text-sm font-bold text-red-600 dark:text-red-400">৳{selectedOrder.amounts.due.toFixed(2)}</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Payment history (installments only) */}
                    {Array.isArray(selectedBackendOrder?.payments) && selectedBackendOrder.payments.length > 0 && (
                      <div className="mt-3 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Installment Payments</p>
                        </div>

                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                          {selectedBackendOrder.payments
                            .filter((p: any) => String(p.payment_type || '').toLowerCase().includes('installment'))
                            .slice()
                            .reverse()
                            .slice(0, 8)
                            .map((p: any) => (
                              <div key={p.id} className="px-4 py-2 flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-semibold text-black dark:text-white">
                                    ৳{parseMoney(p.amount).toFixed(2)}
                                    <span className="ml-2 text-[10px] text-gray-500 dark:text-gray-400">
                                      {p.payment_method || p.payment_method_name || ''}
                                    </span>
                                  </p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {p.created_at ? new Date(p.created_at).toLocaleString('en-GB') : ''}
                                    {p.transaction_reference ? ` • Ref: ${p.transaction_reference}` : ''}
                                  </p>
                                </div>
                                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                                  {statusLabel(p.status || '')}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Customer Information</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 dark:text-gray-500">Name</p>
                      <p className="text-sm font-medium text-black dark:text-white">{selectedOrder.customer.name}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 dark:text-gray-500">Phone</p>
                      <p className="text-sm font-medium text-black dark:text-white">{selectedOrder.customer.phone}</p>
                    </div>
                    {selectedOrder.customer.email && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500 dark:text-gray-500">Email</p>
                        <p className="text-sm font-medium text-black dark:text-white">{selectedOrder.customer.email}</p>
                      </div>
                    )}
                    {selectedOrder.customer.address && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">Address</p>
                        <p className="text-sm text-black dark:text-white">{selectedOrder.customer.address}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Items</h3>
                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px]">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Product
                            </th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Qty
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Price
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {selectedOrder.items.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const url = getItemThumbSrc(item);
                                      if (url) setImagePreview({ url, name: item.name });
                                    }}
                                    className="w-10 h-10 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0"
                                    title="Tap to zoom"
                                  >
                                    <img
                                      src={getItemThumbSrc(item)}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = '/placeholder-product.png';
                                      }}
                                    />
                                  </button>
                                  <div>
                                    <p className="text-sm font-medium text-black dark:text-white">{item.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-500">SKU: {item.sku}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-medium text-black dark:text-white">
                                  {item.quantity}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <p className="text-sm text-black dark:text-white">৳{item.price.toFixed(2)}</p>
                                {item.discount > 0 && <p className="text-xs text-red-500">-৳{item.discount.toFixed(2)}</p>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <p className="text-sm font-medium text-black dark:text-white">
                                  ৳{((item.price - item.discount) * item.quantity).toFixed(2)}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center">
                      <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-500">No items in this order</p>
                    </div>
                  )}
                </div>


                {selectedOrder.services && selectedOrder.services.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Services</h3>
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px]">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Service
                              </th>
                              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Qty
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Price
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {selectedOrder.services.map((svc) => (
                              <tr key={svc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center flex-shrink-0">
                                      <Wrench className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-black dark:text-white">{svc.name}</p>
                                      {svc.category && (
                                        <p className="text-xs text-gray-500 dark:text-gray-500">Category: {titleCase(String(svc.category))}</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-medium text-black dark:text-white">
                                    {svc.quantity}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <p className="text-sm text-black dark:text-white">৳{svc.price.toFixed(2)}</p>
                                  {svc.discount > 0 && <p className="text-xs text-red-500">-৳{svc.discount.toFixed(2)}</p>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <p className="text-sm font-medium text-black dark:text-white">
                                    ৳{((svc.price - svc.discount) * svc.quantity).toFixed(2)}
                                  </p>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}


                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Summary</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-700 dark:text-gray-300">Subtotal</p>
                      <p className="text-sm font-medium text-black dark:text-white">৳{selectedOrder.subtotal.toFixed(2)}</p>
                    </div>
                    {selectedOrder.discount > 0 && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-700 dark:text-gray-300">Discount</p>
                        <p className="text-sm font-medium text-red-600 dark:text-red-400">
                          -৳{selectedOrder.discount.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {selectedOrder.shipping > 0 && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-700 dark:text-gray-300">Shipping</p>
                        <p className="text-sm font-medium text-black dark:text-white">৳{selectedOrder.shipping.toFixed(2)}</p>
                      </div>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-black dark:text-white">Total</p>
                      <p className="text-lg font-bold text-black dark:text-white">৳{selectedOrder.amounts.total.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-700 dark:text-gray-300">Paid</p>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        ৳{selectedOrder.amounts.paid.toFixed(2)}
                      </p>
                    </div>
                    {selectedOrder.amounts.due > 0 && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Due</p>
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">
                          ৳{selectedOrder.amounts.due.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div>
                    <h3 className="text-sm font-bold text-black dark:text-white mb-2">Notes</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                <ActivityLogPanel
                  title="Order Activity"
                  module="orders"
                  modelName="Order"
                  entityId={selectedOrder.id}
                  search={selectedOrder.orderNumber}
                  limit={12}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-gray-200 dark:border-gray-800">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-black dark:text-white">Edit Order</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedOrder?.orderNumber || 'Loading...'}</p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedOrder(null);
                  setEditableOrder(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <XCircle className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="p-12 text-center">
                <Loader className="animate-spin h-12 w-12 text-black dark:text-white mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading order details...</p>
              </div>
            ) : editableOrder ? (
              <div className="p-6 space-y-6">
                {/* Customer */}
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Customer Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                      <input
                        type="text"
                        value={editableOrder.customer.name}
                        onChange={(e) =>
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return { ...prev, customer: { ...prev.customer, name: e.target.value } };
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                      <input
                        type="text"
                        value={editableOrder.customer.phone}
                        onChange={(e) =>
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return { ...prev, customer: { ...prev.customer, phone: e.target.value } };
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                      <input
                        type="email"
                        value={editableOrder.customer.email ?? ''}
                        onChange={(e) =>
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return { ...prev, customer: { ...prev.customer, email: e.target.value } };
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Delivery Address (auto)</label>
                      <textarea
                        rows={2}
                        readOnly
                        value={formatShippingAddress(editableOrder.shipping_address) || ''}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-black dark:text-white text-sm"
                      />
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        Edit below in the <span className="font-medium">Delivery Address</span> section.
                      </p>
                    </div>
                  </div>
                </div>


                {/* Delivery Address */}
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Delivery Address</h3>

                  {normalize(editableOrder.orderType) === 'social_commerce' ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Mode</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setScIsInternational(false)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              !scIsInternational
                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            Domestic
                          </button>
                          <button
                            type="button"
                            onClick={() => setScIsInternational(true)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              scIsInternational
                                ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            International
                          </button>
                        </div>
                      </div>

                      {scIsInternational ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Country*</label>
                            <input
                              type="text"
                              value={scCountry}
                              onChange={(e) => setScCountry(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                              placeholder="e.g., United Arab Emirates"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">State/Province</label>
                            <input
                              type="text"
                              value={scState}
                              onChange={(e) => setScState(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">City*</label>
                            <input
                              type="text"
                              value={scCity}
                              onChange={(e) => setScCity(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Postal Code</label>
                            <input
                              type="text"
                              value={scInternationalPostalCode}
                              onChange={(e) => setScInternationalPostalCode(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Street Address*</label>
                            <textarea
                              rows={2}
                              value={scInternationalStreet}
                              onChange={(e) => setScInternationalStreet(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                              placeholder="House, Road, etc."
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* ✅ Auto-detect toggle (recommended) */}
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-900 dark:text-white">Auto-detect Pathao location</p>
                              <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-300">
                                When ON, City/Zone/Area are not required. Pathao will infer the location from the full address text.
                              </p>
                            </div>
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={scUsePathaoAutoLocation}
                                onChange={(e) => setScUsePathaoAutoLocation(e.target.checked)}
                                className="h-4 w-4"
                              />
                            </label>
                          </div>

                          {!scUsePathaoAutoLocation && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">City (Pathao)*</label>
                                <select
                                  value={pathaoCityId}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPathaoCityId(v);
                                    setPathaoZoneId('');
                                    setPathaoAreaId('');
                                    setPathaoZones([]);
                                    setPathaoAreas([]);
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                                >
                                  <option value="">Select City</option>
                                  {pathaoCities.map((c) => (
                                    <option key={c.city_id} value={String(c.city_id)}>
                                      {c.city_name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Zone (Pathao)*</label>
                                <select
                                  value={pathaoZoneId}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPathaoZoneId(v);
                                    setPathaoAreaId('');
                                    setPathaoAreas([]);
                                  }}
                                  disabled={!pathaoCityId}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm disabled:opacity-60"
                                >
                                  <option value="">{pathaoCityId ? 'Select Zone' : 'Select City first'}</option>
                                  {pathaoZones.map((z) => (
                                    <option key={z.zone_id} value={String(z.zone_id)}>
                                      {z.zone_name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Area (Pathao)*</label>
                                <select
                                  value={pathaoAreaId}
                                  onChange={(e) => setPathaoAreaId(e.target.value)}
                                  disabled={!pathaoZoneId}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm disabled:opacity-60"
                                >
                                  <option value="">{pathaoZoneId ? 'Select Area' : 'Select Zone first'}</option>
                                  {pathaoAreas.map((a) => (
                                    <option key={a.area_id} value={String(a.area_id)}>
                                      {a.area_name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Postal Code</label>
                                <input
                                  type="text"
                                  value={scPostalCode}
                                  onChange={(e) => setScPostalCode(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                                  placeholder="e.g., 1212"
                                />
                              </div>
                            </div>
                          )}

                          {scUsePathaoAutoLocation && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Postal Code</label>
                                <input
                                  type="text"
                                  value={scPostalCode}
                                  onChange={(e) => setScPostalCode(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                                  placeholder="e.g., 1212"
                                />
                              </div>
                              <div className="text-[11px] text-gray-600 dark:text-gray-300 flex items-end">
                                Tip: include area + city (e.g., <span className="font-semibold">Uttara, Dhaka</span>) in the address.
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {scUsePathaoAutoLocation ? 'Full Address*' : 'Street Address*'}
                            </label>
                            <textarea
                              rows={scUsePathaoAutoLocation ? 3 : 2}
                              value={scStreetAddress}
                              onChange={(e) => setScStreetAddress(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                              placeholder={
                                scUsePathaoAutoLocation ? 'House 71, Road 15, Sector 11, Uttara, Dhaka' : 'House 12, Road 5, etc.'
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : normalize(editableOrder.orderType) === 'ecommerce' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address Line 1*</label>
                        <input
                          type="text"
                          value={ecAddress1}
                          onChange={(e) => setEcAddress1(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={ecAddress2}
                          onChange={(e) => setEcAddress2(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">City*</label>
                        <input
                          type="text"
                          value={ecCity}
                          onChange={(e) => setEcCity(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">State*</label>
                        <input
                          type="text"
                          value={ecState}
                          onChange={(e) => setEcState(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Postal Code*</label>
                        <input
                          type="text"
                          value={ecPostalCode}
                          onChange={(e) => setEcPostalCode(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Country*</label>
                        <input
                          type="text"
                          value={ecCountry}
                          onChange={(e) => setEcCountry(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Landmark</label>
                        <input
                          type="text"
                          value={ecLandmark}
                          onChange={(e) => setEcLandmark(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No delivery address editor for this order type.</p>
                  )}
                </div>

                {/* Items */}
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Items</h3>
                  {editableOrder.items && editableOrder.items.length > 0 ? (
                    <div className="space-y-3">
                      {editableOrder.items.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <img
                            src={getItemThumbSrc(item)}
                            alt={item.name}
                            className="w-12 h-12 rounded-md object-cover border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder-product.png';
                            }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-black dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">SKU: {item.sku}</p>
                          </div>

                          <div className="w-24">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              min={1}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value || 1));
                                setEditableOrder((prev) => {
                                  if (!prev) return prev;
                                  const items = [...prev.items];
                                  items[index] = { ...items[index], quantity: val };
                                  return recalcOrderTotals({ ...prev, items });
                                });
                              }}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                            />
                          </div>

                          <div className="w-32">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Price</label>
                            <input
                              type="number"
                              value={item.price}
                              step="0.01"
                              onChange={(e) => {
                                const val = Number(e.target.value || 0);
                                setEditableOrder((prev) => {
                                  if (!prev) return prev;
                                  const items = [...prev.items];
                                  items[index] = { ...items[index], price: val };
                                  return recalcOrderTotals({ ...prev, items });
                                });
                              }}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                            />
                          </div>

                          <div className="flex flex-col gap-1 items-end">
                            <button
                              type="button"
                              onClick={() => handleUpdateItem(index)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No items in this order</p>
                  )}

                  <button
                    type="button"
                    onClick={openProductPicker}
                    className="mt-3 inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    + Add Item
                  </button>
                </div>


                {/* Order Services */}
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Services</h3>

                  {editableOrder.services && editableOrder.services.length > 0 ? (
                    <div className="space-y-3">
                      {editableOrder.services.map((svc, index) => (
                        <div
                          key={svc.id}
                          className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <div className="w-12 h-12 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center">
                            <Wrench className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                          </div>

                          <div className="flex-1">
                            <p className="text-sm font-medium text-black dark:text-white">{svc.name}</p>
                            {svc.category ? (
                              <p className="text-xs text-gray-500 dark:text-gray-500">Category: {titleCase(String(svc.category))}</p>
                            ) : (
                              <p className="text-xs text-gray-500 dark:text-gray-500">Service</p>
                            )}
                          </div>

                          <div className="w-24">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qty</label>
                            <input
                              type="number"
                              value={svc.quantity}
                              min={1}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value || 1));
                                setEditableOrder((prev) => {
                                  if (!prev) return prev;
                                  const next = [...prev.services];
                                  next[index] = { ...next[index], quantity: val };
                                  return recalcOrderTotals({ ...prev, services: next });
                                });
                                setServicesTouched(true);
                              }}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                            />
                          </div>

                          <div className="w-32">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Price</label>
                            <input
                              type="number"
                              value={svc.price}
                              step="0.01"
                              onChange={(e) => {
                                const val = Number(e.target.value || 0);
                                setEditableOrder((prev) => {
                                  if (!prev) return prev;
                                  const next = [...prev.services];
                                  next[index] = { ...next[index], price: val };
                                  return recalcOrderTotals({ ...prev, services: next });
                                });
                                setServicesTouched(true);
                              }}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                            />
                          </div>

                          <div className="w-28">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Discount</label>
                            <input
                              type="number"
                              value={svc.discount}
                              step="0.01"
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value || 0));
                                setEditableOrder((prev) => {
                                  if (!prev) return prev;
                                  const next = [...prev.services];
                                  next[index] = { ...next[index], discount: val };
                                  return recalcOrderTotals({ ...prev, services: next });
                                });
                                setServicesTouched(true);
                              }}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white text-sm"
                            />
                          </div>

                          <div className="flex flex-col gap-1 items-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveServiceLine(svc.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No services in this order</p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowServicePicker(true);
                      setServiceSearch('');
                    }}
                    className="mt-3 inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    + Add Service
                  </button>
                </div>

                {/* Totals */}
                <div>
                  <h3 className="text-sm font-bold text-black dark:text-white mb-3">Order Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Discount (৳)</label>
                      <input
                        type="number"
                        value={editableOrder.discount}
                        step="0.01"
                        onChange={(e) => {
                          const val = Number(e.target.value || 0);
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return recalcOrderTotals({ ...prev, discount: val });
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Shipping (৳)</label>
                      <input
                        type="number"
                        value={editableOrder.shipping}
                        step="0.01"
                        onChange={(e) => {
                          const val = Number(e.target.value || 0);
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return recalcOrderTotals({ ...prev, shipping: val });
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                      <textarea
                        rows={3}
                        value={editableOrder.notes ?? ''}
                        onChange={(e) =>
                          setEditableOrder((prev) => {
                            if (!prev) return prev;
                            return { ...prev, notes: e.target.value };
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setSelectedOrder(null);
                      setEditableOrder(null);
                    }}
                    className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-black dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveOrder}
                    disabled={isSavingOrder}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors font-medium"
                  >
                    {isSavingOrder ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-black dark:text-white">Add Product to Order</h3>
              <button
                onClick={() => {
                  setShowProductPicker(false);
                  setProductSearch('');
                  setProductResults([]);
                }}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search by product name or SKU..."
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
              </div>

              <div className="border border-gray-200 dark:border-gray-800 rounded-lg max-h-72 overflow-auto p-2">
                {isProductLoading ? (
                  <div className="p-6 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Loading products...</p>
                  </div>
                ) : productResults.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                    Type to search products for this store
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {productResults.map((product) => (
                      <button
                        type="button"
                        key={`${product.id}-${product.batchId}`}
                        onClick={() => handleSelectProductForOrder(product)}
                        className="border border-gray-200 dark:border-gray-600 rounded p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={product.imageUrl || '/placeholder-product.png'}
                            alt={product.name}
                            className="w-10 h-10 rounded-md object-cover border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder-product.png';
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-black dark:text-white truncate">{product.name}</p>
                            {product.batchNumber && (
                              <p className="text-[11px] text-blue-600 dark:text-blue-400 truncate">
                                Batch: {product.batchNumber}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-600 dark:text-gray-400">Price: {product.price} Tk</p>
                            <p className="text-[11px] text-green-600 dark:text-green-400">Available: {product.available}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Service Picker Modal */}
      {showServicePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[75] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-black dark:text-white">Add Service to Order</h3>
              <button
                onClick={() => {
                  setShowServicePicker(false);
                  setServiceSearch('');
                }}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
              </div>

              <div className="border border-gray-200 dark:border-gray-800 rounded-lg max-h-72 overflow-auto p-2">
                {isServiceLoading ? (
                  <div className="p-6 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Loading services...</p>
                  </div>
                ) : serviceResults.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                    {availableServices.length === 0 ? 'No services found' : 'No matching services'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {serviceResults.map((svc: any) => (
                      <button
                        type="button"
                        key={String(svc?.id)}
                        onClick={() => handleSelectServiceForOrder(svc)}
                        className="border border-gray-200 dark:border-gray-600 rounded p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <Wrench className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-black dark:text-white truncate">{svc?.name}</p>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                              {svc?.category ? `Category: ${titleCase(String(svc.category))}` : 'Service'}
                            </p>
                            <p className="text-[11px] text-gray-700 dark:text-gray-300">
                              Base price: ৳{Number(svc?.basePrice ?? svc?.base_price ?? 0) || 0}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && selectedOrderForAction && (
        <ReturnProductModal
          order={toReturnModalOrder(selectedOrderForAction)}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedOrderForAction(null);
          }}
          onReturn={handleReturnSubmit}
        />
      )}

      {/* Exchange Modal */}
      {showExchangeModal && selectedOrderForAction && (
        <ExchangeProductModal
          order={toExchangeModalOrder(selectedOrderForAction)}
          onClose={() => {
            setShowExchangeModal(false);
            setSelectedOrderForAction(null);
          }}
          onExchange={handleExchangeSubmit}
        />
      )}

      {/* Click outside to close menu */}
      {activeMenu !== null && <div className="fixed inset-0 z-[55]" onClick={() => setActiveMenu(null)} />}

      {/* Click outside to close printer select */}
      {showPrinterSelect && <div className="fixed inset-0 z-40" onClick={() => setShowPrinterSelect(false)} />}

      <style jsx>{`
        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 3px;
        }
        .dark .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #4a5568;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
        .dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: #718096;
        }
      `}</style>
    </div>
  );
}
