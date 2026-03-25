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
import catalogService from '@/services/catalogService';
import inventoryService from '@/services/inventoryService';
import { fireToast } from '@/lib/globalToast';

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
}

interface ProductSearchResult {
  id: number;
  name: string;
  sku: string;
  mainImage: string;
  available: number;
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
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [cart, setCart] = useState<CartProduct[]>([]);

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
      return `${minP} - ${maxP} Tk`;
    }

    const v = Number(product?.attributes?.Price ?? minP ?? 0);
    return `${Number.isFinite(v) ? v : 0} Tk`;
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
        const [storesData, stats] = await Promise.all([
          fetchStores(),
          inventoryService.getStatistics().catch(() => null)
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

    const delayDebounce = setTimeout(async () => {
      try {
        setIsLoadingData(true);
        console.log('🔍 Executing catalog search for:', searchQuery);
        
        // Use the same search method as e-commerce (SKU grouped)
        const response = await catalogService.searchProducts({
          q: searchQuery,
          per_page: 50,
        });

        if (response && response.grouped_products) {
          const results: ProductSearchResult[] = response.grouped_products.map(group => {
            const main = group.main_variant;
            const allVariants = [main, ...(group.variants || [])];
            
            const branchMap = new Map<number, { store_name: string, quantity: number }>();
            
            for (const v of allVariants) {
              if (Array.isArray(v.batches)) {
                for (const b of v.batches) {
                  const storeId = b.store_id;
                  const storeInfo = stores.find(s => s.id === storeId);
                  const storeName = storeInfo?.name || b.store?.name || `Store #${storeId}`;
                  
                  const current = branchMap.get(storeId) || { store_name: storeName, quantity: 0 };
                  branchMap.set(storeId, {
                    store_name: current.store_name,
                    quantity: current.quantity + (b.quantity || 0)
                  });
                }
              }
            }
            
            const branchStocks = Array.from(branchMap.values()).filter(b => b.quantity > 0);
            
            return {
              id: main.id,
              name: group.base_name,
              sku: main.sku,
              mainImage: main.images?.[0]?.url || '/placeholder-image.jpg',
              available: group.total_stock,
              minPrice: group.min_price,
              maxPrice: group.max_price,
              batchesCount: branchStocks.length,
              attributes: {
                Price: group.min_price,
                mainImage: main.images?.[0]?.url || '/placeholder-image.jpg',
              },
              branchStocks
            };
          });

          setSearchResults(results);
          
          if (results.length === 0) {
            fireToast('No available products found', 'error');
          }
        }
      } catch (error: any) {
        console.error('❌ Search failed:', error);
        fireToast('Search failed. Please try again.', 'error');
      } finally {
        setIsLoadingData(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, stores]);

  useEffect(() => {
    if (selectedProduct && quantity) {
      const price = parseFloat(String(selectedProduct.attributes?.Price ?? selectedProduct.price ?? 0));
      const qty = parseFloat(quantity) || 0;
      const discPer = parseFloat(discountPercent) || 0;
      const discTk = parseFloat(discountTk) || 0;

      const finalAmount = calculateAmount(price, qty, discPer, discTk);
      setAmount(finalAmount.toFixed(2));
    } else {
      setAmount('0.00');
    }
  }, [selectedProduct, quantity, discountPercent, discountTk]);

  const handleProductSelect = (product: ProductSearchResult | any) => {
    setSelectedProduct({
      ...product,
      batch_id: null,
      attributes: {
        Price: Number(product?.attributes?.Price ?? product?.minPrice ?? 0),
        mainImage: product?.mainImage || product?.attributes?.mainImage || '/placeholder-image.jpg',
      },
    });
    setSearchQuery('');
    setSearchResults([]);
    setQuantity('1');
    setDiscountPercent('');
    setDiscountTk('');
  };

  const addToCart = () => {
    if (!selectedProduct || !quantity || parseInt(quantity) <= 0) {
      alert('Please select a product and enter quantity');
      return;
    }

    const price = Number(String(selectedProduct.attributes?.Price ?? selectedProduct.price ?? '0').replace(/[^0-9.-]/g, ''));
    const qty = parseInt(quantity);
    const discPer = parseFloat(discountPercent) || 0;
    const discTk = parseFloat(discountTk) || 0;

    if (qty > selectedProduct.available && !selectedProduct.isDefective) {
      alert(`Only ${selectedProduct.available} units available across all branches`);
      return;
    }

    const baseAmount = price * qty;
    const discountValue = discPer > 0 ? (baseAmount * discPer) / 100 : discTk;
    const finalAmount = baseAmount - discountValue;

    const newItem: CartProduct = {
      id: Date.now(),
      product_id: selectedProduct.id,
      batch_id: selectedProduct.isDefective ? selectedProduct.batchId : null,
      productName: `${selectedProduct.name}${selectedProduct.isDefective ? ' [DEFECTIVE]' : ''}`,
      quantity: qty,
      unit_price: price,
      discount_amount: discountValue,
      amount: finalAmount,
      isDefective: selectedProduct.isDefective,
      defectId: selectedProduct.defectId,
      store_id: selectedProduct.isDefective ? selectedProduct.store_id : null,
      store_name: selectedProduct.isDefective ? selectedProduct.store_name : null,
    };

    console.log('✅ Adding to cart:', {
      product_id: newItem.product_id,
      batch_id: newItem.batch_id,
      store_id: newItem.store_id,
      isDefective: newItem.isDefective,
    });

    setCart([...cart, newItem]);
    setSelectedProduct(null);
    setQuantity('');
    setDiscountPercent('');
    setDiscountTk('');
    setAmount('0.00');
  };

  const removeFromCart = (id: number | string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const handleConfirmOrder = async () => {
    if (!userName || !userPhone) {
      alert('Please fill in customer name and phone number');
      return;
    }
    if (cart.length === 0) {
      alert('Please add products to cart');
      return;
    }

    // ✅ Validate delivery address
    if (isInternational) {
      if (!country || !internationalCity || !deliveryAddress) {
        alert('Please fill in international address');
        return;
      }
    } else {
      if (!streetAddress) {
        alert('Please enter full delivery address');
        return;
      }
    }

    // ⚠️ Duplicate protection
    if (lastOrderInfo && lastOrderInfo.date) {
      const lastDate = new Date(lastOrderInfo.date);
      const now = new Date();
      const sameDay = lastDate.toDateString() === now.toDateString();

      if (sameDay) {
        const summaryText = lastOrderInfo.summary_text || '';
        const confirmMsg = `This customer already has an order today.\n\nLast order: ${lastDate.toLocaleString()}\n${summaryText ? `Items: ${summaryText}\n` : ''
          }\nDo you still want to place another order?`;

        const proceed = window.confirm(confirmMsg);
        if (!proceed) return;
      }
    }

    try {
      console.log('📦 CREATING SOCIAL COMMERCE ORDER');

      const shipping_address = isInternational
        ? {
          name: userName,
          phone: userPhone,
          street: deliveryAddress,
          city: internationalCity,
          state: state || undefined,
          country,
          postal_code: internationalPostalCode || undefined,
        }
        : {
          name: userName,
          phone: userPhone,
          street: streetAddress,
          postal_code: postalCode || undefined,
        };

      // ✅ Flatten items - each item already has store_id
      const orderData = {
        order_type: 'social_commerce',
        customer: {
          name: userName,
          email: userEmail || undefined,
          phone: userPhone,
        },
        shipping_address,
        items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: item.isDefective ? item.batch_id : null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
        })),
        shipping_amount: 0,
        notes: `Social Commerce. ${socialId ? `ID: ${socialId}. ` : ''}${isInternational ? 'International' : 'Domestic'} delivery.`,
      };

      sessionStorage.setItem(
        'pendingOrder',
        JSON.stringify({
          ...orderData,
          salesBy,
          date,
          isInternational,
          subtotal,
          defectiveItems: cart
            .filter((item) => item.isDefective)
            .map((item) => ({
              defectId: item.defectId,
              price: item.unit_price,
              productName: item.productName,
            })),
        })
      );

      console.log('✅ Order data prepared, redirecting...');
      window.location.href = '/social-commerce/amount-details';
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Failed to process order');
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Social Commerce</h1>

                {defectiveProduct && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-orange-900 dark:text-orange-300">
                      Defective Item: {defectiveProduct.productName}
                    </span>
                  </div>
                )}
              </div>

              <div className="mb-4 md:mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="w-full sm:w-auto">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sales By</label>
                  <input
                    type="text"
                    value={salesBy}
                    readOnly
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Inventory Status</label>
                  <div className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                    {isLoadingData ? (
                      <span className="text-blue-600">Loading statistics...</span>
                    ) : (
                      <span className="text-green-600">
                        {inventoryStats ? `${inventoryStats.total_stock} items` : 'Connected'} across {stores.length} branches
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Left Column - Customer Info & Address */}
                <div className="space-y-4 md:space-y-6">
                  {/* Customer Information */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-5">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Customer Information</h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">User Name*</label>
                        <input
                          type="text"
                          placeholder="Full Name"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">User Email</label>
                        <input
                          type="email"
                          placeholder="sample@email.com (optional)"
                          value={userEmail}
                          onChange={(e) => setUserEmail(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">User Phone Number*</label>
                        <input
                          type="text"
                          placeholder="Phone Number"
                          value={userPhone}
                          onChange={(e) => setUserPhone(e.target.value)}
                          onBlur={handlePhoneBlur}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        {isCheckingCustomer && (
                          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                            Checking existing customer & last order...
                          </p>
                        )}
                        {customerCheckError && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{customerCheckError}</p>
                        )}
                        {existingCustomer && (
                          <div className="mt-2 p-2 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-xs text-gray-800 dark:text-gray-100">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <p className="font-semibold">
                                  Existing Customer: {existingCustomer.name}{' '}
                                  {existingCustomer.customer_code ? `(${existingCustomer.customer_code})` : ''}
                                </p>
                                <p>
                                  Total Orders: <span className="font-medium">{existingCustomer.total_orders ?? 0}</span>
                                </p>
                                {/* Customer Tags (view + manage) */}
                                <CustomerTagManager
                                  customerId={existingCustomer.id}
                                  initialTags={Array.isArray(existingCustomer.tags) ? existingCustomer.tags : []}
                                  compact
                                  onTagsChange={(next) =>
                                    setExistingCustomer((prev: any) => (prev ? { ...prev, tags: next } : prev))
                                  }
                                />
                                {lastOrderInfo ? (
                                  <div className="mt-1">
                                    <p className="font-semibold">Last Order Summary:</p>
                                    <p>
                                      Date:{' '}
                                      <span className="font-medium">
                                        {lastOrderInfo.date ? new Date(lastOrderInfo.date).toLocaleString() : 'N/A'}
                                      </span>
                                    </p>
                                    {lastOrderInfo.summary_text && (
                                      <p>
                                        Items: <span className="font-medium">{lastOrderInfo.summary_text}</span>
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="mt-1 text-gray-600 dark:text-gray-300">
                                    No previous orders found for this customer.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Social ID</label>
                        <input
                          type="text"
                          placeholder="Enter Social ID"
                          value={socialId}
                          onChange={(e) => setSocialId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Address */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">Delivery Address</h3>
                      <button
                        onClick={() => {
                          setIsInternational(!isInternational);
                          setStreetAddress('');
                          setPostalCode('');
                          setCountry('');
                          setState('');
                          setInternationalCity('');
                          setInternationalPostalCode('');
                          setDeliveryAddress('');
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isInternational
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                          }`}
                      >
                        <Globe className="w-4 h-4" />
                        {isInternational ? 'International' : 'Domestic'}
                      </button>
                    </div>

                    {isInternational ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Country*</label>
                          <input
                            type="text"
                            placeholder="Enter Country"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">State/Province</label>
                          <input
                            type="text"
                            placeholder="Enter State"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">City*</label>
                          <input
                            type="text"
                            placeholder="Enter City"
                            value={internationalCity}
                            onChange={(e) => setInternationalCity(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Postal Code</label>
                          <input
                            type="text"
                            placeholder="Enter Postal Code"
                            value={internationalPostalCode}
                            onChange={(e) => setInternationalPostalCode(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Street Address*</label>
                          <textarea
                            placeholder="Full Address"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Full Address*</label>
                          <textarea
                            placeholder="House/Flat, Road, Area, Landmark"
                            value={streetAddress}
                            onChange={(e) => setStreetAddress(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Postal Code (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g., 1212"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Product Search & Cart */}
                <div className="space-y-4 md:space-y-6">
                  {/* Product Search */}
                  <div
                    className={`bg-white dark:bg-gray-800 rounded-lg border p-4 md:p-5 ${selectedProduct?.isDefective
                        ? 'border-orange-300 dark:border-orange-700'
                        : 'border-gray-200 dark:border-gray-700'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">Search Product (All Stores)</h3>
                      {selectedProduct?.isDefective && (
                        <span className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded">
                          Defective Product
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        placeholder={isLoadingData ? 'Loading inventory...' : 'Search product name or SKU...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={isLoadingData}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        disabled={isLoadingData}
                        className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Search size={18} />
                      </button>
                    </div>

                    {isLoadingData && (
                      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                        Loading inventory from all stores...
                      </div>
                    )}

                    {!isLoadingData && searchQuery && searchResults.length === 0 && (
                      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                        No products found matching "{searchQuery}"
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 md:max-h-80 overflow-y-auto mb-4 p-1">
                        {searchResults.map((product) => (
                          <div
                            key={product.id}
                            onClick={() => handleProductSelect(product)}
                            className="relative border border-gray-200 dark:border-gray-600 rounded p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <img
                              src={product.mainImage}
                              alt={product.name}
                              className="w-full h-24 sm:h-32 object-cover rounded mb-2"
                            />
                            <p className="text-xs text-gray-900 dark:text-white font-medium truncate">
                              {product.name}
                            </p>
                            {Number(product.batchesCount ?? 0) > 1 && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                                Branch/Batches: {product.batchesCount}
                              </p>
                            )}
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {formatPriceRangeLabel(product)}
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Available: {product.available}
                            </p>
                            {product.branchStocks && product.branchStocks.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {product.branchStocks.map((bs, idx) => (
                                  <p key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                    {bs.store_name}: <span className="font-semibold text-gray-700 dark:text-gray-200">{bs.quantity}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                            {product.daysUntilExpiry != null && product.daysUntilExpiry < 30 && (
                              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                Expires in {product.daysUntilExpiry} days
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedProduct && (
                      <div
                        className={`mt-4 p-3 border rounded mb-4 ${selectedProduct.isDefective
                            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">Selected Product</span>
                          <button
                            onClick={() => {
                              setSelectedProduct(null);
                              setQuantity('');
                              setDiscountPercent('');
                              setDiscountTk('');
                              setAmount('0.00');
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedProduct.name}</p>
                        {Number(selectedProduct?.batchesCount ?? 0) > 1 && (
                          <p className="text-sm text-blue-600 dark:text-blue-400">
                            Across {selectedProduct.batchesCount} branch/batch location(s)
                          </p>
                        )}
                        {selectedProduct.isDefective && selectedProduct.store_name && (
                          <p className="text-sm text-blue-600 dark:text-blue-400">🏪 {selectedProduct.store_name}</p>
                        )}
                        {selectedProduct.isDefective && selectedProduct.batchNumber && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Batch: {selectedProduct.batchNumber}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Price: {selectedProduct.isDefective ? `${selectedProduct.price} Tk` : formatPriceRangeLabel(selectedProduct)}
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Available: {selectedProduct.available}
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          disabled={!selectedProduct || selectedProduct?.isDefective}
                          min="1"
                          max={selectedProduct?.available || 1}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Discount %</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={discountPercent}
                            onChange={(e) => {
                              setDiscountPercent(e.target.value);
                              setDiscountTk('');
                            }}
                            disabled={!selectedProduct || selectedProduct?.isDefective}
                            className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Discount Tk</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={discountTk}
                            onChange={(e) => {
                              setDiscountTk(e.target.value);
                              setDiscountPercent('');
                            }}
                            disabled={!selectedProduct || selectedProduct?.isDefective}
                            className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700 dark:text-gray-300 mb-1">Amount</label>
                          <input
                            type="text"
                            value={amount}
                            readOnly
                            className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <button
                        onClick={addToCart}
                        disabled={!selectedProduct}
                        className="w-full px-4 py-2.5 bg-black hover:bg-gray-800 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>

                  {/* Cart */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">Cart ({cart.length} items)</h3>
                    </div>
                    <div className="max-h-60 md:max-h-96 overflow-y-auto overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                              Product
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                              Qty
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                              Price
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                No products in cart
                              </td>
                            </tr>
                          ) : (
                            cart.map((item) => (
                              <tr
                                key={item.id}
                                className={`border-b border-gray-200 dark:border-gray-700 ${item.isDefective ? 'bg-orange-50 dark:bg-orange-900/10' : ''
                                  }`}
                              >
                                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                                  {item.productName}
                                  {item.isDefective && (
                                    <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white text-xs rounded">
                                      DEFECTIVE
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{item.quantity}</td>
                                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{item.unit_price.toFixed(2)}</td>
                                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{item.amount.toFixed(2)}</td>
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-red-600 hover:text-red-700 text-xs font-medium"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {cart.length > 0 && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex justify-between text-sm mb-3">
                          <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                          <span className="text-gray-900 dark:text-white font-medium">{subtotal.toFixed(2)} Tk</span>
                        </div>
                        {isInternational && (
                          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400">
                            <Globe className="w-4 h-4 flex-shrink-0" />
                            <span>International shipping rates will apply</span>
                          </div>
                        )}
                        <button
                          onClick={handleConfirmOrder}
                          className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded transition-colors"
                        >
                          Confirm Order
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}