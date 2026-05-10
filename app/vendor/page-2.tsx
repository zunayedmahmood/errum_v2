'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import {
  X,
  Plus,
  DollarSign,
  ShoppingCart,
  MoreVertical,
  Eye,
  Receipt,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import AccessControl from '@/components/AccessControl';
import { computeMenuPosition } from '@/lib/menuPosition';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { vendorService, Vendor } from '@/services/vendorService';
import purchaseOrderService, { PurchaseOrder, CreatePurchaseOrderData } from '@/services/purchase-order.service';
import { vendorPaymentService, CreatePaymentRequest, PaymentMethod } from '@/services/vendorPaymentService';
import storeService, { Store } from '@/services/storeService';
import productService, { Product } from '@/services/productService';
import categoryService, { Category, CategoryTree } from '@/services/categoryService';
import { useAuth } from '@/contexts/AuthContext';
import CategoryTreeSelector from '@/components/product/CategoryTreeSelector';

/**
 * Product.id sometimes ends up optional-ish in runtime indexing flows,
 * but our code needs a guaranteed numeric id for variant picker maps.
 */
type ProductWithId = Product & { id: number };

/**
 * Outstanding PO API sometimes returns `status` as a plain string
 * which can break strict union typing in PurchaseOrder['status'].
 */
type OutstandingPurchaseOrder = Partial<Omit<PurchaseOrder, 'status'>> & {
  id: number;
  status?: string;
  po_number?: string;
  outstanding_amount?: number;
};

