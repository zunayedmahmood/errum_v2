'use client';

import { useState, useEffect } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { Search, X, Globe, AlertCircle } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import CustomerTagManager from '@/components/customers/CustomerTagManager';
import axios from '@/lib/axios';
import storeService from '@/services/storeService';
import productImageService from '@/services/productImageService';
import batchService from '@/services/batchService';
import catalogService, { CatalogGroupedProduct, Product } from '@/services/catalogService';
import inventoryService, { GlobalInventoryItem } from '@/services/inventoryService';
import { fireToast } from '@/lib/globalToast';
import { DollarSign, CreditCard, Wallet, MapPin, Truck, ChevronDown, ChevronRight, Plus, Minus, Store as StoreIcon } from 'lucide-react';

interface DefectItem {
  id: string;
  barcode: string;
  productId: number;
  productName: string;
  sellingPrice?: number;
  store?: string;
  batchId: number;
}

interface CartProduct {
  id: number | string;
  product_id: number;
  batch_id: number | null;
  productName: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  amount: number;
  isDefective?: boolean;
  defectId?: string;
  store_id?: number | null;
  store_name?: string | null;
  sku?: string;
}

interface PaymentMethod {
  id: number;
  code: string;
  name: string;
  type: string;
  supports_partial: boolean;
  requires_reference: boolean;
  fixed_fee: number;
  percentage_fee: number;
}

interface ProductSearchResult {
  id: number;
  name: string;
  sku: string;
  mainImage: string;
  available: number;          // total batch stock (kept for backwards-compat)
  availableInventory: number; // from reserved_products — drives UI
  minPrice: number;
  maxPrice: number;
  batchesCount: number;
  expiryDate?: string | null;
  daysUntilExpiry?: number | null;
  attributes: {
    Price: number;
    mainImage: string;
  };
  branchStocks?: { store_name: string; quantity: number }[];
}


const SC_EDIT_PREFILL_KEY = 'socialCommerceEditPrefillV1';
const SC_EDIT_CONTEXT_KEY = 'socialCommerceEditContextV1';

