'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Plus, Search, ChevronLeft, ChevronRight, Filter, Grid, List, RefreshCw } from 'lucide-react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ProductListItem from '@/components/ProductListItem';
import { productService, Product } from '@/services/productService';
import categoryService, { Category } from '@/services/categoryService';
import { vendorService, Vendor } from '@/services/vendorService';
import catalogService from '@/services/catalogService';
import Toast from '@/components/Toast';
import AccessDenied from '@/components/AccessDenied';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

import {
  ProductVariant,
  ProductGroup,
} from '@/types/product';

export default function ProductPage() {
  const { isRole } = useAuth();
  const canCreateProducts = isRole(['super-admin', 'admin', 'online-moderator']);
  const canEditProducts = isRole(['super-admin', 'admin', 'online-moderator']);
  const canDeleteProducts = isRole(['super-admin', 'admin']);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isUpdatingUrlRef = useRef(false);
  // Ref to track the latest fetch request ID to prevent race conditions
  const fetchIdRef = useRef(0);


  // Read URL parameters
  const [selectMode, setSelectMode] = useState(false);
  const [redirectPath, setRedirectPath] = useState('');

  const { darkMode, setDarkMode } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendorsById, setVendorsById] = useState<Record<number, string>>({});
  const [catalogMetaById, setCatalogMetaById] = useState<Record<number, { selling_price: number | null; in_stock: boolean; stock_quantity: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);
  const [serverLastPage, setServerLastPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [debouncedMinPrice, setDebouncedMinPrice] = useState<string>('');
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [stockStatus, setStockStatus] = useState<'all' | 'in_stock' | 'not_in_stock'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const SERVER_PAGE_SIZE = 60;
  const SEARCH_DEBOUNCE_MS = 1000;


  const updateQueryParams = useCallback(
    (
      updates: Record<string, string | null | undefined>,
      historyMode: 'replace' | 'push' = 'replace'
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') params.delete(key);
        else params.set(key, value);
      });

      const qs = params.toString();
      const nextUrl = qs ? `${pathname}?${qs}` : pathname;
      isUpdatingUrlRef.current = true;
      if (historyMode === 'push') {
        router.push(nextUrl);
      } else {
        router.replace(nextUrl);
      }
    },
    [router, pathname, searchParams]
  );
  const goToPage = useCallback(
    (page: number) => {
      const safe = Number.isFinite(page) && page > 0 ? page : 1;
      setCurrentPage(safe);
      updateQueryParams({ page: String(safe) }, 'push');
    },
    [updateQueryParams]
  );

  // Hydration fix
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Keep state in sync with URL params (supports refresh + back/forward)
  useEffect(() => {
    // If we just updated the URL ourselves, don't overwrite state.
    if (isUpdatingUrlRef.current) {
      isUpdatingUrlRef.current = false;
      return;
    }

    const q = searchParams.get('q') ?? '';
    const category = searchParams.get('category') ?? '';
    const vendor = searchParams.get('vendor') ?? '';
    const minP = searchParams.get('minPrice') ?? '';
    const maxP = searchParams.get('maxPrice') ?? '';
    const pageRaw = Number(searchParams.get('page') ?? '1');

    const sort = searchParams.get('sortBy') ?? 'newest';
    const inStockParam = searchParams.get('in_stock');
    const stock = inStockParam === 'true' ? 'in_stock' : inStockParam === 'false' ? 'not_in_stock' : 'all';

    if (q !== searchQuery) {
      setSearchQuery(q);
      setDebouncedSearchQuery(q);
    }
    if (category !== selectedCategory) setSelectedCategory(category);
    if (vendor !== selectedVendor) setSelectedVendor(vendor);
    if (minP !== minPrice) setMinPrice(minP);
    if (maxP !== maxPrice) setMaxPrice(maxP);
    if (sort !== sortBy) setSortBy(sort);
    if (stock !== stockStatus) setStockStatus(stock);

    const nextP = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    if (nextP !== currentPage) setCurrentPage(nextP);

    const sm = searchParams.get('selectMode') === 'true';
    if (sm !== selectMode) setSelectMode(sm);

    const rp = searchParams.get('redirect') || '';
    if (rp !== redirectPath) setRedirectPath(rp);
  }, [searchParams, searchQuery, selectedCategory, selectedVendor, minPrice, maxPrice, sortBy, stockStatus, currentPage, selectMode, redirectPath]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Price validation and query update delay (1000ms)
  useEffect(() => {
    // Determine current values in URL to avoid resetting page=1 on initial load or sync
    const urlMin = searchParams.get('minPrice') || '';
    const urlMax = searchParams.get('maxPrice') || '';

    // If those values are exactly what's currently in the URL, we skip the immediate 
    // refresh logic. This prevents the "reset to page 1" bug on first load.
    if (minPrice === urlMin && maxPrice === urlMax) {
      setDebouncedMinPrice(minPrice);
      setDebouncedMaxPrice(maxPrice);
      return;
    }

    const timer = window.setTimeout(() => {
      let finalMin = minPrice;
      let finalMax = maxPrice;

      if (minPrice && maxPrice) {
        const minVal = parseFloat(minPrice);
        const maxVal = parseFloat(maxPrice);
        if (!isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
          // Equalize as requested: if min > max, change to equal (using max as master for current typing)
          finalMin = maxPrice;
          setMinPrice(maxPrice);
        }
      }

      setDebouncedMinPrice(finalMin);
      setDebouncedMaxPrice(finalMax);
      updateQueryParams({
        minPrice: finalMin || null,
        maxPrice: finalMax || null,
        page: '1'
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [minPrice, maxPrice, updateQueryParams, searchParams]);

  const fetchFilterData = useCallback(async () => {
    try {
      const [categoriesData, vendorsData] = await Promise.all([
        categoryService.getTree(true),
        vendorService.getAll(),
      ]);

      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      const vendorsArr: Vendor[] = Array.isArray(vendorsData) ? vendorsData : [];
      const vmap: Record<number, string> = {};
      vendorsArr.forEach((v) => {
        if (v && typeof v.id === 'number') vmap[v.id] = v.name;
      });
      setVendorsById(vmap);
      setVendorsList(
        vendorsArr
          .filter((v) => v && v.is_active)
          .slice()
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
    } catch (err) {
      console.error('Error fetching filter data:', err);
      setCategories([]);
      setVendorsById({});
      setVendorsList([]);
    }
  }, []);

  const fetchData = useCallback(async (pageOverride?: number) => {
    // Increment the fetch ID for each new request
    const currentFetchId = ++fetchIdRef.current;
    setIsLoading(true);
    try {
      const pageToLoad = Number.isFinite(pageOverride) && pageOverride && pageOverride > 0 ? pageOverride : currentPage;

      let response: { data: any[]; total: number; current_page: number; last_page: number };

      let apiSortBy = 'created_at';
      let apiSortDir: 'asc' | 'desc' = 'desc';

      if (sortBy === 'oldest') {
        apiSortDir = 'asc';
      } else if (sortBy === 'price_asc') {
        apiSortBy = 'price';
        apiSortDir = 'asc';
      } else if (sortBy === 'price_desc') {
        apiSortBy = 'price';
        apiSortDir = 'desc';
      }

      // Proposal 5: use advanced search when query is ≥ 2 chars
      if (debouncedSearchQuery.trim().length >= 2) {
        try {
          response = await productService.advancedSearch({
            query: debouncedSearchQuery.trim(),
            category_id: selectedCategory ? Number(selectedCategory) : undefined,
            vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
            per_page: SERVER_PAGE_SIZE,
            page: pageToLoad,
            enable_fuzzy: true,
            group_by_sku: true,
            in_stock: stockStatus === 'in_stock' ? 'true' : stockStatus === 'not_in_stock' ? 'false' : undefined,
          });
        } catch {
          // Advanced search unavailable — fall back to standard endpoint
          response = await productService.getAll({
            page: pageToLoad,
            per_page: SERVER_PAGE_SIZE,
            search: debouncedSearchQuery || undefined,
            category_id: selectedCategory ? Number(selectedCategory) : undefined,
            vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
            group_by_sku: true,
            min_price: minPrice ? Number(minPrice) : undefined,
            max_price: maxPrice ? Number(maxPrice) : undefined,
            in_stock: stockStatus === 'in_stock' ? 'true' : stockStatus === 'not_in_stock' ? 'false' : undefined,
            sort_by: apiSortBy,
            sort_direction: apiSortDir,
          });
        }
      } else {
        // Proposal 1 + 2: grouped endpoint with optional server-side price filter
        response = await productService.getAll({
          page: pageToLoad,
          per_page: SERVER_PAGE_SIZE,
          search: debouncedSearchQuery || undefined,
          category_id: selectedCategory ? Number(selectedCategory) : undefined,
          vendor_id: selectedVendor ? Number(selectedVendor) : undefined,
          group_by_sku: true,
          min_price: minPrice ? Number(minPrice) : undefined,
          max_price: maxPrice ? Number(maxPrice) : undefined,
          in_stock: stockStatus === 'in_stock' ? 'true' : stockStatus === 'not_in_stock' ? 'false' : undefined,
          sort_by: apiSortBy,
          sort_direction: apiSortDir,
        });
      }

      const nextProducts = Array.isArray(response.data) ? response.data : [];
      const nextLastPage = Math.max(1, Number(response.last_page || 1));
      const safePage = Math.min(pageToLoad, nextLastPage);

      // Check if this is still the most recent request before updating state
      if (currentFetchId !== fetchIdRef.current) return;

      setProducts(nextProducts);
      setTotalProducts(Number(response.total || 0));
      setServerLastPage(nextLastPage);

      if (safePage !== currentPage) {
        // Only update current page if this is still the latest request
        setCurrentPage(safePage);
        updateQueryParams({ page: String(safePage) }, 'replace');
      }
    } catch (err) {
      // Ensure we only set error state for the latest request
      if (currentFetchId === fetchIdRef.current) {
        console.error('Error fetching data:', err);
        setToast({ message: 'Failed to load products', type: 'error' });
        setProducts([]);
        setTotalProducts(0);
        setServerLastPage(1);
        setCatalogMetaById({});
      }
    } finally {
      // Ensure loading state is only cleared for the latest request
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentPage, debouncedSearchQuery, selectedCategory, selectedVendor, debouncedMinPrice, debouncedMaxPrice, sortBy, stockStatus, updateQueryParams]);

  useEffect(() => {
    fetchFilterData();
  }, [fetchFilterData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    await fetchData();
    setToast({ message: 'Products refreshed successfully', type: 'success' });
  };

  const getCategoryPath = (categoryId: number): string => {
    const findPath = (cats: Category[], id: number, path: string[] = []): string[] | null => {
      for (const cat of cats) {
        const newPath = [...path, cat.title];
        if (String(cat.id) === String(id)) {
          return newPath;
        }
        const childCategories = cat.children || cat.all_children || [];
        if (childCategories.length > 0) {
          const found = findPath(childCategories, id, newPath);
          if (found) return found;
        }
      }
      return null;
    };

    const path = findPath(categories, categoryId);
    return path ? path.join(' > ') : 'Uncategorized';
  };

  /**
   * Robustly extract variant attributes.
   * - Prefer custom_fields (backend truth)
   * - Fallback to parsing the product name (common pattern: "Base - Color - Size")
   */
  const parseVariantFromName = (name: string): { base?: string; color?: string; size?: string } => {
    const raw = (name || '').trim();
    if (!raw) return {};

    // Split by hyphen with optional spaces around it
    const parts = raw.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const size = parts[parts.length - 1];
      const color = parts[parts.length - 2];
      const base = parts.slice(0, parts.length - 2).join('-').trim();
      return { base, color, size };
    }

    if (parts.length === 2) {
      const base = parts[0];
      const maybe = parts[1];
      const looksLikeSize = /^(\d{1,3}|xs|s|m|l|xl|xxl|xxxl)$/i.test(maybe);
      return looksLikeSize ? { base, size: maybe } : { base, color: maybe };
    }

    return { base: raw };
  };

  const getColorAndSize = (product: Product): { color?: string; size?: string } => {
    // 1) Prefer explicit custom fields when available
    const colorField = product.custom_fields?.find(cf =>
      String(cf.field_title || '').trim().toLowerCase() === 'color'
    );
    const sizeField = product.custom_fields?.find(cf =>
      String(cf.field_title || '').trim().toLowerCase() === 'size'
    );

    const color = colorField?.value;
    const size = sizeField?.value;

    if (color || size) {
      return { color, size };
    }

    // 2) Fallback: infer from the name
    const parsed = parseVariantFromName(product.name);
    return { color: parsed.color, size: parsed.size };
  };

  /**
   * Base name for a single product.
   * Uses custom_fields if present; otherwise parses the name.
   */
  const getBaseName = (product: Product): string => {
    return ((product as any).base_name || product.name || '').trim();
  };

  /**
   * Determine a stable base name for a whole SKU group.
   * If variants use a consistent naming scheme ("Base - Color - Size"),
   * we pick the most common parsed base across variants.
   */
  const getGroupBaseName = (variants: any[], fallbackName: string) => {
    if (!variants || variants.length === 0) return fallbackName;
    // Pick the first product of the group and use its base_name
    const first = variants[0];
    return (first.base_name || first.name || fallbackName).trim();
  };

  // Enhanced image URL processing
  const getImageUrl = (imagePath: string | null | undefined): string | null => {
    if (!imagePath) return null;

    // If it's already a full URL, return as-is
    if (imagePath.startsWith('http')) return imagePath;

    // If it's a storage path, construct the full URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    return `${baseUrl}/storage/${imagePath}`;
  };

  // Group products into ProductGroup[] cards.
  // When the backend returns the grouped shape (group_by_sku=true), each product
  // already carries `has_variants` / `variants[]` — we map directly without re-grouping.
  // When the response is flat (fallback / advanced-search), we run the original client-side
  // grouping so no card is lost.
  const productGroups = useMemo((): ProductGroup[] => {
    if (products.length === 0) return [];

    // Detect grouped response: any product has the `has_variants` field
    const isGrouped = products.some(p => typeof (p as any).has_variants === 'boolean');

    if (isGrouped) {
      return products.map((product) => {
        const primaryImg = product.images?.find(img => img.is_primary && img.is_active)
          ?? product.images?.find(img => img.is_active)
          ?? product.images?.[0];
        const primaryImageUrl = primaryImg ? getImageUrl(primaryImg.image_path) : null;

        const serverVariants: any[] = (product as any).variants ?? [];

        const allVariants = [
          {
            id: product.id,
            name: product.name,
            sku: product.sku,
            color: getColorAndSize(product).color,
            size: getColorAndSize(product).size,
            variation_suffix: (product as any).variation_suffix,
            image: primaryImageUrl,
          },
          ...serverVariants.map((v: any) => {
            const vImg = v.images?.[0];
            const vImgUrl = vImg
              ? (vImg.url?.startsWith('http') ? vImg.url : getImageUrl(vImg.image_path ?? vImg.url))
              : null;

            const vColorSize = getColorAndSize(v);

            return {
              id: v.id,
              name: v.name,
              sku: v.sku,
              color: vColorSize.color,
              size: vColorSize.size,
              variation_suffix: v.variation_suffix,
              image: vImgUrl,
            };
          }),
        ];

        return {
          sku: product.sku,
          baseName: (product as any).base_name || getBaseName(product),
          totalVariants: allVariants.length,
          variants: allVariants,
          primaryImage: primaryImageUrl,
          categoryPath: getCategoryPath(product.category_id),
          category_id: product.category_id,
          hasVariations: allVariants.length > 1,
          vendorId: product.vendor_id,
          vendorName: vendorsById[product.vendor_id] ?? null,
        };
      });
    }

    // ── Flat-response fallback (original client-side grouping) ──────────────
    const groups = new Map<string, ProductGroup>();

    products.forEach((product) => {
      const sku = product.sku;
      const { color, size } = getColorAndSize(product);
      const baseName = getBaseName(product);

      const primaryImage = product.images?.find(img => img.is_primary && img.is_active)
        ?? product.images?.find(img => img.is_active)
        ?? product.images?.[0];
      const imageUrl = primaryImage ? getImageUrl(primaryImage.image_path) : null;

      const groupKey = (sku && String(sku).trim()) ? String(sku).trim() : `product-${product.id}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          sku: String(sku || ''),
          baseName,
          totalVariants: 0,
          variants: [],
          primaryImage: imageUrl,
          categoryPath: getCategoryPath(product.category_id),
          category_id: product.category_id,
          hasVariations: false,
          vendorId: product.vendor_id,
          vendorName: vendorsById[product.vendor_id] ?? null,
        });
      }

      const group = groups.get(groupKey)!;
      const variantPrimaryImage = product.images?.find(img => img.is_primary && img.is_active)
        ?? product.images?.find(img => img.is_active)
        ?? product.images?.[0];
      const variantImageUrl = variantPrimaryImage ? getImageUrl(variantPrimaryImage.image_path) : null;

      group.variants.push({
        id: product.id,
        name: product.name,
        base_name: (product as any).base_name,
        sku: product.sku,
        color,
        size,
        variation_suffix: (product as any).variation_suffix,
        image: variantImageUrl
      });
    });

    groups.forEach(group => {
      group.baseName = getGroupBaseName(group.variants, group.baseName);
      group.totalVariants = group.variants.length;
      group.hasVariations = group.variants.length > 1;
      if (!group.primaryImage) {
        group.primaryImage = group.variants.find(v => v.image)?.image || null;
      }
    });

    return Array.from(groups.values());
  }, [products, categories, vendorsById]);

  // Search/category/vendor/price filters are all handled server-side now (Proposals 1 & 2).
  const baseFilteredGroups = useMemo(() => productGroups, [productGroups]);

  // Price filter is now applied server-side. filteredGroups = all groups on the current page.
  const filteredGroups = baseFilteredGroups;

  const totalPages = Math.max(1, serverLastPage);
  const paginatedGroups = filteredGroups;

  // Fetch selling price + stock info (only for visible items, cached)
  useEffect(() => {
    const ids = paginatedGroups
      .map((g) => g?.variants?.[0]?.id)
      .filter((id): id is number => typeof id === 'number');

    const missing = ids.filter((id) => !catalogMetaById[id]);
    if (missing.length === 0) return;

    let cancelled = false;

    const run = async () => {
      const chunkSize = 4;

      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);

        const results = await Promise.all(
          chunk.map(async (id) => {
            try {
              const detail: any = await catalogService.getProduct(id);
              const p = detail?.product ?? detail?.data?.product ?? detail?.data ?? detail;

              const selling = Number(p?.selling_price ?? p?.sellingPrice ?? NaN);
              const inStock = Boolean(p?.in_stock ?? p?.inStock ?? false);
              const stockQty = Number(p?.stock_quantity ?? p?.stockQuantity ?? 0);

              if (!Number.isFinite(selling) && inStock) {
                // If backend doesn't provide selling price, treat as unknown
                return { id, meta: { selling_price: null, in_stock: inStock, stock_quantity: stockQty } };
              }

              return {
                id,
                meta: {
                  selling_price: Number.isFinite(selling) ? selling : null,
                  in_stock: inStock,
                  stock_quantity: Number.isFinite(stockQty) ? stockQty : 0,
                },
              };
            } catch (e) {
              return null;
            }
          })
        );

        if (cancelled) return;

        setCatalogMetaById((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            if (r) next[r.id] = r.meta;
          });
          return next;
        });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [paginatedGroups, catalogMetaById]);

  const handleDelete = async (id: number) => {
    if (!canDeleteProducts) {
      setToast({ message: "You don't have permission to delete products", type: 'warning' });
      return;
    }
    try {
      await productService.delete(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setToast({ message: 'Product deleted successfully', type: 'success' });

      // Refresh data to update counts
      await fetchData(currentPage);
    } catch (err) {
      console.error('Error deleting product:', err);
      setToast({ message: 'Failed to delete product', type: 'error' });
    }
  };

  const handleEdit = (id: number) => {
    if (!canEditProducts) {
      setToast({ message: "You don't have permission to edit products", type: 'warning' });
      return;
    }
    // Clear any existing session data
    sessionStorage.removeItem('editProductId');
    sessionStorage.removeItem('productMode');
    sessionStorage.removeItem('baseSku');
    sessionStorage.removeItem('baseName');
    sessionStorage.removeItem('categoryId');

    // Store edit data in sessionStorage
    sessionStorage.setItem('editProductId', id.toString());
    sessionStorage.setItem('productMode', 'edit');

    router.push('/product/add');
  };

  const handleView = (id: number) => {
    const qs = searchParams.toString();
    const returnTo = qs ? `${pathname}?${qs}` : pathname;
    router.push(`/product/${id}?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const handleAdd = () => {
    if (!canCreateProducts) {
      setToast({ message: "You don't have permission to create products", type: 'warning' });
      return;
    }
    // Clear any stored data to ensure create mode
    sessionStorage.removeItem('editProductId');
    sessionStorage.removeItem('productMode');
    sessionStorage.removeItem('baseSku');
    sessionStorage.removeItem('baseName');
    sessionStorage.removeItem('categoryId');

    router.push('/product/add');
  };

  const handleAddVariation = (group: ProductGroup) => {
    if (!canCreateProducts) {
      setToast({ message: "You don't have permission to create product variations", type: 'warning' });
      return;
    }
    // Clear any existing session data
    sessionStorage.removeItem('editProductId');
    sessionStorage.removeItem('productMode');
    sessionStorage.removeItem('baseSku');
    sessionStorage.removeItem('baseName');
    sessionStorage.removeItem('categoryId');

    // Store variation data in sessionStorage
    sessionStorage.setItem('productMode', 'addVariation');
    sessionStorage.setItem('baseSku', group.sku);
    sessionStorage.setItem('baseName', group.baseName);
    sessionStorage.setItem('categoryId', group.category_id.toString());

    router.push('/product/add');
  };

  const handleSelect = (variant: ProductVariant) => {
    if (selectMode && redirectPath) {
      const url = `${redirectPath}?productId=${variant.id}&productName=${encodeURIComponent(variant.name)}&productSku=${encodeURIComponent(variant.sku)}`;
      router.push(url);
    }
  };

  // Flatten categories for filter dropdown
  const flatCategories = useMemo(() => {
    const flatten = (cats: Category[], depth = 0): { id: string; label: string; depth: number }[] => {
      return cats.reduce((acc: { id: string; label: string; depth: number }[], cat) => {
        const prefix = '  '.repeat(depth);
        acc.push({ id: String(cat.id), label: `${prefix}${cat.title}`, depth });
        const childCategories = cat.children || cat.all_children || [];
        if (childCategories.length > 0) {
          acc.push(...flatten(childCategories, depth + 1));
        }
        return acc;
      }, []);
    };
    return flatten(categories);
  }, [categories]);

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSelectedCategory('');
    setSelectedVendor('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');
    setStockStatus('all');
    setCurrentPage(1);
    updateQueryParams({
      q: null,
      category: null,
      vendor: null,
      minPrice: null,
      maxPrice: null,
      sortBy: null,
      stockStatus: null,
      page: '1',
    });
  };

  const hasActiveFilters = Boolean(searchQuery || selectedCategory || selectedVendor || minPrice || maxPrice || stockStatus !== 'all');

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

          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                      {selectMode ? 'Select a Product' : 'Products'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectMode
                        ? 'Choose a product variant to add to your operation'
                        : `Manage your store's product catalog`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <button
                      onClick={handleRefresh}
                      disabled={isLoading}
                      className="p-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                      title="Refresh products"
                    >
                      <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* View Mode Toggle */}
                    {!selectMode && (
                      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-2 rounded transition-colors ${viewMode === 'list'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                          title="List view"
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-2 rounded transition-colors ${viewMode === 'grid'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                          title="Grid view"
                        >
                          <Grid className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Add Product Button */}
                    {isMounted && !selectMode && canCreateProducts && (
                      <button
                        onClick={handleAdd}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        Add Product
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats Bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Products</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalProducts}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Product Groups</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalProducts > 0 ? `${productGroups.length} on this page` : 0}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">With Variations</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {totalProducts > 0 ? `${productGroups.filter(g => g.hasVariations).length} on this page` : 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Categories</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{flatCategories.length}</p>
                  </div>
                </div>

                {/* Search and Filter Bar */}
                <div className="flex gap-3 mb-4">
                  {/* Search Bar */}
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by name, SKU, category, vendor, color, or size..."
                      value={searchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchQuery(val);
                        setCurrentPage(1);
                        updateQueryParams({ q: val || null, page: '1' });
                      }}
                      className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 text-sm shadow-sm"
                    />
                  </div>

                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSortBy(val);
                      setCurrentPage(1);
                      updateQueryParams({ sortBy: val, page: '1' });
                    }}
                    className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors shadow-sm cursor-pointer"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>

                  {/* Filter Toggle Button */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors shadow-sm ${showFilters || hasActiveFilters
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                  >
                    <Filter className="w-5 h-5" />
                    <span className="font-medium">Filters</span>
                    {hasActiveFilters && (
                      <span className="px-2 py-0.5 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-full">
                        {(searchQuery ? 1 : 0) + (selectedCategory ? 1 : 0) + (selectedVendor ? 1 : 0) + (minPrice || maxPrice ? 1 : 0) + (stockStatus !== 'all' ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0)}
                      </span>
                    )}
                  </button>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h3>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Category Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Category
                        </label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCategory(val);
                            setCurrentPage(1);
                            updateQueryParams({ category: val || null, page: '1' });
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                        >
                          <option value="">All Categories</option>
                          {flatCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Vendor Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Vendor
                        </label>
                        <select
                          value={selectedVendor}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedVendor(val);
                            setCurrentPage(1);
                            updateQueryParams({ vendor: val || null, page: '1' });
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                        >
                          <option value="">All Vendors</option>
                          {vendorsList.map((v) => (
                            <option key={v.id} value={String(v.id)}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Stock Status Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Stock Status
                        </label>
                        <select
                          value={stockStatus}
                          onChange={(e) => {
                            const val = e.target.value as 'all' | 'in_stock' | 'not_in_stock';
                            setStockStatus(val);
                            setCurrentPage(1);
                            updateQueryParams({
                              in_stock: val === 'in_stock' ? 'true' : val === 'not_in_stock' ? 'false' : null,
                              page: '1'
                            });
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors cursor-pointer"
                        >
                          <option value="all">All Statuses</option>
                          <option value="in_stock">In Stock</option>
                          <option value="not_in_stock">Out of Stock</option>
                        </select>
                      </div>

                      {/* Price Filter */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Selling Price (৳)
                        </label>
                        <div className="flex gap-3">
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Min"
                            value={minPrice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMinPrice(val);
                              setCurrentPage(1);
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Max"
                            value={maxPrice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMaxPrice(val);
                              setCurrentPage(1);
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 transition-colors"
                          />
                        </div>
                        {(minPrice || maxPrice) && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Showing only items whose selling price is within the selected range.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Content */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">Loading products...</p>
                  </div>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center shadow-sm">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {hasActiveFilters ? 'No products found' : 'No products yet'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    {hasActiveFilters
                      ? 'Try adjusting your filters or search terms'
                      : 'Get started by adding your first product'}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium"
                    >
                      Clear Filters
                    </button>
                  ) : (!selectMode && canCreateProducts) && (
                    <button
                      onClick={handleAdd}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add First Product
                    </button>
                  )}
                </div>
              ) : (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
                  {paginatedGroups.map((group) => (
                    <ProductListItem
                      key={`${group.sku}-${group.variants[0].id}`}
                      productGroup={{
                        ...group,
                        sellingPrice: group.variants?.[0]?.id ? catalogMetaById[group.variants[0].id]?.selling_price ?? null : null,
                        inStock: group.variants?.[0]?.id ? catalogMetaById[group.variants[0].id]?.in_stock ?? null : null,
                        stockQuantity: group.variants?.[0]?.id ? catalogMetaById[group.variants[0].id]?.stock_quantity ?? null : null,
                      }}
                      onDelete={canDeleteProducts ? handleDelete : undefined}
                      onEdit={canEditProducts ? handleEdit : undefined}
                      onView={handleView}
                      onAddVariation={canCreateProducts ? handleAddVariation : undefined}
                      {...(selectMode && { onSelect: handleSelect })}
                      selectable={selectMode}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Showing <span className="font-medium text-gray-900 dark:text-white">{totalProducts === 0 ? 0 : ((currentPage - 1) * SERVER_PAGE_SIZE) + 1}</span> to <span className="font-medium text-gray-900 dark:text-white">{Math.min(currentPage * SERVER_PAGE_SIZE, totalProducts)}</span> of <span className="font-medium text-gray-900 dark:text-white">{totalProducts}</span> product groups
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => goToPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="h-10 w-10 flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-900 dark:text-white shadow-sm"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let page;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`h-10 w-10 flex items-center justify-center rounded-lg transition-colors font-medium shadow-sm ${currentPage === page
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="h-10 w-10 flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-900 dark:text-white shadow-sm"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}