// Utility function to safely format currency
const formatCurrency = (value: any): string => {
  if (value === null || value === undefined || value === '') return '0.00';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(numValue) ? '0.00' : numValue.toFixed(2);
};

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  zIndexClass = 'z-50',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /**
   * IMPORTANT: allows stacking modals (Quick Add Product over PO)
   */
  zIndexClass?: string;
}) => {
  if (!isOpen) return null;

  // ✅ wider overall; xl is now much wider
  const sizeClasses: Record<'md' | 'lg' | 'xl', string> = {
    md: 'max-w-md',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/10 backdrop-blur-md overflow-y-auto`}>
      <div
        className={`bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl shadow-xl w-full ${sizeClasses[size]} mx-4 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const Alert = ({ type, message }: { type: 'success' | 'error'; message: string }) => (
  <div
    className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
      }`}
  >
    <AlertCircle className="w-5 h-5" />
    <span>{message}</span>
  </div>
);

export default function VendorPaymentPage() {
  const { isRole } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { darkMode, setDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ✅ Image preview (tap product image to zoom) — same UX as Orders > View Details
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);

  // Data states
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTree[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<OutstandingPurchaseOrder[]>([]);
  const [vendorPayments, setVendorPayments] = useState<any[]>([]);

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return (Array.isArray(vendors) ? vendors : []).filter((v) => {
      const name = String(v?.name || '').toLowerCase();
      const phone = String((v as any)?.phone || '').toLowerCase();
      const email = String((v as any)?.email || '').toLowerCase();
      const contact = String((v as any)?.contact_person || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || contact.includes(q);
    });
  }, [vendors, vendorSearch]);

  // Modal states
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorModalMode, setVendorModalMode] = useState<'add' | 'edit'>('add');
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null);
  const [showDeleteVendor, setShowDeleteVendor] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);

  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showViewVendor, setShowViewVendor] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Form states - Add Vendor
  const [vendorForm, setVendorForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: '',
    website: '',
    type: 'manufacturer' as 'manufacturer' | 'distributor',
    credit_limit: '',
    payment_terms: '',
    notes: '',
  });

  // Form states - Add Purchase
  const [purchaseForm, setPurchaseForm] = useState({
    vendor_id: '',
    store_id: '',
    expected_delivery_date: '',
    tax_amount: '',
    discount_amount: '',
    shipping_cost: '',
    notes: '',
    terms_and_conditions: '',
    items: [
      {
        product_id: '',
        quantity_ordered: '',
        unit_cost: '',
        unit_sell_price: '',
        tax_amount: '',
        discount_amount: '',
        notes: '',
      },
    ],
  });

  const PO_DRAFT_KEY = 'vendor_po_draft_v1';

  // PO Product finder UI state
  const [poSearch, setPoSearch] = useState('');
  const [poCategoryId, setPoCategoryId] = useState('');
  const [poShowAllProducts, setPoShowAllProducts] = useState(false);

  // Draft restore banner
  const [poDraftRestored, setPoDraftRestored] = useState(false);
  const [poDraftSavedAt, setPoDraftSavedAt] = useState<string | null>(null);

  // ✅ Quick add new product from inside PO
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [quickProductForm, setQuickProductForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    description: '',
  });

  // Variant quick-add (group sizes/colors) in PO creation
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [variantBaseProduct, setVariantBaseProduct] = useState<Product | null>(null);
  const [variantOptions, setVariantOptions] = useState<ProductWithId[]>([]);
  const [variantInputs, setVariantInputs] = useState<Record<number, { quantity: string; unit_cost: string; unit_sell_price: string }>>({});
  const [variantBulkQty, setVariantBulkQty] = useState('');
  const [variantBulkCost, setVariantBulkCost] = useState('');
  const [variantBulkSell, setVariantBulkSell] = useState('');

  // Form states - Payment
  const [paymentForm, setPaymentForm] = useState({
    payment_method_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_type: 'purchase_order' as 'purchase_order' | 'advance',
    reference_number: '',
    transaction_id: '',
    notes: '',
    allocations: [] as { purchase_order_id: number; amount: number; notes?: string }[],
  });

  const [selectedPOs, setSelectedPOs] = useState<{ [key: number]: { selected: boolean; amount: string } }>({});

  // Load initial data
  useEffect(() => {
    loadVendors();
    loadStores();
    loadProducts();
    loadCategories();
    loadPaymentMethods();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (dropdownOpen !== null) setDropdownOpen(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  // Show alert helper
  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  // Image URL normalizer (used for showing thumbnails in PO)
  const getBaseUrl = () => {
    const api = process.env.NEXT_PUBLIC_API_URL || '';
    return api ? api.replace(/\/api\/?$/, '') : '';
  };

  const normalizeImageUrl = (url?: string | null) => {
    if (!url) return '/placeholder-image.jpg';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;

    const baseUrl = getBaseUrl();
    if (url.startsWith('/storage')) return `${baseUrl}${url}`;
    if (url.startsWith('/')) return url;

    if (!baseUrl) return `/storage/product-images/${url}`;
    return `${baseUrl}/storage/product-images/${url}`;
  };

  const getProductPrimaryImage = (p?: Product | null) => {
    if (!p) return '/placeholder-image.jpg';
    const imgs: any[] = Array.isArray((p as any).images) ? (p as any).images : [];
    if (imgs.length === 0) return '/placeholder-image.jpg';

    const primary = imgs.find((i: any) => i?.is_primary) || imgs.find((i: any) => i?.is_active) || imgs[0];
    return normalizeImageUrl(primary?.url || primary?.image_url || primary?.image_path || primary?.image);
  };

  const getEmptyPurchaseForm = () => ({
    vendor_id: '',
    store_id: '',
    expected_delivery_date: '',
    tax_amount: '',
    discount_amount: '',
    shipping_cost: '',
    notes: '',
    terms_and_conditions: '',
    items: [
      {
        product_id: '',
        quantity_ordered: '',
        unit_cost: '',
        unit_sell_price: '',
        tax_amount: '',
        discount_amount: '',
        notes: '',
      },
    ],
  });

  const poFinderProducts = useMemo(() => {
    let list: Product[] = products;

    // Category filter — include all descendant categories
    const cid = parseInt(poCategoryId || '0', 10);
    if (cid) {
      const ids = new Set<number>();
      const collectAll = (node: any) => {
        if (!node) return;
        if (typeof node.id === 'number') ids.add(node.id);
        (node.children || node.all_children || []).forEach(collectAll);
      };
      const findAndCollect = (nodes: any[]): boolean => {
        for (const n of nodes) {
          if (!n) continue;
          if (n.id === cid) { collectAll(n); return true; }
          if (findAndCollect(n.children || n.all_children || [])) return true;
        }
        return false;
      };
      if (Array.isArray(categoryTree) && categoryTree.length > 0) findAndCollect(categoryTree as any);
      if (ids.size === 0) ids.add(cid);
      list = list.filter((p: any) => {
        const raw = p?.category_id ?? p?.category?.id;
        const pid = typeof raw === 'string' ? parseInt(raw, 10) : raw;
        return typeof pid === 'number' && ids.has(pid);
      });
    }

    const q = poSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const sku = ((p as any).sku || '').toLowerCase();
        return name.includes(q) || sku.includes(q);
      });
    }

    // Show grouped rows (by SKU) so variations don't spam the list.
    const keyFor = (p: any) => {
      const id = Number(p?.id ?? 0);
      const rawSku = String(p?.sku ?? '').trim().toLowerCase();
      if (!rawSku) return `__no_sku_${id || Math.random()}`;
      const sku = rawSku.replace(/\s+/g, '');
      const stripped = sku.replace(/[-_]?(?:\d+(?:\.\d+)?)$/i, '');
      return (stripped || sku).trim();
    };

    const grouped = new Map<string, any>();
    for (const p of list) {
      const k = keyFor(p);
      if (!grouped.has(k)) {
        grouped.set(k, p);
        continue;
      }
      // Prefer the "base" item if it has no trailing-number SKU
      const existing = grouped.get(k);
      const existingSku = String(existing?.sku ?? '').trim();
      const newSku = String((p as any)?.sku ?? '').trim();
      if (existingSku && !newSku) grouped.set(k, p);
    }

    return Array.from(grouped.values());
  }, [products, poSearch, poCategoryId, categoryTree]);

  const addProductToPO = (productId: number) => {
    if (!productId) return;

    setPurchaseForm((prev: any) => {
      const items = Array.isArray(prev.items) ? [...prev.items] : [];

      const existingIdx = items.findIndex((it: any) => String(it.product_id) === String(productId));
      if (existingIdx >= 0) {
        const prevQty = parseInt(items[existingIdx]?.quantity_ordered || '0', 10) || 0;
        items[existingIdx] = { ...items[existingIdx], quantity_ordered: String(Math.max(prevQty + 1, 1)) };
        return { ...prev, items };
      }

      const blankIdx = items.findIndex((it: any) => !it.product_id);
      const newItem = {
        product_id: String(productId),
        quantity_ordered: '1',
        unit_cost: '',
        unit_sell_price: '',
        tax_amount: '',
        discount_amount: '',
        notes: '',
      };

      if (blankIdx >= 0) items[blankIdx] = { ...items[blankIdx], ...newItem };
      else items.push(newItem);

      return { ...prev, items };
    });
  };

  const clearPoDraft = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PO_DRAFT_KEY);
    }
    setPurchaseForm(getEmptyPurchaseForm());
    setPoSearch('');
    setPoCategoryId('');
    setPoShowAllProducts(false);
    setPoDraftRestored(false);
    setPoDraftSavedAt(null);
  };

  // Restore PO draft when opening modal
  useEffect(() => {
    if (!showAddPurchase) return;
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(PO_DRAFT_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw || '{}');
      const draft = parsed?.purchaseForm;
      const savedAt = parsed?.savedAt;

      const isEmptyNow =
        !purchaseForm.vendor_id &&
        !purchaseForm.store_id &&
        Array.isArray(purchaseForm.items) &&
        purchaseForm.items.length === 1 &&
        !purchaseForm.items[0]?.product_id;

      if (draft && isEmptyNow) {
        setPurchaseForm(draft);
        setPoSearch(parsed?.poSearch || '');
        setPoCategoryId(parsed?.poCategoryId || '');
        setPoShowAllProducts(!!parsed?.poShowAllProducts);
        setPoDraftRestored(true);
        setPoDraftSavedAt(savedAt || null);
      }
    } catch {
      // ignore broken drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddPurchase]);

  // Auto-save PO draft while modal is open
  useEffect(() => {
    if (!showAddPurchase) return;
    if (typeof window === 'undefined') return;

    const t = window.setTimeout(() => {
      try {
        const payload = {
          savedAt: new Date().toISOString(),
          purchaseForm,
          poSearch,
          poCategoryId,
          poShowAllProducts,
        };
        window.localStorage.setItem(PO_DRAFT_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 450);

    return () => window.clearTimeout(t);
  }, [showAddPurchase, purchaseForm, poSearch, poCategoryId, poShowAllProducts]);

  /**
   * Grouping rule for variations:
   * Group ONLY by the FULL SKU (exact match), never by name or SKU-prefix.
   * Products without SKU are treated as standalone (no inferred variations).
   */
  const getVariantGroupKey = (p: Product): string => {
    const id = Number((p as any)?.id ?? 0);
    const rawSku = String((p as any)?.sku ?? '').trim();
    if (!rawSku) return `__no_sku_${id || 0}`;
    // Normalize: case-insensitive, ignore spaces
    return rawSku.toLowerCase().replace(/\s+/g, '');
  };

  const extractTrailingSize = (p: Product): number | null => {
    const name = (p.name || '').trim();
    const m = name.match(/(\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return isNaN(n) ? null : n;
  };

  const getVariantGroupProducts = (p: Product): Product[] => {
    // If backend already returns variants, use them (trusted relation)
    if (Array.isArray((p as any).variants) && (p as any).variants.length > 0) {
      const all = [p, ...(p as any).variants].filter(Boolean) as any[];
      const map = new Map<number, Product>();
      all.forEach((x) => { if (x?.id) map.set(Number(x.id), x); });
      return Array.from(map.values());
    }

    // Fallback: infer variants from full product list using full SKU match ONLY.
    const key = getVariantGroupKey(p);
    return products.filter((x) => getVariantGroupKey(x) === key);
  };

  const openVariantPicker = (productId: string) => {
    const pid = parseInt(productId || '0', 10);
    if (!pid) return;

    const base = products.find((p) => (p as any).id === pid);
    if (!base) return;

    const options: ProductWithId[] = getVariantGroupProducts(base)
      .filter((x): x is ProductWithId => typeof (x as any)?.id === 'number')
      .sort((a, b) => {
        const sa = extractTrailingSize(a);
        const sb = extractTrailingSize(b);
        if (sa === null && sb === null) return (a.name || '').localeCompare(b.name || '');
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sa - sb;
      });

    const inputs: Record<number, { quantity: string; unit_cost: string; unit_sell_price: string }> = {};
    options.forEach((opt) => {
      const existing = purchaseForm.items.find((it: any) => String(it.product_id) === String(opt.id));
      inputs[opt.id] = {
        quantity: existing?.quantity_ordered || '0',
        unit_cost: existing?.unit_cost || '',
        unit_sell_price: existing?.unit_sell_price || '',
      };
    });

    setVariantBaseProduct(base);
    setVariantOptions(options);
    setVariantInputs(inputs);
    setVariantBulkQty('');
    setVariantBulkCost('');
    setVariantBulkSell('');
    setShowVariantPicker(true);
  };

  const applyVariantPicker = () => {
    if (!variantOptions.length) return;

    setPurchaseForm((prev: any) => {
      const items = [...prev.items];

      variantOptions.forEach((opt) => {
        const input = variantInputs[opt.id] || { quantity: '0', unit_cost: '', unit_sell_price: '' };
        const qty = parseInt(input.quantity || '0', 10) || 0;
        if (qty <= 0) return;

        const idx = items.findIndex((x) => String(x.product_id) === String(opt.id));
        if (idx >= 0) {
          items[idx] = {
            ...items[idx],
            quantity_ordered: String(qty),
            unit_cost: input.unit_cost || items[idx].unit_cost || '',
            unit_sell_price: input.unit_sell_price || items[idx].unit_sell_price || '',
          };
        } else {
          items.push({
            product_id: String(opt.id),
            quantity_ordered: String(qty),
            unit_cost: input.unit_cost || '',
            unit_sell_price: input.unit_sell_price || '',
            tax_amount: '',
            discount_amount: '',
            notes: '',
          });
        }
      });

      return { ...prev, items };
    });

    setShowVariantPicker(false);
    setVariantBaseProduct(null);
    setVariantOptions([]);
    setVariantInputs({});
    setVariantBulkQty('');
    setVariantBulkCost('');
    setVariantBulkSell('');
    showAlert('success', 'Variations applied to purchase order');
  };

  // Load vendors
  const loadVendors = async () => {
    try {
      setLoading(true);
      const data = await vendorService.getAll({ is_active: true });
      setVendors(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to load vendors:', error);
      setVendors([]);
      showAlert('error', error.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  // Load stores (warehouses)
  const loadStores = async () => {
    try {
      const response = await storeService.getStores({
        is_warehouse: true,
        is_active: true,
      });

      if ((response as any).success && Array.isArray((response as any).data?.data)) {
        setStores((response as any).data.data);
      } else if ((response as any).success && Array.isArray((response as any).data)) {
        setStores((response as any).data);
      } else {
        console.warn('Unexpected stores response format:', response);
        setStores([]);
      }
    } catch (error) {
      console.error('Failed to load stores:', error);
      setStores([]);
      showAlert('error', 'Failed to load warehouses');
    }
  };

  // Load categories (for PO filters / quick-add)
  const loadCategories = async () => {
    try {
      // Prefer tree for nicer selection UI (same as Product Add page)
      const tree = await categoryService.getTree(true);
      setCategoryTree(Array.isArray(tree) ? tree : []);

      // Also keep a flat list for legacy selects (e.g. quick add product)
      const rootList: any[] = Array.isArray(tree) ? tree : [];

      const flat: Category[] = [];
      const walk = (c: any) => {
        if (!c) return;
        flat.push(c as Category);
        if (Array.isArray(c.children)) c.children.forEach(walk);
      };
      rootList.forEach(walk);

      const unique = flat.filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx);
      unique.sort((a: any, b: any) => ((a.full_path || a.title) as string).localeCompare((b.full_path || b.title) as string));

      setCategories(unique);
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      setCategories([]);
      setCategoryTree([]);
      showAlert('error', error?.message || 'Failed to load categories');
    }
  };

  // Load products (safe chunked fetch to avoid 10k/100k payloads that can crash backend)
  const loadProducts = async () => {
    try {
      const chunkSize = 2000;
      const first = await productService.getAll({ page: 1, per_page: chunkSize, is_archived: false });
      let all: Product[] = Array.isArray((first as any)?.data) ? ((first as any).data as Product[]) : [];
      const lastPage = Math.max(1, Number((first as any)?.last_page || 1));

      if (lastPage > 1) {
        for (let page = 2; page <= lastPage; page++) {
          const next = await productService.getAll({ page, per_page: chunkSize, is_archived: false });
          const list: Product[] = Array.isArray((next as any)?.data) ? ((next as any).data as Product[]) : [];
          if (!list.length) break;
          all = all.concat(list);
        }
      }

      setProducts(all);
    } catch (error: any) {
      console.error('Failed to load products:', error);
      setProducts([]);
      showAlert('error', error?.message || 'Failed to load products');
    }
  };

  // Load payment methods
  const loadPaymentMethods = async () => {
    try {
      const methods = await vendorPaymentService.getAllPaymentMethods();
      setPaymentMethods(Array.isArray(methods) ? methods : []);
    } catch (error: any) {
      console.error('Failed to load payment methods:', error);
      setPaymentMethods([]);
      showAlert('error', error.message || 'Failed to load payment methods');
    }
  };

  // Handle Add Vendor
  const handleAddVendor = async () => {
    if (!vendorForm.name.trim()) {
      showAlert('error', 'Vendor name is required');
      return;
    }

    if (vendorModalMode === 'edit' && !editingVendorId) {
      showAlert('error', 'Invalid vendor selected for editing');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: vendorForm.name,
        email: vendorForm.email || undefined,
        phone: vendorForm.phone || undefined,
        address: vendorForm.address || undefined,
        contact_person: vendorForm.contact_person || undefined,
        website: vendorForm.website || undefined,
        type: vendorForm.type,
        credit_limit: vendorForm.credit_limit ? parseFloat(vendorForm.credit_limit) : undefined,
        payment_terms: vendorForm.payment_terms || undefined,
        notes: vendorForm.notes || undefined,
      };

      if (vendorModalMode === 'edit') {
        const updatedVendor = await vendorService.update(editingVendorId as number, payload);
        setVendors(vendors.map((v) => (v.id === (updatedVendor as any).id ? (updatedVendor as any) : v)));
        showAlert('success', 'Vendor updated successfully');
      } else {
        const newVendor = await vendorService.create(payload);
        setVendors([...vendors, newVendor as any]);
        showAlert('success', 'Vendor added successfully');
      }

      setVendorForm({
        name: '',
        email: '',
        phone: '',
        address: '',
        contact_person: '',
        website: '',
        type: 'manufacturer',
        credit_limit: '',
        payment_terms: '',
        notes: '',
      });
      setShowAddVendor(false);
      setVendorModalMode('add');
      setEditingVendorId(null);
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to add vendor');
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ FIX: Quick add new product now always opens ABOVE the PO modal
   * and creates correctly using productService.create()
   */
  const handleQuickCreateProduct = async () => {
    if (!purchaseForm.vendor_id) {
      showAlert('error', 'Please select a vendor first');
      return;
    }
    if (!quickProductForm.name.trim() || !quickProductForm.category_id) {
      showAlert('error', 'Name and category are required');
      return;
    }

    try {
      setLoading(true);

      const sku = quickProductForm.sku.trim();
      const payload: any = {
        name: quickProductForm.name.trim(),
        description: quickProductForm.description?.trim() || undefined,
        category_id: parseInt(quickProductForm.category_id, 10),
        vendor_id: parseInt(purchaseForm.vendor_id, 10),
      };
      // SKU is optional; backend will auto-generate if omitted
      if (sku) payload.sku = sku;

      const created = await productService.create(payload);

      // refresh product list so it shows in finder immediately
      await loadProducts();

      addProductToPO((created as any).id);
      setShowQuickProduct(false);
      setQuickProductForm({ name: '', sku: '', category_id: '', description: '' });
      showAlert('success', 'Product created and added to PO');
    } catch (error: any) {
      showAlert('error', error?.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  // Handle Add Purchase Order
  const handleAddPurchase = async () => {
    if (!purchaseForm.vendor_id || !purchaseForm.store_id) {
      showAlert('error', 'Please select vendor and warehouse');
      return;
    }

    const validItems = purchaseForm.items.filter((item) => item.product_id);
    if (validItems.length === 0) {
      showAlert('error', 'Please add at least one product');
      return;
    }

    // basic validation to avoid NaN
    const bad = validItems.find((it) => !it.quantity_ordered || (!isRole(['online-moderator']) && !it.unit_cost));
    if (bad) {
      showAlert('error', 'Please fill Quantity & Unit Cost for all items');
      return;
    }

    // Secondary validation: if moderator, they MUST fill Unit Sell Price if Cost is hidden
    if (isRole(['online-moderator'])) {
      const missingSell = validItems.find((it) => !it.unit_sell_price);
      if (missingSell) {
        showAlert('error', 'Please fill Quantity & Selling Price for all items');
        return;
      }
    }

    try {
      setLoading(true);

      const purchaseData: CreatePurchaseOrderData = {
        vendor_id: parseInt(purchaseForm.vendor_id, 10),
        store_id: parseInt(purchaseForm.store_id, 10),
        expected_delivery_date: purchaseForm.expected_delivery_date || undefined,
        tax_amount: purchaseForm.tax_amount ? parseFloat(purchaseForm.tax_amount) : undefined,
        discount_amount: purchaseForm.discount_amount ? parseFloat(purchaseForm.discount_amount) : undefined,
        shipping_cost: purchaseForm.shipping_cost ? parseFloat(purchaseForm.shipping_cost) : undefined,
        notes: purchaseForm.notes || undefined,
        terms_and_conditions: purchaseForm.terms_and_conditions || undefined,
        items: validItems.map((item) => ({
          product_id: parseInt(item.product_id, 10),
          quantity_ordered: parseInt(item.quantity_ordered, 10),
          unit_cost: parseFloat(item.unit_cost || '0'),
          unit_sell_price: item.unit_sell_price ? parseFloat(item.unit_sell_price) : undefined,
          tax_amount: item.tax_amount ? parseFloat(item.tax_amount) : undefined,
          discount_amount: item.discount_amount ? parseFloat(item.discount_amount) : undefined,
          notes: item.notes || undefined,
        })),
      };

      await purchaseOrderService.create(purchaseData);

      clearPoDraft();
      setShowAddPurchase(false);
      showAlert('success', 'Purchase order created successfully');
      loadVendors();
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  };

  // Add product item to purchase
  const addProductItem = () => {
    setPurchaseForm({
      ...purchaseForm,
      items: [
        ...purchaseForm.items,
        {
          product_id: '',
          quantity_ordered: '',
          unit_cost: '',
          unit_sell_price: '',
          tax_amount: '',
          discount_amount: '',
          notes: '',
        },
      ],
    });
  };

  // Remove product item
  const removeProductItem = (index: number) => {
    setPurchaseForm({
      ...purchaseForm,
      items: purchaseForm.items.filter((_, i) => i !== index),
    });
  };

  // Update product item
  const updateProductItem = (index: number, field: string, value: string) => {
    const newItems = [...purchaseForm.items];
    (newItems as any)[index] = { ...(newItems as any)[index], [field]: value };
    setPurchaseForm({ ...purchaseForm, items: newItems });
  };

  // Handle Payment
  const openPaymentModal = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setLoading(true);

    try {
      const outstanding = await vendorPaymentService.getOutstanding(vendor.id);

      const pos: OutstandingPurchaseOrder[] = Array.isArray((outstanding as any)?.purchase_orders)
        ? (outstanding as any).purchase_orders
          .filter((po: any) => typeof po?.id === 'number')
          .map((po: any) => ({
            ...po,
            status: po?.status,
          }))
        : [];

      setPurchaseOrders(pos);

      const initialSelected: { [key: number]: { selected: boolean; amount: string } } = {};
      pos.forEach((po) => {
        initialSelected[po.id] = { selected: false, amount: '' };
      });
      setSelectedPOs(initialSelected);

      setShowPayment(true);
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to load outstanding orders');
    } finally {
      setLoading(false);
    }
  };

  // Handle Make Payment
  const handlePayment = async () => {
    if (!selectedVendor || !paymentForm.payment_method_id || !paymentForm.amount) {
      showAlert('error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      const allocations = Object.entries(selectedPOs)
        .filter(([_, data]) => data.selected && parseFloat(data.amount) > 0)
        .map(([poId, data]) => ({
          purchase_order_id: parseInt(poId, 10),
          amount: parseFloat(data.amount),
          notes: `Payment for PO`,
        }));

      const paymentData: CreatePaymentRequest = {
        vendor_id: selectedVendor.id,
        payment_method_id: parseInt(paymentForm.payment_method_id, 10),
        amount: parseFloat(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        payment_type: paymentForm.payment_type,
        reference_number: paymentForm.reference_number || undefined,
        transaction_id: paymentForm.transaction_id || undefined,
        notes: paymentForm.notes || undefined,
        allocations: allocations.length > 0 ? allocations : undefined,
      };

      await vendorPaymentService.create(paymentData);

      setPaymentForm({
        payment_method_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_type: 'purchase_order',
        reference_number: '',
        transaction_id: '',
        notes: '',
        allocations: [],
      });
      setSelectedPOs({});
      setShowPayment(false);
      showAlert('success', 'Payment recorded successfully');
      loadVendors();
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  // Open view vendor
  const openViewVendor = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setShowViewVendor(true);
  };

  // Open transactions
  const openTransactions = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setLoading(true);

    try {
      const payments = await vendorPaymentService.getAll({ vendor_id: vendor.id });
      setVendorPayments((payments as any).data || []);
      setShowTransactions(true);
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }

    setDropdownOpen(null);
  };

  const openEditVendor = (vendor: Vendor) => {
    setVendorModalMode('edit');
    setEditingVendorId(vendor.id);
    setVendorForm({
      name: vendor.name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: (vendor as any).address || '',
      contact_person: (vendor as any).contact_person || '',
      website: (vendor as any).website || '',
      type: ((vendor as any).type as any) || 'manufacturer',
      credit_limit: (vendor as any).credit_limit !== undefined && (vendor as any).credit_limit !== null ? String((vendor as any).credit_limit) : '',
      payment_terms: (vendor as any).payment_terms || '',
      notes: (vendor as any).notes || '',
    });
    setShowAddVendor(true);
    setDropdownOpen(null);
  };

  const openDeleteVendorConfirm = (vendor: Vendor) => {
    setVendorToDelete(vendor);
    setShowDeleteVendor(true);
    setDropdownOpen(null);
  };

  const handleDeleteVendor = async () => {
    if (!vendorToDelete) return;
    try {
      setLoading(true);
      await vendorService.delete(vendorToDelete.id);
      setShowDeleteVendor(false);
      setVendorToDelete(null);
      loadVendors();
      showAlert('success', 'Vendor deleted successfully');
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to delete vendor');
    } finally {
      setLoading(false);
    }
  };

  // Calculate total allocated amount
  const calculateTotalAllocated = () => {
    return Object.values(selectedPOs)
      .filter((data) => data.selected)
      .reduce((sum, data) => sum + (parseFloat(data.amount) || 0), 0);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`${darkMode ? 'dark' : ''} flex min-h-screen`}>
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
        <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        {alert && <Alert type={alert.type} message={alert.message} />}

        {/* 🖼️ Product image preview (same UX as Orders > View Details) */}
        {imagePreview && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[999] p-4"
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
                    (e.currentTarget as HTMLImageElement).src = '/placeholder-image.jpg';
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <main className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Vendor Payment Management</h1>
            <div className="flex gap-3">
              <AccessControl roles={['super-admin', 'admin']}>
                <button
                  onClick={() => {
                    setVendorModalMode('add');
                    setEditingVendorId(null);
                    setVendorForm({
                      name: '',
                      email: '',
                      phone: '',
                      address: '',
                      contact_person: '',
                      website: '',
                      type: 'manufacturer',
                      credit_limit: '',
                      payment_terms: '',
                      notes: '',
                    });
                    setShowAddVendor(true);
                  }}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {vendorModalMode === 'add' ? 'Add Vendor' : 'Update Vendor'}
                </button>
              </AccessControl>

              <button
                onClick={() => setShowAddPurchase(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                New Purchase Order
              </button>
            </div>
          </div>

          {loading && vendors.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Vendors</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Showing {filteredVendors.length} of {(Array.isArray(vendors) ? vendors.length : 0)}</p>
                </div>
                <div className="w-full md:w-80">
                  <input
                    type="text"
                    value={vendorSearch}
                    onChange={(e) => setVendorSearch(e.target.value)}
                    placeholder="Search vendors (name/phone/email)"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-700 dark:text-gray-300">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3">Vendor</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Contact</th>
                      <th className="px-6 py-3">Credit Limit</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVendors.map((vendor) => (
                      <tr
                        key={vendor.id}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <td className="px-6 py-3">
                          <div className="font-medium">{vendor.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{vendor.phone}</div>
                        </td>
                        <td className="px-6 py-3">
                          <span className="capitalize text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">
                            {(vendor as any).type}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="text-xs">{vendor.email || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-3">৳{formatCurrency((vendor as any).credit_limit)}</td>
                        <td className="px-6 py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded ${(vendor as any).is_active
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              }`}
                          >
                            {(vendor as any).is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <AccessControl roles={['super-admin', 'admin']}>
                              <button
                                onClick={() => openPaymentModal(vendor)}
                                className="flex items-center gap-1 bg-gray-900 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                              >
                                ৳ Make Payment
                              </button>
                            </AccessControl>

                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = dropdownOpen === vendor.id ? null : vendor.id;
                                  if (next !== null) {
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setDropdownPos(computeMenuPosition(rect, 192, 180, 6, 8));
                                  }
                                  setDropdownOpen(next);
                                }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              >
                                <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </button>

                              {dropdownOpen === vendor.id && dropdownPos && (
                                <div
                                  className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
                                  style={{ top: dropdownPos.top, left: dropdownPos.left }}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openViewVendor(vendor);
                                      setDropdownOpen(null);
                                    }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-t-lg"
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Details
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditVendor(vendor);
                                    }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                    Edit Vendor
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteVendorConfirm(vendor);
                                    }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Vendor
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTransactions(vendor);
                                    }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-b-lg"
                                  >
                                    <Receipt className="w-4 h-4" />
                                    View Transactions
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredVendors.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  {vendorSearch.trim() ? 'No vendors match your search.' : 'No vendors found. Add your first vendor to get started.'}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add Vendor Modal */}
      <Modal
        isOpen={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        title={vendorModalMode === 'add' ? 'Add New Vendor' : 'Edit Vendor'}
        size="lg"
      >
        {/* (vendor modal content unchanged) */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vendor Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vendorForm.name}
                onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                placeholder="Enter vendor name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={vendorForm.type}
                onChange={(e) => setVendorForm({ ...vendorForm, type: e.target.value as 'manufacturer' | 'distributor' })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              >
                <option value="manufacturer">Manufacturer</option>
                <option value="distributor">Distributor</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={vendorForm.email}
                onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                placeholder="vendor@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input
                type="tel"
                value={vendorForm.phone}
                onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                placeholder="+880 1xxx-xxxxxx"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => {
                setShowAddVendor(false);
                setVendorModalMode('add');
                setEditingVendorId(null);
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleAddVendor}
              disabled={loading}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {vendorModalMode === 'add' ? 'Add Vendor' : 'Update Vendor'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Vendor Confirmation */}
      <Modal
        isOpen={showDeleteVendor}
        onClose={() => {
          setShowDeleteVendor(false);
          setVendorToDelete(null);
        }}
        title="Delete Vendor"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <span className="font-semibold">{vendorToDelete?.name}</span>? This action cannot be undone.
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => {
                setShowDeleteVendor(false);
                setVendorToDelete(null);
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteVendor}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* ✅ Create Purchase Order Modal - NOW MUCH WIDER */}
      <Modal isOpen={showAddPurchase} onClose={() => setShowAddPurchase(false)} title="Create Purchase Order" size="xl">
        <div className="space-y-4">
          {poDraftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="flex flex-col">
                <span className="font-semibold">Draft restored</span>
                {poDraftSavedAt && <span className="text-[11px] opacity-80">Saved: {new Date(poDraftSavedAt).toLocaleString()}</span>}
              </div>
              <button
                type="button"
                onClick={clearPoDraft}
                className="rounded-md bg-white px-2 py-1 text-amber-900 hover:bg-amber-100 border border-amber-200"
              >
                Clear
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vendor <span className="text-red-500">*</span>
              </label>
              <select
                value={purchaseForm.vendor_id}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, vendor_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Warehouse <span className="text-red-500">*</span>
              </label>
              <select
                value={purchaseForm.store_id}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, store_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select warehouse</option>
                {stores
                  .filter((s: any) => s.is_warehouse)
                  .map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Delivery Date</label>
              <input
                type="date"
                value={purchaseForm.expected_delivery_date}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, expected_delivery_date: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Search & add products */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700/30">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end mb-3">
              <div className="lg:col-span-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search products</label>
                <input
                  value={poSearch}
                  onChange={(e) => setPoSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Type name or SKU…"
                />
              </div>

              <div className="lg:col-span-5">
                <CategoryTreeSelector
                  categories={categoryTree}
                  selectedCategoryId={poCategoryId}
                  onSelect={setPoCategoryId}
                  disabled={false}
                  label="Filter by category"
                  required={false}
                  placeholder="All categories"
                  showSelectedInfo={false}
                  allowClear={true}
                  clearText="All categories"
                />
              </div>

              <div className="lg:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowQuickProduct(true)}
                  disabled={!purchaseForm.vendor_id}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
                  title={!purchaseForm.vendor_id ? 'Select a vendor first' : 'Quick-create a new product'}
                >
                  <Plus className="w-4 h-4" />
                  Quick add
                </button>
              </div>
            </div>

            {/* Product results — grouped by base name */}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
              {poFinderProducts.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  {poCategoryId || poSearch ? 'No products found. Try a different search or category.' : 'Select a category or search to browse products.'}
                </div>
              ) : (
                poFinderProducts.map((p: any) => {
                  const variantCount = getVariantGroupProducts(p).length;
                  const baseName = (p as any).base_name || p.name;
                  const img = getProductPrimaryImage(p);
                  const isInPO = purchaseForm.items.some((it: any) => String(it.product_id) === String(p.id));
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <img
                        src={img}
                        alt={baseName}
                        className="w-10 h-10 rounded-md object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0 cursor-zoom-in"
                        onClick={() => setImagePreview({ url: img, name: baseName })}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder-image.jpg'; }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{baseName}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-gray-400 font-mono">{p.sku}</span>
                          {p.category?.title && <span className="text-[11px] text-gray-400">• {p.category.title}</span>}
                          {variantCount > 1 && (
                            <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                              {variantCount} variations
                            </span>
                          )}
                        </div>
                      </div>

                      {variantCount > 1 ? (
                        <button
                          type="button"
                          onClick={() => openVariantPicker(String(p.id))}
                          className="flex-shrink-0 px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Pick variation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addProductToPO(p.id)}
                          className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-md ${isInPO ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        >
                          {isInPO ? 'Added ✓' : 'Add'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Result count */}
            {poFinderProducts.length > 0 && (
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 text-right">
                {poFinderProducts.length} product group{poFinderProducts.length !== 1 ? 's' : ''} shown
              </p>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Products</h3>
              <button onClick={addProductItem} className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700">
                <Plus className="w-3 h-3" />
                Add Product
              </button>
            </div>

            {purchaseForm.items.map((item, index) => (
              <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Product</label>
                    <select
                      value={item.product_id}
                      onChange={(e) => updateProductItem(index, 'product_id', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Select product</option>
                      {products.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>

                    {item.product_id &&
                      (() => {
                        const base = products.find((p: any) => p.id === parseInt(item.product_id, 10));
                        if (!base) return null;
                        return (
                          <div className="mt-2 flex items-center gap-2">
                            <img
                              src={getProductPrimaryImage(base)}
                              alt={base.name}
                              className="w-9 h-9 rounded-md object-cover border border-gray-200 dark:border-gray-700 cursor-zoom-in"
                              title="View image"
                              onClick={() => setImagePreview({ url: getProductPrimaryImage(base), name: base.name })}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder-image.jpg';
                              }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{base.name}</div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                {(base as any).sku}
                                {base.category?.title ? ` • ${base.category.title}` : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                    {item.product_id &&
                      (() => {
                        const base = products.find((p: any) => p.id === parseInt(item.product_id, 10));
                        const count = base ? getVariantGroupProducts(base).length : 0;
                        if (!base || count <= 1) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => openVariantPicker(item.product_id)}
                            className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md"
                            title="Quick add size/color variations"
                          >
                            Variations ({count})
                          </button>
                        );
                      })()}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity_ordered}
                      onChange={(e) => updateProductItem(index, 'quantity_ordered', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <AccessControl roles={['super-admin', 'admin']}>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Cost (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) => updateProductItem(index, 'unit_cost', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="0.00"
                      />
                    </div>
                  </AccessControl>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sell Price (৳)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_sell_price}
                      onChange={(e) => updateProductItem(index, 'unit_sell_price', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tax (৳)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.tax_amount}
                      onChange={(e) => updateProductItem(index, 'tax_amount', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Discount (৳)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.discount_amount}
                      onChange={(e) => updateProductItem(index, 'discount_amount', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {purchaseForm.items.length > 1 && (
                  <button onClick={() => removeProductItem(index)} className="mt-2 text-xs text-red-600 hover:text-red-700">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tax Amount (৳)</label>
              <input
                type="number"
                step="0.01"
                value={purchaseForm.tax_amount}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, tax_amount: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount (৳)</label>
              <input
                type="number"
                step="0.01"
                value={purchaseForm.discount_amount}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, discount_amount: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shipping (৳)</label>
              <input
                type="number"
                step="0.01"
                value={purchaseForm.shipping_cost}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, shipping_cost: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={purchaseForm.notes}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Additional notes"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => setShowAddPurchase(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleAddPurchase}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Purchase Order
            </button>
          </div>
        </div>
      </Modal>

      {/* Variant Picker Modal */}
      <Modal
        isOpen={showVariantPicker}
        onClose={() => setShowVariantPicker(false)}
        title={`Add variations${variantBaseProduct?.name ? `: ${variantBaseProduct.name}` : ''}`}
        size="xl"
        zIndexClass="z-[70]"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qty for all (optional)</label>
              <input
                type="number"
                value={variantBulkQty}
                onChange={(e) => setVariantBulkQty(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="e.g., 10"
              />
            </div>

            <AccessControl roles={['super-admin', 'admin']}>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Cost for all (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={variantBulkCost}
                  onChange={(e) => setVariantBulkCost(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="e.g., 1200"
                />
              </div>
            </AccessControl>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sell Price for all (optional)</label>
              <input
                type="number"
                step="0.01"
                value={variantBulkSell}
                onChange={(e) => setVariantBulkSell(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="e.g., 1800"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!variantBulkQty && !variantBulkCost && !variantBulkSell) return;
                setVariantInputs((prev) => {
                  const next: Record<number, { quantity: string; unit_cost: string; unit_sell_price: string }> = { ...prev };
                  variantOptions.forEach((v) => {
                    next[v.id] = {
                      ...(next[v.id] || { quantity: '0', unit_cost: '', unit_sell_price: '' }),
                      quantity: variantBulkQty ? variantBulkQty : next[v.id]?.quantity ?? '0',
                      unit_cost: variantBulkCost ? variantBulkCost : next[v.id]?.unit_cost ?? '',
                      unit_sell_price: variantBulkSell ? variantBulkSell : next[v.id]?.unit_sell_price ?? '',
                    };
                  });
                  return next;
                });
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
            >
              Apply to all
            </button>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Variation</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit Cost</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Sell Price</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {variantOptions.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setImagePreview({ url: getProductPrimaryImage(v), name: v.name })}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0 cursor-zoom-in"
                            title="View image"
                          >
                            <img
                              src={getProductPrimaryImage(v)}
                              alt={v.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder-image.jpg';
                              }}
                            />
                          </button>

                          <div className="min-w-0">
                            <div
                              className="font-medium truncate cursor-zoom-in"
                              title="Click to view image"
                              onClick={() => setImagePreview({ url: getProductPrimaryImage(v), name: v.name })}
                            >
                              {v.name}
                            </div>
                            {(v as any).sku && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{(v as any).sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={variantInputs[v.id]?.quantity ?? '0'}
                          onChange={(e) =>
                            setVariantInputs((prev) => ({
                              ...prev,
                              [v.id]: { ...(prev[v.id] || { quantity: '0', unit_cost: '', unit_sell_price: '' }), quantity: e.target.value },
                            }))
                          }
                          className="w-28 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </td>
                      <AccessControl roles={['super-admin', 'admin']}>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={variantInputs[v.id]?.unit_cost ?? ''}
                            onChange={(e) =>
                              setVariantInputs((prev) => ({
                                ...prev,
                                [v.id]: { ...(prev[v.id] || { quantity: '0', unit_cost: '', unit_sell_price: '' }), unit_cost: e.target.value },
                              }))
                            }
                            className="w-36 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </td>
                      </AccessControl>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={variantInputs[v.id]?.unit_sell_price ?? ''}
                          onChange={(e) =>
                            setVariantInputs((prev) => ({
                              ...prev,
                              [v.id]: {
                                ...(prev[v.id] || { quantity: '0', unit_cost: '', unit_sell_price: '' }),
                                unit_sell_price: e.target.value,
                              },
                            }))
                          }
                          className="w-36 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </td>
                    </tr>
                  ))}
                  {variantOptions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        No variations found for this product.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowVariantPicker(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button type="button" onClick={applyVariantPicker} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
              Apply to PO
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Make Payment" size="lg">
        {selectedVendor && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Vendor</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedVendor.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentForm.payment_method_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_method_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select method</option>
                  {paymentMethods.map((pm: any) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Type</label>
              <select
                value={paymentForm.payment_type}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value as 'purchase_order' | 'advance' })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="purchase_order">Purchase Order Payment</option>
                <option value="advance">Advance Payment</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Total Amount (৳) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="0.00"
              />
            </div>

            {paymentForm.payment_type === 'purchase_order' && purchaseOrders.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Allocate to Purchase Orders</h4>

                {purchaseOrders.map((po: any) => (
                  <div key={po.id} className="flex items-center gap-3 mb-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                    <input
                      type="checkbox"
                      checked={selectedPOs[po.id]?.selected || false}
                      onChange={(e) =>
                        setSelectedPOs({
                          ...selectedPOs,
                          [po.id]: {
                            ...selectedPOs[po.id],
                            selected: e.target.checked,
                            amount: e.target.checked ? selectedPOs[po.id]?.amount || '' : '',
                          },
                        })
                      }
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{po.po_number || `PO #${po.id}`}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Outstanding: ৳{formatCurrency(po.outstanding_amount)}</p>
                    </div>
                    {selectedPOs[po.id]?.selected && (
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={po.outstanding_amount}
                        value={selectedPOs[po.id]?.amount || ''}
                        onChange={(e) =>
                          setSelectedPOs({
                            ...selectedPOs,
                            [po.id]: { ...selectedPOs[po.id], amount: e.target.value },
                          })
                        }
                        className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Amount"
                      />
                    )}
                  </div>
                ))}

                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Total Allocated:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">৳{formatCurrency(calculateTotalAllocated())}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="CHQ-12345"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction ID</label>
                <input
                  type="text"
                  value={paymentForm.transaction_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transaction_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="TXN-12345"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                placeholder="Additional notes"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowPayment(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={loading}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Payment
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* View Vendor Modal */}
      <Modal isOpen={showViewVendor} onClose={() => setShowViewVendor(false)} title="Vendor Details">
        {selectedVendor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Vendor Name</p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedVendor.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Type</p>
                <p className="text-base text-gray-900 dark:text-gray-100 capitalize">{(selectedVendor as any).type}</p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setShowViewVendor(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Transaction History Modal */}
      <Modal isOpen={showTransactions} onClose={() => setShowTransactions(false)} title="Transaction History">
        {selectedVendor && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Vendor</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedVendor.name}</p>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {Array.isArray(vendorPayments) && vendorPayments.length > 0 ? (
                vendorPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                        <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{payment.payment_number}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {payment.payment_type} - {payment.status}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600 dark:text-green-400">৳{formatCurrency(payment.amount)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(payment.payment_date)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No transactions found.</p>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setShowTransactions(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ✅ Quick Add Product Modal - FIXED STACKING (z-[80]) */}
      <Modal
        isOpen={showQuickProduct}
        onClose={() => setShowQuickProduct(false)}
        title="Quick Add Product"
        size="lg"
        zIndexClass="z-[80]"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                value={quickProductForm.name}
                onChange={(e) => setQuickProductForm({ ...quickProductForm, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Product name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SKU (optional)</label>
              <input
                value={quickProductForm.sku}
                onChange={(e) => setQuickProductForm({ ...quickProductForm, sku: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Leave empty to auto-generate (9 digits)"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
            <select
              value={quickProductForm.category_id}
              onChange={(e) => setQuickProductForm({ ...quickProductForm, category_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Select category</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.full_path || c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={quickProductForm.description}
              onChange={(e) => setQuickProductForm({ ...quickProductForm, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              rows={3}
              placeholder="Optional"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowQuickProduct(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQuickCreateProduct}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white rounded-lg disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create & Add'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