const parseMoney = (value: any): number => {
  const n = Number(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const normalizePrefillCartItem = (item: any): CartProduct | null => {
  if (!item || typeof item !== 'object') return null;

  const quantity = Math.max(1, Math.floor(parseMoney(item.quantity ?? item.qty ?? 1) || 1));
  const discountAmount = parseMoney(item.discount_amount ?? item.discount ?? item.discountAmount ?? 0);
  const apiLineTotal = parseMoney(item.total_amount ?? item.total ?? item.line_total ?? item.amount ?? 0);
  let unitPrice = parseMoney(
    item.unit_price ??
    item.unitPrice ??
    item.price ??
    item.sell_price ??
    item.selling_price ??
    item.product?.sell_price ??
    item.product?.selling_price ??
    item.product?.price ??
    0
  );

  if (unitPrice <= 0 && apiLineTotal > 0 && quantity > 0) {
    unitPrice = (apiLineTotal + discountAmount) / quantity;
  }

  const productId = Number(item.product_id ?? item.productId ?? item.product?.id ?? 0) || 0;
  if (!productId) return null;

  return {
    id: item.id ?? item.order_item_id ?? `${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    product_id: productId,
    batch_id: item.batch_id ?? item.product_batch_id ?? item.productBatchId ?? item.batch?.id ?? null,
    productName: item.productName ?? item.product_name ?? item.name ?? item.product?.name ?? 'Unnamed product',
    sku: item.sku ?? item.product_sku ?? item.product?.sku ?? '',
    quantity,
    unit_price: unitPrice,
    discount_amount: discountAmount,
    amount: apiLineTotal > 0 ? apiLineTotal : Math.max(0, unitPrice * quantity - discountAmount),
    isDefective: Boolean(item.isDefective),
    defectId: item.defectId,
    store_id: item.store_id ?? null,
    store_name: item.store_name ?? item.store?.name ?? null,
  };
};

export default function SocialCommercePage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]); // Kept for backward compatibility if needed
  const [allBatches, setAllBatches] = useState<any[]>([]); // Kept for backward compatibility if needed
  const [inventoryStats, setInventoryStats] = useState<{ total_stock: number; active_batches: number } | null>(null);
  const [stores, setStores] = useState<any[]>([]);

  const [date, setDate] = useState(getTodayDate());
  const [salesBy, setSalesBy] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [socialId, setSocialId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [editOrderNumber, setEditOrderNumber] = useState<string | null>(null);
  const [editOrderType, setEditOrderType] = useState<string>('social_commerce');

  const [isInternational, setIsInternational] = useState(false);

  // ✅ Domestic
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // ✅ International
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [internationalCity, setInternationalCity] = useState('');
  const [internationalPostalCode, setInternationalPostalCode] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogGroupedProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null); // For variants modal/dropdown
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartProduct[]>([]);

  // ✅ Logistics & Store Assignment (from amount-details)
  const [storeAssignmentType, setStoreAssignmentType] = useState<'auto' | 'specific'>('auto');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  // ✅ Payment States (from amount-details)
  const [transportCost, setTransportCost] = useState('0');
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial' | 'none'>('full');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [codPaymentMethod, setCodPaymentMethod] = useState('');
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);

  // Existing payment/total metadata carried from Orders page while editing.
  // Amount Details uses these to preserve previous payments and calculate final due.
  const [paidAmount, setPaidAmount] = useState(0);
  const [totalAmountState, setTotalAmountState] = useState(0);
  const [outstandingAmountState, setOutstandingAmountState] = useState(0);
  const [orderDiscountAmountState, setOrderDiscountAmountState] = useState(0);

  const [selectedProductInventory, setSelectedProductInventory] = useState<GlobalInventoryItem | null>(null);

  const [quantity, setQuantity] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountTk, setDiscountTk] = useState('');
  const [amount, setAmount] = useState('0.00');

  const [defectiveProduct, setDefectiveProduct] = useState<DefectItem | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // 🧑‍💼 Existing customer + last order summary states
  const [existingCustomer, setExistingCustomer] = useState<any | null>(null);
  const [lastOrderInfo, setLastOrderInfo] = useState<any | null>(null);
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);
  const [customerCheckError, setCustomerCheckError] = useState<string | null>(null);

  function getTodayDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[today.getMonth()];
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      console.error('Error:', message);
      alert('Error: ' + message);
    } else {
      console.log('Success:', message);
      alert(message);
    }
  };

  const getImageUrl = (imagePath: string | null | undefined): string => {
    if (!imagePath) return '/placeholder-image.jpg';

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

    if (imagePath.startsWith('/storage')) {
      return `${baseUrl}${imagePath}`;
    }

    return `${baseUrl}/storage/product-images/${imagePath}`;
  };

  const fetchPrimaryImage = async (productId: number): Promise<string> => {
    try {
      const images = await productImageService.getProductImages(productId);

      const primaryImage = images.find((img: any) => img.is_primary && img.is_active);

      if (primaryImage) {
        return getImageUrl(primaryImage.image_url || primaryImage.image_path);
      }

      const firstActiveImage = images.find((img: any) => img.is_active);
      if (firstActiveImage) {
        return getImageUrl(firstActiveImage.image_url || firstActiveImage.image_path);
      }

      return '/placeholder-image.jpg';
    } catch (error) {
      console.error('Error fetching product images:', error);
      return '/placeholder-image.jpg';
    }
  };

  const fetchStores = async () => {
    try {
      const response = await storeService.getStores({ is_active: true, per_page: 1000 });
      let storesData: any[] = [];

      if (response?.success && response?.data) {
        storesData = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data.data)
            ? response.data.data
            : [];
      } else if (Array.isArray((response as any)?.data)) {
        storesData = (response as any).data;
      }

      setStores(storesData);
    } catch (error) {
      console.error('Error fetching stores:', error);
      setStores([]);
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      const response = await axios.get('/payment-methods', {
        params: { customer_type: 'social_commerce' }
      });

      if (response.data.success) {
        const methods = response.data.data.payment_methods || response.data.data || [];
        setPaymentMethods(methods);

        // Set default payment methods
        const mobileMethod = methods.find((m: PaymentMethod) => m.type === 'mobile_banking');
        const cashMethod = methods.find((m: PaymentMethod) => m.type === 'cash');

        if (mobileMethod) setSelectedPaymentMethod(String(mobileMethod.id));
        if (cashMethod) setCodPaymentMethod(String(cashMethod.id));
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/products', { params: { per_page: 1000 } });
      let productsData: any[] = [];

      if (response.data?.success && response.data?.data) {
        productsData = Array.isArray(response.data.data)
          ? response.data.data
          : Array.isArray(response.data.data.data)
            ? response.data.data.data
            : [];
      } else if (Array.isArray(response.data)) {
        productsData = response.data;
      }

      setAllProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
      setAllProducts([]);
    }
  };

  // ✅ Fetch batches from ALL stores
  const fetchAllBatches = async () => {
    if (stores.length === 0) return;

    try {
      setIsLoadingData(true);
      console.log('📦 Fetching batches from all stores');

      const allBatchesPromises = stores.map(async (store) => {
        try {
          const batchesData = await batchService.getAvailableBatches(store.id);
          return batchesData
            .filter((batch: any) => batch.quantity > 0)
            .map((batch: any) => ({
              ...batch,
              store_id: store.id,
              store_name: store.name,
            }));
        } catch (err) {
          console.warn(`⚠️ Failed to fetch batches for store ${store.name}`, err);
          return [];
        }
      });

      const batchArrays = await Promise.all(allBatchesPromises);
      const flattenedBatches = batchArrays.flat();

      setAllBatches(flattenedBatches);
      console.log('✅ Total batches loaded:', flattenedBatches.length);
    } catch (error: any) {
      console.error('❌ Batch fetch error:', error);
      setAllBatches([]);
    } finally {
      setIsLoadingData(false);
    }
  };

  // ✅ Build aggregated product cards from all matching batches.
  // This mirrors Deshio Social Commerce behavior:
  // - one product card per product
  // - available = total stock across all branches / batches
  // - batch_id is NOT selected here; it will be assigned during packing/scanning
  const buildAggregatedProductResults = (products: any[], batches: any[]): ProductSearchResult[] => {
    const productMap = new Map<number, ProductSearchResult>();

    for (const prod of products || []) {
      const pid = Number(prod?.id || 0);
      if (!pid) continue;

      const productBatches = (batches || []).filter((batch: any) => {
        const batchProductId = Number(batch?.product?.id || batch?.product_id || 0);
        return batchProductId === pid && Number(batch?.quantity || 0) > 0;
      });

      if (productBatches.length === 0) continue;

      const prices = productBatches
        .map((batch: any) => Number(String(batch?.sell_price ?? '0').replace(/[^0-9.-]/g, '')))
        .filter((price: number) => Number.isFinite(price));

      const totalAvailable = productBatches.reduce(
        (sum: number, batch: any) => sum + Math.max(0, Number(batch?.quantity || 0)),
        0
      );

      const imageUrl = getImageUrl(
        prod?.primary_image_url ||
        prod?.main_image ||
        prod?.image_url ||
        prod?.image_path ||
        prod?.thumbnail ||
        null
      );

      const earliestExpiryBatch = productBatches.reduce((best: any, current: any) => {
        const bestDays = Number(best?.days_until_expiry);
        const currentDays = Number(current?.days_until_expiry);

        if (!Number.isFinite(currentDays)) return best;
        if (!best || !Number.isFinite(bestDays) || currentDays < bestDays) return current;
        return best;
      }, null);

      productMap.set(pid, {
        id: pid,
        name: String(prod?.name || 'Unknown product'),
        sku: String(prod?.sku || ''),
        mainImage: imageUrl,
        available: totalAvailable,
        availableInventory: totalAvailable, // legacy batch path — no reserved_products data here
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        batchesCount: productBatches.length,
        expiryDate: earliestExpiryBatch?.expiry_date ?? null,
        daysUntilExpiry: Number.isFinite(Number(earliestExpiryBatch?.days_until_expiry))
          ? Number(earliestExpiryBatch?.days_until_expiry)
          : null,
        attributes: {
          Price: prices.length ? Math.min(...prices) : 0,
          mainImage: imageUrl,
        },
      });
    }

    return Array.from(productMap.values()).sort((a, b) => {
      const aStock = Number(a.available || 0);
      const bStock = Number(b.available || 0);
      if (bStock !== aStock) return bStock - aStock;
      return a.name.localeCompare(b.name);
    });
  };

  const formatPriceRangeLabel = (product: ProductSearchResult | any) => {
    const minP = Number(product?.minPrice ?? product?.attributes?.Price ?? 0);
    const maxP = Number(product?.maxPrice ?? product?.attributes?.Price ?? minP);

    if (Number.isFinite(minP) && Number.isFinite(maxP) && minP > 0 && maxP > 0 && minP !== maxP) {
      return `${minP} - ${maxP} ৳`;
    }

    const v = Number(product?.attributes?.Price ?? minP ?? 0);
    return `${Number.isFinite(v) ? v : 0} ৳`;
  };

  const performMultiStoreSearch = async (query: string): Promise<ProductSearchResult[]> => {
    const queryLower = query.toLowerCase().trim();
    console.log('🔍 Multi-store search for:', queryLower);

    const matchedProducts = allProducts.filter((prod: any) => {
      const productName = String(prod?.name || '').toLowerCase();
      const productSku = String(prod?.sku || '').toLowerCase();

      return (
        productName === queryLower ||
        productSku === queryLower ||
        productName.startsWith(queryLower) ||
        productSku.startsWith(queryLower) ||
        productName.includes(queryLower) ||
        productSku.includes(queryLower)
      );
    });

    const results = buildAggregatedProductResults(matchedProducts, allBatches);

    // Backfill images only when needed
    const enrichedResults = await Promise.all(
      results.map(async (product) => {
        if (product.mainImage && product.mainImage !== '/placeholder-image.jpg') return product;
        return {
          ...product,
          mainImage: await fetchPrimaryImage(product.id),
          attributes: {
            ...product.attributes,
            mainImage: await fetchPrimaryImage(product.id),
          },
        };
      })
    );

    return enrichedResults;
  };

  const calculateAmount = (basePrice: number, qty: number, discPer: number, discTk: number) => {
    const baseAmount = basePrice * qty;
    const percentDiscount = (baseAmount * discPer) / 100;
    const totalDiscount = percentDiscount + discTk;
    return Math.max(0, baseAmount - totalDiscount);
  };

  // 🔍 Helper: check if customer exists + get last order
  const handlePhoneBlur = async () => {
    const rawPhone = userPhone.trim();
    const phone = rawPhone.replace(/\D/g, '');
    if (!phone) {
      setExistingCustomer(null);
      setLastOrderInfo(null);
      setCustomerCheckError(null);
      return;
    }

    try {
      setIsCheckingCustomer(true);
      setCustomerCheckError(null);

      // Prefer new endpoint (Customer Tags API): POST /customers/find-by-phone
      let customer: any = null;
      try {
        const response = await axios.post('/customers/find-by-phone', { phone });
        const payload = response.data?.data ?? response.data;
        customer = payload?.customer ?? payload;
      } catch (e: any) {
        // Fallback for older builds: GET /customers/by-phone
        try {
          const response = await axios.get('/customers/by-phone', { params: { phone } });
          const payload = response.data?.data ?? response.data;
          customer = payload?.customer ?? payload;
        } catch {
          customer = null;
        }
      }

      if (customer?.id) {
        setExistingCustomer(customer);

        if (!userName && customer.name) setUserName(customer.name);
        if (!userEmail && customer.email) setUserEmail(customer.email);

        // Best-effort: get last order from customer orders (if endpoint exists)
        try {
          const lastOrderRes = await axios.get(`/customers/${customer.id}/orders`, {
            params: { per_page: 1, sort_by: 'order_date', sort_order: 'desc' },
          });
          const payload = lastOrderRes.data?.data ?? lastOrderRes.data;
          const list = payload?.data ?? payload?.orders ?? payload ?? [];
          const last = Array.isArray(list) ? list[0] : null;
          if (last) {
            setLastOrderInfo({
              date: last?.order_date || last?.created_at || last?.date,
              summary_text: last?.summary_text || last?.order_number || `Order #${last?.id ?? ''}`,
              total_amount: last?.total_amount ?? last?.total,
            });
          } else {
            setLastOrderInfo(null);
          }
        } catch (err) {
          // Fallback to older summary endpoint if present
          try {
            const lastOrderRes = await axios.get(`/customers/${customer.id}/last-order-summary`);
            if (lastOrderRes.data?.success) {
              setLastOrderInfo(lastOrderRes.data.data);
            } else {
              setLastOrderInfo(null);
            }
          } catch {
            console.warn('Failed to load last order info', err);
            setLastOrderInfo(null);
          }
        }
      } else {
        setExistingCustomer(null);
        setLastOrderInfo(null);
      }
    } catch (err) {
      console.error('Customer lookup failed', err);
      setExistingCustomer(null);
      setLastOrderInfo(null);
      setCustomerCheckError('Could not check existing customer. Please try again.');
    } finally {
      setIsCheckingCustomer(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = sessionStorage.getItem(SC_EDIT_PREFILL_KEY);
      if (!raw) return;

      sessionStorage.removeItem(SC_EDIT_PREFILL_KEY);
      const prefill = JSON.parse(raw);
      if (!prefill || typeof prefill !== 'object') return;

      const incomingEditOrderId = Number(prefill.editOrderId || 0) || null;
      const incomingEditOrderNumber = typeof prefill.editOrderNumber === 'string' ? prefill.editOrderNumber : null;

      if (incomingEditOrderId) {
        setEditOrderId(incomingEditOrderId);
        sessionStorage.setItem(
          SC_EDIT_CONTEXT_KEY,
          JSON.stringify({ editOrderId: incomingEditOrderId, editOrderNumber: incomingEditOrderNumber })
        );
      }
      if (incomingEditOrderNumber) setEditOrderNumber(incomingEditOrderNumber);
      if (typeof prefill.orderType === 'string') setEditOrderType(prefill.orderType);

      if (typeof prefill.userName === 'string') setUserName(prefill.userName);
      if (typeof prefill.userPhone === 'string') setUserPhone(prefill.userPhone);
      if (typeof prefill.userEmail === 'string') setUserEmail(prefill.userEmail);
      if (typeof prefill.socialId === 'string') setSocialId(prefill.socialId);
      if (typeof prefill.orderNotes === 'string') setOrderNotes(prefill.orderNotes);
      if (typeof prefill.isInternational === 'boolean') setIsInternational(prefill.isInternational);
      if (typeof prefill.streetAddress === 'string') setStreetAddress(prefill.streetAddress);
      if (typeof prefill.postalCode === 'string') setPostalCode(prefill.postalCode);
      if (typeof prefill.country === 'string') setCountry(prefill.country);
      if (typeof prefill.state === 'string') setState(prefill.state);
      if (typeof prefill.internationalCity === 'string') setInternationalCity(prefill.internationalCity);
      if (typeof prefill.internationalPostalCode === 'string') setInternationalPostalCode(prefill.internationalPostalCode);
      if (typeof prefill.deliveryAddress === 'string') setDeliveryAddress(prefill.deliveryAddress);
      if (typeof prefill.shippingAmount === 'number') setTransportCost(String(prefill.shippingAmount));
      if (typeof prefill.paidAmount === 'number') setPaidAmount(prefill.paidAmount);
      if (typeof prefill.totalAmount === 'number') setTotalAmountState(prefill.totalAmount);
      if (typeof prefill.outstandingAmount === 'number') setOutstandingAmountState(prefill.outstandingAmount);
      if (typeof prefill.discountAmount === 'number') setOrderDiscountAmountState(prefill.discountAmount);

      if (typeof prefill.storeId === 'string' && prefill.storeId) {
        setStoreAssignmentType('specific');
        setSelectedStoreId(prefill.storeId);
      } else {
        setStoreAssignmentType('auto');
        setSelectedStoreId('');
      }

      if (Array.isArray(prefill.cart)) {
        setCart(prefill.cart.map(normalizePrefillCartItem).filter(Boolean) as CartProduct[]);
      }

      setPaymentOption('none');
      fireToast(`Editing order ${incomingEditOrderNumber ? `#${incomingEditOrderNumber}` : ''}. Existing payments will be preserved.`, 'success');
    } catch (error) {
      console.error('Failed to hydrate order edit prefill:', error);
      fireToast('Failed to load order editing data', 'error');
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const defectId = urlParams.get('defect');

    if (defectId) {
      console.log('🔍 DEFECT ID IN URL:', defectId);

      const defectData = sessionStorage.getItem('defectItem');
      console.log('📦 Checking sessionStorage:', defectData);

      if (defectData) {
        try {
          const defect = JSON.parse(defectData);
          console.log('✅ Loaded defect from sessionStorage:', defect);

          if (!defect.batchId) {
            console.error('❌ Missing batch_id in defect data');
            showToast('Error: Defect item is missing batch information', 'error');
            return;
          }

          setDefectiveProduct(defect);

          const defectCartItem: CartProduct = {
            id: Date.now(),
            product_id: defect.productId,
            batch_id: defect.batchId,
            productName: `${defect.productName} [DEFECTIVE]`,
            quantity: 1,
            unit_price: defect.sellingPrice || 0,
            discount_amount: 0,
            amount: defect.sellingPrice || 0,
            isDefective: true,
            defectId: defect.id,
            store_id: defect.store_id || 0,
            store_name: defect.store || 'Unknown',
          };

          setCart([defectCartItem]);
          showToast(`Defective item added to cart: ${defect.productName}`, 'success');
          sessionStorage.removeItem('defectItem');
        } catch (error) {
          console.error('❌ Error parsing defect data:', error);
          showToast('Error loading defect item', 'error');
        }
      } else {
        console.warn('⚠️ No defect data in sessionStorage');
        showToast('Defect item data not found. Please return to defects page.', 'error');
      }
    }
  }, []);

  useEffect(() => {
    const userName = localStorage.getItem('userName') || '';
    setSalesBy(userName);

    const loadInitialData = async () => {
      try {
        setIsLoadingData(true);
        const [storesData, stats, payments] = await Promise.all([
          fetchStores(),
          inventoryService.getStatistics().catch(() => null),
          fetchPaymentMethods().catch(() => null)
        ]);

        if (stats?.success) {
          setInventoryStats({
            total_stock: stats.data.overview.total_inventory_units,
            active_batches: stats.data.overview.active_batches
          });
        }
      } catch (err) {
        console.error('Failed to load initial data', err);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadInitialData();
  }, []);

  // ✅ Search effect using e-commerce catalog search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    let active = true;
    const delayDebounce = setTimeout(async () => {
      try {
        setIsLoadingData(true);
        console.log('🔍 Executing SKU-grouped search for:', searchQuery);

        const response = await catalogService.searchProducts({
          q: searchQuery,
          per_page: 50,
          group_by_sku: true,
        });

        if (active && response && response.grouped_products) {
          setSearchResults(response.grouped_products);

          if (response.grouped_products.length === 0) {
            fireToast('No products found', 'error');
          }
        }
      } catch (error: any) {
        console.error('❌ Search failed:', error);
        fireToast('Search failed. Please try again.', 'error');
      } finally {
        if (active) setIsLoadingData(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [searchQuery, stores]);

  useEffect(() => {
    if (selectedProduct && quantity) {
      const price = parseFloat(String(selectedProduct.attributes?.Price ?? selectedProduct.price ?? 0));
      const qty = parseFloat(quantity) || 0;
      const discPer = parseFloat(discountPercent) || 0;
      const discTk = parseFloat(discountTk || '0');

      const finalAmount = calculateAmount(price, qty, discPer, discTk);
      setAmount(finalAmount.toFixed(2));
    } else {
      setAmount('0.00');
    }
  }, [selectedProduct, quantity, discountPercent, discountTk]);

  const handleGroupClick = async (group: CatalogGroupedProduct) => {
    if (expandedGroupId === group.base_name) {
      setExpandedGroupId(null);
      setSelectedProductInventory(null);
    } else {
      setExpandedGroupId(group.base_name);
      // Fetch global inventory for the main variant's product ID as a representative
      // The user wants a table showing stores. We can fetch for the base product or per variant.
      // Usually, it's better to show it when a variant is selected or for the whole group.
      // Let's fetch for the group's main variant first.
      try {
        const inv = await inventoryService.getGlobalInventory({ product_id: group.main_variant.id });
        if (inv.success && inv.data.length > 0) {
          setSelectedProductInventory(inv.data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch group inventory', err);
      }
    }
  };

  const handleVariantSelect = async (variant: Product, group: CatalogGroupedProduct) => {
    const price = variant.selling_price;

    // Add to cart directly or set as "selected" for qty adjustment
    // The user's current UI has a "Quantity" and "Add to Cart" button below.
    // Let's keep that but auto-fill the selected variant.

    setSelectedProduct({
      ...variant,
      base_name: group.base_name,
      mainImage: group.main_variant.images?.[0]?.url || '/placeholder-image.jpg',
    });

    setQuantity('1');
    setDiscountPercent('');
    setDiscountTk('');

    // Fetch specific inventory for this variant
    try {
      const inv = await inventoryService.getGlobalInventory({ product_id: variant.id });
      if (inv.success && inv.data.length > 0) {
        setSelectedProductInventory(inv.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch variant inventory', err);
    }
  };

  const addToCart = () => {
    if (!selectedProduct || !quantity || parseInt(quantity) <= 0) {
      fireToast('Please select a product and enter quantity', 'error');
      return;
    }

    const price = Number(selectedProduct.selling_price || selectedProduct.price || 0);
    const qty = parseInt(quantity);
    const discPer = parseFloat(discountPercent) || 0;
    const discTk = parseFloat(discountTk || '0');

    const avail = selectedProduct.available_inventory ?? selectedProduct.stock_quantity ?? 0;
    if (qty > avail && !selectedProduct.isDefective) {
      fireToast(`Only ${avail} units available`, 'error');
      return;
    }

    const baseAmount = price * qty;
    const discountValue = discPer > 0 ? (baseAmount * discPer) / 100 : discTk;
    const finalAmount = baseAmount - discountValue;

    const newItem: CartProduct = {
      id: Date.now(),
      product_id: selectedProduct.id,
      batch_id: selectedProduct.isDefective ? selectedProduct.batchId : null,
      productName: selectedProduct.isDefective
        ? `${selectedProduct.productName} [DEFECTIVE]`
        : `${selectedProduct.base_name}${selectedProduct.variation_suffix ? ` - ${selectedProduct.variation_suffix}` : ''}`,
      sku: selectedProduct.sku,
      quantity: qty,
      unit_price: price,
      discount_amount: discountValue,
      amount: finalAmount,
      isDefective: selectedProduct.isDefective,
      defectId: selectedProduct.defectId,
      store_id: selectedProduct.isDefective ? selectedProduct.store_id : null,
      store_name: selectedProduct.isDefective ? selectedProduct.store_name : null,
    };

    setCart([...cart, newItem]);
    setSelectedProduct(null);
    setQuantity('');
    setDiscountPercent('');
    setDiscountTk('');
    setAmount('0.00');
    // Keep expandedGroupId but clear inventory if we want
  };

  const removeFromCart = (id: number | string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const totalDiscount = cart.reduce((sum, item) => sum + (item.discount_amount || 0), 0);

  const handleConfirmOrder = async () => {
    let cleanPhone = userPhone ? userPhone.replace(/\D/g, '') : '';
    if (cleanPhone.startsWith('880')) {
      cleanPhone = '0' + cleanPhone.slice(3);
    }

    if (!userName || !cleanPhone) {
      fireToast('Please fill in customer name and phone number', 'error');
      return;
    }

    if (cleanPhone.length !== 11) {
      fireToast('Mobile number must be exactly 11 digits.', 'error');
      return;
    }

    if (cart.length === 0) {
      fireToast('Please add products to cart', 'error');
      return;
    }

    if (isInternational) {
      if (!country || !internationalCity || (!deliveryAddress && !streetAddress)) {
        fireToast('Please fill in international address', 'error');
        return;
      }
    } else if (!streetAddress) {
      fireToast('Please enter full delivery address', 'error');
      return;
    }

    if (storeAssignmentType === 'specific' && !selectedStoreId) {
      fireToast('Please select a store or choose auto-assign', 'error');
      return;
    }

    try {
      setIsProcessingOrder(true);
      console.log(editOrderId ? '✏️ PREPARING EDIT ORDER FOR AMOUNT DETAILS' : '📦 PREPARING NEW SOCIAL COMMERCE ORDER');

      let effectiveEditOrderId = editOrderId;
      let effectiveEditOrderNumber = editOrderNumber;
      if (!effectiveEditOrderId && typeof window !== 'undefined') {
        try {
          const ctx = JSON.parse(sessionStorage.getItem(SC_EDIT_CONTEXT_KEY) || '{}');
          effectiveEditOrderId = Number(ctx.editOrderId || 0) || null;
          effectiveEditOrderNumber = effectiveEditOrderNumber || (typeof ctx.editOrderNumber === 'string' ? ctx.editOrderNumber : null);
        } catch {
          // ignore bad session data
        }
      }

      const selectedStore = storeAssignmentType === 'specific' ? selectedStoreId : '';
      const shippingAmount = parseFloat(transportCost) || 0;

      const formattedCustomerAddress = isInternational
        ? `${deliveryAddress || streetAddress}, ${internationalCity}${state ? ', ' + state : ''}, ${country}${internationalPostalCode ? ' - ' + internationalPostalCode : ''}`
        : `${streetAddress}${postalCode ? ' - ' + postalCode : ''}`;

      const shipping_address = isInternational
        ? {
          name: userName,
          phone: cleanPhone,
          address_line1: deliveryAddress || streetAddress,
          street: deliveryAddress || streetAddress,
          city: internationalCity,
          state: state || undefined,
          country: country || 'Bangladesh',
          postal_code: internationalPostalCode || undefined,
        }
        : {
          name: userName,
          phone: cleanPhone,
          address_line1: streetAddress,
          street: streetAddress,
          city: 'Dhaka',
          country: 'Bangladesh',
          postal_code: postalCode || undefined,
        };

      const deliveryAddressForUi = isInternational
        ? {
          country,
          state: state || '',
          city: internationalCity,
          postalCode: internationalPostalCode || '',
          address: deliveryAddress || streetAddress,
        }
        : {
          auto_pathao_location: true,
          city: 'Dhaka',
          zone: '',
          area: '',
          postalCode: postalCode || '',
          address: streetAddress,
        };

      const pendingOrder = {
        order_type: effectiveEditOrderId ? (editOrderType || 'social_commerce') : 'social_commerce',
        ...(effectiveEditOrderId ? { editOrderId: effectiveEditOrderId } : {}),
        ...(effectiveEditOrderNumber ? { editOrderNumber: effectiveEditOrderNumber } : {}),
        ...(selectedStore ? { store_id: parseInt(selectedStore, 10) } : {}),
        customer: {
          name: userName,
          email: userEmail || undefined,
          phone: cleanPhone,
          address: formattedCustomerAddress,
        },
        shipping_address,
        delivery_address: shipping_address,
        items: cart.map((item) => {
          // Existing order item ids are small database ids. New cart rows use Date.now(),
          // so do not send those as existing ids during edit mode.
          const rawItemId = Number(item.id) || 0;
          const numericExistingId = rawItemId > 0 && rawItemId < 1000000000 ? rawItemId : null;
          return {
            ...(numericExistingId ? { id: numericExistingId } : {}),
            product_id: item.product_id,
            ...(item.batch_id ? { batch_id: item.batch_id } : {}),
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_amount: item.discount_amount || 0,
            amount: item.amount,
            productName: item.productName,
            sku: item.sku || '',
          };
        }),
        services: [],
        shipping_amount: shippingAmount,
        discount_amount: orderDiscountAmountState || 0,
        notes: orderNotes || `Social Commerce. ${socialId ? `ID: ${socialId}. ` : ''}${isInternational ? 'International' : 'Domestic'} delivery.`,
        salesBy,
        date,
        isInternational,
        subtotal,
        deliveryAddress: deliveryAddressForUi,
        defectiveItems: cart
          .filter((item) => item.isDefective)
          .map((item) => ({
            defectId: item.defectId,
            price: item.unit_price,
            productName: item.productName,
          })),
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmountState,
        total_amount: totalAmountState,
        original_discount_amount: orderDiscountAmountState || 0,
        original_shipping_amount: shippingAmount,
      };

      sessionStorage.setItem('pendingOrder', JSON.stringify(pendingOrder));
      if (effectiveEditOrderId) {
        sessionStorage.setItem(
          SC_EDIT_CONTEXT_KEY,
          JSON.stringify({ editOrderId: effectiveEditOrderId, editOrderNumber: effectiveEditOrderNumber })
        );
      }

      window.location.href = '/social-commerce/amount-details';
    } catch (error: any) {
      console.error('❌ Error preparing order:', error);
      fireToast(error?.message || 'Failed to prepare order', 'error');
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const renderOrderSummary = () => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <div className="bg-teal-500 w-2 h-2 rounded-full"></div>
          Order Summary ({cart.length} items)
        </h3>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Product</th>
              <th className="px-2 py-2 text-center font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {cart.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 italic">
                  Cart is empty
                </td>
              </tr>
            ) : (
              cart.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{item.productName}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">SKU: {item.sku}</p>
                  </td>
                  <td className="px-2 py-3 text-center text-gray-700 dark:text-gray-300">{item.quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    <div className="flex flex-col items-end">
                      <span>{(item.unit_price * item.quantity).toLocaleString()} Tk</span>
                      {(item.discount_amount || 0) > 0 && (
                        <span className="text-[10px] text-red-500 font-medium">
                          - {item.discount_amount.toLocaleString()} Tk (Disc)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 space-y-4">
        {/* Pricing Summary */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Subtotal</span>
            <span className="font-medium text-gray-900 dark:text-white">{subtotal.toLocaleString()} ৳</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-xs text-red-500">
              <span>Discount</span>
              <span className="font-medium">-{totalDiscount.toLocaleString()} ৳</span>
            </div>
          )}
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-600 dark:text-gray-400">Transport Cost</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={transportCost === '0' ? '' : transportCost}
                placeholder="0"
                onChange={(e) => {
                  const val = e.target.value;
                  setTransportCost(val === '' ? '0' : val);
                }}
                className="w-20 px-2 py-1 text-right text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-teal-500 outline-none"
              />
              <span className="text-gray-400 font-medium">৳</span>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between text-lg font-bold text-teal-600 dark:text-teal-400">
            <span>Total</span>
            <span>{(subtotal - totalDiscount + (parseFloat(transportCost) || 0)).toLocaleString()} ৳</span>
          </div>
        </div>

        {/* Store Assignment */}
        <div className="space-y-2 pt-2">
          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Logistics & Store</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStoreAssignmentType('auto')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${storeAssignmentType === 'auto'
                ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <Truck size={14} /> Assign Later
            </button>
            <button
              onClick={() => setStoreAssignmentType('specific')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${storeAssignmentType === 'specific'
                ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <StoreIcon size={14} /> Manual
            </button>
          </div>
          {storeAssignmentType === 'specific' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select Store Branch</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
          Payment, COD, advance, EMI/installment, final discount, and final due will be confirmed on the Amount Details page.
        </div>

        <button
          onClick={handleConfirmOrder}
          disabled={cart.length === 0 || isProcessingOrder}
          className="w-full mt-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessingOrder ? 'Preparing...' : 'Continue to Amount Details'}
        </button>
      </div>
    </div>
  );

  const renderProductSearch = () => (
    <div className="space-y-6 flex-1 flex flex-col min-h-0">
      {/* Search Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products by SKU or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-teal-500 rounded-lg outline-none transition-all dark:text-white"
          />
        </div>
      </div>

      {/* Selected Component - Qty, Discount, Add */}
      {selectedProduct && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">{selectedProduct.base_name}</h4>
              <p className="text-xs text-teal-600 dark:text-teal-400">{selectedProduct.variation_suffix || 'Base Style'} - {selectedProduct.sku}</p>
              <p className="text-sm font-bold mt-1 text-teal-700 dark:text-teal-300">{selectedProduct.selling_price} ৳</p>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="p-1 hover:bg-teal-100 rounded-full"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Quantity</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Disc %</label>
              <input type="number" value={discountPercent} onChange={(e) => { setDiscountPercent(e.target.value); setDiscountTk(''); }} className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800" placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Disc ৳</label>
              <input type="number" value={discountTk} onChange={(e) => { setDiscountTk(e.target.value); setDiscountPercent(''); }} className="w-full p-2 text-sm border rounded-lg bg-white dark:bg-gray-800" placeholder="0" />
            </div>
            <button onClick={addToCart} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 rounded-lg text-sm">Add to Cart</button>
          </div>
        </div>
      )}

      {/* Results List */}
      <div className="space-y-3 flex-1 overflow-y-auto pr-2 scrollbar-hide" style={{ maxHeight: '600px' }}>
        {searchResults.map((group) => (
          <div key={group.base_name} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div
              onClick={() => handleGroupClick(group)}
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50"
            >
              <div className="flex items-center gap-4">
                <img
                  src={group.main_variant.images?.[0]?.url || '/placeholder-image.jpg'}
                  alt={group.base_name}
                  className="w-12 h-12 object-cover rounded-lg border"
                />
                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">{group.base_name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-bold text-teal-600">{group.min_price} ৳</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">Available: {group.total_available ?? group.total_stock}</span>
                    {group.total_reserved ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-full">Reserved: {group.total_reserved}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <ChevronDown size={16} className={`transition-transform ${expandedGroupId === group.base_name ? 'rotate-180' : ''}`} />
            </div>

            {expandedGroupId === group.base_name && (
              <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/20">
                {[group.main_variant, ...group.variants].map((variant) => (
                  <div
                    key={variant.id}
                    onClick={() => handleVariantSelect(variant, group)}
                    className="p-3 flex items-center justify-between border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-white dark:hover:bg-gray-800"
                  >
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{variant.variation_suffix || 'Standard'}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-bold">{variant.selling_price} ৳</span>
                      <span className="text-gray-400">|</span>
                      <span className={(variant.available_inventory ?? variant.stock_quantity) > 0 ? 'text-green-600' : 'text-red-500'}>
                        Avail: {variant.available_inventory ?? variant.stock_quantity}
                      </span>
                      {variant.reserved_inventory ? (
                        <span className="text-blue-500 font-medium">({variant.reserved_inventory} Res)</span>
                      ) : null}
                      <Plus size={14} className="text-teal-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderBranchAvailability = () => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <StoreIcon size={16} className="text-teal-500" />
          Branch Availability {selectedProduct ? `- ${selectedProduct.variation_suffix || selectedProduct.base_name}` : ''}
        </h3>
      </div>
      <div className="p-4 flex-1">
        {!selectedProductInventory ? (
          <div className="py-8 text-center text-xs text-gray-400 italic">Select a product to see branch-wise stock</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b dark:border-gray-700">
                <th className="text-left py-2 font-medium">Branch</th>
                <th className="text-center py-2 font-medium">Status</th>
                <th className="text-right py-2 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {stores.map(branch => {
                const s = selectedProductInventory.stores.find(s => s.store_id === branch.id);
                const qty = s?.quantity || 0;
                return (
                  <tr key={branch.id} className="border-b last:border-0 border-gray-50 dark:border-gray-700/50">
                    <td className="py-3 font-medium">{branch.name}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${qty > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {qty > 0 ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-sm">
                      <div className="flex flex-col items-end">
                        <span>{qty}</span>
                        <span className="text-[10px] text-gray-400 font-normal">Physical</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const renderCustomerDetails = () => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-6 flex flex-col justify-center">
      <div className="flex items-center justify-between border-b pb-4">
        <h3 className="text-sm font-bold flex items-center gap-2"><MapPin size={16} className="text-teal-500" /> Delivery Details</h3>
        <button onClick={() => setIsInternational(!isInternational)} className="text-[10px] font-bold px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-lg hover:bg-teal-100 transition-colors">
          {isInternational ? 'International Shipping' : 'Domestic Delivery'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Customer Name*</label>
            <input placeholder="Name" value={userName} onChange={e => setUserName(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-1 focus:ring-teal-500 text-gray-900 dark:text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Phone Number*</label>
            <input placeholder="Phone" value={userPhone} onChange={e => setUserPhone(e.target.value)} onBlur={handlePhoneBlur} className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-1 focus:ring-teal-500 text-gray-900 dark:text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Street Address*</label>
            <textarea placeholder="Address" value={streetAddress} onChange={e => setStreetAddress(e.target.value)} rows={3} className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-1 focus:ring-teal-500 resize-none text-gray-900 dark:text-white" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Email Address</label>
            <input placeholder="Email" value={userEmail} onChange={e => setUserEmail(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-1 focus:ring-teal-500 text-gray-900 dark:text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Social Media ID</label>
            <input placeholder="Social ID" value={socialId} onChange={e => setSocialId(e.target.value)} className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-1 focus:ring-teal-500 text-gray-900 dark:text-white" />
          </div>
          {isInternational && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Country</label>
                <input placeholder="Country" value={country} onChange={e => setCountry(e.target.value)} className="w-full p-2 text-xs border rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">City</label>
                <input placeholder="City" value={internationalCity} onChange={e => setInternationalCity(e.target.value)} className="w-full p-2 text-xs border rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white" />
              </div>
            </div>
          )}
          {existingCustomer && (
            <div className="text-[10px] p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-100 dark:border-teal-800 font-medium text-teal-800 dark:text-teal-300">
              <span className="font-bold">Returning Customer:</span> {existingCustomer.total_orders} total orders found.
            </div>
          )}
        </div>
      </div>
    </div>
  );


  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <h1 className="text-2xl font-black tracking-tight">SOCIAL COMMERCE</h1>
                <div className="flex gap-4">
                  <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border text-xs font-bold uppercase tracking-wider">Date: {date}</div>
                  <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border text-xs font-bold uppercase tracking-wider">By: {salesBy}</div>
                </div>
              </div>

              {editOrderId && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
                  <strong>Editing Order {editOrderNumber ? `#${editOrderNumber}` : ''}</strong> — update customer details, delivery info, products, discounts, and transport cost here. Existing payments will not be duplicated.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 space-y-8">
                  {renderBranchAvailability()}
                  {renderOrderSummary()}
                </div>
                <div className="lg:col-span-2 space-y-8">
                  {renderProductSearch()}
                  {renderCustomerDetails()}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}