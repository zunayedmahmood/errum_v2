'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import { AlertCircle, ChevronDown, ChevronUp, Package, Search } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import inventoryService, { GlobalInventoryItem, Store as StoreBreakdown } from '@/services/inventoryService';
import productService from '@/services/productService';
import categoryService from '@/services/categoryService';
import productImageService from '@/services/productImageService';
import defectiveProductService, { type DefectiveProduct } from '@/services/defectiveProductService';
import ExportInventoryButton from '@/components/inventory/ExportInventoryButton';
import CategoryTreeSelector from '@/components/product/CategoryTreeSelector';

interface Category {
  id: number;
  title: string;
  name?: string;
  slug?: string;
  parent_id?: number;
}

interface ProductVariation {
  productId: number;
  category_id?: number;
  category_name?: string;
  subcategory_name?: string;
  variation_suffix?: string;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  stores: StoreBreakdown[];
}

interface GroupedProduct {
  groupKey: string; // stable unique key (SKU, or NO-SKU-{product_id})
  sku: string; // display SKU (may be 'NO-SKU')
  productName: string;
  totalStock: number;
  totalAvailable: number;
  totalReserved: number;
  variations: ProductVariation[];
  expanded: boolean;
  productIds: number[];

  // Extra panel counts (defective/used) merged client-side
  extraTotal: number;
  extraDefective: number;
  extraUsed: number;
}

type ExtraCounts = { total: number; used: number; defective: number };

type RateLimitState = { active: boolean; lastAt?: number; message?: string };

function ViewInventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isUpdatingUrlRef = useRef(false);

  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [groupedProducts, setGroupedProducts] = useState<GroupedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);
  const [viewMode, setViewMode] = useState<'all' | 'category'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const getFlatCategories = (cats: any[]) => {
    const flat: any[] = [];
    const flatten = (items: any[]) => {
      items.forEach(item => {
        if (!flat.some(f => f.id === item.id)) {
          flat.push(item);
        }
        if (item.children && Array.isArray(item.children)) {
          flatten(item.children);
        }
      });
    };
    
    // First flatten based on children arrays if they exist (Tree mode)
    if (cats.some(c => c.children && c.children.length > 0)) {
       flatten(cats);
    } else {
       // Fallback for flat list mode: manually build tree relationships
       const roots = cats.filter(c => !c.parent_id);
       roots.forEach(root => {
         flat.push(root);
         const addChildren = (parentId: number) => {
           cats.filter(c => c.parent_id === parentId).forEach(child => {
             if (!flat.some(f => f.id === child.id)) {
               flat.push(child);
               addChildren(child.id);
             }
           });
         };
         addChildren(root.id);
       });
       // Catch any orphans
       cats.forEach(c => {
         if (!flat.some(f => f.id === c.id)) flat.push(c);
       });
    }
    
    return flat;
  };

  const flatCategories = useMemo(() => getFlatCategories(categories), [categories]);

  // product meta + image caches (loaded lazily for visible items)
  const [productMetaById, setProductMetaById] = useState<Record<number, any>>({});
  const [productImageById, setProductImageById] = useState<Record<number, string>>({});

  // extra stock counts (defective/used)
  const [extraMap, setExtraMap] = useState<Map<number, ExtraCounts>>(new Map());

  // Store names for dynamic columns
  const [allStores, setAllStores] = useState<{ id: number; name: string }[]>([]);

  // rate limit banner
  const [rateLimit, setRateLimit] = useState<RateLimitState>({ active: false });

  const metaCacheRef = useRef<Record<number, any>>({});
  const imageCacheRef = useRef<Record<number, string>>({});
  const inFlightRef = useRef<Set<number>>(new Set());

  const updateQueryParams = useCallback(
    (updates: Record<string, string | null | undefined>, historyMode: 'replace' | 'push' = 'replace') => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') params.delete(key);
        else params.set(key, value);
      });

      const qs = params.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      isUpdatingUrlRef.current = true;
      if (historyMode === 'push') router.push(nextUrl);
      else router.replace(nextUrl);
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    metaCacheRef.current = productMetaById;
  }, [productMetaById]);

  useEffect(() => {
    imageCacheRef.current = productImageById;
  }, [productImageById]);

  // Sync URL params -> local state (supports refresh + browser back/forward)
  useEffect(() => {
    if (isUpdatingUrlRef.current) {
      isUpdatingUrlRef.current = false;
      return;
    }

    const q = searchParams.get('q') ?? '';
    const limitRaw = Number(searchParams.get('limit') ?? '50');
    const safeLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;

    setSearchTerm(q);
    setVisibleCount(safeLimit);
  }, [searchParams]);

  useEffect(() => {
    fetchInventory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedCategoryId]);

  // --- Same approach as GalleryPage: normalize image paths to absolute URLs ---
  const getBaseUrl = () => {
    // Example: NEXT_PUBLIC_API_URL = https://backend.errumbd.com/api
    // We need base = https://backend.errumbd.com
    const api = process.env.NEXT_PUBLIC_API_URL || '';
    return api ? api.replace(/\/api\/?$/, '') : '';
  };

  const normalizeImageUrl = (url?: string | null) => {
    if (!url) return '/placeholder-image.jpg';

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;

    const baseUrl = getBaseUrl();

    // backend often returns /storage/....
    if (url.startsWith('/storage')) return `${baseUrl}${url}`;

    // if it already starts with "/", treat as site-relative
    if (url.startsWith('/')) return url;

    // otherwise treat as filename stored in product-images
    if (!baseUrl) return `/storage/product-images/${url}`; // best-effort fallback
    return `${baseUrl}/storage/product-images/${url}`;
  };

  const getCategoryName = (categoryId: number, catsToSearch: Category[]): string => {
    const category = catsToSearch.find(c => c.id === categoryId);
    if (!category) return 'Uncategorized';

    if (category.parent_id) {
      const parent = catsToSearch.find(c => c.id === category.parent_id);
      return parent ? `${parent.title} / ${category.title}` : category.title;
    }

    return category.title;
  };

  // -------------------- Extra panel (defective/used) --------------------
  const ACTIVE_EXTRA_STATUSES: Array<DefectiveProduct['status']> = [
    'identified',
    'inspected',
    'available_for_sale',
  ];

  const isUsedItem = (desc?: string) => (desc || '').toUpperCase().includes('USED_ITEM');

  const fetchAllActiveExtraItems = async (): Promise<DefectiveProduct[]> => {
    const per_page = 200;
    const all: DefectiveProduct[] = [];

    for (const status of ACTIVE_EXTRA_STATUSES) {
      let page = 1;
      while (true) {
        const res: any = await defectiveProductService.getAll({ status, per_page, page });

        const paginator = res?.data;
        const rows: DefectiveProduct[] = Array.isArray(paginator)
          ? paginator
          : (paginator?.data || []);

        all.push(...rows);

        if (Array.isArray(paginator)) break;

        const current = paginator?.current_page ?? page;
        const last = paginator?.last_page ?? page;
        if (current >= last || rows.length === 0) break;
        page += 1;
      }
    }

    return all;
  };

  const buildExtraMapByProduct = (items: DefectiveProduct[]) => {
    const map = new Map<number, ExtraCounts>();

    for (const d of items) {
      const pid = d.product_id;
      if (!pid) continue;

      const entry = map.get(pid) || { total: 0, used: 0, defective: 0 };
      entry.total += 1;

      if (isUsedItem(d.defect_description)) entry.used += 1;
      else entry.defective += 1;

      map.set(pid, entry);
    }

    return map;
  };

  // -------------------- Helpers for product meta + images --------------------
  const getCustomFieldValue = (product: any, titles: string[]): string | undefined => {
    const list = product?.custom_fields || [];
    const lower = titles.map(t => t.toLowerCase());
    const found = list.find((f: any) => lower.includes(String(f?.field_title || '').toLowerCase()));
    const v = found?.value;
    if (v === null || v === undefined) return undefined;
    return String(v);
  };

  const pickImageFromProductMeta = (product: any): string | undefined => {
    if (!product) return undefined;

    // 1) custom field image
    const cfImage = getCustomFieldValue(product, ['image']);
    if (cfImage) return cfImage;

    // 2) product.images (if present)
    const imgs = Array.isArray(product?.images) ? product.images : [];
    if (imgs.length > 0) {
      const active = imgs.filter((img: any) => img?.is_active !== false);
      active.sort((a: any, b: any) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      const u = active[0]?.image_url || active[0]?.image_path;
      if (u) return String(u);
    }

    return undefined;
  };

  const getColorSizeForProductId = (productId: number) => {
    const meta = metaCacheRef.current[productId];
    const color = getCustomFieldValue(meta, ['color', 'colour']);
    const size = getCustomFieldValue(meta, ['size']);
    return {
      color: color && color !== 'Default' ? color : undefined,
      size: size && size !== 'One Size' ? size : undefined,
    };
  };

  const getCategoryPaths = (categoryId: number | undefined, catsToSearch: Category[]): { category: string; subcategory: string } => {
    if (!categoryId) return { category: 'Uncategorized', subcategory: '-' };
    const cat = catsToSearch.find(c => c.id === categoryId);
    if (!cat) return { category: 'Uncategorized', subcategory: '-' };

    if (cat.parent_id) {
      const parent = catsToSearch.find(c => c.id === cat.parent_id);
      return {
        category: parent ? parent.title : cat.title,
        subcategory: parent ? cat.title : '-',
      };
    }

    return { category: cat.title, subcategory: '-' };
  };

  const getVariationSuffix = (productId: number) => {
    const { color, size } = getColorSizeForProductId(productId);
    const parts = [];
    if (color) parts.push(color);
    if (size) parts.push(size);
    return parts.join(' / ') || 'Default';
  };

  const getImageForProductId = (productId: number) => {
    const meta = metaCacheRef.current[productId];

    const cfOrMeta = pickImageFromProductMeta(meta);
    if (cfOrMeta) return normalizeImageUrl(cfOrMeta);

    const cached = imageCacheRef.current[productId];
    if (cached) return normalizeImageUrl(cached);

    return '/placeholder-image.jpg';
  };

  const getCategoryForGroup = (g: GroupedProduct) => {
    for (const pid of g.productIds) {
      const meta = metaCacheRef.current[pid];
      if (meta?.category_id) return getCategoryName(meta.category_id, flatCategories);
    }
    return 'Uncategorized';
  };

  const getHeroImageForGroup = (g: GroupedProduct) => {
    for (const pid of g.productIds) {
      const img = getImageForProductId(pid);
      if (img && img !== '/placeholder-image.jpg') return img;
    }
    // fallback: first pid
    return getImageForProductId(g.productIds[0]);
  };

  // -------------------- Retry + rate limiting --------------------
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const getHttpStatus = (err: any): number | undefined => {
    return err?.response?.status ?? err?.status;
  };

  const withRetry = async <T,>(fn: () => Promise<T>, opts?: { attempts?: number; baseDelayMs?: number }): Promise<T> => {
    const attempts = opts?.attempts ?? 3;
    const baseDelayMs = opts?.baseDelayMs ?? 400;

    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fn();

        // clear banner after successful call (soft)
        if (rateLimit.active) {
          setRateLimit(prev => ({ ...prev, active: false }));
        }

        return res;
      } catch (err: any) {
        lastErr = err;
        const status = getHttpStatus(err);

        // Only retry for rate limit & transient
        const retryable = status === 429 || (status && status >= 500);
        if (!retryable || i === attempts - 1) break;

        const is429 = status === 429;
        if (is429) {
          setRateLimit({
            active: true,
            lastAt: Date.now(),
            message: 'HTTP 429 (Too Many Requests). Slowing down image/product loading…'
          });
        }

        const jitter = Math.floor(Math.random() * 200);
        const delay = (is429 ? 800 : baseDelayMs) * Math.pow(2, i) + jitter;
        await sleep(delay);
      }
    }

    throw lastErr;
  };

  const enrichProduct = async (productId: number) => {
    // Meta already cached
    if (metaCacheRef.current[productId]) return;

    // Avoid duplicate in-flight
    if (inFlightRef.current.has(productId)) return;
    inFlightRef.current.add(productId);

    try {
      const meta = await withRetry(() => productService.getById(productId), { attempts: 3, baseDelayMs: 350 });
      setProductMetaById(prev => ({ ...prev, [productId]: meta }));

      // Try to pick image from meta first
      let img = pickImageFromProductMeta(meta);

      // If still missing, hit the dedicated primary-image endpoint (only then)
      if (!img) {
        try {
          const primary = await withRetry(() => productImageService.getPrimaryImage(productId), { attempts: 2, baseDelayMs: 500 });
          const u = (primary as any)?.image_url || (primary as any)?.image_path;
          if (u) img = String(u);
        } catch {
          // ignore
        }
      }

      if (img) {
        setProductImageById(prev => ({ ...prev, [productId]: normalizeImageUrl(img) }));
      }
    } catch (e) {
      // Keep placeholder; we'll try again later when item is visible again
      console.warn('Failed to enrich product', productId, e);
    } finally {
      inFlightRef.current.delete(productId);
    }
  };

  // -------------------- Grouping --------------------
  const buildGroupsFromInventory = (inventoryItems: GlobalInventoryItem[]): GroupedProduct[] => {
    const groups: Record<string, GroupedProduct> = {};

    for (const item of inventoryItems) {
      const displaySku = item.sku || 'NO-SKU';
      const groupKey = item.sku ? item.sku : `NO-SKU-${item.product_id}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          groupKey,
          sku: displaySku,
          productName: item.base_name || item.product_name || 'Unnamed Product',
          totalStock: 0,
          totalAvailable: 0,
          totalReserved: 0,
          variations: [],
          expanded: false,
          productIds: [],
          extraTotal: 0,
          extraDefective: 0,
          extraUsed: 0,
        };
      }

      const g = groups[groupKey];
      const qty = Number(item.total_quantity || 0);
      const avail = Number(item.available_quantity || 0);
      const res = Number(item.reserved_quantity || 0);

      g.totalStock += qty;
      g.totalAvailable += avail;
      g.totalReserved += res;

      if (item.product_id && !g.productIds.includes(item.product_id)) {
        g.productIds.push(item.product_id);
      }

      const existing = g.variations.find(v => v.productId === item.product_id);
      if (!existing) {
        g.variations.push({
          productId: item.product_id,
          category_id: item.category_id,
          category_name: item.category_name,
          subcategory_name: item.subcategory_name,
          variation_suffix: item.variation_suffix,
          quantity: qty,
          availableQuantity: avail,
          reservedQuantity: res,
          stores: Array.isArray(item.stores) ? [...item.stores] : [],
        });
      } else {
        existing.quantity += qty;
        existing.availableQuantity += avail;
        existing.reservedQuantity += res;

        // merge store breakdowns
        for (const s of item.stores || []) {
          const hit = existing.stores.find(x => x.store_id === s.store_id);
          if (hit) {
            hit.quantity += s.quantity;
            hit.batches_count = (hit.batches_count || 0) + (s.batches_count || 0);
          } else {
            existing.stores.push({ ...s });
          }
        }
      }
    }

    return Object.values(groups).sort((a, b) => {
      return (a.productName || '').localeCompare(b.productName || '');
    });
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);

      const [categoriesData, inventoryResponse] = await Promise.all([
        categoryService.getTree(true),
        inventoryService.getGlobalInventory({ 
          skipStoreScope: true,
          category_id: viewMode === 'category' ? (selectedCategoryId || undefined) : undefined
        }),
      ]);

      // Handle tree response or fallback to flat list
      let parsedCategories = [];
      if (Array.isArray(categoriesData)) {
        parsedCategories = categoriesData;
      } else if ((categoriesData as any)?.data) {
        parsedCategories = (categoriesData as any).data;
      }
      
      setCategories(parsedCategories);

      const inventoryData = (inventoryResponse as any)?.data || [];

      // Extract unique stores for table headers
      const storeMap = new Map<number, string>();
      inventoryData.forEach((item: any) => {
        if (Array.isArray(item.stores)) {
          item.stores.forEach((s: any) => {
            if (s.store_id && s.store_name) {
              storeMap.set(s.store_id, s.store_name);
            }
          });
        }
      });
      const storesList = Array.from(storeMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAllStores(storesList);

      // ✅ Build groups ONLY from inventory endpoint (no product list fetch)
      const grouped = buildGroupsFromInventory(inventoryData);
      setGroupedProducts(grouped);

      // ✅ Show UI fast
      setLoading(false);

      // ✅ Load extra counts in background (won't block inventory list)
      (async () => {
        try {
          const extraItems = await fetchAllActiveExtraItems();
          setExtraMap(buildExtraMapByProduct(extraItems));
        } catch (e) {
          console.warn('Failed to load extra (defective/used) counts', e);
        }
      })();
    } catch (error) {
      console.error('Error fetching inventory data:', error);
      setLoading(false);
    }
  };

  const toggleExpand = (groupKey: string) => {
    setGroupedProducts(prev => prev.map(item => (
      item.groupKey === groupKey ? { ...item, expanded: !item.expanded } : item
    )));
  };

  // -------------------- Derived lists --------------------
  const groupsWithExtras = useMemo(() => {
    if (!extraMap || extraMap.size === 0) return groupedProducts;

    return groupedProducts.map(g => {
      let total = 0;
      let used = 0;
      let defective = 0;

      for (const pid of g.productIds) {
        const ex = extraMap.get(pid);
        if (!ex) continue;
        total += ex.total;
        used += ex.used;
        defective += ex.defective;
      }

      return { ...g, extraTotal: total, extraUsed: used, extraDefective: defective };
    });
  }, [groupedProducts, extraMap]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groupsWithExtras;

    return groupsWithExtras.filter(item => {
      const nameHit = (item.productName || '').toLowerCase().includes(q);
      const skuHit = (item.sku || '').toLowerCase().includes(q);
      const categoryHit = getCategoryForGroup(item).toLowerCase().includes(q);
      return nameHit || skuHit || categoryHit;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsWithExtras, searchTerm, categories, productMetaById]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const visibleProductIds = useMemo(() => {
    const ids: number[] = [];
    for (const g of visibleProducts) {
      for (const pid of g.productIds) ids.push(pid);
    }
    return Array.from(new Set(ids.filter(Boolean)));
  }, [visibleProducts]);

  // Lazy-load product meta/images for visible items (with concurrency cap)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const targets = visibleProductIds.filter(pid => !metaCacheRef.current[pid]);
      if (targets.length === 0) return;

      const CONCURRENCY = 3;
      let idx = 0;

      const worker = async () => {
        while (!cancelled) {
          const pid = targets[idx++];
          if (!pid) break;
          try {
            await enrichProduct(pid);
          } catch {
            // ignore
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker());
      await Promise.all(workers);
    };

    run().catch(() => void 0);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleProductIds]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setVisibleCount(50);
    updateQueryParams({ q: value || null, limit: '50' });
  };

  const handleLoadMore = () => {
    const next = visibleCount + 50;
    setVisibleCount(next);
    updateQueryParams({ limit: String(next) }, 'push');
  };

  // -------------------- UI --------------------
  if (loading) {
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
            <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading inventory...</p>
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
          <Header
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-auto p-6">
            <div className="flex justify-between items-start mb-6 text-base">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Inventory Overview
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  View all products and their stock levels across outlets
                </p>
              </div>
              <ExportInventoryButton 
                categories={flatCategories} 
                allStores={allStores} 
                selectedCategoryId={viewMode === 'category' ? selectedCategoryId : null}
              />
            </div>

            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                <label className="text-xs font-bold text-gray-500 uppercase px-1">View Mode</label>
                <select
                  value={viewMode}
                  onChange={(e) => {
                    setViewMode(e.target.value as 'all' | 'category');
                    if (e.target.value === 'all') setSelectedCategoryId(null);
                  }}
                  className="w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                >
                  <option value="all" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Current Stock (All Products)</option>
                  <option value="category" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Category-wise Stock</option>
                </select>
              </div>

              {viewMode === 'category' && (
                <div className="flex-1 min-w-[300px]">
                  <CategoryTreeSelector
                    categories={categories as any}
                    selectedCategoryId={selectedCategoryId ? String(selectedCategoryId) : ''}
                    onSelect={(id) => setSelectedCategoryId(id ? Number(id) : null)}
                    label="Filter by Category"
                    required={false}
                    placeholder="-- All Categories --"
                    showSelectedInfo={false}
                    allowClear={true}
                    clearText="-- All Categories --"
                  />
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by product name, SKU or category"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {rateLimit.active && (
              <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-300 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Rate limit detected</p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      {rateLimit.message || 'HTTP 429 (Too Many Requests). Slowing down requests and retrying automatically…'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {filteredProducts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <Package className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No inventory items found</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-[calc(100vh-320px)] scrollbar-thin">
                    <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-base font-medium">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-20">
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-900 z-30 border-r border-gray-200 dark:border-gray-700">SKU</th>
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 min-w-[250px] border-r border-gray-200 dark:border-gray-700">Product Name</th>
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Category</th>
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Subcategory</th>
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Variation</th>
                          
                          {allStores.map(store => (
                            <th key={store.id} className="p-3 text-center font-bold text-gray-700 dark:text-gray-300 whitespace-normal break-words max-w-[100px] leading-tight border-r border-gray-200 dark:border-gray-700">
                              {store.name}
                            </th>
                          ))}
                          
                          <th className="p-3 text-center font-bold text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-900/20 border-r border-gray-200 dark:border-gray-700">Available</th>
                          <th className="p-3 text-center font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Physical</th>
                          <th className="p-3 text-center font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Reserved</th>
                          <th className="p-3 text-center font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/20 border-r border-gray-200 dark:border-gray-700">SKU Total</th>
                          <th className="p-3 text-left font-bold text-gray-700 dark:text-gray-300">Defective or Used</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800">
                        {visibleProducts.map((group) => (
                          group.variations.map((variation, vIdx) => {
                            const pid = variation.productId;
                            const paths = getCategoryPaths(variation.category_id, flatCategories);
                            const category = variation.category_name || paths.category;
                            const subcategory = variation.subcategory_name || paths.subcategory;
                            const suffix = variation.variation_suffix || getVariationSuffix(pid);
                            const extra = extraMap?.get(pid);
                            const rowSpan = group.variations.length;

                            return (
                              <tr
                                key={pid}
                                className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                              >
                                {vIdx === 0 && (
                                  <>
                                    <td rowSpan={rowSpan} className="p-3 font-bold text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700 align-top">
                                      {group.sku}
                                    </td>
                                    <td rowSpan={rowSpan} className="p-3 text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-top whitespace-normal break-words max-w-[200px] leading-tight">
                                      {group.productName}
                                    </td>
                                    <td rowSpan={rowSpan} className="p-3 text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 align-top">
                                      {category}
                                    </td>
                                    <td rowSpan={rowSpan} className="p-3 text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 align-top">
                                      {subcategory}
                                    </td>
                                  </>
                                )}
                                
                                <td className="p-3 border-r border-gray-200 dark:border-gray-700">
                                  <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold">
                                    {suffix}
                                  </span>
                                </td>

                                {allStores.map(store => {
                                  const storeStock = variation.stores.find(s => s.store_id === store.id);
                                  return (
                                    <td key={store.id} className="p-3 text-center border-r border-gray-200 dark:border-gray-700">
                                      {storeStock ? (
                                        <span className="font-bold text-gray-900 dark:text-white">{storeStock.quantity}</span>
                                      ) : (
                                        <span className="text-gray-300 dark:text-gray-600">-</span>
                                      )}
                                    </td>
                                  );
                                })}

                                <td className="p-3 text-center bg-blue-50/20 dark:bg-blue-900/5 border-r border-gray-200 dark:border-gray-700">
                                  <span className="font-bold text-blue-600 dark:text-blue-400">
                                    {variation.availableQuantity}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                                  {variation.quantity}
                                </td>
                                <td className="p-3 text-center text-amber-600 dark:text-amber-500 border-r border-gray-200 dark:border-gray-700">
                                  {variation.reservedQuantity > 0 ? variation.reservedQuantity : '-'}
                                </td>

                                {vIdx === 0 && (
                                  <td rowSpan={rowSpan} className="p-3 text-center bg-emerald-50/20 dark:bg-emerald-900/5 border-r border-gray-200 dark:border-gray-700 align-middle">
                                    <span className="font-black text-emerald-600 dark:text-emerald-400">{group.totalStock}</span>
                                  </td>
                                )}

                                <td className="p-3 border-r border-gray-200 dark:border-gray-700">
                                  {extra ? (
                                    <div className="flex flex-col gap-1 min-w-[100px]">
                                      {extra.defective > 0 && (
                                        <span className="text-xs font-black text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded uppercase">Def: {extra.defective}</span>
                                      )}
                                      {extra.used > 0 && (
                                        <span className="text-xs font-black text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded uppercase">Used: {extra.used}</span>
                                      )}
                                    </div>
                                  ) : '-'}
                                </td>
                              </tr>
                            );
                          })
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {filteredProducts.length > visibleCount && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleLoadMore}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Load more ({Math.min(50, filteredProducts.length - visibleCount)} more)
                  </button>
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-sm text-gray-600 dark:text-gray-300">Loading inventory view...</div>
        </div>
      }
    >
      <ViewInventoryPageContent />
    </Suspense>
  );
}
